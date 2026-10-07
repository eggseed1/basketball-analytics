import type { CSSProperties } from "react";

import type { AnalyticalFinding } from "@/analytics";
import { type } from "@/lib/design-system";
import { formatNumber, formatOrdinal, formatPct } from "@/lib/format";
import { percentileSavantColor } from "@/lib/player-grade";
import type { QuarterRow, SplitsBundle, TraitBar } from "@/lib/team-overview-data";
import type { TeamSplitBucket } from "@/lib/team-snapshot-games";
import { cn } from "@/lib/utils";

const WIN = "var(--data-positive)";
const WIN_TEXT = "var(--accent-positive)";
const LOSS = "var(--data-negative)";
const LOSS_TEXT = "var(--accent-negative)";
function signed(v: number, digits = 1) {
  return `${v > 0 ? "+" : ""}${formatNumber(v, digits)}`;
}

export function QuarterProfile({ rows, games, season }: { rows: QuarterRow[]; games: number; season: string }) {
  if (!rows.length) return null;
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.net)));
  const best = [...rows].sort((a, b) => b.net - a.net)[0]!;
  const worst = [...rows].sort((a, b) => a.net - b.net)[0]!;
  return (
    <section className="sports-card flex flex-col gap-3 p-4 sm:p-5" aria-label="Quarter by quarter">
      <div>
        <h2 className={type.heading}>Quarter by quarter</h2>
        <p className={cn(type.bodySm, "mt-1 text-muted-foreground")}>
          Average net points in each regulation quarter over {games} {season} regular-season games.
        </p>
      </div>
      <p className={cn(type.bodySm)}>
        Best in the <span className="font-bold">{formatOrdinal(Number(best.quarter.slice(1)))}</span>{" "}
        <span className="text-muted-foreground">({signed(best.net)})</span>
        {worst.quarter !== best.quarter ? (
          <>
            , weakest in the <span className="font-bold">{formatOrdinal(Number(worst.quarter.slice(1)))}</span>{" "}
            <span className="text-muted-foreground">({signed(worst.net)})</span>
          </>
        ) : null}
        .
      </p>
      <ul data-hover-group className="flex flex-col gap-2.5">
        <li
          className={cn(
            type.micro,
            "grid grid-cols-[2rem_2.75rem_minmax(0,1fr)_2.75rem_3.25rem] items-center gap-3 font-semibold uppercase tracking-wide text-muted-foreground"
          )}
          aria-hidden
        >
          <span />
          <span className="text-right">Scored</span>
          <span />
          <span>Allowed</span>
          <span className="text-right">Net</span>
        </li>
        {rows.map((r, i) => {
          const w = (Math.abs(r.net) / max) * 50;
          return (
            <li key={r.quarter} data-hover-item className="grid grid-cols-[2rem_2.75rem_minmax(0,1fr)_2.75rem_3.25rem] items-center gap-3">
              <span className={cn(type.bodySm, "font-bold")}>{r.quarter}</span>
              <span className={cn(type.caption, "text-right tabular-nums text-muted-foreground")}>{formatNumber(r.pf, 1)}</span>
              <span className="relative h-7 rounded-md bg-foreground/[0.04]">
                <span className="absolute inset-y-0 left-1/2 w-px bg-foreground/25" aria-hidden />
                <span
                  data-motion-bar="x"
                  className="absolute inset-y-1 rounded-[4px]"
                  style={{
                    ...({ "--i": i * 2 } as CSSProperties),
                    transformOrigin: r.net >= 0 ? "left" : "right",
                    background: r.net >= 0 ? WIN : LOSS,
                    width: `${Math.max(0.8, w)}%`,
                    ...(r.net >= 0 ? { left: "50%" } : { right: "50%" }),
                  }}
                />
              </span>
              <span className={cn(type.caption, "tabular-nums text-muted-foreground")}>{formatNumber(r.pa, 1)}</span>
              <span className={cn(type.bodySm, "text-right font-bold tabular-nums")} style={{ color: r.net >= 0 ? WIN_TEXT : LOSS_TEXT }}>
                {signed(r.net)}
              </span>
            </li>
          );
        })}
      </ul>
      <p className={cn(type.micro, "text-muted-foreground")}>Average points per quarter. Overtime is left out.</p>
    </section>
  );
}

function RecordBar({ row, label }: { row: TeamSplitBucket; label: string }) {
  return (
    <li data-hover-item className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className={cn(type.caption, "font-semibold")}>{label}</span>
        <span className={cn(type.caption, "tabular-nums text-muted-foreground")}>
          <span className="font-bold text-foreground">
            {row.wins}-{row.losses}
          </span>
          {row.diff != null ? ` · ${signed(row.diff)}` : ""}
        </span>
      </div>
      <div className="flex h-2.5 w-full gap-0.5">
        {row.wins ? (
          <span data-motion-bar="x" className="rounded-full" style={{ flex: row.wins, background: WIN }} />
        ) : null}
        {row.losses ? (
          <span
            data-motion-bar="x"
            className="rounded-full"
            style={{ flex: row.losses, background: LOSS, transformOrigin: "right" }}
          />
        ) : null}
      </div>
    </li>
  );
}

