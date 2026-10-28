import { DEFAULT_BREAK_MINUTES } from "../../shared/breaks";
import { parseCalendar, syncWindow } from "../../shared/calendar";
import { maskCalendarUrl } from "../../shared/calendarUrl";
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
import { planSync } from "../../shared/syncPlan";
import { loadSettings } from "../routes/settings";
import { fingerprint } from "./hash";
import { createStore } from "./store";

// Calendar sync for one employer, and for whichever employers are due. A sync only ever writes the
// employer's own calendar shifts (see planSync); a failed one changes nothing but its status.

/** A second trigger inside this long after a sync started does nothing. */
const LEASE_MS = 60_000;
const FETCH_TIMEOUT_MS = 8_000;
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

export async function calendarStatus(kv: KVNamespace, employerId: string, now = new Date()): Promise<CalendarStatus> {
  const [source, state] = await Promise.all([loadSource(kv, employerId), loadState(kv, employerId)]);
  if (!source) return { linked: false, syncing: false };
  return {
    linked: true,
    url: maskCalendarUrl(source.url),
    match: source.match,
    syncing: isRunning(state, now),
    lastAttemptAt: state.lastAttemptAt,
    lastSuccessAt: state.lastSuccessAt,
    lastError: state.lastError,
    zone: state.zone,
    result: state.result,
  };
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
  await saveState(kv, employerId, { ...state, startedAt: nowIso, lastAttemptAt: nowIso });

  let outcome: SyncOutcome;
  let next: CalendarState = {};
  try {
    ({ outcome, next } = await run());
  } catch (err) {
    console.error(err);
    outcome = { status: "error", error: "internal" };
  }
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
      res = await fetch(source!.url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
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
    const shiftStore = createStore(kv, "shift", ShiftSchema);
    const existing = await shiftStore.list();
    const plan = planSync(employerId, parsed.shifts, existing, window);

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

    await inChunks(doWrites, (s) => shiftStore.put(s));
    await inChunks(doDeletes, (id) => shiftStore.remove(id));

    const { stats } = parsed;
    return {
      outcome: { status: "ok", created: plan.create.length, updated: plan.update.length, deleted: doDeletes.length, unchanged: plan.unchanged, partial },
      next: {
        ...keep,
        // A partial run must not look finished: leave out what would let the next run skip the work.
        ...(partial ? { configSig: undefined } : { ...validators, bodySig }),
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

/** The cron's work: sync the employers that are due, longest-waiting first. */
export async function syncDue(env: Env, now = new Date()): Promise<void> {
  const kv = env.BILL_DATA;
  const employers = (await createStore(kv, "employer", EmployerSchema).list()).filter((e) => e.sync === "calendar");
  const states = await Promise.all(employers.map((e) => loadState(kv, e.id)));
  const due = employers
    .map((employer, i) => ({ employer, state: states[i] }))
    .filter(({ state }) => isDue(state, now))
    .sort((a, b) => (a.state.lastSuccessAt ?? "").localeCompare(b.state.lastSuccessAt ?? ""))
    .slice(0, MAX_PER_RUN);
  await Promise.allSettled(due.map(({ employer }) => syncEmployer(env, employer.id, now)));
}
