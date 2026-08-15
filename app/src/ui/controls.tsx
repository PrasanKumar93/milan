import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { InputUnit } from "../core/types";
import { formatInches, parseDimension } from "../core/units";

/**
 * Small form controls shared by the entry screen. They exist mainly so that
 * "typed a number" behaves properly: an input bound straight to a number cannot
 * hold "2." or "33 1/" on the way to a valid value, which makes an entry grid
 * unusable.
 */

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
    </label>
  );
}

export function TextField({
  value,
  onChange,
  placeholder,
  width,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  width?: number;
}) {
  return (
    <input
      className="input"
      value={value}
      placeholder={placeholder}
      style={width ? { width } : undefined}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  width,
  disabled,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: string; label: string }>;
  width?: number;
  disabled?: boolean;
}) {
  return (
    <select
      className="select"
      value={value}
      disabled={disabled}
      style={width ? { width } : undefined}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/**
 * A numeric input that keeps what the operator typed until they leave the field,
 * so half-finished numbers survive. `parse` decides what counts as a value, which
 * is how inch fractions get in.
 */
function LooseNumberInput({
  value,
  onChange,
  parse,
  format,
  width,
  disabled,
  className,
  title,
}: {
  value: number;
  onChange: (v: number) => void;
  parse: (text: string) => number | null;
  format: (v: number) => string;
  width?: number;
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? format(value);

  // A reset or a unit switch changes the value from outside; drop the draft so
  // the new value is visible rather than the stale text.
  useEffect(() => {
    setDraft(null);
  }, [value]);

  return (
    <input
      className={`input input--num ${className ?? ""}`}
      value={shown}
      disabled={disabled}
      title={title}
      style={width ? { width } : undefined}
      onChange={(e) => {
        setDraft(e.target.value);
        const parsed = parse(e.target.value);
        if (parsed !== null) onChange(parsed);
      }}
      onBlur={() => setDraft(null)}
      onFocus={(e) => e.target.select()}
    />
  );
}

export function NumberField({
  value,
  onChange,
  width = 72,
  disabled,
  className,
  title,
  decimals = 2,
}: {
  value: number;
  onChange: (v: number) => void;
  width?: number;
  disabled?: boolean;
  className?: string;
  title?: string;
  decimals?: number;
}) {
  return (
    <LooseNumberInput
      value={value}
      onChange={onChange}
      width={width}
      disabled={disabled}
      className={className}
      title={title}
      parse={(text) => {
        if (text.trim() === "") return 0;
        const n = Number(text);
        return Number.isFinite(n) ? n : null;
      }}
      format={(v) => {
        const rounded = Math.round(v * 10 ** decimals) / 10 ** decimals;
        return String(rounded);
      }}
    />
  );
}

/**
 * Dimension entry. In inch mode it accepts and prints eighths — "33 1/4" —
 * because 96 of the 137 inch lines in the samples are written that way.
 */
export function DimensionField({
  value,
  unit,
  onChange,
  width = 78,
  disabled,
  className,
  title,
}: {
  value: number;
  unit: InputUnit;
  onChange: (v: number) => void;
  width?: number;
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <LooseNumberInput
      value={value}
      onChange={onChange}
      width={width}
      disabled={disabled}
      className={className}
      title={title}
      parse={(text) => (text.trim() === "" ? 0 : parseDimension(text, unit))}
      format={(v) => (unit === "inch" ? formatInches(v) : String(v))}
    />
  );
}

export function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className="pill" aria-pressed={active} onClick={onClick}>
      {children}
    </button>
  );
}

export function Button({
  children,
  onClick,
  variant = "default",
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  variant?: "default" | "primary" | "ghost" | "icon";
  title?: string;
}) {
  const cls =
    variant === "default" ? "btn" : variant === "icon" ? "btn btn--ghost btn--icon" : `btn btn--${variant}`;
  return (
    <button type="button" className={cls} onClick={onClick} title={title}>
      {children}
    </button>
  );
}

/** Marks a value that no longer matches its computed default (dev-plan §2.8). */
export function OverrideDot({ title }: { title: string }) {
  return <span className="dot" title={title} />;
}

export function Callout({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warn" | "good";
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className={`callout callout--${tone}`}>
      <div className="callout__title">{title}</div>
      {children}
    </div>
  );
}
