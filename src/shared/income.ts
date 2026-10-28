import { addDays, diffDays, type IsoDate } from "./dates";
import type { Employer, Income, Shift } from "./schemas";

export type WeekStart = 0 | 1;

/** First day of the week containing `date`. */
export function weekStart(date: IsoDate, weekStartsOn: WeekStart): IsoDate {
  const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(date, -((dayOfWeek - weekStartsOn + 7) % 7));
}

export const weekEnd = (start: IsoDate): IsoDate => addDays(start, 6);

/** Week starts from `from` to `to` inclusive, both being week starts. */
function weekRange(from: IsoDate, to: IsoDate): IsoDate[] {
  const weeks: IsoDate[] = [];
  for (let w = from; w <= to; w = addDays(w, 7)) weeks.push(w);
  return weeks;
}

// ---- Income by week --------------------------------------------------------

export interface EmployerIncome {
  gross: number;
  net: number;
  tax: number;
  /** True if the payslip covers more than one week (fortnightly pay). */
  multiWeek: boolean;
}

export interface IncomeWeek {
  weekStart: IsoDate;
  byEmployer: Record<string, EmployerIncome>;
  gross: number;
  net: number;
  tax: number;
}

function periodWeeks(slip: Pick<Income, "periodStart" | "periodEnd">): number {
  return Math.max(1, Math.round((diffDays(slip.periodStart, slip.periodEnd) + 1) / 7));
}

/**
 * Each payslip counts in full toward the week its pay period ends in, so a fortnightly payslip
 * shows up in the second week rather than being split. Weeks with no pay in between are included as zeros.
 */
export function incomeWeeks(income: Income[], weekStartsOn: WeekStart): IncomeWeek[] {
  if (income.length === 0) return [];
  const buckets = new Map<IsoDate, IncomeWeek>();
  for (const slip of income) {
    const start = weekStart(slip.periodEnd, weekStartsOn);
    const week = buckets.get(start) ?? { weekStart: start, byEmployer: {}, gross: 0, net: 0, tax: 0 };
    const emp = (week.byEmployer[slip.employerId] ??= { gross: 0, net: 0, tax: 0, multiWeek: false });
    emp.gross += slip.gross;
    emp.net += slip.net;
    emp.tax += slip.tax;
    emp.multiWeek ||= periodWeeks(slip) > 1;
    week.gross += slip.gross;
    week.net += slip.net;
    week.tax += slip.tax;
    buckets.set(start, week);
  }
  const starts = [...buckets.keys()].sort();
  return weekRange(starts[0], starts[starts.length - 1]).map(
    (start) => buckets.get(start) ?? { weekStart: start, byEmployer: {}, gross: 0, net: 0, tax: 0 },
  );
}

// ---- Hours by week ---------------------------------------------------------

export interface ShiftWeek {
  weekStart: IsoDate;
  /** Paid hours per employer id. */
  byEmployer: Record<string, number>;
  total: number;
}

export function shiftWeeks(shifts: Shift[], weekStartsOn: WeekStart): ShiftWeek[] {
  if (shifts.length === 0) return [];
  const buckets = new Map<IsoDate, ShiftWeek>();
  for (const shift of shifts) {
    const start = weekStart(shift.date, weekStartsOn);
    const week = buckets.get(start) ?? { weekStart: start, byEmployer: {}, total: 0 };
    week.byEmployer[shift.employerId] = (week.byEmployer[shift.employerId] ?? 0) + shift.hours;
    week.total += shift.hours;
    buckets.set(start, week);
  }
  const starts = [...buckets.keys()].sort();
  return weekRange(starts[0], starts[starts.length - 1]).map(
    (start) => buckets.get(start) ?? { weekStart: start, byEmployer: {}, total: 0 },
  );
}

