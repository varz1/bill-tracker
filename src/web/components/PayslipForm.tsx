import { Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { amountToInput, parseAmount } from "../../shared/format";
import type { Income, IncomeInput } from "../../shared/schemas";
import { useSettings } from "../lib/settings";
import { EmployerField } from "./EmployerField";
import { inputClass, labelClass, submitClass } from "./fields";

interface Props {
  payslip?: Income;
  employers: string[];
  onSubmit(input: IncomeInput): Promise<void>;
}

const money = `${inputClass} font-mono tabular-nums`;

export function PayslipForm({ payslip, employers, onSubmit }: Props) {
  const { settings } = useSettings();
  const [employer, setEmployer] = useState(payslip?.employer ?? employers[0] ?? "");
  const [payDate, setPayDate] = useState(payslip?.payDate ?? "");
  const [periodStart, setPeriodStart] = useState(payslip?.periodStart ?? "");
  const [periodEnd, setPeriodEnd] = useState(payslip?.periodEnd ?? "");
  const [gross, setGross] = useState(payslip ? amountToInput(payslip.gross) : "");
  const [tax, setTax] = useState(payslip ? amountToInput(payslip.tax) : "");
  const [net, setNet] = useState(payslip ? amountToInput(payslip.net) : "");
  const [netEdited, setNetEdited] = useState(Boolean(payslip));
  const [superAmount, setSuperAmount] = useState(payslip ? amountToInput(payslip.super) : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Until the user types a take-home amount themselves, keep it equal to gross minus tax.
  function setPay(nextGross: string, nextTax: string) {
    setGross(nextGross);
    setTax(nextTax);
    if (netEdited) return;
    const g = parseAmount(nextGross);
    const t = parseAmount(nextTax || "0", { allowZero: true });
    setNet(g !== null && t !== null && g >= t ? amountToInput(g - t) : "");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const g = parseAmount(gross);
    const t = parseAmount(tax, { allowZero: true });
    const n = parseAmount(net, { allowZero: true });
    const s = parseAmount(superAmount, { allowZero: true });
    if (!employer.trim()) return setError("Enter the employer.");
    if (!payDate) return setError("Choose the pay date.");
    if (!periodStart || !periodEnd) return setError("Choose the pay period start and end.");
    if (periodEnd < periodStart) return setError("The pay period can't end before it starts.");
    if (g === null) return setError("Enter the gross pay.");
    if (t === null) return setError("Enter the tax withheld (0 if none).");
    if (n === null) return setError("Enter the net pay.");
    if (s === null) return setError("Enter the super paid (0 if none).");

    setBusy(true);
    setError(null);
    try {
      await onSubmit({ employer: employer.trim(), payDate, periodStart, periodEnd, gross: g, tax: t, net: n, super: s });
    } catch {
      setError("Couldn't save. Please try again.");
      setBusy(false);
    }
  }

  const amount = (label: string, value: string, set: (v: string) => void, aria: string) => (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        value={value}
        onChange={(e) => set(e.target.value)}
        aria-label={aria}
        placeholder={settings.currency}
        className={money}
      />
    </label>
  );

  return (
    <form onSubmit={submit} className="space-y-3 px-5 pt-4 pb-8">
      <EmployerField value={employer} onChange={setEmployer} suggestions={employers} />
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className={labelClass}>Period start</span>
          <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className={inputClass} />
        </label>
        <label className="block">
          <span className={labelClass}>Period end</span>
          <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className={inputClass} />
        </label>
      </div>
      <label className="block">
        <span className={labelClass}>Pay date</span>
        <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className={inputClass} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        {amount("Gross pay", gross, (v) => setPay(v, tax), "Gross pay")}
        {amount("Tax withheld", tax, (v) => setPay(gross, v), "Tax withheld")}
        {amount("Net pay", net, (v) => (setNet(v), setNetEdited(true)), "Net pay")}
        {amount("Super", superAmount, setSuperAmount, "Super")}
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className={submitClass}>
        {!payslip && <Plus className="h-4 w-4" />}
        {payslip ? "Save changes" : "Add payslip"}
      </button>
    </form>
  );
}
