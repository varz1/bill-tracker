import type { ReactNode } from "react";

/** The dark floating card used by both charts. */
export function ChartTooltip({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-36 rounded-lg bg-ink px-3 py-2 text-xs text-paper shadow-lg">
      <div className="mb-1 text-[10px] text-paper/50">{title}</div>
      {children}
    </div>
  );
}

export function TooltipRow({ color, label, value, note }: { color?: string; label: string; value: string; note?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {color && <span className="inline-block h-2 w-2 shrink-0 rounded-sm" style={{ background: color }} />}
      <span className="text-paper/70">{label}</span>
      <span className="ml-auto pl-3 font-mono font-semibold tabular-nums">
        {value}
        {note && <span className="font-sans font-normal text-paper/40"> ({note})</span>}
      </span>
    </div>
  );
}
