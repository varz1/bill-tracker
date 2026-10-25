import { Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { hoursBetween } from "../../shared/income";
import type { Shift, ShiftInput } from "../../shared/schemas";
import { inputClass, labelClass, submitClass } from "./fields";

interface Props {
  shift?: Shift;
  employerId: string;
  onSubmit(input: ShiftInput): Promise<void>;
}

export function ShiftForm({ shift, employerId, onSubmit }: Props) {
  const [date, setDate] = useState(shift?.date ?? "");
  const [start, setStart] = useState(shift?.start ?? "");
  const [end, setEnd] = useState(shift?.end ?? "");
  const [hours, setHours] = useState(shift ? String(shift.hours) : "");
  const [hoursEdited, setHoursEdited] = useState(Boolean(shift));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Until the user types the paid hours themselves, fill them in from the start and end times.
  function setTimes(nextStart: string, nextEnd: string) {
    setStart(nextStart);
    setEnd(nextEnd);
    if (hoursEdited) return;
    const worked = nextStart && nextEnd ? hoursBetween(nextStart, nextEnd) : null;
    setHours(worked === null ? "" : String(worked));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const paid = Number(hours);
    if (!date) return setError("Choose the date.");
    if (!hours || !Number.isFinite(paid) || paid <= 0 || paid > 24) {
      return setError("Enter the paid hours, between 0 and 24.");
    }
    if (Boolean(start) !== Boolean(end)) return setError("Enter both a start and end time, or neither.");

    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        employerId,
        date,
        hours: paid,
        ...(start && end ? { start, end } : {}),
      });
    } catch {
      setError("Couldn't save. Please try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 px-5 pt-4 pb-8">
      <label className="block">
        <span className={labelClass}>Date</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} autoFocus className={inputClass} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className={labelClass}>Start (optional)</span>
          <input type="time" value={start} onChange={(e) => setTimes(e.target.value, end)} className={inputClass} />
        </label>
        <label className="block">
          <span className={labelClass}>End (optional)</span>
          <input type="time" value={end} onChange={(e) => setTimes(start, e.target.value)} className={inputClass} />
        </label>
      </div>
      <label className="block">
        <span className={labelClass}>Paid hours</span>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          max="24"
          value={hours}
          onChange={(e) => (setHours(e.target.value), setHoursEdited(true))}
          className={`${inputClass} font-mono tabular-nums`}
        />
        <span className="mt-1 block text-xs text-ink/35">Subtract any unpaid break yourself.</span>
      </label>
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className={submitClass}>
        {!shift && <Plus className="h-4 w-4" />}
        {shift ? "Save changes" : "Add shift"}
      </button>
    </form>
  );
}
