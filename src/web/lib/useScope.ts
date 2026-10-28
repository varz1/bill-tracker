import { useCallback, useState } from "react";

const KEY = "income.scope";

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/**
 * Which employer the Income overview shows: one employer's id, or null for all of them. Remembered in this
 * browser. An id that no longer matches an employer (it was deleted) counts as all.
 */
export function useScope(employerIds: string[]): [string | null, (id: string | null) => void] {
  const [stored, setStored] = useState<string | null>(read);
  const set = useCallback((id: string | null) => {
    setStored(id);
    try {
      if (id === null) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, id);
    } catch {
      // Not remembered, but the choice still applies for now.
    }
  }, []);
  return [stored !== null && employerIds.includes(stored) ? stored : null, set];
}
