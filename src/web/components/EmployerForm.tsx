import { Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { DEFAULT_BREAK_MINUTES, type BreakRule } from "../../shared/breaks";
import { normalizeCalendarUrl } from "../../shared/calendarUrl";
import { CONTRACT_LABELS, EMPLOYER_COLORS, nextEmployerColor, SYNC_LABELS, sameName } from "../../shared/employers";
import { CONTRACTS, type CalendarLinkInput, type Employer, type EmployerInput } from "../../shared/schemas";
import { useConfig } from "../lib/config";
import { durationText } from "../lib/labels";
import { ApiError } from "../lib/api";
import { BreakRuleField } from "./BreakRuleField";
import { hintClass, inputClass, labelClass, submitClass } from "./fields";

interface Props {
  employer?: Employer;
  /** Existing employers, to catch a duplicate name before it is sent. */
  all: Employer[];
  /** The linked calendar, masked, when this employer already has one. */
  linkedUrl?: string;
  /** `link` is set when a calendar link was entered; the caller links it once the employer is saved. */
  onSubmit(input: EmployerInput, link?: CalendarLinkInput): Promise<void>;
}

/** Why a save failed, in words for the person using the form. */
export function saveErrorText(err: unknown): string {
  const code = err instanceof ApiError ? err.message : "";
  if (code === "duplicate_name") return "You already have an employer with that name.";
  if (code === "invalid_url") return "That link can't be used. It must be a public https:// or webcal:// link.";
  if (code === "too_many_calendars") return "Only a few calendars can be linked at a time here. Unlink another one first.";
  if (code === "too_soon") return "Please wait a few seconds and try again.";
  return "Couldn't save. Please try again.";
}

export function EmployerForm({ employer, all, linkedUrl, onSubmit }: Props) {
  const linked = employer?.sync === "calendar";
  const { demo, calendarTtlMs } = useConfig();
  const [name, setName] = useState(employer?.name ?? "");
  const [contract, setContract] = useState<Employer["contract"]>(employer?.contract ?? "full-time");
  const [color, setColor] = useState(employer?.color ?? nextEmployerColor(all.map((o) => o.color)));
  const [useCalendar, setUseCalendar] = useState(linked);
  const [url, setUrl] = useState("");
  const [match, setMatch] = useState("");
  const [breakRule, setBreakRule] = useState<BreakRule>(employer?.breakRule ?? "none");
  const [breakMinutes, setBreakMinutes] = useState<number>(employer?.breakMinutes ?? DEFAULT_BREAK_MINUTES);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError("Enter the employer's name.");
    if (all.some((o) => o.id !== employer?.id && sameName(o.name, trimmed))) {
      return setError("You already have an employer with that name.");
    }
    const pasted = url.trim();
    if (useCalendar && !linked && !pasted) return setError("Paste your calendar's public link, or choose manual entry.");
    if (pasted && !normalizeCalendarUrl(pasted)) {
      return setError("That doesn't look like a public calendar link. It should start with https:// or webcal://.");
    }

    const input: EmployerInput = {
      name: trimmed,
      contract,
      sync: employer?.sync ?? "manual",
      color,
      // Break settings belong to calendar sync; an employer without one keeps whatever it had.
      ...(useCalendar && { breakRule, breakMinutes: breakMinutes as 30 | 45 | 60 }),
    };

    setBusy(true);
    setError(null);
    try {
      await onSubmit(input, useCalendar && pasted ? { url: pasted, match: match.trim() || undefined } : undefined);
    } catch (err) {
      setError(saveErrorText(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 px-5 pt-4 pb-8">
      <label className="block">
        <span className={labelClass}>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoFocus className={inputClass} />
        {employer && <span className={hintClass}>Renaming updates this employer everywhere, including its payslips and shifts.</span>}
      </label>
      <div role="radiogroup" aria-label="Colour">
        <span className={labelClass}>Colour</span>
        <div className="flex gap-2.5">
          {[...new Set([...EMPLOYER_COLORS, color])].map((c, i) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={`Colour ${i + 1}`}
              onClick={() => setColor(c)}
              className={`h-7 w-7 rounded-full ring-offset-2 transition ${color === c ? "ring-2 ring-ink" : "hover:ring-2 hover:ring-ink/25"}`}
              style={{ background: c }}
            />
          ))}
        </div>
        <span className={hintClass}>Used for this employer in the charts.</span>
      </div>
      <label className="block">
        <span className={labelClass}>Contract</span>
        <select value={contract} onChange={(e) => setContract(e.target.value as Employer["contract"])} className={inputClass}>
          {CONTRACTS.map((c) => (
            <option key={c} value={c}>
              {CONTRACT_LABELS[c]}
            </option>
          ))}
        </select>
        <span className={hintClass}>A label only. It doesn't change any pay figures.</span>
      </label>

      <label className="block">
        <span className={labelClass}>Shifts</span>
        <select
          value={useCalendar ? "calendar" : "manual"}
          onChange={(e) => setUseCalendar(e.target.value === "calendar")}
          disabled={linked}
          className={inputClass}
        >
          <option value="manual">{SYNC_LABELS.manual}</option>
          <option value="calendar">{SYNC_LABELS.calendar}</option>
        </select>
        <span className={hintClass}>
          {linked
            ? "To stop syncing, unlink the calendar on this employer's page."
            : "Calendar sync is the recommended way: your roster keeps shifts up to date automatically, with nothing to type. Shifts it adds can't be edited by hand."}
        </span>
      </label>

      {useCalendar && (
        <>
          {demo && (
            <p role="note" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-800">
              This is a public demo: everyone sees the same data. Use a test calendar, not your real roster.
              {calendarTtlMs !== null && ` A calendar linked here, and the shifts it brings in, is removed after ${durationText(calendarTtlMs)}.`}
            </p>
          )}
          <label className="block">
            <span className={labelClass}>{linked ? "Replace calendar link" : "Calendar link"}</span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              type="url"
              inputMode="url"
              placeholder="webcal://… or https://…"
              autoComplete="off"
              spellCheck={false}
              className={inputClass}
            />
            <span className={hintClass}>
              {linked && linkedUrl ? `Linked: ${linkedUrl}. Leave blank to keep it. ` : ""}
              The public subscription link from your calendar app, which works without signing in. Anyone with the link can read
              the calendar, so keep it private.
            </span>
          </label>
          {url.trim() && (
            <label className="block">
              <span className={labelClass}>Only events containing (optional)</span>
              <input value={match} onChange={(e) => setMatch(e.target.value)} maxLength={100} className={inputClass} />
              <span className={hintClass}>
                Leave blank if every event in this calendar is a shift. Otherwise, only events whose title contains this text count.
              </span>
            </label>
          )}
          <BreakRuleField
            rule={breakRule}
            minutes={breakMinutes}
            onChange={(next) => {
              setBreakRule(next.rule);
              setBreakMinutes(next.minutes);
            }}
          />
        </>
      )}

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
