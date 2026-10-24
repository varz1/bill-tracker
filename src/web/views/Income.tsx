import { AlertTriangle, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { overview } from "../../shared/income";
import type { Income as Payslip, Shift } from "../../shared/schemas";
import { HoursChart } from "../components/HoursChart";
import { IncomeChart } from "../components/IncomeChart";
import { IncomeStats } from "../components/IncomeStats";
import { Modal } from "../components/Modal";
import { PayslipForm } from "../components/PayslipForm";
import { PayslipRow } from "../components/PayslipRow";
import { RecordCard } from "../components/RecordCard";
import { ShiftForm } from "../components/ShiftForm";
import { ShiftRow } from "../components/ShiftRow";
import { api } from "../lib/api";
import { useSettings } from "../lib/settings";
import { useRecords } from "../lib/useRecords";

type Editing = { kind: "payslip"; record?: Payslip } | { kind: "shift"; record?: Shift } | null;

const byNewest = <T,>(date: (r: T) => string) => (a: T, b: T) => (date(a) < date(b) ? 1 : date(a) > date(b) ? -1 : 0);

export default function Income() {
  const { settings, today } = useSettings();
  const payslips = useRecords(api.income);
  const shifts = useRecords(api.shifts);
  const [editing, setEditing] = useState<Editing>(null);

  const ready = payslips.status === "ready" && shifts.status === "ready";
  const failed = payslips.status === "error" || shifts.status === "error";

  const data = useMemo(
    () => overview(payslips.records, shifts.records, today, settings.weekStartsOn),
    [payslips.records, shifts.records, today, settings.weekStartsOn],
  );
  const sortedPayslips = useMemo(() => [...payslips.records].sort(byNewest((p) => p.payDate)), [payslips.records]);
  const sortedShifts = useMemo(() => [...shifts.records].sort(byNewest((s) => s.date)), [shifts.records]);

  if (!ready && !failed) {
    return (
      <div className="flex items-center justify-center py-20" role="status" aria-label="Loading income">
        <Loader2 className="h-6 w-6 animate-spin text-ink" />
      </div>
    );
  }

  const hasPay = payslips.records.length > 0;
  const hasShifts = shifts.records.length > 0;

  return (
    <>
      {failed && (
        <div role="alert" className="mb-4 flex items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Couldn't load your income data. Refresh the page to try again.
        </div>
      )}

      {hasPay || hasShifts ? (
        <>
          <IncomeStats overview={data} />
          {hasPay && (
            <IncomeChart
              weeks={data.incomeWeeks}
              settledUntil={data.settledUntil}
              employers={data.employers}
              colors={data.colors}
            />
          )}
          {hasShifts && <HoursChart weeks={data.shiftWeeks} employers={data.employers} colors={data.colors} />}
        </>
      ) : (
        !failed && (
          <p className="mb-4 rounded-xl border border-ink/10 bg-white p-8 text-center text-xs text-ink/35 shadow-sm">
            Add your payslips and shifts below to see your pay and hours.
          </p>
        )
      )}

      <RecordCard
        title="Payslips"
        noun="payslip"
        records={sortedPayslips}
        onAdd={() => setEditing({ kind: "payslip" })}
        renderRow={(p) => (
          <PayslipRow
            payslip={p}
            color={data.colors[p.employer]}
            onEdit={() => setEditing({ kind: "payslip", record: p })}
            onDelete={() => payslips.remove(p.id)}
          />
        )}
      />
      <RecordCard
        title="Shifts"
        noun="shift"
        records={sortedShifts}
        limit={10}
        onAdd={() => setEditing({ kind: "shift" })}
        renderRow={(s) => (
          <ShiftRow
            shift={s}
            color={data.colors[s.employer]}
            onEdit={() => setEditing({ kind: "shift", record: s })}
            onDelete={() => shifts.remove(s.id)}
          />
        )}
      />

      {(payslips.saveError || shifts.saveError) && (
        <p role="alert" className="mt-2 text-center text-xs text-red-600">
          Couldn't save your change, so it was undone. Please try again.
        </p>
      )}

      {editing?.kind === "payslip" && (
        <Modal title={editing.record ? "Edit payslip" : "Add payslip"} onClose={() => setEditing(null)}>
          <PayslipForm
            payslip={editing.record}
            employers={data.employers}
            onSubmit={async (input) => {
              if (editing.record) await payslips.update(editing.record.id, input);
              else await payslips.add(input);
              setEditing(null);
            }}
          />
        </Modal>
      )}
      {editing?.kind === "shift" && (
        <Modal title={editing.record ? "Edit shift" : "Add shift"} onClose={() => setEditing(null)}>
          <ShiftForm
            shift={editing.record}
            employers={data.employers}
            onSubmit={async (input) => {
              if (editing.record) await shifts.update(editing.record.id, input);
              else await shifts.add(input);
              setEditing(null);
            }}
          />
        </Modal>
      )}
    </>
  );
}
