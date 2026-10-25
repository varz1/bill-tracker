import { Wallet } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
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

interface Route {
  tab: Tab;
  /** Set on #income/<id>: the employer page that is open. */
  employerId: string | null;
}

/** The place named in the URL hash (#income, #income/<employer id>), so a refresh or shared link keeps it. */
function routeFromHash(): Route {
  const [name, id] = window.location.hash.slice(1).split("/");
  const tab = TABS.find((t) => t.key === name)?.key ?? "bills";
  return { tab, employerId: tab === "income" && id ? id : null };
}

export default function App() {
  const [route, setRoute] = useState<Route>(routeFromHash);
  const { tab } = route;

  // Back and forward buttons move between the overview and an employer page.
  useEffect(() => {
    const sync = () => setRoute(routeFromHash());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const setTab = (next: Tab) => {
    window.history.replaceState(null, "", `#${next}`);
    setRoute({ tab: next, employerId: null });
  };
  const openEmployer = (id: string | null) => {
    window.history.pushState(null, "", id ? `#income/${id}` : "#income");
    setRoute({ tab: "income", employerId: id });
  };

  return (
    <div className="min-h-screen bg-paper font-sans text-ink">
      {DEMO_MODE && (
        <p className="bg-ink px-4 py-1.5 text-center text-xs text-paper/80">Demo app. All data shown here is made up.</p>
      )}
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
              <Income employerId={route.employerId} onOpenEmployer={openEmployer} />
            </Suspense>
          )}
          {tab === "settings" && <Settings />}
        </SettingsProvider>
      </div>
    </div>
  );
}
