"use client";

import { homeBase, LADDER, rungCountry, rungPay, TRACK_LABEL } from "@/one-shot/after";
import type { LifeState } from "@/one-shot/types";
import { country, countryFlag } from "@/one-shot/world";

import { Bar, Chip, money, OS, Panel } from "./ui";

/** Replaces the training focus once he stops playing. */
export function AfterPanel({ life }: { life: LifeState }) {
  const a = life.after!;
  const home = homeBase(life);
  const ladder = LADDER[a.track];
  const years = a.years.slice().reverse();
  const coached = a.years.filter((y) => y.wins !== null);
  const w = coached.reduce((x, y) => x + (y.wins ?? 0), 0);
  const l = coached.reduce((x, y) => x + (y.losses ?? 0), 0);
  const tenure = Math.floor((life.ageMonths - a.since) / 12);
  return (
    <Panel id="os-career" title={TRACK_LABEL[a.track]} action={<Chip tone="teal">{tenure === 0 ? "New job" : `${tenure} yr in job`}</Chip>}>
      <p className="text-[15px] font-semibold leading-tight">{a.title}</p>
      <p className="mt-0.5 text-[12.5px] text-[var(--os-dim)]">
        {countryFlag(a.countryId)} {a.employer} · {country(a.countryId).name} · <span className="font-mono tabular-nums text-[var(--os-text)]">{money(a.salary)}/yr</span>
      </p>
      <div className="mt-3">
        <Bar label="Reputation" value={a.rep} color={OS.teal} hint="Clear the next rung's bar and an opening may come at the July review. Top jobs open rarely." />
      </div>
      <ol className="mt-3 flex flex-col gap-1">
        {ladder.map((r, i) => {
          const where = rungCountry(r, home);
          const status = i < a.step ? "done" : i === a.step ? "current" : "next";
          return (
            <li key={i} className={`flex items-baseline justify-between gap-3 border-b border-[var(--os-border)]/50 pb-1 text-[12.5px] ${status === "current" ? "text-[var(--os-text)]" : "text-[var(--os-dim)]"}`}>
              <span className="min-w-0 truncate">
                <span className="mr-1.5 font-mono text-[10.5px]" style={{ color: status === "current" ? OS.teal : status === "done" ? OS.green : undefined }}>
                  {status === "done" ? "✓" : status === "current" ? "●" : "○"}
                </span>
                {r.title(life, where)}
              </span>
              <span className="shrink-0 font-mono text-[11px] tabular-nums">
                {r.business ? "profit" : money(rungPay(r, where))}
                {status === "next" ? ` · rep ${r.bar}` : ""}
              </span>
            </li>
          );
        })}
      </ol>
      {years.length ? (
        <div className="mt-3 max-h-[220px] overflow-auto">
          <table className="w-full min-w-[420px] border-collapse whitespace-nowrap text-[12px] tabular-nums">
            <thead className="sticky top-0 bg-[var(--os-panel)] text-[var(--os-dim)]">
              <tr className="text-left font-mono text-[10.5px] [&>th]:px-1.5 [&>th]:py-1 [&>th]:font-normal">
                <th>Year</th>
                <th>Job</th>
                {coached.length ? <th className="text-right">W-L</th> : null}
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {years.map((y, i) => (
                <tr key={`${y.year}-${i}`} className="border-t border-[var(--os-border)]/50 [&>td]:px-1.5 [&>td]:py-1">
                  <td className="font-mono">{y.year}</td>
                  <td className="max-w-[160px] truncate" title={`${y.title}, ${y.employer}`}>
                    {y.title}
                  </td>
                  {coached.length ? <td className="text-right font-mono">{y.wins !== null ? `${y.wins}-${y.losses}` : "—"}</td> : null}
                  <td className="max-w-[200px] truncate text-[var(--os-dim)]" title={y.note}>
                    {y.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {coached.length ? (
            <p className="mt-1 font-mono text-[11px] tabular-nums text-[var(--os-dim)]">
              Coaching record {w}-{l} ({w + l ? ((w / (w + l)) * 100).toFixed(1) : "—"}%)
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-[12px] text-[var(--os-dim)]">The first review comes next July.</p>
      )}
      <p className="mt-2 text-[11px] text-[var(--os-dim)]">Jobs, pay, reputation bars and how often openings come up are game settings. Employers are fictional unless they are NBA teams.</p>
    </Panel>
  );
}
