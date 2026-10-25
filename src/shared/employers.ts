import type { Employer } from "./schemas";

/** Chart colours handed out to employers in order. */
export const EMPLOYER_COLORS = ["#2a78d6", "#f08a24", "#2a9d8f", "#c8102e", "#8e5bd0", "#a3902a"];

/** The first palette colour no employer uses yet; once all are taken, colours repeat from the start. */
export function nextEmployerColor(used: readonly string[]): string {
  const taken = new Set(used.map((c) => c.toLowerCase()));
  return EMPLOYER_COLORS.find((c) => !taken.has(c)) ?? EMPLOYER_COLORS[used.length % EMPLOYER_COLORS.length];
}

export const CONTRACT_LABELS: Record<Employer["contract"], string> = {
  "full-time": "Full-time",
  "part-time": "Part-time",
  casual: "Casual",
};

export const SYNC_LABELS: Record<Employer["sync"], string> = {
  manual: "Manual entry",
  calendar: "Calendar",
};

/** Names are unique ignoring case and surrounding spaces. */
export const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
