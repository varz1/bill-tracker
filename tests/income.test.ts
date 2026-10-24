import { describe, expect, it } from "vitest";
import {
  employerColors,
  hoursBetween,
  hourStats,
  incomeStats,
  incomeWeeks,
  lastFinishedDay,
  overview,
  settledUntil,
  shiftWeeks,
  weekStart,
} from "../src/shared/income";
import type { Income, Shift } from "../src/shared/schemas";

const META = { createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };

let n = 0;
const slip = (over: Partial<Income>): Income => ({
  id: `I${n++}`,
  employer: "Shop",
  payDate: "2026-10-07",
  periodStart: "2026-09-28",
  periodEnd: "2026-10-04",
  gross: 100000,
  tax: 20000,
  net: 80000,
  super: 12000,
  ...META,
  ...over,
});
const shift = (date: string, hours: number, employer = "Shop"): Shift => ({
  id: `S${n++}`,
  date,
  employer,
  hours,
  source: "manual",
  ...META,
});

// 2026-10-24 is a Saturday. With weeks starting Monday, the current week is Oct 19-25.
const TODAY = "2026-10-24";

describe("weekStart", () => {
  it("finds the Monday or Sunday that starts the week", () => {
    expect(weekStart("2026-10-24", 1)).toBe("2026-10-19"); // Saturday
    expect(weekStart("2026-10-19", 1)).toBe("2026-10-19"); // already Monday
    expect(weekStart("2026-10-25", 1)).toBe("2026-10-19"); // Sunday belongs to the previous Monday's week
    expect(weekStart("2026-10-25", 0)).toBe("2026-10-25");
    expect(weekStart("2026-10-24", 0)).toBe("2026-10-18");
  });
});

describe("hoursBetween", () => {
  it("computes decimal hours, including overnight shifts", () => {
    expect(hoursBetween("09:00", "17:30")).toBe(8.5);
    expect(hoursBetween("22:00", "06:00")).toBe(8);
    expect(hoursBetween("08:20", "12:00")).toBe(3.67);
  });

  it("returns null for invalid times", () => {
    expect(hoursBetween("9:00", "17:00")).toBeNull();
    expect(hoursBetween("09:00", "25:00")).toBeNull();
  });
});

describe("incomeWeeks", () => {
  it("is empty without payslips", () => {
    expect(incomeWeeks([], 1)).toEqual([]);
  });

  it("puts each payslip in the week its period ends and fills gaps with zero weeks", () => {
    const weeks = incomeWeeks(
      [
        slip({ periodStart: "2026-09-14", periodEnd: "2026-09-20" }),
        slip({ periodStart: "2026-09-28", periodEnd: "2026-10-04", gross: 50000, net: 40000, tax: 10000 }),
      ],
      1,
    );
    expect(weeks.map((w) => [w.weekStart, w.gross])).toEqual([
      ["2026-09-14", 100000],
      ["2026-09-21", 0],
      ["2026-09-28", 50000],
    ]);
  });

  it("counts a fortnightly payslip once, in its second week, and flags it", () => {
    const weeks = incomeWeeks([slip({ periodStart: "2026-09-21", periodEnd: "2026-10-04" })], 1);
    expect(weeks).toHaveLength(1);
    expect(weeks[0].weekStart).toBe("2026-09-28");
    expect(weeks[0].byEmployer.Shop.multiWeek).toBe(true);
  });

  it("adds up several employers in one week", () => {
    const [week] = incomeWeeks([slip({ employer: "A", gross: 100 }), slip({ employer: "B", gross: 250 })], 1);
    expect(week.gross).toBe(350);
    expect(Object.keys(week.byEmployer).sort()).toEqual(["A", "B"]);
  });
});

describe("shiftWeeks", () => {
  it("sums hours per employer per week", () => {
    const weeks = shiftWeeks([shift("2026-10-19", 7.6), shift("2026-10-20", 7.6), shift("2026-10-21", 4, "Other")], 1);
    expect(weeks).toHaveLength(1);
    expect(weeks[0].byEmployer.Shop).toBeCloseTo(15.2);
    expect(weeks[0].total).toBeCloseTo(19.2);
  });
});

describe("settledUntil", () => {
  it("is the end of the last finished week when everything worked has been paid", () => {
    expect(lastFinishedDay(TODAY, 1)).toBe("2026-10-18");
    const income = [slip({ payDate: "2026-10-21", periodStart: "2026-10-12", periodEnd: "2026-10-18" })];
    const shifts = [shift("2026-10-13", 8), shift("2026-10-17", 8)];
    expect(settledUntil(income, shifts, TODAY, 1)).toBe("2026-10-18");
  });

  it("stops before a week whose wages haven't been paid yet", () => {
    // Paid up to Oct 11, but shifts were worked in the week of Oct 12-18.
    const income = [slip({ payDate: "2026-10-14", periodStart: "2026-10-05", periodEnd: "2026-10-11" })];
    const shifts = [shift("2026-10-06", 8), shift("2026-10-14", 8)];
    expect(settledUntil(income, shifts, TODAY, 1)).toBe("2026-10-11");
  });

  it("ignores payslips dated in the future", () => {
    const income = [slip({ payDate: "2026-10-28", periodStart: "2026-10-12", periodEnd: "2026-10-18" })];
    expect(settledUntil(income, [shift("2026-10-14", 8)], TODAY, 1)).toBe("2026-10-11");
  });

  it("treats shifts for an employer with no payslips as unpaid", () => {
    expect(settledUntil([], [shift("2026-10-06", 8)], TODAY, 1)).toBe("2026-10-04");
  });

  it("does not count shifts in the current, unfinished week", () => {
    expect(settledUntil([], [shift("2026-10-22", 8)], TODAY, 1)).toBe("2026-10-18");
  });
});

