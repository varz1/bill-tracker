import type { Employer } from "../../shared/schemas";
import { inputClass } from "./fields";

interface Props {
  employers: Employer[];
  /** The employer shown, or null for all of them. */
  value: string | null;
  onChange(id: string | null): void;
}

/** Chooses whether the stats and charts below cover every employer or just one. Not worth showing for a single employer. */
export function ScopePicker({ employers, value, onChange }: Props) {
  if (employers.length < 2 && value === null) return null;
  return (
    <label className="mb-3 flex items-center gap-2 px-1 text-xs text-ink/50">
      Show
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        aria-label="Employer shown in the stats and charts"
        className={`${inputClass} w-auto bg-white py-1.5`}
      >
        <option value="">All employers</option>
        {employers.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </select>
    </label>
  );
}
