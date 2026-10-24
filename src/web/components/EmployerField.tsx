import { useId } from "react";
import { inputClass, labelClass } from "./fields";

interface Props {
  value: string;
  onChange(value: string): void;
  /** Employers already in use, offered as completions. */
  suggestions: string[];
}

export function EmployerField({ value, onChange, suggestions }: Props) {
  const listId = useId();
  return (
    <label className="block">
      <span className={labelClass}>Employer</span>
      <input
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={100}
        autoFocus
        className={inputClass}
      />
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </label>
  );
}
