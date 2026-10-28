import { Hono } from "hono";
import { syncDue } from "./lib/calendarSync";
import { calendar } from "./routes/calendar";
import { bills, employers, income, shifts } from "./routes/resources";
import { settings } from "./routes/settings";

export const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api/bills", bills);
app.route("/api/employers", employers);
app.route("/api/employers", calendar);
app.route("/api/shifts", shifts);
app.route("/api/income", income);
app.route("/api/settings", settings);

app.notFound((c) => c.json({ error: "not_found" }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "internal_error" }, 500);
});

export default {
  fetch: app.fetch,
  // Cron Trigger (see wrangler.jsonc): sync the calendars that are due.
  scheduled: (_event, env, ctx) => {
    ctx.waitUntil(syncDue(env));
  },
} satisfies ExportedHandler<Env>;
