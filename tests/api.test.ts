import { beforeEach, describe, expect, it } from "vitest";
import app from "../src/worker/index";
import { asEnv, FakeKV } from "./helpers/fakeKv";

type Item = { id: string; createdAt: string; updatedAt: string } & Record<string, unknown>;

let kv: FakeKV;

beforeEach(() => {
  kv = new FakeKV();
});

const call = (path: string, init?: { method?: string; body?: unknown }) =>
  app.request(
    path,
    {
      method: init?.method ?? "GET",
      headers: { "content-type": "application/json" },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    },
    asEnv(kv),
  );

const rent = { name: "Rent", amount: 42400, cycle: "biweekly", startDate: "2026-07-01", totalPayments: null };

describe("health", () => {
  it("responds ok", async () => {
    const res = await call("/api/health");
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("bills CRUD", () => {
  it("creates, reads, updates and deletes a bill", async () => {
    const created = await call("/api/bills", { method: "POST", body: rent });
    expect(created.status).toBe(201);
    const { item } = (await created.json()) as { item: Item };
    expect(item).toMatchObject({ ...rent, paidAhead: [] });
    expect(item.id).toMatch(/^[0-9A-Z]{26}$/);
    expect(item.createdAt).toBe(item.updatedAt);

    const fetched = await call(`/api/bills/${item.id}`);
    expect(((await fetched.json()) as { item: unknown }).item).toEqual(item);

    const patched = await call(`/api/bills/${item.id}`, { method: "PATCH", body: { amount: 50000 } });
    const { item: updated } = (await patched.json()) as { item: Item };
    expect(updated).toMatchObject({ ...rent, amount: 50000, id: item.id, createdAt: item.createdAt });
    expect(updated.updatedAt >= item.updatedAt).toBe(true);

    expect((await call(`/api/bills/${item.id}`, { method: "DELETE" })).status).toBe(204);
    expect((await call(`/api/bills/${item.id}`)).status).toBe(404);
  });

  it("stores one KV key per bill", async () => {
    const { item } = (await (await call("/api/bills", { method: "POST", body: rent })).json()) as {
      item: { id: string };
    };
    expect([...kv.data.keys()]).toEqual([`bill:${item.id}`]);
  });

  it("rejects invalid bodies with 400 and field issues", async () => {
    const res = await call("/api/bills", { method: "POST", body: { ...rent, amount: 19.99 } });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; issues: { path: unknown[] }[] };
    expect(body.error).toBe("invalid_body");
    expect(body.issues[0].path).toEqual(["amount"]);
    expect(kv.data.size).toBe(0);
  });

  it("rejects malformed JSON", async () => {
    const res = await app.request(
      "/api/bills",
      { method: "POST", headers: { "content-type": "application/json" }, body: "{nope" },
      asEnv(kv),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("invalid_json");
  });

  it("returns 404 when patching a missing bill, and delete is idempotent", async () => {
    expect((await call("/api/bills/NOPE", { method: "PATCH", body: { amount: 1 } })).status).toBe(404);
    expect((await call("/api/bills/NOPE", { method: "DELETE" })).status).toBe(204);
  });

  it("rejects a patch that would make the record invalid", async () => {
    const { item } = (await (await call("/api/bills", { method: "POST", body: rent })).json()) as {
      item: { id: string };
    };
    const res = await call(`/api/bills/${item.id}`, { method: "PATCH", body: { startDate: "2026-02-30" } });
    expect(res.status).toBe(400);
  });

  it("lists every bill across KV pages, oldest first", async () => {
    for (let i = 0; i < 8; i++) {
      await call("/api/bills", { method: "POST", body: { ...rent, name: `Bill ${i}` } });
      await new Promise((r) => setTimeout(r, 2)); // distinct ULID timestamps
    }
    const { items } = (await (await call("/api/bills")).json()) as { items: { name: string }[] };
    expect(items.map((b) => b.name)).toEqual(Array.from({ length: 8 }, (_, i) => `Bill ${i}`));
  });

  it("batches reads in groups of at most 100 keys", async () => {
    const big = new FakeKV(1000);
    for (let i = 0; i < 250; i++) {
      const id = `ID${String(i).padStart(3, "0")}`;
      big.data.set(
        `bill:${id}`,
        JSON.stringify({
          ...rent,
          id,
          paidAhead: [],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
      );
    }
    const res = await app.request("/api/bills", {}, asEnv(big));
    expect(((await res.json()) as { items: unknown[] }).items).toHaveLength(250);
    expect(big.bulkSizes).toEqual([100, 100, 50]);
  });

  it("skips records that no longer match the schema instead of failing the list", async () => {
    kv.data.set("bill:BAD", JSON.stringify({ id: "BAD", name: 42 }));
    await call("/api/bills", { method: "POST", body: rent });
    const { items } = (await (await call("/api/bills")).json()) as { items: unknown[] };
    expect(items).toHaveLength(1);
  });
});

describe("shifts", () => {
  it("always creates manual shifts, ignoring a client-supplied source", async () => {
    const res = await call("/api/shifts", {
      method: "POST",
      body: { date: "2026-05-05", employer: "Cafe", hours: 4, start: "11:00", end: "15:00", source: "calendar" },
    });
    expect(res.status).toBe(201);
    const { item } = (await res.json()) as { item: { source: string; calendarUid?: string } };
    expect(item.source).toBe("manual");
    expect(item.calendarUid).toBeUndefined();
  });
});

describe("income", () => {
  it("stores a payslip in integer cents", async () => {
    const payslip = {
      employer: "Cafe",
      payDate: "2026-05-06",
      periodStart: "2026-04-27",
      periodEnd: "2026-05-03",
      gross: 20352,
      tax: 3000,
      net: 17352,
      super: 2442,
    };
    const res = await call("/api/income", { method: "POST", body: payslip });
    expect(res.status).toBe(201);
    expect(((await res.json()) as { item: unknown }).item).toMatchObject(payslip);
  });
});

describe("settings", () => {
  it("returns defaults until changed, then merges patches", async () => {
    const initial = (await (await call("/api/settings")).json()) as { settings: Record<string, unknown> };
    expect(initial.settings).toEqual({ currency: "AUD", weekStartsOn: 1 });

    await call("/api/settings", { method: "PATCH", body: { currency: "USD", weekStartsOn: 0 } });
    const after = (await (await call("/api/settings")).json()) as { settings: Record<string, unknown> };
    expect(after.settings).toEqual({ currency: "USD", weekStartsOn: 0 });
  });

  it("rejects an invalid currency code", async () => {
    expect((await call("/api/settings", { method: "PATCH", body: { currency: "dollars" } })).status).toBe(400);
  });
});

describe("unknown routes", () => {
  it("return a JSON 404", async () => {
    const res = await call("/api/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });
});
