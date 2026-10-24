import { Plus } from "lucide-react";
import { useState, type ReactNode } from "react";

interface Props<T extends { id: string }> {
  title: string;
  /** Singular noun for the add button's label and the empty message, e.g. "payslip". */
  noun: string;
  records: T[];
  onAdd(): void;
  renderRow(record: T): ReactNode;
  /** How many rows to show before "Show all". */
  limit?: number;
}

/** A titled card holding a list of rows with an add button and a "show all" toggle. */
export function RecordCard<T extends { id: string }>({ title, noun, records, onAdd, renderRow, limit = 8 }: Props<T>) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? records : records.slice(0, limit);

  return (
    <section className="mb-4 overflow-hidden rounded-xl border border-ink/10 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-ink/10 bg-ink/[0.03] px-4 py-2.5">
        <h2 className="text-sm font-medium">
          {title} <span className="font-normal text-ink/35">{records.length}</span>
        </h2>
        <button
          onClick={onAdd}
          aria-label={`Add ${noun}`}
          className="rounded-md bg-ink/10 p-1.5 text-ink/55 transition-colors hover:bg-ink/15 hover:text-ink"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {records.length === 0 ? (
        <p className="py-7 text-center text-xs text-ink/30">No {noun}s yet. Tap + to add one.</p>
      ) : (
        <div className="divide-y divide-ink/[0.08]">{shown.map((r) => <div key={r.id}>{renderRow(r)}</div>)}</div>
      )}
      {records.length > limit && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="w-full border-t border-ink/[0.08] py-2.5 text-xs text-ink/50 hover:bg-ink/[0.03]"
        >
          {expanded ? "Show fewer" : `Show all ${records.length}`}
        </button>
      )}
    </section>
  );
}
