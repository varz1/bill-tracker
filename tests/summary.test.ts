import { describe, expect, it } from "vitest";
import { amountToInput, createFormatters, formatHours, formatShiftHours, parseAmount } from "../src/shared/format";
import type { Bill } from "../src/shared/schemas";
import { sortViews, timeline, totals, viewBill } from "../src/shared/summary";

const bill = (over: Partial<Bill> = {}): Bill => ({
  id: "B1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  name: "Rent",
  amount: 120000,
  cycle: "monthly",
  startDate: "2026-01-05",
  totalPayments: null,
  paidAhead: [],
  ...over,
});

const TODAY = "2026-10-24";

describe("viewBill", () => {
  it("combines next payment, end date, remaining and monthly cost", () => {
    const view = viewBill(bill({ id: "L", amount: 129000, startDate: "2026-03-10", totalPayments: 24 }), TODAY);
    expect(view.next).toEqual({ status: "upcoming", date: "2026-11-10", daysUntil: 17 });
    expect(view.endDate).toBe("2028-02-10");
    expect(view.remaining).toEqual({ remainingCount: 16, remainingAmount: 16 * 129000 });
    expect(view.monthly).toBe(129000);
  });
});

describe("totals", () => {
  it("normalises every cycle to per-year, then derives the other periods", () => {
    const t = totals(
      [bill({ amount: 120000 }), bill({ id: "B2", amount: 10000, cycle: "weekly", startDate: "2026-10-01" })],
      TODAY,
    );
    expect(t.yearly).toBe(120000 * 12 + 10000 * 52);
    expect(t.monthly).toBe(Math.round(t.yearly / 12));
    expect(t.weekly).toBe(Math.round(t.yearly / 52));
    expect(t.biweekly).toBe(Math.round(t.yearly / 26));
  });

  it("leaves out bills that are fully paid off", () => {
    const done = bill({ id: "B3", startDate: "2026-01-01", totalPayments: 3 }); // Jan-Mar, over by October
    expect(totals([done], TODAY).yearly).toBe(0);
    expect(totals([done, bill()], TODAY).yearly).toBe(120000 * 12);
  });

  it("is zero with no bills", () => {
    expect(totals([], TODAY)).toEqual({ weekly: 0, biweekly: 0, monthly: 0, yearly: 0 });
  });
});

describe("sortViews", () => {
  it("orders by next payment date and puts finished bills last", () => {
    const later = bill({ id: "A", name: "Later", startDate: "2026-01-28" });
    const sooner = bill({ id: "B", name: "Sooner", startDate: "2026-01-26" });
    const done = bill({ id: "C", name: "Done", startDate: "2026-01-01", totalPayments: 2 });
    const order = sortViews([done, later, sooner].map((b) => viewBill(b, TODAY))).map((v) => v.bill.name);
    expect(order).toEqual(["Sooner", "Later", "Done"]);
  });
});

describe("timeline", () => {
  it("lists payments 15 days either side of today, oldest first", () => {
    const rent = bill({ name: "Rent", startDate: "2026-01-30" }); // due on the 30th: Oct 30 is in the window
    const gym = bill({ id: "B2", name: "Gym", startDate: "2026-10-01", cycle: "weekly" });
    const events = timeline([rent, gym], TODAY); // window: Oct 9 - Nov 8
    expect(events.map((e) => [e.date, e.name, e.daysFromToday])).toEqual([
      ["2026-10-15", "Gym", -9],
      ["2026-10-22", "Gym", -2],
      ["2026-10-29", "Gym", 5],
      ["2026-10-30", "Rent", 6],
      ["2026-11-05", "Gym", 12],
    ]);
  });

  it("marks early-paid dates and carries remaining info", () => {
    // 12 monthly payments from Mar 30: Mar-Sep are past (7), Oct 30 is paid early (8) -> 4 left (Nov-Feb).
    const b = bill({ startDate: "2026-03-30", totalPayments: 12, paidAhead: ["2026-10-30"] });
    const [event] = timeline([b], TODAY);
    expect(event).toMatchObject({ date: "2026-10-30", daysFromToday: 6, paidAhead: true });
    expect(event.remaining).toEqual({ remainingCount: 4, remainingAmount: 4 * 120000 });
  });
});

describe("formatters", () => {
  const fmt = createFormatters({ currency: "AUD", locale: "en-AU" });

  it("strips .00 from whole amounts only", () => {
    expect(fmt.money(129000)).toBe("$1,290");
    expect(fmt.money(42450)).toBe("$424.50");
    expect(fmt.money(0)).toBe("$0");
  });

  it("uses the configured currency and locale", () => {
    expect(createFormatters({ currency: "USD", locale: "en-US" }).money(129000)).toBe("$1,290");
    expect(createFormatters({ currency: "AUD", locale: "en-US" }).money(129000)).toBe("A$1,290");
  });

  it("includes the weekday when asked", () => {
    expect(fmt.weekdayDate("2026-10-24")).toBe("Sat 24 Oct");
  });

  it("shows the year only when it differs from today's", () => {
    expect(fmt.date("2026-10-24")).toBe("24 Oct");
    expect(fmt.dateSmart("2026-12-01", "2026-10-24")).toBe("1 Dec");
    expect(fmt.dateSmart("2027-12-01", "2026-10-24")).toBe("1 Dec 2027");
  });
});

describe("amount parsing", () => {
  it("parses positive decimals into minor units", () => {
    expect(parseAmount("1,290.50")).toBe(129050);
    expect(parseAmount(" 19.99 ")).toBe(1999);
  });

  it("rejects empty, zero, negative and non-numeric input", () => {
    for (const bad of ["", "0", "-5", "abc", "1e999"]) expect(parseAmount(bad)).toBeNull();
  });

  it("accepts zero only when asked to", () => {
    expect(parseAmount("0")).toBeNull();
    expect(parseAmount("0", { allowZero: true })).toBe(0);
    expect(parseAmount("", { allowZero: true })).toBeNull();
    expect(parseAmount("-1", { allowZero: true })).toBeNull();
  });

  it("formats hours with at most one decimal", () => {
    expect(formatHours(38)).toBe("38h");
    expect(formatHours(7.6)).toBe("7.6h");
    expect(formatHours(7.64)).toBe("7.6h");
    expect(formatHours(0)).toBe("0h");
  });

  it("formatShiftHours keeps quarter hours", () => {
    expect(formatShiftHours(6.25)).toBe("6.25h");
    expect(formatShiftHours(4.75)).toBe("4.75h");
    expect(formatShiftHours(8)).toBe("8h");
    expect(formatShiftHours(7.6)).toBe("7.6h");
  });

  it("round-trips through the form input representation", () => {
    expect(amountToInput(42400)).toBe("424");
    expect(amountToInput(42450)).toBe("424.5");
    expect(parseAmount(amountToInput(42450))).toBe(42450);
  });
});
