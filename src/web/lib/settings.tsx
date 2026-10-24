import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { todayIn, type IsoDate } from "../../shared/dates";
import { createFormatters, type Formatters } from "../../shared/format";
import { DEFAULT_SETTINGS, type Settings } from "../../shared/schemas";
import { api } from "./api";

interface SettingsContextValue {
  settings: Settings;
  fmt: Formatters;
  /** Today's date on the device. */
  today: IsoDate;
  update(patch: Partial<Settings>): Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    // If settings can't be loaded the app still works with defaults.
    api.settings
      .get()
      .then(setSettings)
      .catch(() => setSettings(DEFAULT_SETTINGS));
  }, []);

  const update = useCallback(async (patch: Partial<Settings>) => {
    setSettings(await api.settings.update(patch));
  }, []);

  const value = useMemo(
    () =>
      settings
        ? {
            settings,
            fmt: createFormatters({ currency: settings.currency }),
            today: todayIn(),
            update,
          }
        : null,
    [settings, update],
  );

  if (!value) return <p className="py-20 text-center text-sm text-ink/40">Loading…</p>;
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside <SettingsProvider>");
  return ctx;
}
