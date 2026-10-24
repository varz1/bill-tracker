import type { Cycle } from "../../shared/schedule";

export const CYCLE_LABELS: Record<Cycle, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
  quarterly: "Every 3 months",
  yearly: "Yearly",
};
