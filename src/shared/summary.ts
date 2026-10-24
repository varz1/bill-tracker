import { addDays, type IsoDate } from "./dates";
import {
  endDate,
  monthlyCost,
  nextPayment,
  paymentsInWindow,
  PER_YEAR,
  remaining,
  yearlyCost,
  type NextPayment,
} from "./schedule";
import type { Bill } from "./schemas";

export interface BillView {
  bill: Bill;
  next: NextPayment;
  /** Due date of the final payment; null for an open-ended bill. */
  endDate: IsoDate | null;
  remaining: { remainingCount: number; remainingAmount: number } | null;
  /** Average cost per month in minor units. */
  monthly: number;
}

export function viewBill(bill: Bill, today: IsoDate): BillView {
  return {
    bill,
    next: nextPayment(bill, today),
    endDate: endDate(bill),
    remaining: remaining(bill, bill.amount, today),
    monthly: monthlyCost(bill.amount, bill.cycle),
  };
}

/** Soonest next payment first; finished bills last. Ties keep their original (creation) order. */
export function sortViews(views: BillView[]): BillView[] {
  const rank = (v: BillView) => (v.next.status === "upcoming" ? v.next.date : "9999-99-99");
  return [...views].sort((a, b) => (rank(a) < rank(b) ? -1 : rank(a) > rank(b) ? 1 : 0));
}

export interface Totals {
  weekly: number;
  biweekly: number;
  monthly: number;
  yearly: number;
}

/** Running cost of every bill that still has payments to make, in minor units. */
export function totals(bills: Bill[], today: IsoDate): Totals {
  const yearly = bills
    .filter((b) => nextPayment(b, today).status === "upcoming")
    .reduce((sum, b) => sum + yearlyCost(b.amount, b.cycle), 0);
  return {
    yearly,
    monthly: Math.round(yearly / 12),
    biweekly: Math.round(yearly / PER_YEAR.biweekly),
    weekly: Math.round(yearly / PER_YEAR.weekly),
  };
}

export interface TimelineEvent {
  billId: string;
  name: string;
  amount: number;
  date: IsoDate;
  /** Negative for past payments. */
  daysFromToday: number;
  paidAhead: boolean;
  remaining: BillView["remaining"];
}

/** Every payment due within `daysBefore` days before and `daysAfter` days after today. */
export function timeline(bills: Bill[], today: IsoDate, daysBefore = 15, daysAfter = 15): TimelineEvent[] {
  const from = addDays(today, -daysBefore);
  const to = addDays(today, daysAfter);
  const events: TimelineEvent[] = [];
  for (const bill of bills) {
    const left = remaining(bill, bill.amount, today);
    for (const date of paymentsInWindow(bill, from, to)) {
      events.push({
        billId: bill.id,
        name: bill.name,
        amount: bill.amount,
        date,
        daysFromToday: Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000),
        paidAhead: bill.paidAhead.includes(date),
        remaining: left,
      });
    }
  }
  return events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.name.localeCompare(b.name)));
}
