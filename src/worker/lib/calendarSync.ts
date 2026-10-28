import { DEFAULT_BREAK_MINUTES } from "../../shared/breaks";
import { parseCalendar, syncWindow } from "../../shared/calendar";
import { maskCalendarUrl, normalizeCalendarUrl } from "../../shared/calendarUrl";
import { todayIn } from "../../shared/dates";
import {
  CalendarSourceSchema,
  CalendarStateSchema,
  EmployerSchema,
  ShiftSchema,
  type CalendarSource,
  type CalendarState,
  type CalendarStatus,
  type Shift,
} from "../../shared/schemas";
import { calendarShiftPrefix, planSync } from "../../shared/syncPlan";
import { loadSettings } from "../routes/settings";
import { fingerprint } from "./hash";
import { createStore } from "./store";

// Calendar sync for one employer, and for whichever employers are due. A sync only ever writes the
// employer's own calendar shifts (see planSync); a failed one changes nothing but its status.

/** A second trigger inside this long after a sync started does nothing. */
const LEASE_MS = 60_000;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;
const MAX_FEED_BYTES = 2 * 1024 * 1024;
/** Shift writes per sync; a bigger change finishes over the next runs. */
const MAX_WRITES = 500;
const WRITE_CHUNK = 25;

/** An employer whose last success is older than this is due. */
export const SYNC_EVERY_MS = 45 * 60_000;
/** After any attempt, success or not, wait this long before the cron tries again. */
export const RETRY_AFTER_MS = 10 * 60_000;
/** Employers synced per cron run; the free plan allows 10 ms of CPU for the whole run. */
export const MAX_PER_RUN = 3;
/** Nobody can start a sync, or change a link, on an employer more often than this. */
export const MIN_GAP_MS = 30_000;

/**
 * A public demo has an open API, so calendar links are bounded instead of locked: only a few at a time, and
 * each (with the shifts it brought in) is removed after a day. Switched on by the DEMO variable.
 */
export const isDemo = (env: Env) => String(env.DEMO) === "true";

export function limitsOf(env: Env): { maxLinked: number; linkTtlMs: number | null } {
  return isDemo(env) ? { maxLinked: 3, linkTtlMs: 24 * 3_600_000 } : { maxLinked: 20, linkTtlMs: null };
}

const sourceKey = (employerId: string) => `calsrc:${employerId}`;
const stateKey = (employerId: string) => `calstate:${employerId}`;

export async function loadSource(kv: KVNamespace, employerId: string): Promise<CalendarSource | null> {
  const parsed = CalendarSourceSchema.safeParse(await kv.get<unknown>(sourceKey(employerId), "json"));
  return parsed.success ? parsed.data : null;
}

export const saveSource = (kv: KVNamespace, employerId: string, source: CalendarSource) =>
  kv.put(sourceKey(employerId), JSON.stringify(source));

export async function loadState(kv: KVNamespace, employerId: string): Promise<CalendarState> {
  const parsed = CalendarStateSchema.safeParse(await kv.get<unknown>(stateKey(employerId), "json"));
  return parsed.success ? parsed.data : {};
}

export const saveState = (kv: KVNamespace, employerId: string, state: CalendarState) =>
  kv.put(stateKey(employerId), JSON.stringify(state));

export async function removeLink(kv: KVNamespace, employerId: string): Promise<void> {
  await Promise.all([kv.delete(sourceKey(employerId)), kv.delete(stateKey(employerId))]);
}

const isRunning = (state: CalendarState, now: Date) =>
  state.startedAt !== undefined && now.getTime() - Date.parse(state.startedAt) < LEASE_MS;

/** True when a sync was started on this employer less than MIN_GAP_MS ago. */
export const startedTooRecently = (state: CalendarState, now: Date) =>
  state.lastAttemptAt !== undefined && now.getTime() - Date.parse(state.lastAttemptAt) < MIN_GAP_MS;

const expiryOf = (env: Env, source: CalendarSource): number | null => {
  const ttl = limitsOf(env).linkTtlMs;
  if (ttl === null) return null;
  return source.linkedAt ? Date.parse(source.linkedAt) + ttl : 0;
};

