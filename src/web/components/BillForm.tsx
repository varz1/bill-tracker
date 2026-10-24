import { Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { endDate } from "../../shared/schedule";
import { amountToInput, parseAmount } from "../../shared/format";
import { CYCLES, type Cycle } from "../../shared/schedule";
import type { Bill, BillInput } from "../../shared/schemas";
import { useSettings } from "../lib/settings";
import { CYCLE_LABELS } from "../lib/labels";

interface Props {
  /** Present when editing an existing bill. */
  bill?: Bill;
  onSubmit(input: BillInput): Promise<void>;
}

const field =
  "w-full rounded-md border border-ink/15 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40";

export function BillForm({ bill, onSubmit }: Props) {
  const { settings, fmt, today } = useSettings();
  const [name, setName] = useState(bill?.name ?? "");
  const [amount, setAmount] = useState(bill ? amountToInput(bill.amount) : "");
  const [cycle, setCycle] = useState<Cycle>(bill?.cycle ?? "monthly");
  const [startDate, setStartDate] = useState(bill?.startDate ?? "");
  const [totalPayments, setTotalPayments] = useState(bill?.totalPayments ? String(bill.totalPayments) : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const payments = Number(totalPayments);
  const lastPayment =
    startDate && Number.isInteger(payments) && payments >= 1 ? endDate({ startDate, cycle, totalPayments: payments }) : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const minor = parseAmount(amount);
    if (!name.trim()) return setError("Enter a name.");
    if (minor === null) return setError("Enter an amount greater than zero.");
    if (!startDate) return setError("Choose a start date.");
    if (totalPayments && (!Number.isInteger(payments) || payments < 1)) {
      return setError("Number of payments must be a whole number, or leave it blank.");
    }

    // Paid-early marks refer to specific due dates; if the schedule changes they would point at the wrong days.
    const scheduleChanged = bill && (bill.cycle !== cycle || bill.startDate !== startDate);
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        amount: minor,
        cycle,
        startDate,
        totalPayments: totalPayments ? payments : null,
        ...(scheduleChanged ? { paidAhead: [] } : {}),
      });
    } catch {
      setError("Couldn't save. Please try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 px-5 pt-4 pb-8">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name"
        aria-label="Name"
        maxLength={100}
        autoFocus
        className={field}
      />
      <div className="flex gap-2">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          placeholder={`Amount (${settings.currency})`}
          aria-label="Amount"
          className={`${field} min-w-0 flex-1 font-mono tabular-nums`}
        />
        <select
          value={cycle}
          onChange={(e) => setCycle(e.target.value as Cycle)}
          aria-label="Repeats"
          className={`${field} w-auto bg-white`}
        >
          {CYCLES.map((c) => (
            <option key={c} value={c}>
              {CYCLE_LABELS[c]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <label className="flex-1">
          <span className="mb-1 block text-xs text-ink/45">First payment</span>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={field} />
        </label>
        <label className="w-32 shrink-0">
          <span className="mb-1 block text-xs text-ink/45">Payments (optional)</span>
          <input
            type="number"
            inputMode="numeric"
            min="1"
            value={totalPayments}
            onChange={(e) => setTotalPayments(e.target.value)}
            placeholder="Ongoing"
            className={`${field} font-mono tabular-nums`}
          />
        </label>
      </div>
      {lastPayment && <p className="text-xs text-ink/40">Last payment: {fmt.dateSmart(lastPayment, today)}</p>}
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-md bg-ink py-3 text-sm font-medium text-paper transition-colors hover:bg-ink/90 disabled:opacity-60"
      >
        {!bill && <Plus className="h-4 w-4" />}
        {bill ? "Save changes" : "Add bill"}
      </button>
    </form>
  );
}
