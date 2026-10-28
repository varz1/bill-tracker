// Works out what a calendar sync has to change, without touching storage.
//
// Only the employer's own calendar shifts that are in the window and not in the past are ever deleted.
// Manual shifts, other employers' shifts and anything older than the window are left alone, and so is a
// shift that has already happened: a calendar that stops listing past events doesn't erase worked hours.

import type { CalendarShift } from "./calendar";
import type { IsoDate } from "./dates";
import { stableId } from "./id";
import type { Shift } from "./schemas";

export interface SyncWindow {
  from: IsoDate;
  to: IsoDate;
}

/** A calendar shift as it is stored, minus the record timestamps. */
export interface PlannedShift {
  id: string;
  employerId: string;
  date: IsoDate;
  hours: number;
  start: string;
  end: string;
  source: "calendar";
  calendarUid: string;
}

export interface SyncPlan {
  create: PlannedShift[];
  update: PlannedShift[];
  /** Ids of calendar shifts that are no longer in the calendar. */
  delete: string[];
  unchanged: number;
  /** Events whose id is already taken by one of the user's own shifts (kept when a calendar was unlinked); left as they are. */
  kept: number;
  /** The calendar came back empty while shifts exist in the window; nothing was deleted. */
  suspiciousEmpty: boolean;
}

/**
 * Every calendar shift of an employer has an id starting with this, so they can be listed on their own
 * without reading every shift there is.
 */
export const calendarShiftPrefix = (employerId: string) => `cal-${stableId(employerId)}-`;

/** The same event always maps to the same id, so a sync that runs twice at once writes the same records. */
export const calendarShiftId = (employerId: string, key: string) => `${calendarShiftPrefix(employerId)}${stableId(key)}`;

const inWindow = (date: IsoDate, w: SyncWindow) => date >= w.from && date <= w.to;

/**
 * `existing` needs to hold at least the employer's calendar shifts and any kept shifts that carry calendar
 * ids; listing by `calendarShiftPrefix` gives exactly that. `today` is the employer's current date.
 */
export function planSync(
  employerId: string,
  desired: CalendarShift[],
  existing: Shift[],
  window: SyncWindow,
  today: IsoDate,
): SyncPlan {
  const mine = existing.filter((s) => s.employerId === employerId && s.source === "calendar" && s.calendarUid);
  const byKey = new Map<string, Shift>();
  const duplicates: Shift[] = [];
  for (const shift of mine) {
    if (byKey.has(shift.calendarUid!)) duplicates.push(shift);
    else byKey.set(shift.calendarUid!, shift);
  }

  const owned = new Set(existing.filter((s) => s.source !== "calendar").map((s) => s.id));
  const plan: SyncPlan = { create: [], update: [], delete: [], unchanged: 0, kept: 0, suspiciousEmpty: false };
  const seen = new Set<string>();

  for (const want of desired) {
    seen.add(want.key);
    const have = byKey.get(want.key);
    const next: PlannedShift = {
      id: have?.id ?? calendarShiftId(employerId, want.key),
      employerId,
      date: want.date,
      hours: want.hours,
      start: want.start,
      end: want.end,
      source: "calendar",
      calendarUid: want.key,
    };
    if (!have && owned.has(next.id)) plan.kept++;
    else if (!have) plan.create.push(next);
    else if (have.date !== want.date || have.hours !== want.hours || have.start !== want.start || have.end !== want.end) plan.update.push(next);
    else plan.unchanged++;
  }

  const gone = [...byKey.values()].filter((s) => !seen.has(s.calendarUid!) && inWindow(s.date, window) && s.date >= today);
  const extra = duplicates.filter((s) => inWindow(s.date, window));
  if (desired.length === 0 && gone.length > 0) {
    plan.suspiciousEmpty = true;
    return plan;
  }
  plan.delete = [...gone, ...extra].map((s) => s.id);
  return plan;
}
