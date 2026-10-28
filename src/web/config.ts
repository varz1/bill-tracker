/**
 * Demo mode: shows a "made-up data" note on every page and locks the Settings page,
 * so a publicly deployed demo can't have its currency changed by visitors. Calendar sync stays open, but
 * the Worker limits it (see DEMO in wrangler.jsonc) and the form warns visitors the data is public.
 * Set to false for a real deployment, together with DEMO in wrangler.jsonc.
 */
export const DEMO_MODE = true;
