import { Hono, type Context } from "hono";
import { normalizeCalendarUrl } from "../../shared/calendarUrl";
import { CalendarLinkInputSchema, EmployerSchema } from "../../shared/schemas";
import {
  calendarStatus,
  loadState,
  saveSource,
  saveState,
  startedTooRecently,
  syncEmployer,
  unlinkCalendar,
} from "../lib/calendarSync";
import { readBody } from "../lib/crud";
import { policyOf } from "../lib/demo";
import { createStore } from "../lib/store";

// Linking an employer to a calendar feed. Mounted next to the employer routes at /api/employers.

type AppEnv = { Bindings: Env };

export const calendar = new Hono<AppEnv>();

const employerStore = (c: Context<AppEnv>) => createStore(c.env.BILL_DATA, "employer", EmployerSchema);

async function findEmployer(c: Context<AppEnv>) {
  return employerStore(c).get(c.req.param("id") ?? "");
}

calendar.get("/:id/calendar", async (c) => {
  const employer = await findEmployer(c);
  if (!employer) return c.json({ error: "not_found" }, 404);
  return c.json({ calendar: await calendarStatus(c.env, employer.id) });
});

/** Links (or re-links) the calendar and starts a first sync in the background. */
calendar.put("/:id/calendar", async (c) => {
  const body = await readBody(c, CalendarLinkInputSchema);
  if (body instanceof Response) return body;
  const employer = await findEmployer(c);
  if (!employer) return c.json({ error: "not_found" }, 404);

  const url = normalizeCalendarUrl(body.url);
  if (!url) return c.json({ error: "invalid_url" }, 400);

  const kv = c.env.BILL_DATA;
  const now = new Date();

  // The API is open on a public demo, so what a link can cost is capped: how many at once, and how often.
  const maxLinked = policyOf(c.env).maxLinkedCalendars;
  const linkedElsewhere = (await employerStore(c).list()).filter((e) => e.sync === "calendar" && e.id !== employer.id);
  if (employer.sync !== "calendar" && linkedElsewhere.length >= maxLinked) {
    return c.json({ error: "too_many_calendars", limit: maxLinked }, 409);
  }
  if (startedTooRecently(await loadState(kv, employer.id), now)) return c.json({ error: "too_soon" }, 429);

  await saveSource(kv, employer.id, { url, match: body.match || undefined, linkedAt: now.toISOString() });
  // A new link or filter starts clean: nothing remembered about the old feed applies to it.
  await saveState(kv, employer.id, {});
  if (employer.sync !== "calendar") {
    await employerStore(c).put({ ...employer, sync: "calendar", updatedAt: now.toISOString() });
  }
  c.executionCtx.waitUntil(syncEmployer(c.env, employer.id));
  return c.json({ calendar: await calendarStatus(c.env, employer.id) }, 202);
});

/**
 * Unlinks the calendar. `?shifts=keep` turns its shifts into ordinary manual ones; `?shifts=delete` removes them.
 * This is the only way out, because calendar shifts can't be edited or deleted one by one.
 */
calendar.delete("/:id/calendar", async (c) => {
  const choice = c.req.query("shifts");
  if (choice !== "keep" && choice !== "delete") return c.json({ error: "shifts_choice_required" }, 400);
  const employer = await findEmployer(c);
  if (!employer) return c.json({ error: "not_found" }, 404);

  const state = await loadState(c.env.BILL_DATA, employer.id);
  if (state.startedAt && Date.now() - Date.parse(state.startedAt) < 60_000) return c.json({ error: "sync_running" }, 409);

  await unlinkCalendar(c.env, employer.id, choice);
  return c.body(null, 204);
});

/** Starts a sync in the background and answers at once; the page reads the result from the status. */
calendar.post("/:id/sync", async (c) => {
  const employer = await findEmployer(c);
  if (!employer) return c.json({ error: "not_found" }, 404);
  if (employer.sync !== "calendar") return c.json({ error: "no_calendar" }, 409);
  if (startedTooRecently(await loadState(c.env.BILL_DATA, employer.id), new Date())) return c.json({ error: "too_soon" }, 429);
  c.executionCtx.waitUntil(syncEmployer(c.env, employer.id));
  return c.json({ accepted: true }, 202);
});
