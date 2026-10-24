import { Bar, BarChart, CartesianGrid, Rectangle, ResponsiveContainer, Tooltip, XAxis, YAxis, type BarShapeProps } from "recharts";
import { weekEnd, type IncomeWeek } from "../../shared/income";
import { useSettings } from "../lib/settings";
import { ChartTooltip, TooltipRow } from "./ChartTooltip";

interface Props {
  weeks: IncomeWeek[];
  settledUntil: string;
  employers: string[];
  colors: Record<string, string>;
}

interface Row {
  label: string;
  week: IncomeWeek;
  settled: boolean;
  [employerKey: string]: unknown;
}

const AXIS = { fontSize: 10, fill: "#898781" };

/** Gross pay per week, stacked by employer. Weeks that still have wages outstanding are drawn faded. */
export function IncomeChart({ weeks, settledUntil, employers, colors }: Props) {
  const { fmt } = useSettings();
  // Recharts reads values by key path, and employer names can contain dots, so use plain keys.
  const active = employers.filter((e) => weeks.some((w) => (w.byEmployer[e]?.gross ?? 0) > 0));
  const keyOf = (employer: string) => `e${employers.indexOf(employer)}`;

  const data: Row[] = weeks.map((week) => ({
    label: fmt.date(week.weekStart),
    week,
    settled: weekEnd(week.weekStart) <= settledUntil,
    ...Object.fromEntries(active.map((e) => [keyOf(e), (week.byEmployer[e]?.gross ?? 0) / 100])),
  }));

  const fade = (props: BarShapeProps) => (
    <Rectangle {...props} fillOpacity={(props.payload as Row).settled ? 1 : 0.35} />
  );

  return (
    <section className="mb-4 rounded-xl border border-ink/10 bg-white p-4 shadow-sm">
      <h2 className="mb-1 text-sm font-medium">Gross pay by week</h2>
      <p className="mb-3 text-[10px] text-ink/35">
        A fortnightly payslip is shown in full in the second week. Faded weeks still have wages outstanding and are left
        out of the stats.
      </p>
      <Legend names={active} colors={colors} />
      <div role="img" aria-label="Stacked bar chart of gross pay per week, by employer">
        <ResponsiveContainer width="100%" height={210}>
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="#e1e0d9" />
            <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis
              tick={AXIS}
              tickLine={false}
              axisLine={false}
              width={40}
              tickFormatter={(v: number) => (v >= 1000 ? `${v / 1000}k` : String(v))}
            />
            <Tooltip
              cursor={{ fill: "rgba(28,43,57,0.05)" }}
              content={({ active: on, payload }) => {
                const row = on ? (payload?.[0]?.payload as Row | undefined) : undefined;
                if (!row) return null;
                const present = active.filter((e) => row.week.byEmployer[e]);
                return (
                  <ChartTooltip title={`Week of ${fmt.date(row.week.weekStart)}`}>
                    {!row.settled && <div className="mb-1 text-[10px] text-paper/50">Wages outstanding, not in stats</div>}
                    {present.length === 0 && <div className="text-paper/60">No pay</div>}
                    {present.map((e) => (
                      <TooltipRow
                        key={e}
                        color={colors[e]}
                        label={e}
                        value={fmt.money(row.week.byEmployer[e].gross)}
                        note={row.week.byEmployer[e].multiWeek ? "2 weeks' pay" : undefined}
                      />
                    ))}
                    {present.length > 0 && (
                      <div className="mt-1 border-t border-paper/15 pt-1">
                        <TooltipRow label="Net" value={fmt.money(row.week.net)} />
                      </div>
                    )}
                  </ChartTooltip>
                );
              }}
            />
            {active.map((e, i) => (
              <Bar
                key={e}
                dataKey={keyOf(e)}
                stackId="gross"
                fill={colors[e]}
                shape={fade}
                isAnimationActive={false}
                radius={i === active.length - 1 ? [3, 3, 0, 0] : 0}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export function Legend({ names, colors }: { names: string[]; colors: Record<string, string> }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
      {names.map((name) => (
        <div key={name} className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: colors[name] }} />
          <span className="text-ink/60">{name}</span>
        </div>
      ))}
    </div>
  );
}
