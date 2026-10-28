// Turns an iCalendar (.ics) roster feed into shifts. Pure: no network, no clock.
//
// Deliberately small: it reads the properties a roster needs and nothing else. Recurring events (RRULE)
// are not expanded; they are skipped and counted so the caller can tell the user.

import type { IsoDate } from "./dates";
import { DEFAULT_BREAK_MINUTES, paidMinutes, type BreakRule } from "./breaks";
import { instantOf, isValidZone, wallOf } from "./timezone";

/** One shift read from the calendar. `key` identifies the event across syncs. */
export interface CalendarShift {
  key: string;
  date: IsoDate;
  /** "HH:mm" in the calendar's time zone. */
  start: string;
  end: string;
  /** Paid hours: the event's length minus the unpaid break. */
  hours: number;
}

export interface ParseOptions {
  /** Used when the calendar names no time zone of its own. */
  fallbackZone: string;
  breakRule?: BreakRule;
  breakMinutes?: number;
  /** Keep only events whose title contains this text, ignoring case. */
  match?: string;
  /** Shifts starting on dates outside this range are dropped. */
  from: IsoDate;
  to: IsoDate;
}

export interface ParseStats {
  /** VEVENTs in the feed. */
  events: number;
  allDay: number;
  cancelled: number;
  /** Recurring events, which are not expanded. */
  recurring: number;
  filtered: number;
  outsideWindow: number;
  /** No end, a zero or negative length, over 24 hours, or an unreadable date. */
  invalid: number;
  /** Events naming a time zone this runtime does not know; they were read in the calendar's zone instead. */
  unknownZone: number;
}

export interface ParsedCalendar {
  shifts: CalendarShift[];
  zone: { name: string; source: "calendar" | "events" | "fallback" };
  stats: ParseStats;
}

interface Prop {
  name: string;
  params: Record<string, string>;
  value: string;
}

const KEY_MAX = 256;

function parseLine(line: string): Prop | null {
  let quoted = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') quoted = !quoted;
    else if (ch === ":" && !quoted) {
      colon = i;
      break;
    }
  }
  if (colon < 1) return null;
  const [name, ...rawParams] = line.slice(0, colon).split(";");
  const params: Record<string, string> = {};
  for (const raw of rawParams) {
    const eq = raw.indexOf("=");
    if (eq > 0) params[raw.slice(0, eq).toUpperCase()] = raw.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), params, value: line.slice(colon + 1) };
}

/** Splits a feed into its VEVENTs (each a list of properties), skipping nested components such as alarms. */
function readEvents(text: string): { events: Prop[][]; calendarZone: string | null } {
  const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const events: Prop[][] = [];
  let current: Prop[] | null = null;
  let nested = 0;
  let calendarZone: string | null = null;

  for (const line of lines) {
    const upper = line.toUpperCase();
    if (current === null) {
      if (upper === "BEGIN:VEVENT") current = [];
      else if (upper.startsWith("X-WR-TIMEZONE")) calendarZone = parseLine(line)?.value.trim() ?? calendarZone;
      continue;
    }
    if (upper.startsWith("BEGIN:")) nested++;
    else if (upper.startsWith("END:")) {
      if (nested > 0) nested--;
      else {
        events.push(current);
        current = null;
      }
    } else if (nested === 0) {
      const prop = parseLine(line);
      if (prop) current.push(prop);
    }
  }
  return { events, calendarZone };
}

const first = (props: Prop[], name: string) => props.find((p) => p.name === name);

const DATE_TIME = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/;

/** The most common valid TZID among the events' start times. */
function commonEventZone(events: Prop[][]): string | null {
  const counts = new Map<string, number>();
  for (const props of events) {
    const zone = first(props, "DTSTART")?.params.TZID;
    if (zone && isValidZone(zone)) counts.set(zone, (counts.get(zone) ?? 0) + 1);
  }
  let best: string | null = null;
  for (const [zone, n] of counts) if (n > (counts.get(best ?? "") ?? 0)) best = zone;
  return best;
}

