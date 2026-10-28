// Converting between instants and wall-clock time in an IANA time zone, with nothing but Intl.

import type { IsoDate } from "./dates";

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export function isValidZone(timeZone: string): boolean {
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

export interface Wall {
  date: IsoDate;
  /** "HH:mm" */
  time: string;
}

function parts(ms: number, timeZone: string) {
  const p: Record<string, string> = {};
  for (const { type, value } of formatter(timeZone).formatToParts(ms)) p[type] = value;
  return p;
}

/** The wall-clock date and time in `timeZone` at the instant `ms`. */
export function wallOf(ms: number, timeZone: string): Wall {
  const p = parts(ms, timeZone);
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** How far the zone's wall clock is ahead of UTC at the instant `ms`. */
function offsetMs(ms: number, timeZone: string): number {
  const p = parts(ms, timeZone);
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return wall - (ms - (((ms % 1000) + 1000) % 1000));
}

/**
 * The instant at which the wall clock in `timeZone` reads the given time.
 * A time that happens twice (clocks going back) is its first pass, as RFC 5545 says. A time skipped by a
 * clock change (clocks going forward) resolves to the instant just after the gap.
 */
export function instantOf(
  wall: { year: number; month: number; day: number; hour: number; minute: number; second: number },
  timeZone: string,
): number {
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  // The offset in force a day either side is the one before and the one after any change nearby.
  const offsets = new Set([offsetMs(asUtc - 86_400_000, timeZone), offsetMs(asUtc + 86_400_000, timeZone)]);
  const matches = [...offsets].map((o) => asUtc - o).filter((t) => offsetMs(t, timeZone) === asUtc - t);
  if (matches.length > 0) return Math.min(...matches);
  return asUtc - offsetMs(asUtc - offsetMs(asUtc, timeZone), timeZone);
}
