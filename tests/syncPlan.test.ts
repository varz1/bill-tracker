import { describe, expect, it } from "vitest";
import type { CalendarShift } from "../src/shared/calendar";
import type { Shift } from "../src/shared/schemas";
import { calendarShiftId, calendarShiftPrefix, planSync } from "../src/shared/syncPlan";

const window = { from: "2026-10-14", to: "2027-01-26" };
const NOW = "2026-10-28T00:00:00.000Z";
const TODAY = "2026-10-28";

const want = (key: string, date: string, over: Partial<CalendarShift> = {}): CalendarShift => ({
  key,
  date,
  start: "09:00",
  end: "17:00",
  hours: 8,
  ...over,
});

const have = (key: string, date: string, over: Partial<Shift> = {}): Shift => ({
  id: calendarShiftId("E1", key),
  employerId: "E1",
  date,
  hours: 8,
  start: "09:00",
  end: "17:00",
  source: "calendar",
  calendarUid: key,
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

const manual = (id: string, date: string, over: Partial<Shift> = {}): Shift => ({
  id,
  employerId: "E1",
  date,
  hours: 4,
  source: "manual",
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

describe("planSync", () => {
  it("creates shifts it has not seen, with a stable id", () => {
    const plan = planSync("E1", [want("A", "2026-10-30")], [], window, TODAY);
    expect(plan.create).toEqual([
      { id: calendarShiftId("E1", "A"), employerId: "E1", date: "2026-10-30", hours: 8, start: "09:00", end: "17:00", source: "calendar", calendarUid: "A" },
    ]);
    expect(plan.update).toEqual([]);
    expect(plan.delete).toEqual([]);
  });

  it("changes nothing when the calendar matches what is stored", () => {
    const plan = planSync("E1", [want("A", "2026-10-30")], [have("A", "2026-10-30")], window, TODAY);
    expect(plan).toEqual({ create: [], update: [], delete: [], unchanged: 1, kept: 0, suspiciousEmpty: false });
  });

  it("is idempotent: applying a plan and planning again changes nothing", () => {
    const desired = [want("A", "2026-10-30"), want("B", "2026-11-02", { hours: 7.5 })];
    const first = planSync("E1", desired, [], window, TODAY);
    const stored = first.create.map((p) => ({ ...p, createdAt: NOW, updatedAt: NOW }) as Shift);
    const second = planSync("E1", desired, stored, window, TODAY);
    expect([second.create.length, second.update.length, second.delete.length, second.unchanged]).toEqual([0, 0, 0, 2]);
  });

  it("updates a shift whose date, times or hours changed, keeping its id", () => {
    const stored = have("A", "2026-10-30");
    expect(planSync("E1", [want("A", "2026-10-31")], [stored], window, TODAY).update[0]).toMatchObject({ id: stored.id, date: "2026-10-31" });
    expect(planSync("E1", [want("A", "2026-10-30", { end: "18:00" })], [stored], window, TODAY).update).toHaveLength(1);
    expect(planSync("E1", [want("A", "2026-10-30", { hours: 7.5 })], [stored], window, TODAY).update).toHaveLength(1);
  });

  it("deletes a calendar shift that left the calendar", () => {
    const plan = planSync("E1", [want("B", "2026-11-02")], [have("A", "2026-10-30"), have("B", "2026-11-02")], window, TODAY);
    expect(plan.delete).toEqual([calendarShiftId("E1", "A")]);
  });

  it("never touches manual shifts, even on the same day", () => {
    const plan = planSync("E1", [want("A", "2026-10-30")], [manual("M1", "2026-10-30")], window, TODAY);
    expect(plan.create).toHaveLength(1);
    expect(plan.delete).toEqual([]);
    expect(plan.update).toEqual([]);
  });

  it("never touches another employer's shifts", () => {
    const other = have("A", "2026-10-30", { id: "other", employerId: "E2" });
    const plan = planSync("E1", [], [other], window, TODAY);
    expect(plan.delete).toEqual([]);
    expect(plan.suspiciousEmpty).toBe(false);
  });

  it("keeps calendar shifts that fall outside the window", () => {
    const old = have("OLD", "2026-06-01");
    const plan = planSync("E1", [want("A", "2026-10-30")], [old], window, TODAY);
    expect(plan.delete).toEqual([]);
  });

  it("updates a shift that moved into the window", () => {
    const stored = have("A", "2026-06-01");
    const plan = planSync("E1", [want("A", "2026-10-30")], [stored], window, TODAY);
    expect(plan.update[0]).toMatchObject({ id: stored.id, date: "2026-10-30" });
    expect(plan.create).toEqual([]);
  });

  it("never deletes a shift that has already happened, even inside the window", () => {
    const past = have("PAST", "2026-10-20");
    const today = have("TODAY", "2026-10-28");
    const plan = planSync("E1", [want("KEEP", "2026-11-05")], [past, today, have("LATER", "2026-11-02")], window, TODAY);
    expect(plan.delete.sort()).toEqual([calendarShiftId("E1", "TODAY"), calendarShiftId("E1", "LATER")].sort());
    expect(plan.delete).not.toContain(past.id);
  });

  it("still updates a past shift whose hours were corrected in the calendar", () => {
    const plan = planSync("E1", [want("PAST", "2026-10-20", { hours: 7 })], [have("PAST", "2026-10-20")], window, TODAY);
    expect(plan.update).toHaveLength(1);
  });

  it("leaves a kept shift alone instead of writing over it when the calendar is linked again", () => {
    const kept = have("A", "2026-10-30", { source: "manual", calendarUid: undefined, hours: 3.5 });
    const plan = planSync("E1", [want("A", "2026-10-30")], [kept], window, TODAY);
    expect(plan.create).toEqual([]);
    expect(plan.update).toEqual([]);
    expect(plan.kept).toBe(1);
  });

  it("deletes nothing when the calendar comes back empty, and says so", () => {
    const plan = planSync("E1", [], [have("A", "2026-10-30"), have("B", "2026-11-02")], window, TODAY);
    expect(plan.delete).toEqual([]);
    expect(plan.suspiciousEmpty).toBe(true);
  });

  it("an empty calendar is fine when nothing is stored in the window", () => {
    expect(planSync("E1", [], [have("OLD", "2026-06-01")], window, TODAY)).toEqual({ create: [], update: [], delete: [], unchanged: 0, kept: 0, suspiciousEmpty: false });
  });

  it("removes duplicate copies of one event inside the window", () => {
    const a = have("A", "2026-10-30");
    const dup = have("A", "2026-10-30", { id: "dup" });
    const plan = planSync("E1", [want("A", "2026-10-30")], [a, dup], window, TODAY);
    expect(plan.delete).toEqual(["dup"]);
    expect(plan.unchanged).toBe(1);
  });
});

describe("calendarShiftPrefix", () => {
  it("starts every id of that employer's calendar shifts, and no one else's", () => {
    expect(calendarShiftId("E1", "A").startsWith(calendarShiftPrefix("E1"))).toBe(true);
    expect(calendarShiftId("E1", "B").startsWith(calendarShiftPrefix("E1"))).toBe(true);
    expect(calendarShiftId("E2", "A").startsWith(calendarShiftPrefix("E1"))).toBe(false);
  });
});

describe("calendarShiftId", () => {
  it("depends on both the employer and the event, and fits a record id", () => {
    expect(calendarShiftId("E1", "A")).toBe(calendarShiftId("E1", "A"));
    expect(calendarShiftId("E1", "A")).not.toBe(calendarShiftId("E2", "A"));
    expect(calendarShiftId("E1", "A")).not.toBe(calendarShiftId("E1", "B"));
    expect(calendarShiftId("E1", "A".repeat(256)).length).toBeLessThanOrEqual(64);
  });
});
