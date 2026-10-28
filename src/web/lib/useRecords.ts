import { useCallback, useEffect, useRef, useState } from "react";
import type { Resource } from "./api";

export type LoadStatus = "loading" | "ready" | "error";

export interface Records<T, I> {
  records: T[];
  status: LoadStatus;
  saveError: boolean;
  /** Rejects on failure so the calling form can show the error. Resolves with the saved record. */
  add(input: I): Promise<T>;
  /** Loads the list again, for changes made outside this hook (a calendar sync, linking a calendar). */
  reload(): Promise<void>;
  update(id: string, patch: Partial<I>): Promise<void>;
  remove(id: string): Promise<void>;
}

/**
 * Loads a list of records once and keeps it in sync with the API.
 * Edits and deletes apply instantly and roll back if the save fails.
 */
export function useRecords<T extends { id: string }, I>(resource: Resource<T, I>): Records<T, I> {
  const [records, setRecords] = useState<T[]>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [saveError, setSaveError] = useState(false);
  // Latest list, so a failed save can restore exactly what was on screen before the edit.
  const latest = useRef(records);
  latest.current = records;

  useEffect(() => {
    let cancelled = false;
    resource
      .list()
      .then((items) => {
        if (cancelled) return;
        setRecords(items);
        setStatus("ready");
      })
      .catch(() => !cancelled && setStatus("error"));
    return () => {
      cancelled = true;
    };
  }, [resource]);

  /** Applies `change` locally right away, then runs `save`; restores the previous list on failure. */
  const optimistic = useCallback(async (change: (list: T[]) => T[], save: () => Promise<T | void>) => {
    const previous = latest.current;
    setRecords(change(previous));
    setSaveError(false);
    try {
      const saved = await save();
      if (saved) setRecords((current) => current.map((r) => (r.id === saved.id ? saved : r)));
    } catch {
      setRecords(previous);
      setSaveError(true);
    }
  }, []);

  /** Creates a record. Rejects on failure so the calling form can show the error. */
  const add = useCallback(
    async (input: I) => {
      const created = await resource.create(input);
      setRecords((current) => [...current, created]);
      return created;
    },
    [resource],
  );

  /** Keeps the current list if the reload fails; a stale list beats an empty one. */
  const reload = useCallback(async () => {
    try {
      setRecords(await resource.list());
    } catch {
      /* the next reload will try again */
    }
  }, [resource]);

  const update = useCallback(
    (id: string, patch: Partial<I>) =>
      optimistic(
        (list) => list.map((r) => (r.id === id ? ({ ...r, ...patch } as T) : r)),
        () => resource.update(id, patch),
      ),
    [optimistic, resource],
  );

  const remove = useCallback(
    (id: string) =>
      optimistic(
        (list) => list.filter((r) => r.id !== id),
        () => resource.remove(id),
      ),
    [optimistic, resource],
  );

  return { records, status, saveError, add, reload, update, remove };
}
