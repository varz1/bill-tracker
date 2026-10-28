import { AlertTriangle, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { addDays } from "../../shared/dates";
import { overview, scopeTo, weekStart } from "../../shared/income";
import { EmployerDetail } from "../components/EmployerDetail";
import { EmployerForm, saveErrorText } from "../components/EmployerForm";
import { EmployerRow } from "../components/EmployerRow";
import { HoursChart } from "../components/HoursChart";
import { IncomeChart } from "../components/IncomeChart";
import { IncomeStats } from "../components/IncomeStats";
import { ScopePicker } from "../components/ScopePicker";
import { Modal } from "../components/Modal";
import { RecordCard } from "../components/RecordCard";
import { api } from "../lib/api";
import { useScope } from "../lib/useScope";
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
  // Why a calendar couldn't be linked to an employer that was just added; shown on that employer's page.
  const [linkNotice, setLinkNotice] = useState<string | null>(null);

  const all = [employers, payslips, shifts];
  const ready = all.every((r) => r.status === "ready");
  const failed = all.some((r) => r.status === "error");

  const [scope, setScope] = useScope(employers.records.map((e) => e.id));
  const book = useMemo(
    () => ({ employers: employers.records, income: payslips.records, shifts: shifts.records }),
    [employers.records, payslips.records, shifts.records],
  );
  const run = (id: string | null) => {
    const part = scopeTo(id, book);
    return overview(part.employers, part.income, part.shifts, today, settings.weekStartsOn);
  };
  // Everyone's numbers: the employer list and last week's hours. What the stats and charts show follows the picker.
  const data = useMemo(() => run(null), [book, today, settings.weekStartsOn]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useMemo(() => run(scope), [book, scope, today, settings.weekStartsOn]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready && !failed) {
    return (
      <div className="flex items-center justify-center py-20" role="status" aria-label="Loading income">
        <Loader2 className="h-6 w-6 animate-spin text-ink" />
      </div>
    );
  }

  const open = employerId ? employers.records.find((e) => e.id === employerId) : undefined;
  if (open) {
    // An employer's own page counts only its own payslips and shifts, whatever the others have been paid.
    return (
      <EmployerDetail
        employer={open}
        employers={employers}
        payslips={payslips}
        shifts={shifts}
        overview={run(open.id)}
        notice={linkNotice}
        onBack={() => {
          setLinkNotice(null);
          onOpenEmployer(null);
        }}
      />
    );
  }

  const lastWeek = addDays(weekStart(today, settings.weekStartsOn), -7);
  const lastWeekHours = (id: string) => data.shiftWeeks.find((w) => w.weekStart === lastWeek)?.byEmployer[id] ?? null;
  const scoped = scopeTo(scope, book);
  const hasPay = scoped.income.length > 0;
  const hasShifts = scoped.shifts.length > 0;

  return (
    <>
      {failed && (
        <div role="alert" className="mb-4 flex items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Couldn't load your income data. Refresh the page to try again.
        </div>
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
        <p role="alert" className="mb-4 text-center text-xs text-red-600">
          Couldn't save your change, so it was undone. Please try again.
        </p>
      )}

      {hasPay || hasShifts ? (
        <>
          <ScopePicker employers={data.employers} value={scope} onChange={setScope} />
          <IncomeStats overview={shown} onlyOne={scope !== null} />
          {hasPay && <IncomeChart weeks={shown.incomeWeeks} settledUntil={shown.settledUntil} employers={shown.employers} />}
          {hasShifts && <HoursChart weeks={shown.shiftWeeks} employers={shown.employers} />}
        </>
      ) : (
        !failed && (
          <p className="mb-4 rounded-xl border border-ink/10 bg-white p-8 text-center text-xs text-ink/35 shadow-sm">
            {employers.records.length === 0
              ? "Add an employer above to start tracking your pay and hours."
              : "Open an employer above to add its payslips and shifts."}
          </p>
        )
      )}

      {adding && (
        <Modal title="Add employer" onClose={() => setAdding(false)}>
          <EmployerForm
            all={employers.records}
            onSubmit={async (input, link) => {
              const created = await employers.add(input);
              setAdding(false);
              if (!link) return;
              // The employer exists now; linking can still fail, in which case its page says why and lets them try again.
              setLinkNotice(null);
              await api.calendar.link(created.id, link).catch((err) => setLinkNotice(`The calendar wasn't linked. ${saveErrorText(err)}`));
              await employers.reload();
              onOpenEmployer(created.id);
            }}
          />
        </Modal>
      )}
    </>
  );
}
