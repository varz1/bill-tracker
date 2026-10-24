import { describe, expect, it } from "vitest";
import {
  endDate,
  monthlyCost,
  nextPayment,
  occurrence,
  paymentsInWindow,
  remaining,
  yearlyCost,
  type Schedule,
} from "../src/shared/schedule";

const monthly = (over: Partial<Schedule> = {}): Schedule => ({
  startDate: "2026-03-10",
  cycle: "monthly",
  totalPayments: null,
  paidAhead: [],
  ...over,
});

describe("occurrence", () => {
  it("steps by the cycle length from the start date", () => {
    expect(occurrence("2026-07-01", "weekly", 2)).toBe("2026-07-15");
    expect(occurrence("2026-07-01", "biweekly", 2)).toBe("2026-07-29");
    expect(occurrence("2026-07-01", "quarterly", 1)).toBe("2026-10-01");
    expect(occurrence("2026-07-01", "yearly", 1)).toBe("2027-07-01");
  });

  it("keeps month-end bills on the last day of each month", () => {
    const dates = [0, 1, 2, 3].map((n) => occurrence("2026-01-31", "monthly", n));
    expect(dates).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });
});

describe("nextPayment", () => {
  it("returns the start date when the bill hasn't started", () => {
    expect(nextPayment(monthly(), "2026-01-01")).toEqual({
      status: "upcoming",
      date: "2026-03-10",
      daysUntil: 68,
    });
  });

  it("counts a payment due today as upcoming", () => {
    expect(nextPayment(monthly(), "2026-06-10")).toEqual({
      status: "upcoming",
      date: "2026-06-10",
      daysUntil: 0,
    });
  });

  it("skips dates paid early", () => {
    const s = monthly({ paidAhead: ["2026-10-10"] });
    expect(nextPayment(s, "2026-10-01")).toMatchObject({ date: "2026-11-10" });
  });

  it("is finished once every payment is behind us", () => {
    const s = monthly({ totalPayments: 3 }); // Mar, Apr, May
    expect(nextPayment(s, "2026-05-10")).toMatchObject({ status: "upcoming", date: "2026-05-10" });
    expect(nextPayment(s, "2026-05-11")).toEqual({ status: "finished" });
  });

  it("is finished when the last remaining payment was paid early", () => {
    const s = monthly({ totalPayments: 3, paidAhead: ["2026-05-10"] });
    expect(nextPayment(s, "2026-05-01")).toEqual({ status: "finished" });
  });

  it("works far from the start date", () => {
    const s = monthly({ startDate: "2020-01-31" });
    expect(nextPayment(s, "2026-02-01")).toMatchObject({ date: "2026-02-28" });
  });
});

describe("endDate", () => {
  it("is the due date of the last payment", () => {
    expect(endDate(monthly({ totalPayments: 24 }))).toBe("2028-02-10");
    expect(endDate(monthly({ totalPayments: 1 }))).toBe("2026-03-10");
  });

  it("is null for an open-ended bill", () => {
    expect(endDate(monthly())).toBeNull();
  });
});

describe("remaining", () => {
  it("is null for an open-ended bill", () => {
    expect(remaining(monthly(), 1000, "2026-06-01")).toBeNull();
  });

  it("counts past and early-paid dates as paid", () => {
    const s = monthly({ totalPayments: 6, paidAhead: ["2026-07-10"] }); // Mar..Aug
    // On 2026-05-20: Mar, Apr, May are past, Jul is paid early -> 4 paid, 2 left.
    expect(remaining(s, 129000, "2026-05-20")).toEqual({
      remainingCount: 2,
      remainingAmount: 258000,
    });
  });

  it("does not count a payment due today as paid", () => {
    const s = monthly({ totalPayments: 3 });
    expect(remaining(s, 100, "2026-05-10")).toEqual({ remainingCount: 1, remainingAmount: 100 });
  });

  it("ignores early-paid dates that aren't real due dates", () => {
    const s = monthly({ totalPayments: 3, paidAhead: ["2026-04-11"] });
    expect(remaining(s, 100, "2026-01-01")?.remainingCount).toBe(3);
  });
});

describe("paymentsInWindow", () => {
  it("lists due dates inside the window, inclusive", () => {
    const s: Schedule = { startDate: "2026-07-01", cycle: "biweekly", totalPayments: null, paidAhead: [] };
    expect(paymentsInWindow(s, "2026-07-15", "2026-08-12")).toEqual([
      "2026-07-15",
      "2026-07-29",
      "2026-08-12",
    ]);
  });

  it("stops after the final payment", () => {
    const s = monthly({ totalPayments: 3 });
    expect(paymentsInWindow(s, "2026-01-01", "2026-12-31")).toEqual([
      "2026-03-10",
      "2026-04-10",
      "2026-05-10",
    ]);
  });

  it("is empty before the bill starts", () => {
    expect(paymentsInWindow(monthly(), "2026-01-01", "2026-02-28")).toEqual([]);
  });

  it("matches a brute-force scan for a window years after the start", () => {
    const s = monthly({ startDate: "2019-01-31" });
    const got = paymentsInWindow(s, "2026-01-01", "2026-06-30");
    const want = Array.from({ length: 100 }, (_, n) => occurrence(s.startDate, s.cycle, n)).filter(
      (d) => d >= "2026-01-01" && d <= "2026-06-30",
    );
    expect(got).toEqual(want);
    expect(got).toHaveLength(6);
  });
});

describe("cost normalisation", () => {
  it("converts any cycle to yearly and monthly minor units", () => {
    expect(yearlyCost(42400, "biweekly")).toBe(42400 * 26);
    expect(monthlyCost(129000, "monthly")).toBe(129000);
    expect(monthlyCost(1200, "yearly")).toBe(100);
    expect(monthlyCost(42400, "biweekly")).toBe(91867);
  });
});