describe("incomeStats", () => {
  const weeks = incomeWeeks(
    [
      slip({ periodStart: "2026-09-28", periodEnd: "2026-10-04", gross: 100000, net: 80000, tax: 20000 }),
      slip({ periodStart: "2026-10-05", periodEnd: "2026-10-11", gross: 120000, net: 96000, tax: 24000 }),
      slip({ periodStart: "2026-10-12", periodEnd: "2026-10-18", gross: 110000, net: 88000, tax: 22000 }),
    ],
    1,
  );

  it("totals only the settled weeks", () => {
    const stats = incomeStats(weeks, "2026-10-11");
    expect(stats).toMatchObject({ weeks: 2, gross: 220000, net: 176000, tax: 44000, avgNet: 88000 });
    expect(stats.grossByEmployer).toEqual({ Shop: 220000 });
  });

  it("has no average before anything is settled", () => {
    expect(incomeStats(weeks, "2026-09-01")).toMatchObject({ weeks: 0, gross: 0, avgNet: null });
  });
});

describe("hourStats", () => {
  const income = [
    slip({ payDate: "2026-10-07", periodStart: "2026-09-28", periodEnd: "2026-10-04", gross: 114000 }),
    slip({ payDate: "2026-10-14", periodStart: "2026-10-05", periodEnd: "2026-10-11", gross: 114000 }),
  ];
  const week = (monday: string) =>
    [0, 1, 2, 3, 4].map((d) => shift(new Date(Date.parse(monday) + d * 86_400_000).toISOString().slice(0, 10), 7.6));
  // Two paid weeks (38h each) and a finished week (Oct 12-18) that hasn't been paid yet, plus the current week.
  const shifts = [...week("2026-09-28"), ...week("2026-10-05"), ...week("2026-10-12"), shift("2026-10-22", 7.6)];

  const settled = settledUntil(income, shifts, TODAY, 1);
  const stats = incomeStats(incomeWeeks(income, 1), settled);
  const hours = hourStats(shifts, income, stats, settled, TODAY, 1);

  it("counts hours from finished weeks only", () => {
    expect(settled).toBe("2026-10-11");
    expect(hours.totalHours).toBeCloseTo(3 * 38);
    expect(hours.weeks).toBe(3);
    expect(hours.avgWeeklyHours).toBeCloseTo(38);
  });

  it("divides gross by only the hours that payslips cover", () => {
    // 2 payslips of $1,140 over 76 paid hours -> $30/h. The unpaid third week must not dilute it.
    expect(hours.avgRate).toBe(3000);
    expect(hours.rateByEmployer.Shop).toBe(3000);
  });

  it("has no rate while no payslip covers any worked hour", () => {
    const none = hourStats(shifts, [], incomeStats([], settled), settled, TODAY, 1);
    expect(none.avgRate).toBeNull();
  });
});

describe("employerColors", () => {
  it("assigns palette colours by sorted name, ignoring input order and duplicates", () => {
    const a = employerColors(["Zeta", "Alpha", "Zeta"]);
    const b = employerColors(["Alpha", "Zeta"]);
    expect(a).toEqual(b);
    expect(a.Alpha).not.toBe(a.Zeta);
  });

  it("wraps around when there are more employers than colours", () => {
    const colors = employerColors(Array.from({ length: 8 }, (_, i) => `E${i}`));
    expect(Object.keys(colors)).toHaveLength(8);
  });
});

describe("overview", () => {
  it("is empty and safe with no data", () => {
    const o = overview([], [], TODAY, 1);
    expect(o.incomeWeeks).toEqual([]);
    expect(o.employers).toEqual([]);
    expect(o.stats.avgNet).toBeNull();
    expect(o.hours.avgRate).toBeNull();
  });

  it("lists employers from both payslips and shifts, and leaves future weeks out of the hours chart", () => {
    const o = overview(
      [slip({ employer: "Shop" })],
      [shift("2026-10-05", 8, "Cafe"), shift("2026-10-22", 8, "Cafe"), shift("2026-10-29", 8, "Cafe")],
      TODAY,
      1,
    );
    expect(o.employers).toEqual(["Cafe", "Shop"]);
    expect(o.shiftWeeks.at(-1)?.weekStart).toBe("2026-10-19"); // Oct 26 week is in the future
  });
});
