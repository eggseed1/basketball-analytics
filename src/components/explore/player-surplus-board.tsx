import Link from "next/link";
import { Fragment } from "react";

import { TeamLogo } from "@/components/brand/team-logo";
import { getContractSurplusMeta, getPlayerSurplusRows } from "@/data/queries/contract-surplus";
import { contractSpan, type PlayerSurplusRow } from "@/lib/contract-surplus";
import { type } from "@/lib/design-system";
import { formatUsdCompact, formatUsdSignedCompact } from "@/lib/format-money";
import type { PlayerRaceFieldSize, PlayerRaceRankEnd } from "@/lib/player-race-tracker";
import { cn } from "@/lib/utils";
import { applyVizFieldFilter } from "@/lib/viz-field-filter";
import { parseVizTeamKeys } from "@/lib/viz-team-highlight";

const ROW =
  "grid grid-cols-[2.25rem_minmax(0,9rem)_minmax(0,1fr)_4.25rem] items-center gap-2 sm:grid-cols-[2.5rem_minmax(0,13rem)_minmax(0,1fr)_5rem]";

function tone(dollars: number): string {
  if (Math.abs(dollars) < 50_000) return "text-muted-foreground";
  return dollars > 0 ? "text-[var(--chart-3)]" : "text-destructive";
}

function fieldBlurb(fieldSize: PlayerRaceFieldSize, rankEnd: PlayerRaceRankEnd, total: number): string {
  if (fieldSize === "all" || fieldSize >= total) return `All ${total} contracts we can estimate`;
  if (rankEnd === "low") return `The ${fieldSize} lowest of ${total} contracts`;
  if (rankEnd === "both") {
    const top = Math.ceil(fieldSize / 2);
    return `The ${top} highest and ${fieldSize - top} lowest of ${total} contracts`;
  }
  return `The ${fieldSize} highest of ${total} contracts`;
}

export function PlayerSurplusBoard({
  fieldSize,
  rankEnd,
  pin,
  team,
}: {
  fieldSize: PlayerRaceFieldSize;
  rankEnd: PlayerRaceRankEnd;
  pin?: string;
  team?: string;
}) {
  const all = getPlayerSurplusRows();
  const meta = getContractSurplusMeta();
  const pins = new Set((pin ?? "").split(",").map((p) => p.trim()).filter(Boolean));
  const teamKeys = new Set(parseVizTeamKeys(team));

  if (!all.length) {
    return (
      <p className={cn(type.bodySm, "sports-card px-4 py-10 text-center text-muted-foreground")}>
        No contract estimates are available right now.
      </p>
    );
  }

  const shown = applyVizFieldFilter(all, {
    fieldSize,
    rankEnd,
    keyOf: (r) => r.brefId,
    sortValue: (r) => r.surplus,
    isPinned: (r) => (r.playerId ? pins.has(r.playerId) : false),
  }).sort((a, b) => a.rank - b.rank);
  const unmatchedPins = [...pins].filter((id) => !all.some((r) => r.playerId === id)).length;

  const lo = Math.min(0, ...shown.map((r) => r.surplusLow));
  const hi = Math.max(0, ...shown.map((r) => r.surplusHigh));
  const pct = (v: number) => `${((v - lo) / (hi - lo || 1)) * 100}%`;

  return (
    <section className="sports-card flex flex-col gap-3 p-4 sm:p-5" aria-labelledby="player-surplus-title">
      <div>
        <h2 id="player-surplus-title" className={type.heading}>
          Contract surplus
        </h2>
        <p className={cn(type.bodySm, "mt-1 text-muted-foreground")}>
          Contracts from {meta.capSeason} on · {fieldBlurb(fieldSize, rankEnd, all.length)}, ranked by
          projected worth minus salary over the rest of the deal. The dot is the middle estimate and
          the line is the 80% range.
        </p>
      </div>

      <div
        aria-hidden
        className={cn(ROW, type.micro, "font-semibold uppercase tracking-wide text-muted-foreground")}
      >
        <span>#</span>
        <span>Player</span>
        <span className="hidden justify-between tabular-nums normal-case sm:flex">
          <span>{formatUsdSignedCompact(lo)}</span>
          <span>{formatUsdSignedCompact(hi)}</span>
        </span>
        <span className="text-right">Surplus</span>
      </div>

      <ol className="flex flex-col" aria-label="Contracts ranked by projected surplus">
        {shown.map((r, i) => {
          const prev = shown[i - 1];
          const skipped = prev ? r.rank - prev.rank - 1 : 0;
          return (
            <Fragment key={r.brefId}>
              {skipped > 0 ? (
                <li className={cn(type.caption, "py-1.5 text-center text-muted-foreground")}>
                  {skipped} {skipped === 1 ? "contract" : "contracts"} in between
                </li>
              ) : null}
              <SurplusRow
                row={r}
                pinned={r.playerId ? pins.has(r.playerId) : false}
                teamHighlighted={teamKeys.has(r.teamKey)}
                pct={pct}
              />
            </Fragment>
          );
        })}
      </ol>

      <div className={cn(type.caption, "flex flex-col gap-1 text-muted-foreground")}>
        <p>
          Worth is what a player&apos;s projected wins would cost on the open market. Surplus is worth
          minus salary, with team options and non-guaranteed years counting only their upside and
          player options only their downside. Longer deals swing further both ways because they cover
          more seasons.
        </p>
        <p>
          {meta.leftOut
            ? `${meta.leftOut} contracts aren't ranked because those players have too little recent NBA time to estimate. `
            : ""}
          {unmatchedPins
            ? `${unmatchedPins === 1 ? "One pinned player has" : `${unmatchedPins} pinned players have`} no contract estimate, so ${unmatchedPins === 1 ? "he isn't" : "they aren't"} shown. `
            : ""}
          Each player&apos;s Contract section breaks his estimate down by season.
        </p>
      </div>
    </section>
  );
}

