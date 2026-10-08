"use client";

import type { ButtonHTMLAttributes, CSSProperties, ReactNode, Ref } from "react";

import { cn } from "@/lib/utils";

export const OS = {
  page: "#0E1519",
  panel: "#161F23",
  panel2: "#1B262B",
  border: "#2A3B41",
  text: "#DFEBEB",
  dim: "#8A9B9B",
  rose: "#DF668C",
  teal: "#48B9AB",
  green: "#5CBF90",
  amber: "#D6AD51",
} as const;

export const OS_VARS = {
  "--os-page": OS.page,
  "--os-panel": OS.panel,
  "--os-panel2": OS.panel2,
  "--os-border": OS.border,
  "--os-text": OS.text,
  "--os-dim": OS.dim,
  "--os-rose": OS.rose,
  "--os-teal": OS.teal,
  "--os-green": OS.green,
  "--os-amber": OS.amber,
} as CSSProperties;

export function Panel({
  title,
  action,
  children,
  className,
  id,
  labelledBy,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
  labelledBy?: string;
}) {
  const headingId = labelledBy ?? (id ? `${id}-title` : undefined);
  return (
    <section
      id={id}
      aria-labelledby={title ? headingId : undefined}
      className={cn("min-w-0 rounded-[6px] border border-[var(--os-border)] bg-[var(--os-panel)] p-3.5", className)}
    >
      {title ? (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id={headingId} className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--os-dim)]">
            {title}
          </h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Bar({ label, value, color, hint }: { label: string; value: number | null; color: string; hint?: string }) {
  const v = value === null ? null : Math.max(0, Math.min(100, value));
  return (
    <div className="grid grid-cols-[88px_1fr_34px] items-center gap-2 text-[12px]">
      <span className="text-[var(--os-dim)]" title={hint}>
        {label}
      </span>
      <span
        className="h-2 overflow-hidden rounded-[2px] bg-[var(--os-page)]"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={v === null ? undefined : Math.round(v)}
        aria-valuetext={v === null ? "not rated yet" : `${Math.round(v)} of 100`}
      >
        {v !== null ? <span className="block h-full rounded-[2px]" style={{ width: `${v}%`, background: color }} /> : null}
      </span>
      <span className="text-right font-mono tabular-nums">{v === null ? "—" : Math.round(v)}</span>
    </div>
  );
}

export function Kv({ k, v, mono }: { k: ReactNode; v: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--os-border)]/60 py-1.5 text-[12.5px] last:border-b-0">
      <dt className="text-[var(--os-dim)]">{k}</dt>
      <dd className={cn("min-w-0 text-right", mono && "font-mono tabular-nums")}>{v}</dd>
    </div>
  );
}

export function Chip({ children, tone = "dim" }: { children: ReactNode; tone?: "dim" | "teal" | "green" | "amber" | "rose" }) {
  const c = { dim: OS.dim, teal: OS.teal, green: OS.green, amber: OS.amber, rose: OS.rose }[tone];
  return (
    <span
      className="inline-flex items-center rounded-[4px] border px-1.5 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.08em]"
      style={{ color: c, borderColor: `${c}66` }}
    >
      {children}
    </span>
  );
}

export function Btn({
  children,
  onClick,
  variant = "ghost",
  className,
  disabled,
  title,
  type = "button",
  ref,
  ...rest
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "quiet";
  className?: string;
  disabled?: boolean;
  title?: string;
  type?: "button" | "submit";
  ref?: Ref<HTMLButtonElement>;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "type">) {
  return (
    <button
      ref={ref}
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-[5px] px-3 text-[13px] font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--os-teal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--os-page)]",
        "disabled:cursor-not-allowed disabled:opacity-45",
        variant === "primary" && "bg-[var(--os-teal)] text-[#0B1215] hover:bg-[#5BC8BA]",
        variant === "ghost" && "border border-[var(--os-border)] bg-[var(--os-panel)] text-[var(--os-text)] hover:border-[var(--os-teal)]",
        variant === "quiet" && "text-[var(--os-dim)] hover:text-[var(--os-text)]",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function ExpandButton({ expanded, onClick, showLabel = false, className }: { expanded: boolean; onClick: () => void; showLabel?: boolean; className?: string }) {
  const label = expanded ? "Exit full screen" : "Full screen";
  return (
    <Btn onClick={onClick} aria-label={label} title={`${label} (F)`} aria-keyshortcuts="F" className={cn("px-2.5", className)}>
      <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {expanded ? <path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4" /> : <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" />}
      </svg>
      {showLabel ? <span className="hidden sm:inline">{label}</span> : null}
    </Btn>
  );
}

export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode; hint?: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-[5px] border border-[var(--os-border)] bg-[var(--os-page)] p-0.5", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={o.disabled}
            title={o.hint}
            onClick={() => onChange(o.value)}
            className={cn(
              "min-h-8 flex-1 rounded-[4px] px-2.5 font-mono text-[12px] tabular-nums transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--os-teal)]",
              on ? "bg-[var(--os-panel2)] text-[var(--os-text)] shadow-[inset_0_0_0_1px_var(--os-border)]" : "text-[var(--os-dim)] hover:text-[var(--os-text)]",
              o.disabled && "cursor-not-allowed opacity-40",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export const money = (n: number) => {
  const a = Math.abs(n);
  const s = a >= 1_000_000 ? `$${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M` : a >= 10_000 ? `$${Math.round(a / 1000)}K` : `$${Math.round(a).toLocaleString("en-US")}`;
  return n < 0 ? `-${s}` : s;
};

export function ageLabel(months: number) {
  const y = Math.floor(months / 12);
  const m = months % 12;
  return y < 1 ? `${m} mo` : `${y}y ${m}m`;
}
