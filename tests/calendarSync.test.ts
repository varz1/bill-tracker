import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Employer, Shift } from "../src/shared/schemas";
import { EmployerSchema, ShiftSchema } from "../src/shared/schemas";
import { createStore } from "../src/worker/lib/store";
import {
  isDue,
  loadState,
  MAX_PER_RUN,
  saveSource,
  saveState,
  syncDue,
  syncEmployer,
} from "../src/worker/lib/calendarSync";
import { ics, zoned } from "./helpers/ics";
import { asEnv, FakeKV } from "./helpers/fakeKv";

const NOW = new Date("2026-10-28T02:00:00.000Z");
const URL = "https://calendar.example.com/roster.ics";

let kv: FakeKV;
let env: Env;
let fetchMock: ReturnType<typeof vi.fn>;

const darwin = (uid: string, day: string, from = "083000", to = "174500") => zoned(uid, "Australia/Darwin", `${day}T${from}`, `${day}T${to}`);
const feed = (...events: string[][]) => ics(events);
const reply = (body: string, init: ResponseInit = {}) => new Response(body, { status: 200, ...init });

async function addEmployer(over: Partial<Employer> = {}, source: { url?: string; match?: string } | null = { url: URL }): Promise<Employer> {
  const employer: Employer = {
    id: over.id ?? "E1",
    name: "Roster Co",
    contract: "casual",
    sync: "calendar",
    color: "#2a78d6",
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...over,
  };
  await createStore(env.BILL_DATA, "employer", EmployerSchema).put(employer);
  if (source) await saveSource(env.BILL_DATA, employer.id, { url: source.url ?? URL, match: source.match });
  return employer;
}

const shifts = () => createStore(env.BILL_DATA, "shift", ShiftSchema).list();

