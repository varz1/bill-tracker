import { CalendarDays, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { calendarErrorText, timeAgo, timeUntil } from "../lib/labels";
import type { CalendarControl } from "../lib/useCalendar";

interface Props {
  calendar: CalendarControl;
  /** Unlinks the calendar; rejects if it couldn't. */
  onUnlink(shifts: "keep" | "delete"): Promise<void>;
}

const ZONE_NOTES = {
  calendar: "from your calendar",
  events: "from its events",
  fallback: "your calendar doesn't say, so this is the time zone in Settings",
} as const;

/** What the last successful sync changed, in a few words. */
function changeSummary(result: NonNullable<NonNullable<CalendarControl["status"]>["result"]>): string {
  const parts = [
    result.created > 0 && `${result.created} added`,
    result.updated > 0 && `${result.updated} updated`,
    result.deleted > 0 && `${result.deleted} removed`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "no changes";
}

/** An employer's calendar link: when it last synced, what that did, and the way to unlink it. */
export function CalendarSection({ calendar, onUnlink }: Props) {
  const { status, syncing, unreachable, tooSoon, syncNow } = calendar;
  const [step, setStep] = useState<"idle" | "choosing" | "working">("idle");
  const [unlinkFailed, setUnlinkFailed] = useState(false);

  async function unlink(shifts: "keep" | "delete") {
    setStep("working");
    setUnlinkFailed(false);
    try {
      await onUnlink(shifts);
    } catch {
      setUnlinkFailed(true);
      setStep("choosing");
    }
  }

  return (
    <section className="mb-4 rounded-xl border border-ink/10 bg-white px-4 py-3 shadow-sm" aria-label="Calendar sync">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-4 w-4 shrink-0 text-ink/40" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium">Calendar</h3>
          {status?.url && <p className="truncate font-mono text-[11px] text-ink/35">{status.url}</p>}
        </div>
        <button
          onClick={() => void syncNow()}
          disabled={syncing || !status}
          className="flex items-center gap-1.5 rounded-md bg-ink/10 px-2.5 py-1.5 text-xs text-ink/65 transition-colors hover:bg-ink/15 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {syncing ? "Syncing" : "Sync now"}
        </button>
      </div>

      <div className="mt-2 space-y-1 text-xs">
        {!status ? (
          <p className={unreachable ? "text-red-600" : "text-ink/40"} role={unreachable ? "alert" : undefined}>
            {unreachable ? "Couldn't read the calendar's status." : "Loading…"}
          </p>
        ) : (
          <>
            {status.lastError ? (
              <p role="alert" className="text-red-600">
                {calendarErrorText(status.lastError)}
                {status.lastSuccessAt && ` Last synced ${timeAgo(status.lastSuccessAt)}.`}
              </p>
            ) : status.lastSuccessAt ? (
              <p className="text-ink/55">
                Synced {timeAgo(status.lastSuccessAt)}
                {status.result && ` · ${changeSummary(status.result)}`}
              </p>
            ) : (
              <p className="text-ink/40">
                {syncing ? "Reading your calendar…" : status.result ? "Still importing your calendar…" : "Not synced yet."}
              </p>
            )}
            {tooSoon && <p className="text-ink/55">Just synced a moment ago. Try again in a few seconds.</p>}
            {unreachable && (
              <p role="alert" className="text-red-600">
                Couldn't start a sync. Please try again.
              </p>
            )}
            {status.zone && (
              <p className="text-ink/40">
                Times are in {status.zone.name} ({ZONE_NOTES[status.zone.source]}).
              </p>
            )}
            {status.expiresAt && (
              <p className="text-amber-700">
                Demo: this calendar and its shifts are removed {timeUntil(status.expiresAt)}.
              </p>
            )}
            {status.result && status.result.recurring > 0 && (
              <p className="text-ink/40">
                {status.result.recurring} repeating {status.result.recurring === 1 ? "event was" : "events were"} skipped. Repeating
                events aren't supported yet.
              </p>
            )}
          </>
        )}
      </div>

      <div className="mt-3 border-t border-ink/[0.08] pt-2.5 text-xs">
        {step === "idle" ? (
          <button onClick={() => setStep("choosing")} className="rounded-md px-1 py-1 text-ink/45 hover:bg-ink/5 hover:text-ink">
            Unlink calendar
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-ink/60">What should happen to the shifts it added? Shifts you entered yourself are never touched.</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => void unlink("keep")}
                disabled={step === "working"}
                className="rounded-md bg-ink px-2.5 py-1.5 font-medium text-paper hover:bg-ink/90 disabled:opacity-60"
              >
                Keep them as my own
              </button>
              <button
                onClick={() => void unlink("delete")}
                disabled={step === "working"}
                className="rounded-md px-2.5 py-1.5 font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                Delete them
              </button>
              <button
                onClick={() => setStep("idle")}
                disabled={step === "working"}
                className="rounded-md px-2.5 py-1.5 text-ink/50 hover:bg-ink/5 disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
            {unlinkFailed && (
              <p role="alert" className="text-red-600">
                Couldn't unlink. A sync may be running; wait a moment and try again.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
