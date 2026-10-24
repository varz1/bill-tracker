// Calendar dates are plain "YYYY-MM-DD" strings. All arithmetic goes through UTC
// so results never depend on the machine's time zone or DST.

export type IsoDate = string;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export function isValidIsoDate(value: string): boolean {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1900 || y > 2999) return false;
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

function parse(date: IsoDate): [number, number, number] {
  if (!isValidIsoDate(date)) throw new RangeError(`Invalid date: ${date}`);
  const [y, m, d] = date.split("-").map(Number);
  return [y, m, d];
}

function toMs(date: IsoDate): number {
  const [y, m, d] = parse(date);
  return Date.UTC(y, m - 1, d);
}
const fromMs = (ms: number): IsoDate => new Date(ms).toISOString().slice(0, 10);

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromMs(toMs(date) + days * DAY_MS);
}

/** Adds calendar months, clamping to the end of the target month (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const [y, m, d] = parse(date);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return fromMs(Date.UTC(year, month, Math.min(d, lastDay)));
}

/** Whole days from `a` to `b` (positive when `b` is later). */
export function diffDays(a: IsoDate, b: IsoDate): number {
  return Math.round((toMs(b) - toMs(a)) / DAY_MS);
}

/** Today's date in the given IANA time zone (e.g. "Australia/Adelaide"), or the device's own when omitted. */
export function todayIn(timeZone?: string, now: Date = new Date()): IsoDate {
  // The en-CA locale formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
}
