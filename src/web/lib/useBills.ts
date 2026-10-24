import { useCallback } from "react";
import type { Bill } from "../../shared/schemas";
import { api } from "./api";
import { useRecords } from "./useRecords";

export function useBills() {
  const { records, update, ...rest } = useRecords(api.bills);

  const togglePaidAhead = useCallback(
    (bill: Bill, date: string) => {
      const paidAhead = bill.paidAhead.includes(date)
        ? bill.paidAhead.filter((d) => d !== date)
        : [...bill.paidAhead, date];
      return update(bill.id, { paidAhead });
    },
    [update],
  );

  return { bills: records, update, togglePaidAhead, ...rest };
}