export function SplitsPanel({ splits, season }: { splits: SplitsBundle; season: string }) {
  const rows: Array<[string, TeamSplitBucket | null]> = [
    ["Home", splits.home],
    ["Road", splits.away],
    ["Within 5 points", splits.close],
    ["Decided by 15+", splits.blowout],
  ];
  const present = rows.filter((r): r is [string, TeamSplitBucket] => r[1] != null);
  if (!present.length && !splits.months.length) return null;
  return (
    <section className="sports-card flex flex-col gap-4 p-4 sm:p-5" aria-label="Splits">
      <div>
        <h2 className={type.heading}>Splits</h2>
        <p className={cn(type.bodySm, "mt-1 text-muted-foreground")}>
          {season} regular season. The number after the record is average margin.
        </p>
      </div>
      {present.length ? (
        <ul data-hover-group className="flex flex-col gap-3">
          {present.map(([label, row]) => (
            <RecordBar key={label} label={label} row={row} />
          ))}
        </ul>
      ) : null}
      {splits.months.length ? (
        <div>
          <p className={cn(type.micro, "mb-2 font-semibold uppercase tracking-wide text-muted-foreground")}>Win % by month</p>
          <div data-hover-group className="flex gap-1.5">
            {splits.months.map((m, i) => {
              const total = m.wins + m.losses;
              const pct = total ? m.wins / total : 0;
              return (
                <div
                  key={m.id}
                  data-hover-item
                  data-tip={m.label}
                  data-tip-sub={`${m.wins}-${m.losses} · ${total ? formatPct(pct, 0) : "no games"}`}
                  className="flex min-w-0 flex-1 flex-col items-center gap-1"
                >
                  <span className="text-[10px] font-semibold tabular-nums">{formatPct(pct, 0)}</span>
                  <span className="relative flex h-24 w-full items-end overflow-hidden rounded-md bg-foreground/[0.05]">
                    <span
                      data-motion-bar="y"
                      data-tip-anchor
                      className="w-full rounded-md"
                      style={{ height: `${Math.max(3, pct * 100)}%`, background: pct >= 0.5 ? WIN : LOSS, "--i": i * 2 } as CSSProperties}
                    />
                    <span className="absolute inset-x-0 top-1/2 border-t border-dashed border-foreground/30" aria-hidden />
                  </span>
                  <span className="text-[10px] text-muted-foreground">{m.label.slice(0, 3)}</span>
                  <span className="text-[9.5px] text-muted-foreground tabular-nums">
                    {m.wins}-{m.losses}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function TraitRow({ t }: { t: TraitBar }) {
  return (
    <li data-hover-item className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className={cn(type.bodySm, "font-semibold")}>{t.label}</span>
        <span className={cn(type.caption, "tabular-nums text-muted-foreground")}>
          <span className="font-bold text-foreground">{t.display}</span> · {formatOrdinal(Math.round(t.percentile))} pct
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-foreground/[0.07]">
        <div
          data-motion-bar="x"
          className="h-full rounded-full"
          style={{ width: `${Math.max(3, t.percentile)}%`, background: percentileSavantColor(t.percentile, "auto") }}
        />
      </div>
    </li>
  );
}

export function StrengthsPanel({
  strengths,
  weaknesses,
  howTheyWin,
}: {
  strengths: TraitBar[];
  weaknesses: TraitBar[];
  howTheyWin: AnalyticalFinding[];
}) {
  if (!strengths.length && !weaknesses.length) return null;
  return (
    <section className="sports-card flex flex-col gap-4 p-4 sm:p-5" aria-label="Strengths and weaknesses">
      <div>
        <h2 className={type.heading}>Strengths and weaknesses</h2>
        <p className={cn(type.bodySm, "mt-1 text-muted-foreground")}>
          Their best and worst league percentiles on the season board.
        </p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <p className={cn(type.micro, "mb-2 font-semibold uppercase tracking-wide")} style={{ color: WIN_TEXT }}>
            Strengths
          </p>
          {strengths.length ? (
            <ul data-hover-group className="flex flex-col gap-3">
              {strengths.map((t) => (
                <TraitRow key={t.id} t={t} />
              ))}
            </ul>
          ) : (
            <p className={cn(type.caption, "text-muted-foreground")}>Nothing in the top third of the league.</p>
          )}
        </div>
        <div>
          <p className={cn(type.micro, "mb-2 font-semibold uppercase tracking-wide")} style={{ color: LOSS_TEXT }}>
            Weaknesses
          </p>
          {weaknesses.length ? (
            <ul data-hover-group className="flex flex-col gap-3">
              {weaknesses.map((t) => (
                <TraitRow key={t.id} t={t} />
              ))}
            </ul>
          ) : (
            <p className={cn(type.caption, "text-muted-foreground")}>Nothing in the bottom third of the league.</p>
          )}
        </div>
      </div>
      {howTheyWin.length ? (
        <div className="grid gap-2 sm:grid-cols-3">
          {howTheyWin.map((f) => (
            <div key={f.id} className="rounded-lg bg-secondary/50 px-3 py-2.5">
              <p className={cn(type.micro, "font-bold uppercase tracking-wide text-muted-foreground")}>{f.title}</p>
              <p className={cn(type.caption, "mt-1 text-muted-foreground")}>{f.body}</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
