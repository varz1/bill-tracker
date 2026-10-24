import { useEffect, useState } from "react";

export default function App() {
  const [apiOk, setApiOk] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => setApiOk(r.ok))
      .catch(() => setApiOk(false));
  }, []);

  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-semibold">Bill Tracker</h1>
      <p className="mt-2 text-sm text-neutral-500">
        API: {apiOk === null ? "checking…" : apiOk ? "ok" : "unreachable"}
      </p>
    </main>
  );
}