export async function calendarStatus(env: Env, employerId: string, now = new Date()): Promise<CalendarStatus> {
  const kv = env.BILL_DATA;
  const [source, state] = await Promise.all([loadSource(kv, employerId), loadState(kv, employerId)]);
  if (!source) return { linked: false, syncing: false };
  const expiry = expiryOf(env, source);
  return {
    linked: true,
    url: maskCalendarUrl(source.url),
    match: source.match,
    syncing: isRunning(state, now),
    expiresAt: expiry ? new Date(expiry).toISOString() : undefined,
    lastAttemptAt: state.lastAttemptAt,
    lastSuccessAt: state.lastSuccessAt,
    lastError: state.lastError,
    zone: state.zone,
    result: state.result,
  };
}

/**
 * Unlinks an employer's calendar. `keep` turns the shifts it brought in into the user's own; `delete`
 * removes them. Shifts the user entered themselves are never touched.
 */
export async function unlinkCalendar(env: Env, employerId: string, shifts: "keep" | "delete", now = new Date()): Promise<void> {
  const kv = env.BILL_DATA;
  const store = createStore(kv, "shift", ShiftSchema);
  // Everything marked as the calendar's, by whatever id, so nothing is left that can no longer be edited.
  const mine = (await store.list()).filter((s) => s.employerId === employerId && s.source === "calendar");
  const nowIso = now.toISOString();
  for (let i = 0; i < mine.length; i += WRITE_CHUNK) {
    await Promise.all(
      mine.slice(i, i + WRITE_CHUNK).map((s) =>
        shifts === "delete" ? store.remove(s.id) : store.put({ ...s, source: "manual", calendarUid: undefined, updatedAt: nowIso }),
      ),
    );
  }
  await removeLink(kv, employerId);
  const employers = createStore(kv, "employer", EmployerSchema);
  const employer = await employers.get(employerId);
  if (employer) await employers.put({ ...employer, sync: "manual", updatedAt: nowIso });
}

export type SyncOutcome =
  | { status: "unlinked" }
  | { status: "busy" }
  | { status: "ok"; created: number; updated: number; deleted: number; unchanged: number; partial: boolean }
  | { status: "error"; error: string };

/** Reads a response body as text, or null when it is bigger than `max` bytes. */
async function readCapped(res: Response, max: number): Promise<string | null> {
  if (Number(res.headers.get("content-length")) > max) return null;
  if (!res.body) {
    const text = await res.text();
    return text.length > max ? null : text;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(bytes);
}

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

/**
 * Fetches the feed, following redirects by hand: every hop has to be a public https link again, so a
 * link can't be bounced to somewhere it shouldn't go. One timeout covers all the hops.
 */
async function fetchFeed(url: string, headers: Record<string, string>): Promise<Response | { error: string }> {
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  let target = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(target, { headers, signal, redirect: "manual" });
    if (!REDIRECTS.has(res.status)) return res;
    const location = res.headers.get("location");
    await res.body?.cancel();
    let next: string | null = null;
    try {
      next = location ? normalizeCalendarUrl(new URL(location, target).toString()) : null;
    } catch {
      /* an unreadable Location is refused below */
    }
    if (!next) return { error: "bad_redirect" };
    target = next;
  }
  return { error: "too_many_redirects" };
}

async function inChunks<T>(items: T[], run: (item: T) => Promise<unknown>) {
  for (let i = 0; i < items.length; i += WRITE_CHUNK) await Promise.all(items.slice(i, i + WRITE_CHUNK).map(run));
}

