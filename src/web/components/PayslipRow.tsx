import type { Income } from "../../shared/schemas";
import { useSettings } from "../lib/settings";
import { RowActions } from "./RowActions";

interface Props {
  payslip: Income;
  onEdit(): void;
  onDelete(): void;
}

export function PayslipRow({ payslip: p, onEdit, onDelete }: Props) {
  const { fmt } = useSettings();
  return (
    <div className="flex items-start justify-between gap-1 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">Paid {fmt.date(p.payDate)}</div>
        <div className="mt-0.5 text-xs text-ink/45">
          {fmt.date(p.periodStart)} – {fmt.date(p.periodEnd)}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-ink/40">
          <span className="whitespace-nowrap">Gross {fmt.money(p.gross)}</span>
          <span className="whitespace-nowrap">Tax {fmt.money(p.tax)}</span>
          <span className="whitespace-nowrap">Super {fmt.money(p.super)}</span>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-mono text-sm font-semibold tabular-nums">{fmt.money(p.net)}</div>
        <div className="text-[10px] text-ink/35">net</div>
      </div>
      <RowActions label={`payslip paid ${p.payDate}`} onEdit={onEdit} onDelete={onDelete} />
    </div>
  );
}
