import { Hono } from "hono";
import { bills, employers, income, shifts } from "./routes/resources";
import { settings } from "./routes/settings";

const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api/bills", bills);
app.route("/api/employers", employers);
app.route("/api/shifts", shifts);
app.route("/api/income", income);
app.route("/api/settings", settings);

app.notFound((c) => c.json({ error: "not_found" }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "internal_error" }, 500);
});

export default app;
