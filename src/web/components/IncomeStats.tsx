import { formatHours } from "../../shared/format";
import type { Overview } from "../../shared/income";
import { useSettings } from "../lib/settings";

function Stat({ label, value, big = false, wide = false }: { label: string; value: string; big?: boolean; wide?: boolean }) {
  return (
    <div className={`rounded-xl border border-ink/10 bg-white p-4 shadow-sm ${wide ? "col-span-2" : ""}`}>
      <div className="mb-1 text-xs text-ink/50">{label}</div>
      <div className={`font-mono tabular-nums ${big ? "text-xl font-bold" : "text-base font-semibold text-ink/70"}`}>{value}</div>
    </div>
  );
}

/** `onlyOne` is set when the numbers cover a single employer. */
export function IncomeStats({ overview, onlyOne = false }: { overview: Overview; onlyOne?: boolean }) {
  const { fmt, today } = useSettings();
  const { stats, hours, settledUntil, heldBack } = overview;
  const holder = heldBack && overview.employers.find((e) => e.id === heldBack.employerId);
  const dash = "—";

  return (
    <section className="mb-4">
      <p className="mb-2 px-1 text-[10px] text-ink/40">
        {stats.weeks > 0
          ? `Pay stats cover ${stats.weeks} ${stats.weeks === 1 ? "week" : "weeks"} up to ${fmt.dateSmart(settledUntil, today)}. Later weeks still have wages outstanding. `
          : "No fully paid weeks yet. "}
        Hours count finished weeks only.
      </p>
      {heldBack && holder && (
        <p role="note" className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-800">
          {holder.name} has shifts from {fmt.dateSmart(heldBack.since, today)} with no payslip covering them, so weeks from then on aren't
          counted in the pay stats.{" "}
          {onlyOne
            ? `Add its payslips to count them.`
            : "Add its payslips to count them, or choose one employer above to see the others on their own."}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Stat big label="Total gross" value={fmt.money(stats.gross)} />
        <Stat big label="Total net" value={fmt.money(stats.net)} />
        <Stat label="Total tax" value={fmt.money(stats.tax)} />
        <Stat label="Average net per week" value={stats.avgNet === null ? dash : fmt.money(stats.avgNet)} />
        <Stat label="Total hours" value={hours.totalHours > 0 ? formatHours(hours.totalHours) : dash} />
        <Stat label="Average hours per week" value={hours.avgWeeklyHours === null ? dash : formatHours(hours.avgWeeklyHours)} />
        <Stat wide label="Average hourly rate (gross ÷ paid hours)" value={hours.avgRate === null ? dash : `${fmt.money(hours.avgRate)}/h`} />
      </div>
    </section>
  );
}
