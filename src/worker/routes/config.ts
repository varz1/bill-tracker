import { Hono } from "hono";
import { policyOf } from "../lib/demo";

/** What the page needs to know about how this deployment is set up. Follows the DEMO variable. */
export const config = new Hono<{ Bindings: Env }>();

config.get("/", (c) => {
  const { demo, settingsLocked, calendarTtlMs } = policyOf(c.env);
  return c.json({ config: { demo, settingsLocked, calendarTtlMs } });
});