beforeEach(() => {
  kv = new FakeKV();
  env = asEnv(kv);
  fetchMock = vi.fn(async () => reply(feed(darwin("A", "20261101"))));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("syncEmployer", () => {
  it("creates the calendar's shifts and records how it went", async () => {
    await addEmployer({ breakRule: "over5" });
    fetchMock.mockResolvedValue(reply(feed(darwin("A", "20261101"), darwin("B", "20261102", "100000", "130000")), { headers: { etag: '"v1"' } }));

    const outcome = await syncEmployer(env, "E1", NOW);
    expect(outcome).toMatchObject({ status: "ok", created: 2, updated: 0, deleted: 0 });

    expect(await shifts()).toMatchObject([
      { date: "2026-11-01", start: "08:30", end: "17:45", hours: 8.75, source: "calendar", calendarUid: "A", employerId: "E1" },
      { date: "2026-11-02", start: "10:00", end: "13:00", hours: 3, source: "calendar", calendarUid: "B" },
    ]);
    const state = await loadState(kv as unknown as KVNamespace, "E1");
    expect(state).toMatchObject({
      lastAttemptAt: NOW.toISOString(),
      lastSuccessAt: NOW.toISOString(),
      etag: '"v1"',
      zone: { name: "Australia/Darwin", source: "events" },
      result: { created: 2, updated: 0, deleted: 0, unchanged: 0 },
    });
    expect(state.lastError).toBeUndefined();
    expect(state.startedAt).toBeUndefined();
  });

  it("does nothing for an employer with no calendar link", async () => {
    await addEmployer({ sync: "manual" }, null);
    expect(await syncEmployer(env, "E1", NOW)).toEqual({ status: "unlinked" });
    expect(await syncEmployer(env, "nope", NOW)).toEqual({ status: "unlinked" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks the server whether anything changed, and stops there on 304", async () => {
    await addEmployer();
    fetchMock.mockResolvedValueOnce(reply(feed(darwin("A", "20261101")), { headers: { etag: '"v1"', "last-modified": "Tue, 27 Oct 2026 00:00:00 GMT" } }));
    await syncEmployer(env, "E1", NOW);

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 304 }));
    const later = new Date(NOW.getTime() + 3_600_000);
    expect(await syncEmployer(env, "E1", later)).toMatchObject({ status: "ok", created: 0 });

    const headers = fetchMock.mock.calls[1][1].headers as Record<string, string>;
    expect(headers["if-none-match"]).toBe('"v1"');
    expect(headers["if-modified-since"]).toBe("Tue, 27 Oct 2026 00:00:00 GMT");
    expect(await shifts()).toHaveLength(1);
    expect((await loadState(kv as unknown as KVNamespace, "E1")).lastSuccessAt).toBe(later.toISOString());
  });

  it("skips the work when the feed is byte-for-byte the same", async () => {
    await addEmployer();
    await syncEmployer(env, "E1", NOW);
    const before = [...kv.data.entries()].filter(([k]) => k.startsWith("shift:"));

    const outcome = await syncEmployer(env, "E1", new Date(NOW.getTime() + 3_600_000));
    expect(outcome).toMatchObject({ status: "ok", created: 0, updated: 0, deleted: 0 });
    expect([...kv.data.entries()].filter(([k]) => k.startsWith("shift:"))).toEqual(before);
  });

  it("recomputes when the break rule changes, even if the feed hasn't", async () => {
    const employer = await addEmployer({ breakRule: "none" });
    fetchMock.mockImplementation(async () => reply(feed(darwin("A", "20261101")), { headers: { etag: '"v1"' } }));
    await syncEmployer(env, "E1", NOW);
    expect((await shifts())[0].hours).toBe(9.25);

    await createStore(env.BILL_DATA, "employer", EmployerSchema).put({ ...employer, breakRule: "over5" });
    const outcome = await syncEmployer(env, "E1", new Date(NOW.getTime() + 3_600_000));

    const headers = fetchMock.mock.calls[1][1].headers as Record<string, string>;
    expect(headers["if-none-match"]).toBeUndefined();
    expect(outcome).toMatchObject({ status: "ok", updated: 1 });
    expect((await shifts())[0].hours).toBe(8.75);
  });

  it("picks up a changed, added and removed event, and leaves manual shifts alone", async () => {
    await addEmployer();
    fetchMock.mockResolvedValueOnce(reply(feed(darwin("A", "20261101"), darwin("B", "20261102"))));
    await syncEmployer(env, "E1", NOW);

    const manual: Shift = { id: "M1", employerId: "E1", date: "2026-11-02", hours: 4, source: "manual", createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() };
    await createStore(env.BILL_DATA, "shift", ShiftSchema).put(manual);

    fetchMock.mockResolvedValueOnce(reply(feed(darwin("A", "20261103"), darwin("C", "20261104"))));
    const outcome = await syncEmployer(env, "E1", new Date(NOW.getTime() + 3_600_000));
    expect(outcome).toMatchObject({ status: "ok", created: 1, updated: 1, deleted: 1 });

    const all = await shifts();
    expect(all.find((s) => s.id === "M1")).toEqual(manual);
    expect(all.filter((s) => s.source === "calendar").map((s) => [s.calendarUid, s.date]).sort()).toEqual([
      ["A", "2026-11-03"],
      ["C", "2026-11-04"],
    ]);
  });

  it("keeps a shift's creation time when it updates it", async () => {
    await addEmployer();
    await syncEmployer(env, "E1", NOW);
    const [created] = await shifts();
    fetchMock.mockResolvedValueOnce(reply(feed(darwin("A", "20261101", "083000", "180000"))));
    await syncEmployer(env, "E1", new Date(NOW.getTime() + 3_600_000));
    const [updated] = await shifts();
    expect(updated.id).toBe(created.id);
    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.updatedAt).toBe(new Date(NOW.getTime() + 3_600_000).toISOString());
  });

  it("only keeps events matching the link's filter", async () => {
    await addEmployer({}, { url: URL, match: "work" });
    fetchMock.mockResolvedValue(
      reply(feed([...darwin("W", "20261101"), "SUMMARY:Work shift"], [...darwin("D", "20261102"), "SUMMARY:Dentist"])),
    );
    await syncEmployer(env, "E1", NOW);
    expect((await shifts()).map((s) => s.calendarUid)).toEqual(["W"]);
  });

  describe("when the calendar can't be read", () => {
    beforeEach(async () => {
      await addEmployer();
      await syncEmployer(env, "E1", NOW);
    });

    const later = new Date(NOW.getTime() + 3_600_000);

    async function failsWith(error: string, response: () => Promise<Response>) {
      fetchMock.mockImplementationOnce(response);
      expect(await syncEmployer(env, "E1", later)).toEqual({ status: "error", error });
      expect(await shifts()).toHaveLength(1);
      const state = await loadState(kv as unknown as KVNamespace, "E1");
      expect(state).toMatchObject({ lastError: error, lastAttemptAt: later.toISOString(), lastSuccessAt: NOW.toISOString() });
      expect(state.startedAt).toBeUndefined();
    }

    it("a timeout", () => failsWith("timeout", async () => Promise.reject(new DOMException("timed out", "TimeoutError"))));
    it("a network error", () => failsWith("network", async () => Promise.reject(new TypeError("fetch failed"))));
    it("an error status", () => failsWith("http_500", async () => new Response("oops", { status: 500 })));
    it("a missing feed", () => failsWith("http_404", async () => new Response("no", { status: 404 })));
    it("a page that isn't a calendar", () => failsWith("not_a_calendar", async () => reply("<html>Sign in</html>")));
    it("a feed that is too big", () => failsWith("too_large", async () => reply("x", { headers: { "content-length": String(5 * 1024 * 1024) } })));

    it("clears the error on the next success", async () => {
      fetchMock.mockImplementationOnce(async () => new Response("oops", { status: 500 }));
      await syncEmployer(env, "E1", later);
      const next = new Date(later.getTime() + 3_600_000);
      expect(await syncEmployer(env, "E1", next)).toMatchObject({ status: "ok" });
      const state = await loadState(kv as unknown as KVNamespace, "E1");
      expect(state.lastError).toBeUndefined();
      expect(state.lastSuccessAt).toBe(next.toISOString());
    });

    it("an empty calendar, which it doesn't believe", async () => {
      fetchMock.mockImplementationOnce(async () => reply(feed()));
      expect(await syncEmployer(env, "E1", later)).toEqual({ status: "error", error: "empty_calendar" });
      expect(await shifts()).toHaveLength(1);
    });
  });

  it("does not start while another sync is running, but takes over once its lease is up", async () => {
    await addEmployer();
    await saveState(env.BILL_DATA, "E1", { startedAt: NOW.toISOString() });
    expect(await syncEmployer(env, "E1", new Date(NOW.getTime() + 30_000))).toEqual({ status: "busy" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await syncEmployer(env, "E1", new Date(NOW.getTime() + 90_000))).toMatchObject({ status: "ok" });
  });

  it("writes at most 500 shifts per run and finishes the rest on the next", async () => {
    await addEmployer();
    const events = Array.from({ length: 520 }, (_, i) => darwin(`E${i}`, "20261101", "090000", "120000"));
    fetchMock.mockImplementation(async () => reply(feed(...events)));

    expect(await syncEmployer(env, "E1", NOW)).toMatchObject({ status: "ok", created: 520, partial: true });
    expect(await shifts()).toHaveLength(500);

    expect(await syncEmployer(env, "E1", new Date(NOW.getTime() + 60_000))).toMatchObject({ status: "ok", created: 20, partial: false });
    expect(await shifts()).toHaveLength(520);
  });

  it("is safe to run twice at once", async () => {
    await addEmployer();
    fetchMock.mockImplementation(async () => reply(feed(darwin("A", "20261101"), darwin("B", "20261102"))));
    // The lease can't stop two syncs that read the state at the same moment; stable ids must.
    await Promise.all([syncEmployer(env, "E1", NOW), syncEmployer(env, "E1", NOW)]);
    expect(await shifts()).toHaveLength(2);
  });
});

describe("isDue", () => {
  const at = (minutesAgo: number) => new Date(NOW.getTime() - minutesAgo * 60_000).toISOString();

  it("is due when it has never synced", () => {
    expect(isDue({}, NOW)).toBe(true);
  });

  it("waits 45 minutes after a success", () => {
    expect(isDue({ lastAttemptAt: at(30), lastSuccessAt: at(30) }, NOW)).toBe(false);
    expect(isDue({ lastAttemptAt: at(46), lastSuccessAt: at(46) }, NOW)).toBe(true);
  });

  it("retries a failure after 10 minutes, not before", () => {
    expect(isDue({ lastAttemptAt: at(5), lastError: "timeout", lastSuccessAt: at(120) }, NOW)).toBe(false);
    expect(isDue({ lastAttemptAt: at(11), lastError: "timeout", lastSuccessAt: at(120) }, NOW)).toBe(true);
  });
});

describe("syncDue", () => {
  it("syncs only linked employers that are due, longest-waiting first, a few per run", async () => {
    const ago = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();
    for (const [id, minutes] of [["E1", 50], ["E2", 300], ["E3", 90], ["E4", 120], ["E5", 10]] as const) {
      await addEmployer({ id, name: id });
      await saveState(env.BILL_DATA, id, { lastAttemptAt: ago(minutes), lastSuccessAt: ago(minutes) });
    }
    await addEmployer({ id: "M", name: "Manual", sync: "manual" }, null);

    const urls: string[] = [];
    fetchMock.mockImplementation(async (url: string) => {
      urls.push(url);
      return reply(feed());
    });
    for (const id of ["E1", "E2", "E3", "E4", "E5"]) await saveSource(env.BILL_DATA, id, { url: `https://calendar.example.com/${id}.ics` });

    await syncDue(env, NOW);

    expect(MAX_PER_RUN).toBe(3);
    expect(urls.sort()).toEqual(["https://calendar.example.com/E2.ics", "https://calendar.example.com/E3.ics", "https://calendar.example.com/E4.ics"]);
  });

  it("one employer failing doesn't stop the others", async () => {
    await addEmployer({ id: "E1", name: "One" }, { url: "https://calendar.example.com/one.ics" });
    await addEmployer({ id: "E2", name: "Two" }, { url: "https://calendar.example.com/two.ics" });
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("one") ? Promise.reject(new TypeError("boom")) : reply(feed(darwin("A", "20261101"))),
    );
    await syncDue(env, NOW);
    expect((await shifts()).map((s) => s.employerId)).toEqual(["E2"]);
    expect((await loadState(kv as unknown as KVNamespace, "E1")).lastError).toBe("network");
  });
});
