import { AlertTriangle, Loader2, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import type { Bill } from "../../shared/schemas";
import { sortViews, timeline, totals, viewBill } from "../../shared/summary";
import { BillForm } from "../components/BillForm";
import { BillRow } from "../components/BillRow";
import { Modal } from "../components/Modal";
import { Summary } from "../components/Summary";
import { Timeline } from "../components/Timeline";
import { useBills } from "../lib/useBills";
import { useSettings } from "../lib/settings";

export default function Bills() {
  const { today } = useSettings();
  const { bills, status, saveError, add, update, remove, togglePaidAhead } = useBills();
  // null = closed, "new" = add form, Bill = editing that bill
  const [editing, setEditing] = useState<Bill | "new" | null>(null);

  const views = useMemo(() => sortViews(bills.map((b) => viewBill(b, today))), [bills, today]);
  const sums = useMemo(() => totals(bills, today), [bills, today]);
  const events = useMemo(() => timeline(bills, today), [bills, today]);

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center py-20" role="status" aria-label="Loading bills">
        <Loader2 className="h-6 w-6 animate-spin text-ink" />
      </div>
    );
  }

  return (
    <>
      {status === "error" && (
        <div role="alert" className="mb-4 flex items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Couldn't load your bills. Refresh the page to try again.
        </div>
      )}

      <Summary totals={sums} />
      {events.length > 0 && <Timeline events={events} bills={bills} onTogglePaid={togglePaidAhead} />}

      <section className="mb-4 overflow-hidden rounded-xl border border-ink/10 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-ink/10 bg-ink/[0.03] px-4 py-2.5">
          <h2 className="text-sm font-medium">Bills</h2>
          <button
            onClick={() => setEditing("new")}
            aria-label="Add bill"
            className="rounded-md bg-ink/10 p-1.5 text-ink/55 transition-colors hover:bg-ink/15 hover:text-ink"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        {views.length === 0 ? (
          <p className="py-7 text-center text-xs text-ink/30">No bills yet. Tap + to add one.</p>
        ) : (
          <div className="divide-y divide-ink/[0.08]">
            {views.map((v) => (
              <BillRow key={v.bill.id} view={v} onEdit={() => setEditing(v.bill)} onDelete={() => remove(v.bill.id)} />
            ))}
          </div>
        )}
      </section>

      {saveError && (
        <p role="alert" className="mt-2 text-center text-xs text-red-600">
          Couldn't save your change, so it was undone. Please try again.
        </p>
      )}

      {editing && (
        <Modal title={editing === "new" ? "Add bill" : "Edit bill"} onClose={() => setEditing(null)}>
          <BillForm
            bill={editing === "new" ? undefined : editing}
            onSubmit={async (input) => {
              if (editing === "new") await add(input);
              else await update(editing.id, input);
              setEditing(null);
            }}
          />
        </Modal>
      )}
    </>
  );
}
