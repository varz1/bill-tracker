import type { Cycle } from "../../shared/schedule";

export const CYCLE_LABELS: Record<Cycle, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
  quarterly: "Every 3 months",
  yearly: "Yearly",
};

/** What a calendar sync error code means, in words for the person using the app. */
export function calendarErrorText(code: string): string {
  switch (code) {
    case "timeout":
      return "The calendar took too long to answer.";
    case "network":
      return "Couldn't reach the calendar.";
    case "not_a_calendar":
      return "That link didn't return a calendar. Check it's the public link.";
    case "too_large":
      return "The calendar is too big to read.";
    case "empty_calendar":
      return "The calendar came back empty, so your shifts were kept. If you cleared your roster on purpose, unlink the calendar.";
    case "http_404":
    case "http_410":
      return "The calendar link no longer works. Check it is still published.";
    case "http_401":
    case "http_403":
      return "The calendar needs a login. Use a public link.";
    default:
      return code.startsWith("http_") ? `The calendar answered with an error (${code.slice(5)}).` : "Something went wrong while syncing.";
  }
}

/** "just now", "5 min ago", "3 h ago", "2 days ago". */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}
