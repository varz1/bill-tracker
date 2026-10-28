// Unpaid meal breaks that calendar sync takes off an event's length to get paid hours.
// Paid rest breaks (the 10 to 20 minute ones) are part of working time and are never deducted.
//
// The rules below come from the break clauses of the Fair Work modern awards, as consolidated up to
// 1 July 2026. They are starting points: an enterprise agreement or contract can say something else.

export const BREAK_RULES = ["none", "over5", "over5_twice10", "atLeast5", "over6", "over4_5"] as const;
export type BreakRule = (typeof BREAK_RULES)[number];

/** Awards allow 30 to 60 minutes; the calendar can't tell which one the employer rosters. */
export const BREAK_MINUTES = [30, 45, 60] as const;
export const DEFAULT_BREAK_MINUTES = 30;

interface Threshold {
  /** Event length, in minutes, past which one more unpaid break is taken. */
  after: number;
  /** True when a shift of exactly `after` minutes already counts ("5 hours or more"). */
  inclusive: boolean;
}

interface RuleInfo {
  label: string;
  /** Industries (awards) this rule comes from, for the form's hint. */
  industries: string[];
  thresholds: Threshold[];
}

export const BREAK_RULE_INFO: Record<BreakRule, RuleInfo> = {
  none: { label: "No unpaid break", industries: [], thresholds: [] },
  over5: {
    label: "Over 5 h",
    industries: ["Clerks", "Pharmacy", "Aged care", "Children's services", "Security", "Storage and wholesale", "Health professionals", "Building"],
    thresholds: [{ after: 300, inclusive: false }],
  },
  over5_twice10: {
    label: "Over 5 h, twice from 10 h",
    industries: ["Retail"],
    thresholds: [
      { after: 300, inclusive: false },
      { after: 600, inclusive: true },
    ],
  },
  atLeast5: {
    label: "5 h or more",
    industries: ["Fast food", "Restaurants"],
    thresholds: [{ after: 300, inclusive: true }],
  },
  over6: {
    label: "Over 6 h",
    industries: ["Hospitality"],
    thresholds: [{ after: 360, inclusive: false }],
  },
  over4_5: {
    label: "Over 4.5 h",
    industries: ["Cleaning"],
    thresholds: [{ after: 270, inclusive: false }],
  },
};

/** Unpaid minutes to deduct from an event that lasts `spanMinutes`. */
export function unpaidMinutes(spanMinutes: number, rule: BreakRule, breakMinutes: number = DEFAULT_BREAK_MINUTES): number {
  const taken = BREAK_RULE_INFO[rule].thresholds.filter((t) => (t.inclusive ? spanMinutes >= t.after : spanMinutes > t.after));
  return taken.length * breakMinutes;
}

/** Paid minutes for an event that lasts `spanMinutes`. */
export function paidMinutes(spanMinutes: number, rule: BreakRule, breakMinutes: number = DEFAULT_BREAK_MINUTES): number {
  return spanMinutes - unpaidMinutes(spanMinutes, rule, breakMinutes);
}
