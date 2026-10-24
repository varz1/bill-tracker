import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatHours } from "../../shared/format";
import { weekEnd, type ShiftWeek } from "../../shared/income";
import { useSettings } from "../lib/settings";
import { ChartTooltip, TooltipRow } from "./ChartTooltip";
import { Legend } from "./IncomeChart";

interface Props {
  weeks: ShiftWeek[];
  employers: string[];
  colors: Record<string, string>;
}

interface Row {
  label: string;
  week: ShiftWeek;
  [employerKey: string]: unknown;
}

const AXIS = { fontSize: 10, fill: "#898781" };

/** Paid hours per week, one line per employer, with a list view as an alternative. */
export function HoursChart({ weeks, employers, colors }: Props) {
  const { fmt } = useSettings();
  const [mode, setMode] = useState<"chart" | "list">("chart");
  const active = employers.filter((e) => weeks.some((w) => (w.byEmployer[e] ?? 0) > 0));
  const keyOf = (employer: string) => `e${employers.indexOf(employer)}`;

  const data: Row[] = weeks.map((week) => ({
    label: fmt.date(week.weekStart),
    week,
    ...Object.fromEntries(active.map((e) => [keyOf(e), week.byEmployer[e] ?? 0])),
  }));

  return (
    <section className="mb-4 rounded-xl border border-ink/10 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium">Paid hours by week</h2>
        <div className="flex gap-1" role="group" aria-label="View">
          {(["chart", "list"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
                mode === m ? "bg-ink text-paper" : "bg-ink/10 text-ink/55 hover:bg-ink/[0.12]"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      <Legend names={active} colors={colors} />

      {mode === "chart" ? (
        <div role="img" aria-label="Line chart of paid hours per week, by employer">
          <ResponsiveContainer width="100%" height={210}>
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="#e1e0d9" />
              <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis
                tick={AXIS}
                tickLine={false}
                axisLine={false}
                width={40}
                domain={[0, (max: number) => Math.max(10, Math.ceil(max / 10) * 10)]}
                tickCount={6}
                allowDecimals={false}
                tickFormatter={(v: number) => `${v}h`}
              />
              <Tooltip
                content={({ active: on, payload }) => {
                  const row = on ? (payload?.[0]?.payload as Row | undefined) : undefined;
                  if (!row) return null;
                  return (
                    <ChartTooltip title={`Week of ${fmt.date(row.week.weekStart)}`}>
                      {active.map((e) => (
                        <TooltipRow key={e} color={colors[e]} label={e} value={formatHours(row.week.byEmployer[e] ?? 0)} />
                      ))}
                      <div className="mt-1 border-t border-paper/15 pt-1">
                        <TooltipRow label="Total" value={formatHours(row.week.total)} />
                      </div>
                    </ChartTooltip>
                  );
                }}
              />
              {active.map((e) => (
                <Line
                  key={e}
                  dataKey={keyOf(e)}
                  stroke={colors[e]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <ul className="divide-y divide-ink/[0.08]">
          {[...weeks].reverse().map((w) => (
            <li key={w.weekStart} className="flex items-center gap-2 py-2 text-xs">
              <span className="w-28 shrink-0 font-mono text-ink/45 tabular-nums">
                {fmt.date(w.weekStart)} – {fmt.date(weekEnd(w.weekStart))}
              </span>
              <span className="flex min-w-0 flex-1 flex-wrap gap-x-3 gap-y-0.5">
                {active.map((e) => (
                  <span key={e} className="flex items-center gap-1">
                    <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: colors[e] }} />
                    <span className="font-mono text-ink/70 tabular-nums">{formatHours(w.byEmployer[e] ?? 0)}</span>
                  </span>
                ))}
              </span>
              <span className="shrink-0 font-mono font-semibold tabular-nums">{formatHours(w.total)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
