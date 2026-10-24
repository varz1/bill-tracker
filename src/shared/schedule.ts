import { addDays, addMonths, diffDays, type IsoDate } from "./dates";

export const CYCLES = ["weekly", "biweekly", "monthly", "quarterly", "yearly"] as const;
export type Cycle = (typeof CYCLES)[number];

export const PER_YEAR: Record<Cycle, number> = {
  weekly: 52,
  biweekly: 26,
  monthly: 12,
  quarterly: 4,
  yearly: 1,
};

/** The fields of a bill that determine when payments fall due. */
export interface Schedule {
  startDate: IsoDate;
  cycle: Cycle;
  /** Number of payments, or null for an open-ended bill. */
  totalPayments: number | null;
  /** Due dates the user has already paid early. */
  paidAhead: readonly IsoDate[];
}

export type NextPayment =
  | { status: "upcoming"; date: IsoDate; daysUntil: number }
  | { status: "finished" };

/** The due date of the n-th payment (0-based), counted from the start date. */
export function occurrence(startDate: IsoDate, cycle: Cycle, n: number): IsoDate {
  switch (cycle) {
    case "weekly":
      return addDays(startDate, 7 * n);
    case "biweekly":
      return addDays(startDate, 14 * n);
    case "monthly":
      return addMonths(startDate, n);
    case "quarterly":
      return addMonths(startDate, 3 * n);
    case "yearly":
      return addMonths(startDate, 12 * n);
  }
}

// Longest possible length of one cycle in days, so dividing by it never overshoots the true index.
const MAX_CYCLE_DAYS: Record<Cycle, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 31,
  quarterly: 92,
  yearly: 366,
};

/** An index n such that occurrence(n) is on or before `date`; used to skip ahead without looping from the start. */
function indexNear(startDate: IsoDate, cycle: Cycle, date: IsoDate): number {
  return Math.max(0, Math.floor(diffDays(startDate, date) / MAX_CYCLE_DAYS[cycle]));
}

/** Due date of the final payment, or null for an open-ended bill. */
export function endDate(s: Pick<Schedule, "startDate" | "cycle" | "totalPayments">): IsoDate | null {
  return s.totalPayments === null ? null : occurrence(s.startDate, s.cycle, s.totalPayments - 1);
}

/** The first due date on or after `today` that hasn't been paid early. */
export function nextPayment(s: Schedule, today: IsoDate): NextPayment {
  const paid = new Set(s.paidAhead);
  for (let n = indexNear(s.startDate, s.cycle, today); s.totalPayments === null || n < s.totalPayments; n++) {
    const date = occurrence(s.startDate, s.cycle, n);
    if (date >= today && !paid.has(date)) {
      return { status: "upcoming", date, daysUntil: diffDays(today, date) };
    }
  }
  return { status: "finished" };
}

/** Payments still to make, counting a due date as paid once it is before `today` or marked paid early. */
export function remaining(
  s: Schedule,
  amount: number,
  today: IsoDate,
): { remainingCount: number; remainingAmount: number } | null {
  if (s.totalPayments === null) return null;
  const paid = new Set(s.paidAhead);
  let paidCount = 0;
  for (let n = 0; n < s.totalPayments; n++) {
    const date = occurrence(s.startDate, s.cycle, n);
    if (date < today || paid.has(date)) paidCount++;
  }
  const remainingCount = s.totalPayments - paidCount;
  return { remainingCount, remainingAmount: remainingCount * amount };
}

/** Every due date within [from, to], inclusive. */
export function paymentsInWindow(s: Schedule, from: IsoDate, to: IsoDate): IsoDate[] {
  const dates: IsoDate[] = [];
  for (let n = indexNear(s.startDate, s.cycle, from); s.totalPayments === null || n < s.totalPayments; n++) {
    const date = occurrence(s.startDate, s.cycle, n);
    if (date > to) break;
    if (date >= from) dates.push(date);
  }
  return dates;
}

/** Cost per year / per month in minor units. Monthly is rounded to the nearest unit. */
export const yearlyCost = (amount: number, cycle: Cycle) => amount * PER_YEAR[cycle];
export const monthlyCost = (amount: number, cycle: Cycle) => Math.round((amount * PER_YEAR[cycle]) / 12);