function SurplusRow({
  row,
  pinned,
  teamHighlighted,
  pct,
}: {
  row: PlayerSurplusRow;
  pinned: boolean;
  teamHighlighted: boolean;
  pct: (v: number) => string;
}) {
  const emphasized = pinned || teamHighlighted;
  const name = row.playerId ? (
    <Link
      href={`/players/${row.playerId}#contract`}
      className={cn(type.bodySm, "block truncate font-semibold text-foreground underline-offset-2 hover:underline")}
    >
      {row.name}
    </Link>
  ) : (
    <span className={cn(type.bodySm, "block truncate font-semibold text-foreground")}>{row.name}</span>
  );
  return (
    <li
      className={cn(
        ROW,
        "rounded-md border-t border-border/40 px-1 py-1.5 first:border-t-0",
        emphasized && "bg-secondary"
      )}
    >
      <span className={cn(type.caption, "tabular-nums text-muted-foreground", emphasized && "font-semibold text-foreground")}>
        {row.rank}
      </span>
      <div className="min-w-0">
        {name}
        <p className={cn(type.micro, "flex min-w-0 items-center gap-1 text-muted-foreground")}>
          <TeamLogo teamKey={row.teamKey} size="xs" />
          <span className="truncate tabular-nums">
            {row.teamKey} · {formatUsdCompact(row.salary)}, {contractSpan(row)}
          </span>
        </p>
      </div>
      <div
        className="relative h-5"
        data-tip={`${row.name}: ${formatUsdSignedCompact(row.surplus)}`}
        data-tip-sub={`80% range ${formatUsdSignedCompact(row.surplusLow)} to ${formatUsdSignedCompact(row.surplusHigh)} · worth ${formatUsdCompact(row.worth)} against ${formatUsdCompact(row.salary)} in salary`}
      >
        <span aria-hidden className="absolute inset-y-0 w-px bg-foreground/30" style={{ left: pct(0) }} />
        <span
          aria-hidden
          className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full"
          style={{
            left: pct(row.surplusLow),
            width: `calc(${pct(row.surplusHigh)} - ${pct(row.surplusLow)})`,
            background: row.surplus > 0 ? "var(--chart-3)" : "var(--destructive)",
            opacity: 0.35,
          }}
        />
        <span
          aria-hidden
          className={cn(
            "absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full",
            emphasized && "size-3 ring-2 ring-foreground"
          )}
          style={{
            left: pct(row.surplus),
            background: row.surplus > 0 ? "var(--chart-3)" : "var(--destructive)",
          }}
        />
      </div>
      <span className={cn(type.bodySm, "text-right font-semibold tabular-nums", tone(row.surplus))}>
        {formatUsdSignedCompact(row.surplus)}
      </span>
    </li>
  );
}