/** Brings one employer's calendar shifts in line with its calendar. Never throws. */
export async function syncEmployer(env: Env, employerId: string, now = new Date()): Promise<SyncOutcome> {
  const kv = env.BILL_DATA;
  const started = Date.now();
  const nowIso = now.toISOString();

  const employer = await createStore(kv, "employer", EmployerSchema).get(employerId);
  const source = employer ? await loadSource(kv, employerId) : null;
  if (!employer || !source) return { status: "unlinked" };

  const state = await loadState(kv, employerId);
  if (isRunning(state, now)) return { status: "busy" };
  // A start mark that is still there, past its lease, means the last run never finished (the platform
  // stopped it). Say so at once, so a run that keeps dying doesn't look like a calendar that's fine.
  const interrupted = state.startedAt !== undefined;
  await saveState(kv, employerId, {
    ...state,
    startedAt: nowIso,
    lastAttemptAt: nowIso,
    lastError: interrupted ? "interrupted" : state.lastError,
  });

  /** False once the calendar was unlinked or relinked: what this run found belongs to a link that is gone. */
  const stillLinked = async () => {
    const current = await loadSource(kv, employerId);
    return current !== null && current.url === source.url && current.linkedAt === source.linkedAt;
  };

  let outcome: SyncOutcome;
  let next: CalendarState = {};
  try {
    ({ outcome, next } = await run());
  } catch (err) {
    console.error(err);
    outcome = { status: "error", error: "internal" };
  }
  if (outcome.status === "unlinked" || !(await stillLinked())) return { status: "unlinked" };
  if (outcome.status === "error") next = { ...next, lastError: outcome.error };

  await saveState(kv, employerId, { ...state, ...next, lastAttemptAt: nowIso, startedAt: undefined });
  console.log(JSON.stringify({ event: "calendar_sync", employerId, ms: Date.now() - started, ...outcome }));
  return outcome;

  async function run(): Promise<{ outcome: SyncOutcome; next: CalendarState }> {
    const settings = await loadSettings(kv);
    const today = todayIn(settings.timeZone, now);
    const window = syncWindow(today);
    const breakRule = employer!.breakRule ?? "none";
    const breakMinutes = employer!.breakMinutes ?? DEFAULT_BREAK_MINUTES;
    const configSig = await fingerprint(JSON.stringify([today, breakRule, breakMinutes, source!.match ?? "", settings.timeZone]));

    // The server may answer "unchanged", but only if nothing we compute from the feed has changed either.
    const headers: Record<string, string> = { accept: "text/calendar, */*;q=0.5" };
    if (state.configSig === configSig) {
      if (state.etag) headers["if-none-match"] = state.etag;
      if (state.lastModified) headers["if-modified-since"] = state.lastModified;
    }

    let res: Response;
    try {
      const fetched = await fetchFeed(source!.url, headers);
      if ("error" in fetched) return { outcome: { status: "error", error: fetched.error }, next: {} };
      res = fetched;
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      return { outcome: { status: "error", error: timedOut ? "timeout" : "network" }, next: {} };
    }

    const keep = { lastSuccessAt: nowIso, lastError: undefined, configSig };
    if (res.status === 304) {
      return { outcome: { status: "ok", created: 0, updated: 0, deleted: 0, unchanged: 0, partial: false }, next: keep };
    }
    if (!res.ok) {
      await res.body?.cancel();
      return { outcome: { status: "error", error: `http_${res.status}` }, next: {} };
    }

    const text = await readCapped(res, MAX_FEED_BYTES);
    if (text === null) return { outcome: { status: "error", error: "too_large" }, next: {} };
    if (!/BEGIN:VCALENDAR/i.test(text)) return { outcome: { status: "error", error: "not_a_calendar" }, next: {} };

    const validators = { etag: res.headers.get("etag") ?? undefined, lastModified: res.headers.get("last-modified") ?? undefined };
    const bodySig = await fingerprint(text + configSig);
    if (state.bodySig === bodySig) {
      return {
        outcome: { status: "ok", created: 0, updated: 0, deleted: 0, unchanged: 0, partial: false },
        next: { ...keep, ...validators, bodySig },
      };
    }

    const parsed = parseCalendar(text, { fallbackZone: settings.timeZone, breakRule, breakMinutes, match: source!.match, ...window });
    // Only this employer's calendar-style ids, not every shift there is: the cost stays small as the data grows.
    const shiftStore = createStore(kv, "shift", ShiftSchema);
    const existing = await shiftStore.list(calendarShiftPrefix(employerId));
    const plan = planSync(employerId, parsed.shifts, existing, window, today);

    if (plan.suspiciousEmpty) {
      return { outcome: { status: "error", error: "empty_calendar" }, next: { zone: parsed.zone } };
    }

    const createdAt = new Map<string, string>(existing.map((s) => [s.id, s.createdAt]));
    const writes: Shift[] = [];
    for (const planned of [...plan.create, ...plan.update]) {
      const record = ShiftSchema.safeParse({ ...planned, createdAt: createdAt.get(planned.id) ?? nowIso, updatedAt: nowIso });
      if (record.success) writes.push(record.data);
    }
    const doWrites = writes.slice(0, MAX_WRITES);
    const doDeletes = plan.delete.slice(0, Math.max(0, MAX_WRITES - doWrites.length));
    const partial = doWrites.length < writes.length || doDeletes.length < plan.delete.length;

    // The link may have changed while the feed was being read and worked through; don't write for one that is gone.
    if (!(await stillLinked())) return { outcome: { status: "unlinked" }, next: {} };
    await inChunks(doWrites, (s) => shiftStore.put(s));
    await inChunks(doDeletes, (id) => shiftStore.remove(id));

    const { stats } = parsed;
    return {
      outcome: { status: "ok", created: plan.create.length, updated: plan.update.length, deleted: doDeletes.length, unchanged: plan.unchanged, partial },
      next: {
        // A partial run is not a finished sync: no success time, so the cron comes back for the rest soon.
        ...(partial ? { lastError: undefined, configSig: undefined } : { ...keep, ...validators, bodySig }),
        zone: parsed.zone,
        result: {
          created: plan.create.length,
          updated: plan.update.length,
          deleted: doDeletes.length,
          unchanged: plan.unchanged,
          skipped: stats.allDay + stats.cancelled + stats.filtered + stats.invalid,
          recurring: stats.recurring,
        },
      },
    };
  }
}