/** Hours between two HH:mm times; an end at or before the start means the shift runs past midnight. */
export function hoursBetween(start: string, end: string): number | null {
  const parse = (t: string) => {
    const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(t);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const a = parse(start);
  const b = parse(end);
  if (a === null || b === null) return null;
  const minutes = b > a ? b - a : b + 24 * 60 - a;
  return Math.round((minutes / 60) * 100) / 100;
}

// ---- Which weeks are fully paid --------------------------------------------

/** Last day of the most recent finished week. The current week is never counted in statistics. */
export const lastFinishedDay = (today: IsoDate, weekStartsOn: WeekStart): IsoDate =>
  addDays(weekStart(today, weekStartsOn), -1);

/** A shift unpaid for less than this is just the usual wait for payday, not worth pointing out. */
const PAY_LAG_DAYS = 28;

export interface Settlement {
  /** The last day up to which every shift worked has been paid. */
  settled: IsoDate;
  /** The earliest finished shift that no payslip covers, or null when every finished shift is covered. */
  unpaidSince: IsoDate | null;
}

/**
 * Works out how far the wages have been paid, from the payslips and shifts it is given. Weeks after
 * `settled` still have wages outstanding, so averaging them would drag the numbers down; charts fade them
 * and stats skip them. Give it one employer's records to get that employer's own answer.
 */
export function settlement(income: Income[], shifts: Shift[], today: IsoDate, weekStartsOn: WeekStart): Settlement {
  const lastPaidEnd: Record<string, IsoDate> = {};
  for (const slip of income) {
    if (slip.payDate > today) continue;
    if (!lastPaidEnd[slip.employerId] || slip.periodEnd > lastPaidEnd[slip.employerId]) {
      lastPaidEnd[slip.employerId] = slip.periodEnd;
    }
  }

  const finished = lastFinishedDay(today, weekStartsOn);
  let cutoff = finished;
  let unpaidSince: IsoDate | null = null;
  for (const shift of shifts) {
    if (shift.date > finished) continue;
    const paidEnd = lastPaidEnd[shift.employerId];
    if (paidEnd && shift.date <= paidEnd) continue;
    if (unpaidSince === null || shift.date < unpaidSince) unpaidSince = shift.date;
    // Worked but not yet paid: nothing from the start of that week onward is settled.
    const owedFrom = addDays(weekStart(shift.date, weekStartsOn), -1);
    if (owedFrom < cutoff) cutoff = owedFrom;
  }
  return { settled: cutoff, unpaidSince };
}

export const settledUntil = (income: Income[], shifts: Shift[], today: IsoDate, weekStartsOn: WeekStart): IsoDate =>
  settlement(income, shifts, today, weekStartsOn).settled;

/** Each employer's own settlement, so one employer's unpaid shifts never hold back another's numbers. */
export function settlements(
  employerIds: string[],
  income: Income[],
  shifts: Shift[],
  today: IsoDate,
  weekStartsOn: WeekStart,
): Record<string, Settlement> {
  const result: Record<string, Settlement> = {};
  for (const id of new Set([...employerIds, ...income.map((p) => p.employerId), ...shifts.map((s) => s.employerId)])) {
    result[id] = settlement(
      income.filter((p) => p.employerId === id),
      shifts.filter((x) => x.employerId === id),
      today,
      weekStartsOn,
    );
  }
  return result;
}

/** One cut-off date for everyone, or one per employer id. */
export type Settled = IsoDate | Record<string, IsoDate>;

const settledOf = (settled: Settled, employerId: string): IsoDate =>
  typeof settled === "string" ? settled : (settled[employerId] ?? "0000-00-00");

/** An employer with finished shifts that no payslip covers, for long enough that it isn't just waiting for payday. */
export interface HeldBack {
  employerId: string;
  since: IsoDate;
}

// ---- Statistics ------------------------------------------------------------

export interface IncomeStats {
  /** Number of weeks included. */
  weeks: number;
  gross: number;
  net: number;
  tax: number;
  avgNet: number | null;
  grossByEmployer: Record<string, number>;
}

/**
 * Totals the settled weeks. With one date, every employer is counted up to it. With one date per employer,
 * each employer is counted up to their own, and a week counts once any employer with pay is settled through it.
 */
export function incomeStats(weeks: IncomeWeek[], settled: Settled): IncomeStats {
  const reach =
    typeof settled === "string"
      ? settled
      : weeks.reduce((latest, w) => {
          const ends = Object.keys(w.byEmployer).map((id) => settledOf(settled, id));
          return ends.reduce((a, b) => (b > a ? b : a), latest);
        }, "0000-00-00");
  const counted = weeks.filter((w) => weekEnd(w.weekStart) <= reach);
  const stats: IncomeStats = { weeks: counted.length, gross: 0, net: 0, tax: 0, avgNet: null, grossByEmployer: {} };
  for (const w of counted) {
    for (const [employer, e] of Object.entries(w.byEmployer)) {
      if (weekEnd(w.weekStart) > settledOf(settled, employer)) continue;
      stats.gross += e.gross;
      stats.net += e.net;
      stats.tax += e.tax;
      stats.grossByEmployer[employer] = (stats.grossByEmployer[employer] ?? 0) + e.gross;
    }
  }
  if (counted.length > 0) stats.avgNet = Math.round(stats.net / counted.length);
  return stats;
}

export interface HourStats {
  totalHours: number;
  /** Finished weeks between the first shift and the last finished week. */
  weeks: number;
  avgWeeklyHours: number | null;
  /** Gross pay per paid hour, in minor units; null until there is a payslip covering worked hours. */
  avgRate: number | null;
  rateByEmployer: Record<string, number | null>;
  hoursByEmployer: Record<string, number>;
}

/**
 * Hours come from finished weeks only. Hourly rates divide gross pay by only those hours that a payslip
 * covers, so shifts still waiting to be paid don't inflate the divisor.
 */
export function hourStats(
  shifts: Shift[],
  income: Income[],
  stats: IncomeStats,
  settled: Settled,
  today: IsoDate,
  weekStartsOn: WeekStart,
): HourStats {
  const finished = lastFinishedDay(today, weekStartsOn);
  const hoursByEmployer: Record<string, number> = {};
  const billable: Record<string, number> = {};
  let totalHours = 0;

  for (const shift of shifts) {
    if (shift.date > finished) continue;
    totalHours += shift.hours;
    hoursByEmployer[shift.employerId] = (hoursByEmployer[shift.employerId] ?? 0) + shift.hours;
    const covered = shift.date <= settledOf(settled, shift.employerId) && income.some(
      (s) => s.employerId === shift.employerId && shift.date >= s.periodStart && shift.date <= s.periodEnd,
    );
    if (covered) billable[shift.employerId] = (billable[shift.employerId] ?? 0) + shift.hours;
  }

  const rateByEmployer: Record<string, number | null> = {};
  let billableHours = 0;
  let billableGross = 0;
  for (const employer of Object.keys(hoursByEmployer)) {
    const hours = billable[employer] ?? 0;
    const gross = stats.grossByEmployer[employer] ?? 0;
    rateByEmployer[employer] = hours > 0 ? Math.round(gross / hours) : null;
    // Only employers with billable hours feed the overall rate, so an unpaid job can't skew it.
    if (hours > 0) {
      billableHours += hours;
      billableGross += gross;
    }
  }

  const weeks = shiftWeeks(shifts, weekStartsOn).filter((w) => weekEnd(w.weekStart) <= finished).length;
  return {
    totalHours,
    weeks,
    avgWeeklyHours: weeks > 0 ? totalHours / weeks : null,
    avgRate: billableHours > 0 ? Math.round(billableGross / billableHours) : null,
    rateByEmployer,
    hoursByEmployer,
  };
}

// ---- Everything the Income page shows ---------------------------------------

export interface Overview {
  incomeWeeks: IncomeWeek[];
  /** Weeks up to and including the current one, so upcoming rostered weeks aren't charted. */
  shiftWeeks: ShiftWeek[];
  /** The last day any employer's pay is counted up to. */
  settledUntil: IsoDate;
  /** The day each employer's pay is counted up to. Later weeks of theirs still have wages outstanding. */
  settledByEmployer: Record<string, IsoDate>;
  /** Employers whose unpaid shifts keep their own later weeks out of the pay stats. */
  heldBack: HeldBack[];
  stats: IncomeStats;
  hours: HourStats;
  /** Employers sorted by name; charts draw and stack them in this order. */
  employers: Employer[];
}

export function overview(
  employers: Employer[],
  income: Income[],
  shifts: Shift[],
  today: IsoDate,
  weekStartsOn: WeekStart,
): Overview {
  const per = settlements(employers.map((e) => e.id), income, shifts, today, weekStartsOn);
  const settledByEmployer = Object.fromEntries(Object.entries(per).map(([id, p]) => [id, p.settled]));
  const weeks = incomeWeeks(income, weekStartsOn);
  const stats = incomeStats(weeks, settledByEmployer);
  const currentWeek = weekStart(today, weekStartsOn);
  const payers = new Set(income.map((p) => p.employerId));
  const reach = [...payers].reduce((latest, id) => (settledByEmployer[id] > latest ? settledByEmployer[id] : latest), "0000-00-00");
  const longUnpaid = addDays(today, -PAY_LAG_DAYS);
  return {
    incomeWeeks: weeks,
    shiftWeeks: shiftWeeks(shifts, weekStartsOn).filter((w) => w.weekStart <= currentWeek),
    settledUntil: payers.size > 0 ? reach : lastFinishedDay(today, weekStartsOn),
    settledByEmployer,
    heldBack: Object.entries(per)
      .filter(([, p]) => p.unpaidSince !== null && p.unpaidSince < longUnpaid)
      .map(([employerId, p]) => ({ employerId, since: p.unpaidSince! }))
      .sort((a, b) => (a.since < b.since ? -1 : 1)),
    stats,
    hours: hourStats(shifts, income, stats, settledByEmployer, today, weekStartsOn),
    employers: [...employers].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** Narrows everything to one employer, so its numbers don't depend on what the others have been paid. Null keeps all. */
export function scopeTo<T extends { employers: Employer[]; income: Income[]; shifts: Shift[] }>(employerId: string | null, data: T): T {
  if (employerId === null) return data;
  return {
    ...data,
    employers: data.employers.filter((e) => e.id === employerId),
    income: data.income.filter((p) => p.employerId === employerId),
    shifts: data.shifts.filter((s) => s.employerId === employerId),
  };
}
