import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker, { app } from "../src/worker/index";
import { saveSource, saveState } from "../src/worker/lib/calendarSync";
import { ics, zoned } from "./helpers/ics";
import { asEnv, FakeKV } from "./helpers/fakeKv";

const SECRET = "https://calendar.example.com/published/2/TOPSECRETTOKEN";
const feed = ics([
  zoned("A", "Australia/Darwin", "20261101T083000", "20261101T174500"),
  zoned("B", "Australia/Darwin", "20261102T083000", "20261102T133000"),
]);

let kv: FakeKV;
let pending: Promise<unknown>[];

const ctx = () => ({ waitUntil: (p: Promise<unknown>) => void pending.push(p), passThroughOnException() {} }) as unknown as ExecutionContext;

const call = (path: string, init?: { method?: string; body?: unknown }) =>
  app.request(
    path,
    {
      method: init?.method ?? "GET",
      headers: { "content-type": "application/json" },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    },
    asEnv(kv),
    ctx(),
  );

/** Waits for the background work a request started with waitUntil. */
const settle = async () => {
  await Promise.all(pending);
  pending = [];
};

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const json = async (res: Response) => (await res.json()) as Json;

async function newEmployer(body: Json = {}): Promise<Json> {
  const res = await call("/api/employers", { method: "POST", body: { name: "Roster Co", contract: "casual", sync: "manual", ...body } });
  return (await json(res)).item;
}

async function linkedEmployer(): Promise<Json> {
  const employer = await newEmployer();
  const res = await call(`/api/employers/${employer.id}/calendar`, { method: "PUT", body: { url: SECRET } });
  expect(res.status).toBe(202);
  await settle();
  return employer;
}

const shiftsOf = async (employerId: string) =>
  ((await json(await call("/api/shifts"))).items as Json[]).filter((s) => s.employerId === employerId);

