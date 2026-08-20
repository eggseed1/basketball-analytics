"use client";

import { useMemo, useState } from "react";

import { GlassSurface } from "@/components/brand/glass-surface";
import { type } from "@/lib/design-system";
import { formatNumber, formatPct } from "@/lib/format";
import { brandAtmosphereColors } from "@/lib/game-matchup-theme";
import { resolveTeamBrand } from "@/lib/nba-brand";
import type { PlayerSeasonKind } from "@/lib/player-destination";
import type { PlayerSeason } from "@/data/types";
import { cn } from "@/lib/utils";

type RateMode = "perGame" | "totals" | "per36";

const RATE_MODES: Array<{ id: RateMode; label: string }> = [
  { id: "perGame", label: "Per game" },
  { id: "totals", label: "Totals" },
  { id: "per36", label: "Per 36" },
];

function scaleCount(
  total: number,
  row: PlayerSeason,
  mode: RateMode
): number | null {
  if (!Number.isFinite(total)) return null;
  if (mode === "totals") return total;
  if (mode === "perGame") {
    return row.gamesPlayed > 0 ? total / row.gamesPlayed : null;
  }
  return row.minutes > 0 ? (total / row.minutes) * 36 : null;
}

function fmt(
  n: number | null | undefined,
  digits: number,
  pct = false
): string {
  if (n == null || !Number.isFinite(n)) return "-";
  return pct ? formatPct(n, digits) : formatNumber(n, digits);
}

function rate(n: number | null | undefined): number | null {
  return n != null && Number.isFinite(n) && n !== 0 ? n : n === 0 ? 0 : null;
}

