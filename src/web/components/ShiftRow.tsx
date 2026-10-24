import { CalendarDays } from "lucide-react";
import { formatHours } from "../../shared/format";
import type { Shift } from "../../shared/schemas";
import { useSettings } from "../lib/settings";
import { RowActions } from "./RowActions";

interface Props {
  shift: Shift;
  color?: string;
  onEdit(): void;
  onDelete(): void;
}

export function ShiftRow({ shift: s, color, onEdit, onDelete }: Props) {
  const { fmt } = useSettings();
  // Shifts imported from a calendar are managed by the sync, so they can't be edited by hand.
  const imported = s.source === "calendar";

  return (
    <div className="flex items-center justify-between gap-1 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <span className="inline-block h-2 w-2 shrink-0 rounded-sm" style={{ background: color }} />
          <span className="truncate">{fmt.weekdayDate(s.date)}</span>
          {imported && <CalendarDays className="h-3 w-3 shrink-0 text-ink/30" aria-label="From calendar" />}
        </div>
        <div className="mt-0.5 text-xs text-ink/45">
          {s.employer}
          {s.start && s.end && ` · ${s.start}–${s.end}`}
        </div>
      </div>
      <div className="shrink-0 font-mono text-sm font-semibold tabular-nums">{formatHours(s.hours)}</div>
      {imported ? (
        <div className="w-[3.75rem] shrink-0" />
      ) : (
        <RowActions label={`${s.employer} shift on ${s.date}`} onEdit={onEdit} onDelete={onDelete} />
      )}
    </div>
  );
}
