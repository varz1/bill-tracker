import { Wallet } from "lucide-react";
import { useState } from "react";
import { SettingsProvider } from "./lib/settings";
import Bills from "./views/Bills";
import Settings from "./views/Settings";

const TABS = [
  { key: "bills", label: "Bills" },
  { key: "settings", label: "Settings" },
] as const;

type Tab = (typeof TABS)[number]["key"];

export default function App() {
  const [tab, setTab] = useState<Tab>("bills");

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

        <SettingsProvider>{tab === "bills" ? <Bills /> : <Settings />}</SettingsProvider>
      </div>
    </div>
  );
}
