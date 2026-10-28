import { useState, type FormEvent } from "react";
import { SettingsPatchSchema, type Settings as SettingsValue } from "../../shared/schemas";
import { isValidZone } from "../../shared/timezone";
import { inputClass, labelClass } from "../components/fields";
import { useConfig } from "../lib/config";
import { useSettings } from "../lib/settings";

const CURRENCIES = Intl.supportedValuesOf("currency");
const TIME_ZONES = Intl.supportedValuesOf("timeZone");

export default function Settings() {
  const { settings, update } = useSettings();
  const { settingsLocked } = useConfig();
  const [draft, setDraft] = useState<SettingsValue>(settings);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof SettingsValue>(key: K, value: SettingsValue[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setState("idle");
  };

  async function save(e: FormEvent) {
    e.preventDefault();
    if (settingsLocked) return;
    const currency = draft.currency.trim().toUpperCase();
    if (!CURRENCIES.includes(currency)) return setError("Choose a valid currency code, e.g. AUD.");
    const timeZone = draft.timeZone.trim();
    if (!isValidZone(timeZone)) return setError("Choose a valid time zone, e.g. Australia/Sydney.");
    const patch = SettingsPatchSchema.safeParse({ ...draft, currency, timeZone });
    if (!patch.success) return setError("Some of these values aren't valid.");

    setError(null);
    setState("saving");
    try {
      await update(patch.data);
      setState("saved");
    } catch {
      setState("error");
    }
  }

  return (
    <form onSubmit={save} className="space-y-4 rounded-xl border border-ink/10 bg-white p-5 shadow-sm">
      {settingsLocked && <p className="text-xs text-ink/50">Settings are locked on this deployment.</p>}
      <fieldset disabled={settingsLocked} className="space-y-4">
        <label className="block">
          <span className={labelClass}>Currency</span>
          <input
            list="currencies"
            value={draft.currency}
            onChange={(e) => set("currency", e.target.value.toUpperCase())}
            maxLength={3}
            className={`${inputClass} font-mono`}
          />
          <datalist id="currencies">
            {CURRENCIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <span className="mt-1 block text-xs text-ink/35">
            The app uses one currency. Changing it doesn't convert existing amounts.
          </span>
        </label>

        <label className="block">
          <span className={labelClass}>Week starts on</span>
          <select
            value={draft.weekStartsOn}
            onChange={(e) => set("weekStartsOn", Number(e.target.value) as 0 | 1)}
            className={`${inputClass} bg-white`}
          >
            <option value={1}>Monday</option>
            <option value={0}>Sunday</option>
          </select>
        </label>

        <label className="block">
          <span className={labelClass}>Time zone</span>
          <input
            list="time-zones"
            value={draft.timeZone}
            onChange={(e) => set("timeZone", e.target.value)}
            autoComplete="off"
            spellCheck={false}
            className={inputClass}
          />
          <datalist id="time-zones">
            {TIME_ZONES.map((z) => (
              <option key={z} value={z} />
            ))}
          </datalist>
          <span className="mt-1 block text-xs text-ink/35">
            Used by calendar sync for a calendar that doesn't say which time zone its events are in.
          </span>
        </label>

        {error && (
          <p role="alert" className="text-xs text-red-600">
            {error}
          </p>
        )}
        {state === "error" && (
          <p role="alert" className="text-xs text-red-600">
            Couldn't save settings. Please try again.
          </p>
        )}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={state === "saving"}
            className="rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Save
          </button>
          {state === "saved" && <span className="text-xs text-emerald-600">Saved</span>}
        </div>
      </fieldset>
    </form>
  );
}