/** Whether the cron should sync an employer with this state now. */
export function isDue(state: CalendarState, now: Date): boolean {
  if (state.lastAttemptAt && now.getTime() - Date.parse(state.lastAttemptAt) < RETRY_AFTER_MS) return false;
  if (state.lastSuccessAt && now.getTime() - Date.parse(state.lastSuccessAt) < SYNC_EVERY_MS) return false;
  return true;
}

/** On a public demo: unlinks (and deletes the shifts of) every calendar whose day is up. Returns their ids. */
async function expireLinks(env: Env, employerIds: string[], now: Date): Promise<Set<string>> {
  const expired = new Set<string>();
  if (limitsOf(env).linkTtlMs === null) return expired;
  for (const id of employerIds) {
    const source = await loadSource(env.BILL_DATA, id);
    const expiry = source ? expiryOf(env, source) : null;
    if (source && expiry !== null && now.getTime() >= expiry) {
      await unlinkCalendar(env, id, "delete", now);
      console.log(JSON.stringify({ event: "calendar_expired", employerId: id }));
      expired.add(id);
    }
  }
  return expired;
}

/** The cron's work: drop expired demo links, then sync the employers that are due, longest-waiting first. */
export async function syncDue(env: Env, now = new Date()): Promise<void> {
  const kv = env.BILL_DATA;
  const linked = (await createStore(kv, "employer", EmployerSchema).list()).filter((e) => e.sync === "calendar");
  const expired = await expireLinks(env, linked.map((e) => e.id), now);
  const employers = linked.filter((e) => !expired.has(e.id));
  const states = await Promise.all(employers.map((e) => loadState(kv, e.id)));
  const due = employers
    .map((employer, i) => ({ employer, state: states[i] }))
    .filter(({ state }) => isDue(state, now))
    .sort((a, b) => (a.state.lastSuccessAt ?? "").localeCompare(b.state.lastSuccessAt ?? ""))
    .slice(0, MAX_PER_RUN);
  await Promise.allSettled(due.map(({ employer }) => syncEmployer(env, employer.id, now)));
}
