import type { Totals } from "../../shared/summary";
import { useSettings } from "../lib/settings";

export function Summary({ totals }: { totals: Totals }) {
  const { fmt } = useSettings();
  const rows: [string, number][] = [
    ["Weekly", totals.weekly],
    ["Every 2 weeks", totals.biweekly],
    ["Yearly", totals.yearly],
  ];

  return (
    <section className="mb-4 rounded-xl border border-ink/10 bg-white p-5 shadow-sm">
      <div className="mb-4 border-b border-dashed border-ink/20 pb-4 text-center">
        <div className="mb-1 text-xs text-ink/50">Per month</div>
        <div className="font-mono text-4xl font-bold tabular-nums">{fmt.money(totals.monthly)}</div>
      </div>
      <div className="grid grid-cols-3 gap-1 text-center">
        {rows.map(([label, value], i) => (
          <div key={label} className={i === 1 ? "border-x border-ink/10" : ""}>
            <div className="mb-0.5 text-xs text-ink/50">{label}</div>
            <div className="font-mono text-sm font-semibold tabular-nums">{fmt.money(value)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
