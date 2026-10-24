import { Check } from "lucide-react";
import { useState } from "react";
import type { Bill } from "../../shared/schemas";
import type { TimelineEvent } from "../../shared/summary";
import { useSettings } from "../lib/settings";

const SPAN_DAYS = 30; // 15 days either side of today

interface Props {
  events: TimelineEvent[];
  bills: Bill[];
  onTogglePaid(bill: Bill, date: string): void;
}

function dotClass(e: TimelineEvent): string {
  if (e.daysFromToday < 0) return "h-1 w-1 bg-ink/20";
  if (e.paidAhead) return "h-1.5 w-1.5 bg-emerald-500";
  if (e.daysFromToday === 0) return "h-2 w-2 bg-red-400";
  if (e.daysFromToday <= 7) return "h-1.5 w-1.5 bg-amber-400";
  return "h-1.5 w-1.5 bg-emerald-400";
}

function dueLabel(e: TimelineEvent): { text: string; className: string } {
  if (e.paidAhead) return { text: "Paid", className: "text-emerald-500" };
  if (e.daysFromToday === 0) return { text: "Today", className: "text-red-500" };
  return { text: `${e.daysFromToday}d`, className: e.daysFromToday <= 7 ? "text-amber-500" : "text-ink/30" };
}

export function Timeline({ events, bills, onTogglePaid }: Props) {
  const { fmt, today } = useSettings();
  // Which row's "remaining" tooltip is open (hover on desktop, tap on touch screens).
  const [tip, setTip] = useState<string | null>(null);
  const past = events.filter((e) => e.daysFromToday < 0);
  const upcoming = events.filter((e) => e.daysFromToday >= 0);
  const keyOf = (e: TimelineEvent) => `${e.billId}-${e.date}`;

  const tooltip = (e: TimelineEvent, right: string) =>
    tip === keyOf(e) &&
    e.remaining && (
      <div
        className={`pointer-events-none absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-[10px] text-paper shadow-lg ${right}`}
      >
        {fmt.money(e.remaining.remainingAmount)} left · {e.remaining.remainingCount} payments to go
      </div>
    );

  const hover = (e: TimelineEvent) => ({
    onMouseEnter: () => e.remaining && setTip(keyOf(e)),
    onMouseLeave: () => setTip((k) => (k === keyOf(e) ? null : k)),
    onClick: () => e.remaining && setTip((k) => (k === keyOf(e) ? null : keyOf(e))),
  });

  return (
    <section className="mb-4 rounded-xl border border-ink/10 bg-white px-4 pt-4 pb-3 shadow-sm">
      <div className="relative mx-0.5 mb-4 h-0.5 rounded-full bg-ink/10" aria-hidden>
        {events.map((e) => (
          <div
            key={keyOf(e)}
            className={`pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ${dotClass(e)}`}
            style={{ left: `${((e.daysFromToday + SPAN_DAYS / 2) / SPAN_DAYS) * 100}%` }}
          />
        ))}
        <div className="absolute top-1/2 left-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink/50" />
      </div>

      {past.map((e) => (
        <div key={keyOf(e)} className="relative flex items-center gap-2 py-1.5" {...hover(e)}>
          <span className="w-14 shrink-0 text-xs text-ink/30 tabular-nums">{fmt.date(e.date)}</span>
          <span className="min-w-0 flex-1 truncate text-xs text-ink/35">{e.name}</span>
          <span className="shrink-0 font-mono text-xs text-ink/30 tabular-nums">{fmt.money(e.amount)}</span>
          <Check className="h-3 w-3 shrink-0 text-ink/20" aria-hidden />
          {tooltip(e, "right-0")}
        </div>
      ))}

      <div className="flex items-center gap-2 py-2">
        <div className="h-px flex-1 bg-ink/10" />
        <span className="shrink-0 text-[10px] font-medium tracking-wider text-ink/35 uppercase">
          Today · {fmt.date(today)}
        </span>
        <div className="h-px flex-1 bg-ink/10" />
      </div>

      {upcoming.length === 0 && <p className="py-1 text-center text-xs text-ink/30">Nothing due in the next 15 days</p>}
      {upcoming.map((e) => {
        const bill = bills.find((b) => b.id === e.billId);
        const due = dueLabel(e);
        const done = e.paidAhead;
        return (
          <div key={keyOf(e)} className="relative flex items-center gap-2 py-1.5" {...hover(e)}>
            <span className={`w-14 shrink-0 text-xs tabular-nums ${done ? "text-ink/30" : "text-ink/45"}`}>
              {fmt.date(e.date)}
            </span>
            <span className={`min-w-0 flex-1 truncate text-xs ${done ? "text-ink/35 line-through" : ""}`}>{e.name}</span>
            <span
              className={`shrink-0 font-mono text-xs font-medium tabular-nums ${done ? "text-ink/35 line-through" : ""}`}
            >
              {fmt.money(e.amount)}
            </span>
            <span className={`w-10 shrink-0 text-right text-[10px] font-medium ${due.className}`}>{due.text}</span>
            <button
              onClick={(ev) => {
                ev.stopPropagation();
                if (bill) onTogglePaid(bill, e.date);
              }}
              aria-label={done ? `Unmark ${e.name} as paid` : `Mark ${e.name} as paid`}
              aria-pressed={done}
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors ${
                done ? "bg-emerald-500 text-white" : "bg-ink/10 text-ink/25 hover:bg-emerald-100 hover:text-emerald-500"
              }`}
            >
              <Check className="h-3 w-3" />
            </button>
            {tooltip(e, "right-6")}
          </div>
        );
      })}
    </section>
  );
}