beforeEach(() => {
  kv = new FakeKV();
  pending = [];
  vi.stubGlobal("fetch", vi.fn(async () => new Response(feed, { status: 200 })));
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("linking a calendar", () => {
  it("accepts a webcal link, switches the employer to calendar and syncs in the background", async () => {
    const employer = await newEmployer();
    const res = await call(`/api/employers/${employer.id}/calendar`, {
      method: "PUT",
      body: { url: "webcal://calendar.example.com/published/2/TOPSECRETTOKEN" },
    });
    expect(res.status).toBe(202);
    expect((await json(res)).calendar).toMatchObject({ linked: true });

    await settle();
    expect(fetch).toHaveBeenCalledWith(SECRET, expect.anything());
    expect(await shiftsOf(employer.id)).toHaveLength(2);
    expect((await json(await call(`/api/employers/${employer.id}`))).item.sync).toBe("calendar");
  });

  it("never gives the link back", async () => {
    const employer = await linkedEmployer();
    const status = await call(`/api/employers/${employer.id}/calendar`);
    const text = await status.text();
    expect(text).not.toContain("TOPSECRETTOKEN");
    expect(text).not.toContain("published");
    expect(JSON.parse(text).calendar).toMatchObject({ linked: true, url: "calendar.example.com/…OKEN", syncing: false });

    for (const path of [`/api/employers/${employer.id}`, "/api/employers"]) {
      expect(await (await call(path)).text()).not.toContain("TOPSECRETTOKEN");
    }
  });

  it("reports how the last sync went", async () => {
    const employer = await linkedEmployer();
    const { calendar } = await json(await call(`/api/employers/${employer.id}/calendar`));
    expect(calendar).toMatchObject({
      zone: { name: "Australia/Darwin", source: "events" },
      result: { created: 2, updated: 0, deleted: 0 },
    });
    expect(calendar.lastSuccessAt).toBeTruthy();
    expect(calendar.lastError).toBeUndefined();
  });

  it("rejects links it can't use", async () => {
    const employer = await newEmployer();
    for (const url of ["http://calendar.example.com/a.ics", "https://127.0.0.1/a.ics", "nonsense"]) {
      const res = await call(`/api/employers/${employer.id}/calendar`, { method: "PUT", body: { url } });
      expect(res.status, url).toBe(400);
      expect(await json(res)).toMatchObject({ error: "invalid_url" });
    }
    expect((await json(await call(`/api/employers/${employer.id}/calendar`))).calendar.linked).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("404s for an unknown employer", async () => {
    expect((await call("/api/employers/nope/calendar", { method: "PUT", body: { url: SECRET } })).status).toBe(404);
    expect((await call("/api/employers/nope/calendar")).status).toBe(404);
    expect((await call("/api/employers/nope/sync", { method: "POST" })).status).toBe(404);
  });
});

describe("calendar shifts are read-only", () => {
  it("refuses to edit or delete a calendar shift, and allows both for a manual one", async () => {
    const employer = await linkedEmployer();
    const [fromCalendar] = await shiftsOf(employer.id);

    const patch = await call(`/api/shifts/${fromCalendar.id}`, { method: "PATCH", body: { hours: 1 } });
    expect(patch.status).toBe(403);
    expect(await json(patch)).toEqual({ error: "calendar_managed" });
    expect((await call(`/api/shifts/${fromCalendar.id}`, { method: "DELETE" })).status).toBe(403);
    expect((await json(await call(`/api/shifts/${fromCalendar.id}`))).item.hours).toBe(fromCalendar.hours);

    const made = await call("/api/shifts", { method: "POST", body: { employerId: employer.id, date: "2026-11-01", hours: 3 } });
    const manual = (await json(made)).item;
    expect(manual.source).toBe("manual");
    expect((await call(`/api/shifts/${manual.id}`, { method: "PATCH", body: { hours: 4 } })).status).toBe(200);
    expect((await call(`/api/shifts/${manual.id}`, { method: "DELETE" })).status).toBe(204);
  });

  it("still answers 204 when deleting a shift that doesn't exist", async () => {
    expect((await call("/api/shifts/nope", { method: "DELETE" })).status).toBe(204);
  });
});

describe("keeping the employer and its link in step", () => {
  it("won't create a calendar employer with no link, or switch a linked one back by hand", async () => {
    const res = await call("/api/employers", { method: "POST", body: { name: "X", contract: "casual", sync: "calendar" } });
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ error: "no_calendar" });

    const employer = await linkedEmployer();
    const back = await call(`/api/employers/${employer.id}`, { method: "PATCH", body: { sync: "manual" } });
    expect(back.status).toBe(409);
    expect(await json(back)).toEqual({ error: "calendar_linked" });
  });

  it("lets a linked employer be renamed", async () => {
    const employer = await linkedEmployer();
    expect((await call(`/api/employers/${employer.id}`, { method: "PATCH", body: { name: "Renamed" } })).status).toBe(200);
  });

  it("won't delete a linked employer", async () => {
    const employer = await linkedEmployer();
    const res = await call(`/api/employers/${employer.id}`, { method: "DELETE" });
    expect(res.status).toBe(409);
    expect(await json(res)).toEqual({ error: "calendar_linked" });
  });
});

describe("unlinking", () => {
  it("makes you choose what happens to the calendar's shifts", async () => {
    const employer = await linkedEmployer();
    expect((await call(`/api/employers/${employer.id}/calendar`, { method: "DELETE" })).status).toBe(400);
    expect((await call(`/api/employers/${employer.id}/calendar?shifts=maybe`, { method: "DELETE" })).status).toBe(400);
    expect((await json(await call(`/api/employers/${employer.id}/calendar`))).calendar.linked).toBe(true);
  });

  it("keep: the shifts become ordinary manual ones", async () => {
    const employer = await linkedEmployer();
    expect((await call(`/api/employers/${employer.id}/calendar?shifts=keep`, { method: "DELETE" })).status).toBe(204);

    const kept = await shiftsOf(employer.id);
    expect(kept).toHaveLength(2);
    for (const shift of kept) {
      expect(shift).toMatchObject({ source: "manual" });
      expect(shift.calendarUid).toBeUndefined();
    }
    expect((await call(`/api/shifts/${kept[0].id}`, { method: "PATCH", body: { hours: 6 } })).status).toBe(200);
    expect((await json(await call(`/api/employers/${employer.id}`))).item.sync).toBe("manual");
    expect((await json(await call(`/api/employers/${employer.id}/calendar`))).calendar.linked).toBe(false);
    expect([...kv.data.keys()].filter((k) => k.startsWith("cal"))).toEqual([]);
  });

  it("delete: the calendar's shifts go, manual ones stay, and the employer can then be deleted", async () => {
    const employer = await linkedEmployer();
    await call("/api/shifts", { method: "POST", body: { employerId: employer.id, date: "2026-11-05", hours: 2 } });

    expect((await call(`/api/employers/${employer.id}/calendar?shifts=delete`, { method: "DELETE" })).status).toBe(204);
    const left = await shiftsOf(employer.id);
    expect(left).toHaveLength(1);
    expect(left[0].source).toBe("manual");

    await call(`/api/shifts/${left[0].id}`, { method: "DELETE" });
    expect((await call(`/api/employers/${employer.id}`, { method: "DELETE" })).status).toBe(204);
  });

  it("is refused while a sync is running", async () => {
    const employer = await linkedEmployer();
    await saveState(asEnv(kv).BILL_DATA, employer.id, { startedAt: new Date().toISOString() });
    expect((await call(`/api/employers/${employer.id}/calendar?shifts=keep`, { method: "DELETE" })).status).toBe(409);
  });
});

describe("syncing on demand", () => {
  it("answers at once and syncs in the background", async () => {
    const employer = await linkedEmployer();
    vi.mocked(fetch).mockImplementationOnce(async () => new Response(ics([zoned("C", "Australia/Darwin", "20261103T090000", "20261103T130000")])));

    const res = await call(`/api/employers/${employer.id}/sync`, { method: "POST" });
    expect(res.status).toBe(202);
    await settle();
    expect((await shiftsOf(employer.id)).map((s) => s.calendarUid)).toEqual(["C"]);
  });

  it("refuses for an employer with no calendar", async () => {
    const employer = await newEmployer();
    expect((await call(`/api/employers/${employer.id}/sync`, { method: "POST" })).status).toBe(409);
  });
});

describe("the cron trigger", () => {
  it("syncs a linked calendar that has never been synced", async () => {
    const employer = await newEmployer();
    // Link it without the first background sync, as if that run never happened.
    await saveSource(asEnv(kv).BILL_DATA, employer.id, { url: SECRET });
    await call(`/api/employers/${employer.id}`, { method: "PATCH", body: { sync: "calendar" } });
    expect(await shiftsOf(employer.id)).toHaveLength(0);

    const done: Promise<unknown>[] = [];
    const cronCtx = { waitUntil: (p: Promise<unknown>) => void done.push(p) } as unknown as ExecutionContext;
    await worker.scheduled({} as ScheduledController, asEnv(kv), cronCtx);
    await Promise.all(done);

    expect(await shiftsOf(employer.id)).toHaveLength(2);
  });

  it("leaves a calendar alone that synced a few minutes ago", async () => {
    const employer = await linkedEmployer();
    vi.mocked(fetch).mockClear();

    const done: Promise<unknown>[] = [];
    await worker.scheduled({} as ScheduledController, asEnv(kv), { waitUntil: (p: Promise<unknown>) => void done.push(p) } as unknown as ExecutionContext);
    await Promise.all(done);

    expect(fetch).not.toHaveBeenCalled();
    expect(await shiftsOf(employer.id)).toHaveLength(2);
  });
});