function durationMs(value: string): number | null {
  const m = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value);
  if (!m) return null;
  const [w, d, h, min, s] = [1, 2, 3, 4, 5].map((i) => Number(m[i] ?? 0));
  return (((w * 7 + d) * 24 + h) * 60 + min) * 60_000 + s * 1000;
}

export function parseCalendar(text: string, opts: ParseOptions): ParsedCalendar {
  const { events, calendarZone } = readEvents(text);
  const stats: ParseStats = {
    events: events.length,
    allDay: 0,
    cancelled: 0,
    recurring: 0,
    filtered: 0,
    outsideWindow: 0,
    invalid: 0,
    unknownZone: 0,
  };

  let zone: ParsedCalendar["zone"];
  const fromEvents = commonEventZone(events);
  if (calendarZone && isValidZone(calendarZone)) zone = { name: calendarZone, source: "calendar" };
  else if (fromEvents) zone = { name: fromEvents, source: "events" };
  else zone = { name: opts.fallbackZone, source: "fallback" };

  /** The instant a DTSTART/DTEND property names, or null when it is a date without a time or unreadable. */
  function instantFrom(prop: Prop): number | null {
    const m = DATE_TIME.exec(prop.value.trim());
    if (!m) return null;
    const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number);
    const wall = { year, month, day, hour, minute, second };
    if (m[7] === "Z") return Date.UTC(year, month - 1, day, hour, minute, second);
    const tzid = prop.params.TZID;
    if (tzid && isValidZone(tzid)) return instantOf(wall, tzid);
    if (tzid) stats.unknownZone++;
    return instantOf(wall, zone.name);
  }

  const needle = opts.match?.trim().toLowerCase();
  const byKey = new Map<string, CalendarShift>();

  for (const props of events) {
    if (first(props, "STATUS")?.value.trim().toUpperCase() === "CANCELLED") {
      stats.cancelled++;
      continue;
    }
    if (first(props, "RRULE")) {
      stats.recurring++;
      continue;
    }
    const dtstart = first(props, "DTSTART");
    if (!dtstart) {
      stats.invalid++;
      continue;
    }
    if (dtstart.params.VALUE?.toUpperCase() === "DATE" || /^\d{8}$/.test(dtstart.value.trim())) {
      stats.allDay++;
      continue;
    }
    if (needle && !(first(props, "SUMMARY")?.value ?? "").toLowerCase().includes(needle)) {
      stats.filtered++;
      continue;
    }

    const startMs = instantFrom(dtstart);
    const dtend = first(props, "DTEND");
    const duration = first(props, "DURATION");
    const endMs = dtend ? instantFrom(dtend) : duration && startMs !== null ? startMs + (durationMs(duration.value.trim()) ?? NaN) : null;
    const uid = first(props, "UID")?.value.trim();
    if (startMs === null || endMs === null || Number.isNaN(endMs) || !uid) {
      stats.invalid++;
      continue;
    }
    const recurrenceId = first(props, "RECURRENCE-ID")?.value.trim();
    const key = recurrenceId ? `${uid}#${recurrenceId}` : uid;

    const span = Math.round((endMs - startMs) / 60_000);
    const paid = paidMinutes(span, opts.breakRule ?? "none", opts.breakMinutes ?? DEFAULT_BREAK_MINUTES);
    if (key.length > KEY_MAX || span <= 0 || span > 24 * 60 || paid <= 0) {
      stats.invalid++;
      continue;
    }

    const start = wallOf(startMs, zone.name);
    if (start.date < opts.from || start.date > opts.to) {
      stats.outsideWindow++;
      continue;
    }
    byKey.set(key, {
      key,
      date: start.date,
      start: start.time,
      end: wallOf(endMs, zone.name).time,
      hours: Math.round((paid / 60) * 100) / 100,
    });
  }

  return { shifts: [...byKey.values()].sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start)), zone, stats };
}

/** A sync covers the whole calendar, past and future. Shifts that already happened are still never deleted (see planSync). */
export const SYNC_WINDOW: { from: IsoDate; to: IsoDate } = { from: "1970-01-01", to: "9999-12-31" };
