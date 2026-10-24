import { Wallet } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { DEMO_MODE } from "./config";
import { SettingsProvider } from "./lib/settings";
import Bills from "./views/Bills";
import Settings from "./views/Settings";

// The Income view pulls in the charting library, so load it only when that tab is opened.
const Income = lazy(() => import("./views/Income"));

const TABS = [
  { key: "bills", label: "Bills" },
  { key: "income", label: "Income" },
  { key: "settings", label: "Settings" },
] as const;

type Tab = (typeof TABS)[number]["key"];

/** The tab named in the URL hash (#income), so a refresh or a shared link keeps its place. */
function tabFromHash(): Tab {
  const name = window.location.hash.slice(1);
  return TABS.find((t) => t.key === name)?.key ?? "bills";
}

export default function App() {
  const [tab, setTabState] = useState<Tab>(tabFromHash);
  const setTab = (next: Tab) => {
    setTabState(next);
    window.history.replaceState(null, "", `#${next}`);
  };

  return (
    <div className="min-h-screen bg-paper font-sans text-ink">
      <div className="mx-auto max-w-md px-4 py-6">
        <header className="mb-5 flex items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ink">
            <Wallet className="h-5 w-5 text-paper" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Bill Tracker</h1>
        </header>

        <nav className="mb-5 flex gap-2" aria-label="Sections">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              aria-current={tab === t.key ? "page" : undefined}
              className={`flex-1 rounded-full py-2 text-sm font-medium transition-colors ${
                tab === t.key ? "bg-ink text-paper" : "bg-ink/10 text-ink/55 hover:bg-ink/[0.12]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <SettingsProvider>
          {tab === "bills" && <Bills />}
          {tab === "income" && (
            <Suspense fallback={<p className="py-20 text-center text-sm text-ink/40">Loading…</p>}>
              <Income />
            </Suspense>
          )}
          {tab === "settings" && <Settings />}
        </SettingsProvider>

        {DEMO_MODE && (
          <p className="mt-6 text-center text-xs text-ink/40">Demo app. All data shown here is made up.</p>
        )}
      </div>
    </div>
  );
}
