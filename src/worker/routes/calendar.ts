import { Hono, type Context } from "hono";
import { normalizeCalendarUrl } from "../../shared/calendarUrl";
import { CalendarLinkInputSchema, EmployerSchema, ShiftSchema } from "../../shared/schemas";
import { calendarStatus, removeLink, saveSource, saveState, syncEmployer, loadState } from "../lib/calendarSync";
import { readBody } from "../lib/crud";
import { createStore } from "../lib/store";

// Linking an employer to a calendar feed. Mounted next to the employer routes at /api/employers.

type AppEnv = { Bindings: Env };

export const calendar = new Hono<AppEnv>();

const employerStore = (c: Context<AppEnv>) => createStore(c.env.BILL_DATA, "employer", EmployerSchema);
const shiftStore = (c: Context<AppEnv>) => createStore(c.env.BILL_DATA, "shift", ShiftSchema);

async function findEmployer(c: Context<AppEnv>) {
  return employerStore(c).get(c.req.param("id") ?? "");
}

calendar.get("/:id/calendar", async (c) => {
  const employer = await findEmployer(c);
  if (!employer) return c.json({ error: "not_found" }, 404);
  return c.json({ calendar: await calendarStatus(c.env.BILL_DATA, employer.id) });
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
  await saveSource(kv, employer.id, { url, match: body.match || undefined });
  // A new link or filter starts clean: nothing remembered about the old feed applies to it.
  await saveState(kv, employer.id, {});
  if (employer.sync !== "calendar") {
    await employerStore(c).put({ ...employer, sync: "calendar", updatedAt: new Date().toISOString() });
  }
  c.executionCtx.waitUntil(syncEmployer(c.env, employer.id));
  return c.json({ calendar: await calendarStatus(kv, employer.id) }, 202);
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

  const kv = c.env.BILL_DATA;
  const state = await loadState(kv, employer.id);
  if (state.startedAt && Date.now() - Date.parse(state.startedAt) < 60_000) return c.json({ error: "sync_running" }, 409);

  const shifts = shiftStore(c);
  const mine = (await shifts.list()).filter((s) => s.employerId === employer.id && s.source === "calendar");
  const now = new Date().toISOString();
  for (let i = 0; i < mine.length; i += 25) {
    await Promise.all(
      mine.slice(i, i + 25).map((s) =>
        choice === "delete" ? shifts.remove(s.id) : shifts.put({ ...s, source: "manual", calendarUid: undefined, updatedAt: now }),
      ),
    );
  }
  await removeLink(kv, employer.id);
  await employerStore(c).put({ ...employer, sync: "manual", updatedAt: now });
  return c.body(null, 204);
});

/** Starts a sync in the background and answers at once; the page reads the result from the status. */
calendar.post("/:id/sync", async (c) => {
  const employer = await findEmployer(c);
  if (!employer) return c.json({ error: "not_found" }, 404);
  if (employer.sync !== "calendar") return c.json({ error: "no_calendar" }, 409);
  c.executionCtx.waitUntil(syncEmployer(c.env, employer.id));
  return c.json({ accepted: true }, 202);
});