function StatTable({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; value: string }>;
}) {
  const shown = rows.filter((row) => row.value !== "-");
  if (!shown.length) return null;
  return (
    <div>
      <h3 className={cn(type.bodySm, "mb-2 font-bold")}>{title}</h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3 lg:grid-cols-4">
        {shown.map((row) => (
          <div
            key={row.label}
            className="flex items-baseline justify-between gap-2 border-b border-dashed border-border/70 py-1"
          >
            <dt className={cn(type.caption, "text-muted-foreground")}>
              {row.label}
            </dt>
            <dd
              className={cn(
                type.bodySm,
                "font-semibold tabular-nums text-foreground"
              )}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function PlayerStatsBoard({
  row,
  seasonType,
  teamKey,
  teamLabel,
}: {
  row: PlayerSeason | null;
  seasonType: PlayerSeasonKind;
  teamKey?: string | null;
  teamLabel?: string | null;
}) {
  const [mode, setMode] = useState<RateMode>("perGame");
  const wash = brandAtmosphereColors(
    resolveTeamBrand(teamKey)?.primary,
    resolveTeamBrand(teamKey)?.secondary
  );
  const digits = mode === "totals" ? 0 : 1;
  const kindLabel =
    seasonType === "playoffs" ? "Playoffs" : "Regular season";

  const scaled = useMemo(() => {
    if (!row) return null;
    const s = (key: keyof PlayerSeason) =>
      scaleCount(Number(row[key]) || 0, row, mode);
    const twoMade = row.fieldGoalsMade - row.threePointersMade;
    const twoAtt = row.fieldGoalsAttempted - row.threePointersAttempted;
    return {
      pts: s("points"),
      reb: s("rebounds"),
      oreb: s("offensiveRebounds"),
      dreb: s("defensiveRebounds"),
      ast: s("assists"),
      stl: s("steals"),
      blk: s("blocks"),
      tov: s("turnovers"),
      pf: s("personalFouls"),
      plus: s("plusMinus"),
      fgm: s("fieldGoalsMade"),
      fga: s("fieldGoalsAttempted"),
      tpm: scaleCount(twoMade, row, mode),
      tpa: scaleCount(twoAtt, row, mode),
      fg3m: s("threePointersMade"),
      fg3a: s("threePointersAttempted"),
      ftm: s("freeThrowsMade"),
      fta: s("freeThrowsAttempted"),
    };
  }, [row, mode]);

  return (
    <section
      id="statistics"
      className="scroll-mt-16 flex flex-col gap-4"
      aria-label="Statistics"
    >
      <GlassSurface
        effect="css"
        accentColor={wash?.colorA}
        accentColorB={wash?.colorB}
        className="flex flex-col gap-4 p-4 sm:p-5"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className={type.heading}>Statistics</h2>
            <p className={cn(type.bodySm, "mt-1 text-muted-foreground")}>
              {row?.season ?? "-"} · {kindLabel}
              {teamLabel ? ` · ${teamLabel}` : ""}
              . Counting stats follow the rate toggle; percentages and
              ratings stay unscaled.
            </p>
          </div>
          <div
            role="group"
            aria-label="Rate mode"
            className="flex flex-wrap gap-1"
          >
            {RATE_MODES.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={item.id === mode}
                onClick={() => setMode(item.id)}
                className={cn(
                  type.caption,
                  "rounded-md px-2.5 py-1 font-semibold",
                  item.id === mode
                    ? "bg-foreground text-background"
                    : "bg-white/55 text-foreground hover:bg-white/80"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {!row || !scaled ? (
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            No {kindLabel.toLowerCase()} counting stats for this season.
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            <StatTable
              title="Availability"
              rows={[
                { label: "GP", value: fmt(row.gamesPlayed, 0) },
                { label: "GS", value: fmt(row.gamesStarted, 0) },
                { label: "MIN", value: fmt(row.minutes, 0) },
                {
                  label: "MPG",
                  value: fmt(
                    row.gamesPlayed > 0
                      ? row.minutes / row.gamesPlayed
                      : null,
                    1
                  ),
                },
              ]}
            />
            <StatTable
              title="Box score"
              rows={[
                { label: "PTS", value: fmt(scaled.pts, digits) },
                { label: "REB", value: fmt(scaled.reb, digits) },
                { label: "OREB", value: fmt(scaled.oreb, digits) },
                { label: "DREB", value: fmt(scaled.dreb, digits) },
                { label: "AST", value: fmt(scaled.ast, digits) },
                { label: "STL", value: fmt(scaled.stl, digits) },
                { label: "BLK", value: fmt(scaled.blk, digits) },
                { label: "TOV", value: fmt(scaled.tov, digits) },
                { label: "PF", value: fmt(scaled.pf, digits) },
                { label: "+/-", value: fmt(scaled.plus, digits) },
              ]}
            />
            <StatTable
              title="Shooting"
              rows={[
                { label: "FGM", value: fmt(scaled.fgm, digits) },
                { label: "FGA", value: fmt(scaled.fga, digits) },
                { label: "FG%", value: fmt(rate(row.fieldGoalPct), 1, true) },
                { label: "2PM", value: fmt(scaled.tpm, digits) },
                { label: "2PA", value: fmt(scaled.tpa, digits) },
                { label: "2P%", value: fmt(rate(row.twoPointPct), 1, true) },
                { label: "3PM", value: fmt(scaled.fg3m, digits) },
                { label: "3PA", value: fmt(scaled.fg3a, digits) },
                { label: "3P%", value: fmt(rate(row.threePointPct), 1, true) },
                { label: "FTM", value: fmt(scaled.ftm, digits) },
                { label: "FTA", value: fmt(scaled.fta, digits) },
                { label: "FT%", value: fmt(rate(row.freeThrowPct), 1, true) },
              ]}
            />
            <StatTable
              title="Efficiency"
              rows={[
                { label: "TS%", value: fmt(rate(row.trueShootingPct), 1, true) },
                {
                  label: "eFG%",
                  value: fmt(rate(row.effectiveFieldGoalPct), 1, true),
                },
                {
                  label: "3PAr",
                  value: fmt(rate(row.threePointAttemptRate), 1, true),
                },
                { label: "FTr", value: fmt(rate(row.freeThrowRate), 1, true) },
                { label: "USG%", value: fmt(rate(row.usagePct), 1, true) },
                { label: "TOV%", value: fmt(rate(row.turnoverPct), 1, true) },
                { label: "AST%", value: fmt(rate(row.assistPct), 1, true) },
                {
                  label: "ORB%",
                  value: fmt(rate(row.offensiveReboundPct), 1, true),
                },
                {
                  label: "DRB%",
                  value: fmt(rate(row.defensiveReboundPct), 1, true),
                },
                { label: "TRB%", value: fmt(rate(row.reboundPct), 1, true) },
                { label: "STL%", value: fmt(rate(row.stealPct), 1, true) },
                { label: "BLK%", value: fmt(rate(row.blockPct), 1, true) },
                { label: "PIE", value: fmt(rate(row.pie), 1, true) },
                { label: "ORtg", value: fmt(row.offensiveRating, 1) },
                { label: "DRtg", value: fmt(row.defensiveRating, 1) },
                { label: "NET", value: fmt(row.netRating, 1) },
              ]}
            />
            <StatTable
              title="Advanced"
              rows={[
                { label: "PER", value: fmt(rate(row.per), 1) },
                { label: "OWS", value: fmt(row.ows, 1) },
                { label: "DWS", value: fmt(row.dws, 1) },
                { label: "WS", value: fmt(row.winShares, 1) },
                { label: "WS/48", value: fmt(rate(row.winSharesPer48), 3) },
                { label: "OBPM", value: fmt(row.obpm, 1) },
                { label: "DBPM", value: fmt(row.dbpm, 1) },
                { label: "BPM", value: fmt(row.bpm, 1) },
                { label: "VORP", value: fmt(row.vorp, 1) },
              ]}
            />
          </div>
        )}
      </GlassSurface>
    </section>
  );
}
