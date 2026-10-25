import { ChevronRight } from "lucide-react";
import { CONTRACT_LABELS, SYNC_LABELS } from "../../shared/employers";
import { formatHours } from "../../shared/format";
import type { Employer } from "../../shared/schemas";

interface Props {
  employer: Employer;
  /** Paid hours in the last finished week; null when there were no shifts. */
  lastWeekHours: number | null;
  onOpen(): void;
}

export function EmployerRow({ employer: e, lastWeekHours, onOpen }: Props) {
  return (
    <button onClick={onOpen} className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-ink/[0.03]">
      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: e.color }} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{e.name}</span>
        <span className="mt-0.5 block text-xs text-ink/45">
          {CONTRACT_LABELS[e.contract]} · {SYNC_LABELS[e.sync]}
          {lastWeekHours !== null && ` · ${formatHours(lastWeekHours)} last week`}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-ink/25" />
    </button>
  );
}
