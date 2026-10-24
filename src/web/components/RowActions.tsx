import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

interface Props {
  /** Used in accessible labels, e.g. the bill's name. */
  label: string;
  onEdit(): void;
  onDelete(): void;
}

/** Edit and delete buttons for a list row; delete asks for confirmation in place. */
export function RowActions({ label, onEdit, onDelete }: Props) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="-mr-1 flex shrink-0 items-center">
        <button onClick={onDelete} className="rounded-md px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">
          Delete
        </button>
        <button onClick={() => setConfirming(false)} className="rounded-md px-2 py-1.5 text-xs text-ink/50 hover:bg-ink/5">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="-mr-1 flex shrink-0 items-center">
      <button
        onClick={onEdit}
        aria-label={`Edit ${label}`}
        className="rounded-md p-2 text-ink/25 transition-colors hover:bg-ink/5 hover:text-ink"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => setConfirming(true)}
        aria-label={`Delete ${label}`}
        className="rounded-md p-2 text-ink/25 transition-colors hover:bg-red-50 hover:text-red-500"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
