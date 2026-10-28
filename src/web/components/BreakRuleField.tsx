import { useState } from "react";
import { BREAK_MINUTES, BREAK_RULES, BREAK_RULE_INFO, paidMinutes, type BreakRule } from "../../shared/breaks";
import { hintClass, inputClass, labelClass } from "./fields";

interface Props {
  rule: BreakRule;
  minutes: number;
  onChange(next: { rule: BreakRule; minutes: number }): void;
}

/** "Over 5 h (Clerks, Pharmacy, Aged care…)": the rule, and the first few industries it covers. */
function optionLabel(rule: BreakRule): string {
  const { label, industries } = BREAK_RULE_INFO[rule];
  if (industries.length === 0) return label;
  return `${label} (${industries.slice(0, 3).join(", ")}${industries.length > 3 ? "…" : ""})`;
}

const hoursText = (minutes: number) => `${Math.round((minutes / 60) * 100) / 100} h`;

/** Which unpaid meal break calendar sync takes off each event, with a quick check of what it does to a shift. */
export function BreakRuleField({ rule, minutes, onChange }: Props) {
  const [tryHours, setTryHours] = useState("6.5");
  const { industries } = BREAK_RULE_INFO[rule];

  const span = Math.round(Number(tryHours) * 60);
  const canTry = tryHours.trim() !== "" && span > 0 && span <= 24 * 60;

  return (
    <div className="space-y-3">
      <label className="block">
        <span className={labelClass}>Unpaid break</span>
        <select value={rule} onChange={(e) => onChange({ rule: e.target.value as BreakRule, minutes })} className={inputClass}>
          {BREAK_RULES.map((r) => (
            <option key={r} value={r}>
              {optionLabel(r)}
            </option>
          ))}
        </select>
        <span className={hintClass}>
          {industries.length > 0 && `Used by: ${industries.join(", ")}. `}
          Taken off each calendar event's length to get your paid hours, from the Fair Work awards as at 1 July 2026. Check your
          contract or enterprise agreement. Shiftworkers' breaks are usually paid, so choose "No unpaid break".
        </span>
      </label>

      {rule !== "none" && (
        <>
          <label className="block">
            <span className={labelClass}>Break length</span>
            <select value={minutes} onChange={(e) => onChange({ rule, minutes: Number(e.target.value) })} className={inputClass}>
              {BREAK_MINUTES.map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
            <span className={hintClass}>Awards allow 30 to 60 minutes. Your calendar can't say how long yours is.</span>
          </label>

          <div className="flex items-center gap-2 text-xs text-ink/55">
            <span>Try it: a</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={24}
              step={0.25}
              value={tryHours}
              onChange={(e) => setTryHours(e.target.value)}
              aria-label="Event length in hours"
              className="w-20 rounded-md border border-ink/15 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
            <span>
              h event {canTry ? `→ ${hoursText(paidMinutes(span, rule, minutes))} paid` : ""}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
