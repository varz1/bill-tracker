// Works out what a calendar sync has to change, without touching storage.
//
// Only the employer's own calendar shifts inside the window are ever deleted. Manual shifts, other
// employers' shifts and anything older than the window are left alone.

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
  /** The calendar came back empty while shifts exist in the window; nothing was deleted. */
  suspiciousEmpty: boolean;
}

/** The same event always maps to the same id, so a sync that runs twice at once writes the same records. */
export const calendarShiftId = (employerId: string, key: string) => `cal-${stableId(`${employerId}\n${key}`)}`;

const inWindow = (date: IsoDate, w: SyncWindow) => date >= w.from && date <= w.to;

export function planSync(employerId: string, desired: CalendarShift[], existing: Shift[], window: SyncWindow): SyncPlan {
  const mine = existing.filter((s) => s.employerId === employerId && s.source === "calendar" && s.calendarUid);
  const byKey = new Map<string, Shift>();
  const duplicates: Shift[] = [];
  for (const shift of mine) {
    if (byKey.has(shift.calendarUid!)) duplicates.push(shift);
    else byKey.set(shift.calendarUid!, shift);
  }

  const plan: SyncPlan = { create: [], update: [], delete: [], unchanged: 0, suspiciousEmpty: false };
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
    if (!have) plan.create.push(next);
    else if (have.date !== want.date || have.hours !== want.hours || have.start !== want.start || have.end !== want.end) plan.update.push(next);
    else plan.unchanged++;
  }

  const gone = [...byKey.values()].filter((s) => !seen.has(s.calendarUid!) && inWindow(s.date, window));
  const extra = duplicates.filter((s) => inWindow(s.date, window));
  if (desired.length === 0 && gone.length > 0) {
    plan.suspiciousEmpty = true;
    return plan;
  }
  plan.delete = [...gone, ...extra].map((s) => s.id);
  return plan;
}
