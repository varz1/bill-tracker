import { useCallback, useEffect, useRef, useState } from "react";
import type { Bill, BillInput } from "../../shared/schemas";
import { api } from "./api";

export type LoadStatus = "loading" | "ready" | "error";

/** Loads bills once and keeps them in sync with the API. Edits apply instantly and roll back if the save fails. */
export function useBills() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [saveError, setSaveError] = useState(false);
  // Latest list, so a failed save can restore exactly what was on screen before the edit.
  const latest = useRef(bills);
  latest.current = bills;

  useEffect(() => {
    let cancelled = false;
    api.bills
      .list()
      .then((items) => {
        if (cancelled) return;
        setBills(items);
        setStatus("ready");
      })
      .catch(() => !cancelled && setStatus("error"));
    return () => {
      cancelled = true;
    };
  }, []);

  /** Applies `change` locally right away, then runs `save`; restores the previous list on failure. */
  const optimistic = useCallback(async (change: (bills: Bill[]) => Bill[], save: () => Promise<Bill | void>) => {
    const previous = latest.current;
    setBills(change(previous));
    setSaveError(false);
    try {
      const saved = await save();
      if (saved) setBills((current) => current.map((b) => (b.id === saved.id ? saved : b)));
    } catch {
      setBills(previous);
      setSaveError(true);
    }
  }, []);

  const add = useCallback(async (input: BillInput) => {
    const created = await api.bills.create(input);
    setBills((current) => [...current, created]);
  }, []);

  const update = useCallback(
    (id: string, patch: Partial<BillInput>) =>
      optimistic(
        (list) => list.map((b) => (b.id === id ? ({ ...b, ...patch } as Bill) : b)),
        () => api.bills.update(id, patch),
      ),
    [optimistic],
  );

  const remove = useCallback(
    (id: string) =>
      optimistic(
        (list) => list.filter((b) => b.id !== id),
        () => api.bills.remove(id),
      ),
    [optimistic],
  );

  const togglePaidAhead = useCallback(
    (bill: Bill, date: string) => {
      const paidAhead = bill.paidAhead.includes(date)
        ? bill.paidAhead.filter((d) => d !== date)
        : [...bill.paidAhead, date];
      return update(bill.id, { paidAhead });
    },
    [update],
  );

  return { bills, status, saveError, add, update, remove, togglePaidAhead };
}
