import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type AppConfig } from "./api";

// Until the Worker has answered, or if it can't, behave as a locked public demo: nothing is allowed that a demo
// wouldn't allow. `loaded` lets the page hold back what only a demo should show.
const LOCKED: AppConfig = { demo: true, settingsLocked: true, calendarTtlMs: null };

interface ConfigValue extends AppConfig {
  loaded: boolean;
}

const ConfigContext = createContext<ConfigValue>({ ...LOCKED, loaded: false });

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<ConfigValue>({ ...LOCKED, loaded: false });

  useEffect(() => {
    api.config
      .get()
      .then((config) => setValue({ ...config, loaded: true }))
      .catch(() => {});
  }, []);

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

/**
 * How this deployment is set up. `demo` is only true once the Worker has said so, so a personal deployment
 * never flashes the demo notices; the locks apply from the start.
 */
export function useConfig(): AppConfig {
  const { loaded, ...config } = useContext(ConfigContext);
  return { ...config, demo: loaded && config.demo };
}
