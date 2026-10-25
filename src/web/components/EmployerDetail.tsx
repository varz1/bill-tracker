import { ArrowLeft, Pencil } from "lucide-react";
import { useMemo, useState } from "react";
import { CONTRACT_LABELS, SYNC_LABELS } from "../../shared/employers";
import { formatHours } from "../../shared/format";
import type { Overview } from "../../shared/income";
import type { Employer, EmployerInput, Income, IncomeInput, Shift, ShiftInput } from "../../shared/schemas";
import { useSettings } from "../lib/settings";
import type { Records } from "../lib/useRecords";
import { EmployerForm } from "./EmployerForm";
import { Modal } from "./Modal";
import { PayslipForm } from "./PayslipForm";
import { PayslipRow } from "./PayslipRow";
import { RecordCard } from "./RecordCard";
import { ShiftForm } from "./ShiftForm";
import { ShiftRow } from "./ShiftRow";

interface Props {
  employer: Employer;
  employers: Records<Employer, EmployerInput>;
  payslips: Records<Income, IncomeInput>;
  shifts: Records<Shift, ShiftInput>;
  overview: Overview;
  onBack(): void;
}

type Editing = { kind: "employer" } | { kind: "payslip"; record?: Income } | { kind: "shift"; record?: Shift } | null;

const byNewest = <T,>(date: (r: T) => string) => (a: T, b: T) => (date(a) < date(b) ? 1 : date(a) > date(b) ? -1 : 0);

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-ink/10 bg-white px-3 py-2.5 shadow-sm">
      <div className="text-[10px] text-ink/45">{label}</div>
      <div className="mt-0.5 truncate font-mono text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

/** One employer's settings, numbers, payslips and shifts. Payslips and shifts are entered here. */
export function EmployerDetail({ employer, employers, payslips, shifts, overview, onBack }: Props) {
  const { fmt } = useSettings();
  const [editing, setEditing] = useState<Editing>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const mySlips = useMemo(
    () => payslips.records.filter((p) => p.employerId === employer.id).sort(byNewest((p) => p.payDate)),
    [payslips.records, employer.id],
  );
  const myShifts = useMemo(
    () => shifts.records.filter((s) => s.employerId === employer.id).sort(byNewest((s) => s.date)),
    [shifts.records, employer.id],
  );

  const hours = overview.hours.hoursByEmployer[employer.id] ?? 0;
  const rate = overview.hours.rateByEmployer[employer.id] ?? null;
  const gross = overview.stats.grossByEmployer[employer.id] ?? 0;
  const inUse = mySlips.length + myShifts.length > 0;
  const close = () => setEditing(null);

  return (
    <>
      <button onClick={onBack} className="-ml-1 mb-3 flex items-center gap-1 rounded-md px-1 py-1 text-sm text-ink/55 hover:text-ink">
        <ArrowLeft className="h-4 w-4" />
        Income
      </button>

      <section className="mb-4 flex items-center gap-2 rounded-xl border border-ink/10 bg-white px-4 py-3 shadow-sm">
        <span className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: employer.color }} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold">{employer.name}</h2>
          <p className="text-xs text-ink/45">
            {CONTRACT_LABELS[employer.contract]} · {SYNC_LABELS[employer.sync]}
          </p>
        </div>
        <button
          onClick={() => setEditing({ kind: "employer" })}
          aria-label="Edit employer"
          className="rounded-md p-2 text-ink/30 transition-colors hover:bg-ink/5 hover:text-ink"
        >
          <Pencil className="h-4 w-4" />
        </button>
      </section>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <MiniStat label="Gross (paid weeks)" value={fmt.money(gross)} />
        <MiniStat label="Hours" value={hours > 0 ? formatHours(hours) : "—"} />
        <MiniStat label="Hourly rate" value={rate === null ? "—" : `${fmt.money(rate)}/h`} />
      </div>

      <RecordCard
        title="Payslips"
        noun="payslip"
        records={mySlips}
        onAdd={() => setEditing({ kind: "payslip" })}
        renderRow={(p) => (
          <PayslipRow payslip={p} onEdit={() => setEditing({ kind: "payslip", record: p })} onDelete={() => payslips.remove(p.id)} />
        )}
      />
      <RecordCard
        title="Shifts"
        noun="shift"
        records={myShifts}
        limit={10}
        onAdd={() => setEditing({ kind: "shift" })}
        renderRow={(s) => (
          <ShiftRow shift={s} onEdit={() => setEditing({ kind: "shift", record: s })} onDelete={() => shifts.remove(s.id)} />
        )}
      />

      {(payslips.saveError || shifts.saveError || employers.saveError) && (
        <p role="alert" className="mb-3 text-center text-xs text-red-600">
          Couldn't save your change, so it was undone. Please try again.
        </p>
      )}

      <div className="mt-6 text-center">
        {confirmingDelete ? (
          <span className="text-xs">
            <button
              onClick={async () => {
                await employers.remove(employer.id);
                onBack();
              }}
              className="rounded-md px-2 py-1.5 font-medium text-red-600 hover:bg-red-50"
            >
              Delete {employer.name}
            </button>
            <button onClick={() => setConfirmingDelete(false)} className="rounded-md px-2 py-1.5 text-ink/50 hover:bg-ink/5">
              Cancel
            </button>
          </span>
        ) : inUse ? (
          <p className="text-xs text-ink/35">
            {employer.name} has {mySlips.length} {mySlips.length === 1 ? "payslip" : "payslips"} and {myShifts.length}{" "}
            {myShifts.length === 1 ? "shift" : "shifts"}. To delete it, remove those first.
          </p>
        ) : (
          <button onClick={() => setConfirmingDelete(true)} className="rounded-md px-2 py-1.5 text-xs text-red-500 hover:bg-red-50">
            Delete employer
          </button>
        )}
      </div>

      {editing?.kind === "employer" && (
        <Modal title="Edit employer" onClose={close}>
          <EmployerForm
            employer={employer}
            all={employers.records}
            onSubmit={async (input) => {
              await employers.update(employer.id, input);
              close();
            }}
          />
        </Modal>
      )}
      {editing?.kind === "payslip" && (
        <Modal title={editing.record ? "Edit payslip" : "Add payslip"} onClose={close}>
          <PayslipForm
            payslip={editing.record}
            employerId={employer.id}
            onSubmit={async (input) => {
              if (editing.record) await payslips.update(editing.record.id, input);
              else await payslips.add(input);
              close();
            }}
          />
        </Modal>
      )}
      {editing?.kind === "shift" && (
        <Modal title={editing.record ? "Edit shift" : "Add shift"} onClose={close}>
          <ShiftForm
            shift={editing.record}
            employerId={employer.id}
            onSubmit={async (input) => {
              if (editing.record) await shifts.update(editing.record.id, input);
              else await shifts.add(input);
              close();
            }}
          />
        </Modal>
      )}
    </>
  );
}
