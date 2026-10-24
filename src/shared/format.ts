import type { IsoDate } from "./dates";

export interface Formatters {
  /** "$1,290" for whole amounts, "$424.50" otherwise. Input is minor units. */
  money(minor: number): string;
  /** "24 Oct" */
  date(date: IsoDate): string;
  /** "24 Oct" in the current year, "24 Oct 2027" otherwise. */
  dateSmart(date: IsoDate, today: IsoDate): string;
}

/** The interface is English-only, so number and date formatting is fixed rather than following the browser. */
export const LOCALE = "en-AU";

export function createFormatters({ currency, locale = LOCALE }: { currency: string; locale?: string }): Formatters {
  const money = new Intl.NumberFormat(locale, { style: "currency", currency, trailingZeroDisplay: "stripIfInteger" });
  // Dates are calendar dates, not instants, so format them as UTC to avoid any time zone shift.
  const short = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" });
  const long = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const at = (d: IsoDate) => new Date(`${d}T00:00:00Z`);

  return {
    money: (minor) => money.format(minor / 100),
    date: (d) => short.format(at(d)),
    dateSmart: (d, today) => (d.slice(0, 4) === today.slice(0, 4) ? short : long).format(at(d)),
  };
}

/**
 * Parses a user-typed amount like "1,290.50" into minor units. Returns null for blank or invalid input,
 * and for zero unless `allowZero` is set (tax and super can legitimately be 0).
 */
export function parseAmount(input: string, { allowZero = false } = {}): number | null {
  if (input.trim() === "") return null;
  const value = Number(input.replace(/,/g, "").trim());
  if (!Number.isFinite(value) || value < 0 || (value === 0 && !allowZero)) return null;
  return Math.round(value * 100);
}

/** "38h", "7.6h", "0h": one decimal place at most. */
export function formatHours(hours: number): string {
  return `${Math.round(hours * 10) / 10}h`;
}

/** Minor units to the plain decimal string used in form inputs: 42400 -> "424", 42450 -> "424.5". */
export function amountToInput(minor: number): string {
  return String(minor / 100);
}
