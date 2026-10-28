// The one place that knows whether this is a public demo. It follows the DEMO variable in wrangler.jsonc.
// Anything that only makes sense on a demo (a lock, a cap, a banner) must ask here, never hard-code it,
// so a personal deployment only has to set DEMO to "false".

export const isDemo = (env: Env) => String(env.DEMO) === "true";

export interface DemoPolicy {
  demo: boolean;
  /** Settings can't be changed (the API is open, so visitors could otherwise change them for everyone). */
  settingsLocked: boolean;
  /** Calendars that can be linked at once, across all employers. */
  maxLinkedCalendars: number;
  /** A linked calendar, with the shifts it brought in, is removed after this long. Null keeps it for good. */
  calendarTtlMs: number | null;
}

export function policyOf(env: Env): DemoPolicy {
  return isDemo(env)
    ? { demo: true, settingsLocked: true, maxLinkedCalendars: 3, calendarTtlMs: 24 * 3_600_000 }
    : { demo: false, settingsLocked: false, maxLinkedCalendars: 20, calendarTtlMs: null };
}
