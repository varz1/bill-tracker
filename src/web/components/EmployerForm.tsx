import { Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { CONTRACT_LABELS, SYNC_LABELS, sameName } from "../../shared/employers";
import { CONTRACTS, type Employer, type EmployerInput } from "../../shared/schemas";
import { ApiError } from "../lib/api";
import { inputClass, labelClass, submitClass } from "./fields";

interface Props {
  employer?: Employer;
  /** Existing employers, to catch a duplicate name before it is sent. */
  all: Employer[];
  onSubmit(input: EmployerInput): Promise<void>;
}

export function EmployerForm({ employer, all, onSubmit }: Props) {
  const [name, setName] = useState(employer?.name ?? "");
  const [contract, setContract] = useState<Employer["contract"]>(employer?.contract ?? "full-time");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError("Enter the employer's name.");
    if (all.some((o) => o.id !== employer?.id && sameName(o.name, trimmed))) {
      return setError("You already have an employer with that name.");
    }

    setBusy(true);
    setError(null);
    try {
      await onSubmit({ name: trimmed, contract, sync: employer?.sync ?? "manual" });
    } catch (err) {
      setError(err instanceof ApiError && err.status === 409 ? "You already have an employer with that name." : "Couldn't save. Please try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 px-5 pt-4 pb-8">
      <label className="block">
        <span className={labelClass}>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoFocus className={inputClass} />
      </label>
      <label className="block">
        <span className={labelClass}>Contract</span>
        <select value={contract} onChange={(e) => setContract(e.target.value as Employer["contract"])} className={inputClass}>
          {CONTRACTS.map((c) => (
            <option key={c} value={c}>
              {CONTRACT_LABELS[c]}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className={labelClass}>Shifts</span>
        <select value="manual" onChange={() => {}} className={inputClass}>
          <option value="manual">{SYNC_LABELS.manual}</option>
          <option value="calendar" disabled>
            {SYNC_LABELS.calendar} (coming soon)
          </option>
        </select>
      </label>
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className={submitClass}>
        {!employer && <Plus className="h-4 w-4" />}
        {employer ? "Save changes" : "Add employer"}
      </button>
    </form>
  );
}
