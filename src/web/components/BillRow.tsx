import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import type { BillView } from "../../shared/summary";
import { CYCLE_LABELS } from "../lib/labels";
import { useSettings } from "../lib/settings";

interface Props {
  view: BillView;
  onEdit(): void;
  onDelete(): void;
}

export function BillRow({ view, onEdit, onDelete }: Props) {
  const { fmt, today } = useSettings();
  const { bill, next, endDate, remaining, monthly } = view;
  const [confirming, setConfirming] = useState(false);

  const dot =
    next.status !== "upcoming"
      ? null
      : next.daysUntil === 0
        ? "bg-red-400"
        : next.daysUntil <= 7
          ? "bg-amber-400"
          : "bg-emerald-400";

  return (
    <div className="flex items-start justify-between gap-1 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{bill.name}</div>
        <div className="mt-0.5 text-xs text-ink/45">
          {fmt.money(bill.amount)} · {CYCLE_LABELS[bill.cycle]}
          {bill.totalPayments ? (
            <>
              {" "}
              · {bill.totalPayments} payments
              {endDate && <span className="text-ink/30"> · ends {fmt.dateSmart(endDate, today)}</span>}
              {remaining && remaining.remainingCount > 0 && (
                <span className="text-amber-600/80"> · {fmt.money(remaining.remainingAmount)} left</span>
              )}
            </>
          ) : (
            bill.cycle !== "monthly" && <> · {fmt.money(monthly)}/month</>
          )}
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-ink/40">
          {next.status === "finished" ? (
            <span className="text-ink/30">Paid off</span>
          ) : (
            <>
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
              {next.daysUntil === 0
                ? "Due today"
                : `Next ${fmt.date(next.date)} · in ${next.daysUntil} ${next.daysUntil === 1 ? "day" : "days"}`}
            </>
          )}
        </div>
      </div>

      <div className="-mr-1 flex shrink-0 items-center">
        {confirming ? (
          <>
            <button
              onClick={onDelete}
              className="rounded-md px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
            <button onClick={() => setConfirming(false)} className="rounded-md px-2 py-1.5 text-xs text-ink/50 hover:bg-ink/5">
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onEdit}
              aria-label={`Edit ${bill.name}`}
              className="rounded-md p-2 text-ink/25 transition-colors hover:bg-ink/5 hover:text-ink"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setConfirming(true)}
              aria-label={`Delete ${bill.name}`}
              className="rounded-md p-2 text-ink/25 transition-colors hover:bg-red-50 hover:text-red-500"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
