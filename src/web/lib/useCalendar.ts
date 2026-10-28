import { useCallback, useEffect, useRef, useState } from "react";
import type { CalendarStatus } from "../../shared/schemas";
import { api, ApiError } from "./api";

const POLL_MS = 2_000;
/** Stop waiting for a sync after this long; the status still shows whatever happened. */
const GIVE_UP_MS = 60_000;
/** A calendar last synced longer ago than this is refreshed when its page opens. */
const STALE_MS = 15 * 60_000;
/** Opening the page never starts a sync if one was tried this recently, so errors don't cause a retry storm. */
const RECENT_ATTEMPT_MS = 2 * 60_000;

export interface CalendarControl {
  /** Null until the first answer arrives, and for an employer with no calendar. */
  status: CalendarStatus | null;
  /** A sync is running, or one was just started and hasn't finished. */
  syncing: boolean;
  /** The status couldn't be read or a sync couldn't be started. */
  unreachable: boolean;
  syncNow(): Promise<void>;
  /** Reads the status again, e.g. just after linking. */
  refresh(): Promise<void>;
  /** Tells the hook a sync has been started elsewhere (linking starts one), so it waits for it. */
  expectSync(): void;
}

/**
 * Follows one employer's calendar sync: reads its status, starts a sync when the page opens on a stale
 * calendar, and while a sync runs polls until it finishes, then calls `onSynced` so the page can reload
 * the shifts. Does nothing when `linked` is false.
 */
export function useCalendar(employerId: string, linked: boolean, onSynced: () => void): CalendarControl {
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [waiting, setWaitingState] = useState(false);
  const [unreachable, setUnreachable] = useState(false);
  // Same as `waiting`, readable inside the polling timer.
  const waitingRef = useRef(false);
  const setWaiting = useCallback((value: boolean) => {
    waitingRef.current = value;
    setWaitingState(value);
  }, []);
  // The last attempt we had seen when a sync was started: a newer one means that sync has finished.
  const attemptBefore = useRef<string | undefined>(undefined);
  const waitingSince = useRef(0);
  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;

  const refresh = useCallback(async () => {
    try {
      setStatus(await api.calendar.status(employerId));
      setUnreachable(false);
    } catch {
      setUnreachable(true);
    }
  }, [employerId]);

  const expectSync = useCallback(() => {
    attemptBefore.current = status?.lastAttemptAt;
    waitingSince.current = Date.now();
    setWaiting(true);
  }, [setWaiting, status?.lastAttemptAt]);

  const syncNow = useCallback(async () => {
    expectSync();
    try {
      await api.calendar.sync(employerId);
      setUnreachable(false);
    } catch (err) {
      setWaiting(false);
      // "Too soon" means a sync has only just run; its result is what the status already shows.
      if (err instanceof ApiError && err.status === 429) await refresh();
      else setUnreachable(true);
    }
  }, [employerId, expectSync, refresh, setWaiting]);

  useEffect(() => {
    if (!linked) {
      setStatus(null);
      setWaiting(false);
      return;
    }
    refresh();
  }, [linked, refresh, setWaiting]);

  // Open on a stale calendar: refresh it once, quietly.
  const checkedStale = useRef(false);
  useEffect(() => {
    if (!status || !status.linked || checkedStale.current) return;
    checkedStale.current = true;
    const now = Date.now();
    const stale = !status.lastSuccessAt || now - Date.parse(status.lastSuccessAt) > STALE_MS;
    const triedRecently = status.lastAttemptAt && now - Date.parse(status.lastAttemptAt) < RECENT_ATTEMPT_MS;
    if (stale && !triedRecently && !status.syncing) void syncNow();
  }, [status, syncNow]);

  const running = waiting || status?.syncing === true;
  useEffect(() => {
    if (!running) return;
    // A sync we didn't start (the cron's) is followed from now.
    if (!waitingRef.current) waitingSince.current = Date.now();
    const timer = setInterval(async () => {
      let next: CalendarStatus;
      try {
        next = await api.calendar.status(employerId);
      } catch {
        return;
      }
      setStatus(next);
      // One we started has finished once a newer attempt than the one we saw is no longer running.
      const finished = !next.syncing && (!waitingRef.current || next.lastAttemptAt !== attemptBefore.current);
      if (finished || Date.now() - waitingSince.current > GIVE_UP_MS) {
        setWaiting(false);
        onSyncedRef.current();
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [running, employerId, setWaiting]);

  return { status, syncing: running, unreachable, syncNow, refresh, expectSync };
}
