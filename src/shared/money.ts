// Amounts are stored as integers in minor units (cents) and only formatted for display.

const MINOR_UNITS = 100;

export function toMinor(major: number): number {
  return Math.round(major * MINOR_UNITS);
}

export function formatMoney(minor: number, currency: string, locale = "en-AU"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(minor / MINOR_UNITS);
}
