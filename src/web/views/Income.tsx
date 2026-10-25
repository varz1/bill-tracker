import { AlertTriangle, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { addDays } from "../../shared/dates";
import { overview, weekStart } from "../../shared/income";
import { EmployerDetail } from "../components/EmployerDetail";
import { EmployerForm } from "../components/EmployerForm";
import { EmployerRow } from "../components/EmployerRow";
import { HoursChart } from "../components/HoursChart";
import { IncomeChart } from "../components/IncomeChart";
import { IncomeStats } from "../components/IncomeStats";
import { Modal } from "../components/Modal";
import { RecordCard } from "../components/RecordCard";
import { api } from "../lib/api";
import { useSettings } from "../lib/settings";
import { useRecords } from "../lib/useRecords";

interface Props {
  /** The employer whose page is open, from the URL (#income/<id>); null on the overview. */
  employerId: string | null;
  onOpenEmployer(id: string | null): void;
}

export default function Income({ employerId, onOpenEmployer }: Props) {
  const { settings, today } = useSettings();
  const employers = useRecords(api.employers);
  const payslips = useRecords(api.income);
  const shifts = useRecords(api.shifts);
  const [adding, setAdding] = useState(false);

  const all = [employers, payslips, shifts];
  const ready = all.every((r) => r.status === "ready");
  const failed = all.some((r) => r.status === "error");

  const data = useMemo(
    () => overview(employers.records, payslips.records, shifts.records, today, settings.weekStartsOn),
    [employers.records, payslips.records, shifts.records, today, settings.weekStartsOn],
  );

  if (!ready && !failed) {
    return (
      <div className="flex items-center justify-center py-20" role="status" aria-label="Loading income">
        <Loader2 className="h-6 w-6 animate-spin text-ink" />
      </div>
    );
  }

  const open = employerId ? employers.records.find((e) => e.id === employerId) : undefined;
  if (open) {
    return (
      <EmployerDetail
        employer={open}
        employers={employers}
        payslips={payslips}
        shifts={shifts}
        overview={data}
        onBack={() => onOpenEmployer(null)}
      />
    );
  }

  const lastWeek = addDays(weekStart(today, settings.weekStartsOn), -7);
  const lastWeekHours = (id: string) => data.shiftWeeks.find((w) => w.weekStart === lastWeek)?.byEmployer[id] ?? null;
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
          {hasPay && <IncomeChart weeks={data.incomeWeeks} settledUntil={data.settledUntil} employers={data.employers} />}
          {hasShifts && <HoursChart weeks={data.shiftWeeks} employers={data.employers} />}
        </>
      ) : (
        !failed && (
          <p className="mb-4 rounded-xl border border-ink/10 bg-white p-8 text-center text-xs text-ink/35 shadow-sm">
            {employers.records.length === 0
              ? "Add an employer to start tracking your pay and hours."
              : "Open an employer below to add its payslips and shifts."}
          </p>
        )
      )}

      <RecordCard
        title="Employers"
        noun="employer"
        records={data.employers}
        limit={20}
        onAdd={() => setAdding(true)}
        renderRow={(e) => <EmployerRow employer={e} lastWeekHours={lastWeekHours(e.id)} onOpen={() => onOpenEmployer(e.id)} />}
      />

      {employers.saveError && (
        <p role="alert" className="mt-2 text-center text-xs text-red-600">
          Couldn't save your change, so it was undone. Please try again.
        </p>
      )}

      {adding && (
        <Modal title="Add employer" onClose={() => setAdding(false)}>
          <EmployerForm
            all={employers.records}
            onSubmit={async (input) => {
              await employers.add(input);
              setAdding(false);
            }}
          />
        </Modal>
      )}
    </>
  );
}
