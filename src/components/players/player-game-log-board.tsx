"use client";

import { useMemo, useState, type ReactNode } from "react";

import { MiniStat } from "@/components/players/player-destination-stats";
import { useQueryNavOptional } from "@/components/continuity/query-nav";
import { TextLink } from "@/components/ui/text-link";
import type { PlayerGame } from "@/data/types";
import { type } from "@/lib/design-system";
import { formatNumber, formatPct } from "@/lib/format";
import { teamChartColor } from "@/lib/nba-brand";
import type { PlayerSeasonKind } from "@/lib/player-destination";
import { cn } from "@/lib/utils";

type LogCategory = "overview" | "scoring" | "shooting" | "defense" | "advanced";
type PlaceFilter = "all" | "home" | "away";
type RoleFilter = "all" | "starter" | "bench";

const CATEGORIES: Array<{ id: LogCategory; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "scoring", label: "Scoring" },
  { id: "shooting", label: "Shooting" },
  { id: "defense", label: "Defense" },
  { id: "advanced", label: "Advanced" },
];

function shortSeason(season: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(season);
  if (!m) return season;
  return `${m[1].slice(2)}-${m[2]}`;
}

function started(g: PlayerGame) {
  return Boolean(g.startPosition && g.startPosition.trim());
}

function tsFromLine(g: PlayerGame): number | null {
  if (g.trueShootingPct != null) return g.trueShootingPct;
  const denom = g.fieldGoalsAttempted + 0.44 * g.freeThrowsAttempted;
  if (g.points > 0 && denom > 0) return g.points / (2 * denom);
  return null;
}

function efgFromLine(g: PlayerGame): number | null {
  if (g.effectiveFieldGoalPct != null) return g.effectiveFieldGoalPct;
  if (g.fieldGoalsAttempted <= 0) return null;
  return (g.fieldGoalsMade + 0.5 * g.threePointersMade) / g.fieldGoalsAttempted;
}

function summarize(games: PlayerGame[]) {
  const gp = games.length;
  if (!gp) return null;
  const tot = (key: keyof PlayerGame) =>
    games.reduce((sum, g) => sum + (Number(g[key]) || 0), 0);
  const points = tot("points");
  const fga = tot("fieldGoalsAttempted");
  const fta = tot("freeThrowsAttempted");
  const fgm = tot("fieldGoalsMade");
  const fg3m = tot("threePointersMade");
  const fg3a = tot("threePointersAttempted");
  const ftm = tot("freeThrowsMade");
  const tsDenom = fga + 0.44 * fta;
  const avg = (pick: (g: PlayerGame) => number | null | undefined) => {
    const vals = games
      .map(pick)
      .filter((n): n is number => n != null && Number.isFinite(n));
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };
  return {
    gp,
    minutes: tot("minutes") / gp,
    ppg: points / gp,
    apg: tot("assists") / gp,
    rpg: tot("rebounds") / gp,
    spg: tot("steals") / gp,
    bpg: tot("blocks") / gp,
    tov: tot("turnovers") / gp,
    plus: tot("plusMinus") / gp,
    fgPct: fga > 0 ? fgm / fga : null,
    fg3Pct: fg3a > 0 ? fg3m / fg3a : null,
    ftPct: fta > 0 ? ftm / fta : null,
    efg: fga > 0 ? (fgm + 0.5 * fg3m) / fga : null,
    ts: points > 0 && tsDenom > 0 ? points / (2 * tsDenom) : null,
    usg: avg((g) => g.usagePct),
    ortg: avg((g) => g.offensiveRating),
    drtg: avg((g) => g.defensiveRating),
    net: avg((g) => g.netRating),
    pie: avg((g) => g.pie),
    gmsc: avg((g) => g.gameScore),
  };
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        type.caption,
        "rounded-md px-2.5 py-1 font-semibold",
        active
          ? "bg-foreground text-background"
          : "bg-white/55 text-foreground hover:bg-white/80"
      )}
    >
      {children}
    </button>
  );
}

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
      <p
        className={cn(
          type.caption,
          "shrink-0 font-semibold uppercase tracking-wide text-muted-foreground"
        )}
      >
        {label}
      </p>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

export function PlayerGameLogBoard({
  games,
  season,
  seasons,
  seasonType,
  seasonTypeLabel,
}: {
  games: PlayerGame[];
  season: string;
  seasons: string[];
  seasonType: PlayerSeasonKind;
  seasonTypeLabel: string;
}) {
  const queryNav = useQueryNavOptional();
  const [category, setCategory] = useState<LogCategory>("overview");
  const [place, setPlace] = useState<PlaceFilter>("all");
  const [role, setRole] = useState<RoleFilter>("all");

  const filtered = useMemo(() => {
    return games.filter((g) => {
      if (place === "home" && !g.isHome) return false;
      if (place === "away" && g.isHome) return false;
      if (role === "starter" && !started(g)) return false;
      if (role === "bench" && started(g)) return false;
      return true;
    });
  }, [games, place, role]);

  const totals = summarize(filtered);
  const hasAdvanced = filtered.some(
    (g) =>
      g.offensiveRating != null ||
      g.usagePct != null ||
      g.pie != null ||
      g.gameScore != null
  );

  function setSeason(next: string) {
    queryNav?.replaceParams({ season: next });
  }

  function setSeasonType(next: PlayerSeasonKind) {
    queryNav?.replaceParams({
      seasonType: next === "playoffs" ? "playoffs" : null,
    });
  }

  const summaryCells = (() => {
    if (!totals) return [];
    const n = (v: number, d = 1) => formatNumber(v, d);
    const p = (v: number | null) => (v != null ? formatPct(v) : "-");
    const all: Record<LogCategory, Array<{ label: string; value: string }>> = {
      overview: [
        { label: "GP", value: n(totals.gp, 0) },
        { label: "MIN", value: n(totals.minutes) },
        { label: "PPG", value: n(totals.ppg) },
        { label: "APG", value: n(totals.apg) },
        { label: "RPG", value: n(totals.rpg) },
        { label: "TS%", value: p(totals.ts) },
      ],
      scoring: [
        { label: "GP", value: n(totals.gp, 0) },
        { label: "PPG", value: n(totals.ppg) },
        { label: "RPG", value: n(totals.rpg) },
        { label: "APG", value: n(totals.apg) },
        { label: "TOV", value: n(totals.tov) },
        { label: "+/-", value: n(totals.plus) },
      ],
      shooting: [
        { label: "GP", value: n(totals.gp, 0) },
        { label: "FG%", value: p(totals.fgPct) },
        { label: "3P%", value: p(totals.fg3Pct) },
        { label: "FT%", value: p(totals.ftPct) },
        { label: "eFG%", value: p(totals.efg) },
        { label: "TS%", value: p(totals.ts) },
      ],
      defense: [
        { label: "GP", value: n(totals.gp, 0) },
        { label: "RPG", value: n(totals.rpg) },
        { label: "SPG", value: n(totals.spg) },
        { label: "BPG", value: n(totals.bpg) },
        { label: "+/-", value: n(totals.plus) },
      ],
      advanced: [
        { label: "GP", value: n(totals.gp, 0) },
        { label: "USG%", value: p(totals.usg) },
        { label: "ORtg", value: totals.ortg != null ? n(totals.ortg) : "-" },
        { label: "DRtg", value: totals.drtg != null ? n(totals.drtg) : "-" },
        { label: "NET", value: totals.net != null ? n(totals.net) : "-" },
        { label: "PIE", value: p(totals.pie) },
      ],
    };
    return all[category];
  })();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <FilterRow label="Type">
          {(
            [
              ["regular", "Regular"],
              ["playoffs", "Playoffs"],
            ] as const
          ).map(([id, label]) => (
            <Chip
              key={id}
              active={seasonType === id}
              onClick={() => setSeasonType(id)}
            >
              {label}
            </Chip>
          ))}
        </FilterRow>
        {seasons.length > 1 ? (
          <FilterRow label="Season">
            {[...seasons]
              .sort((a, b) => a.localeCompare(b))
              .map((option) => (
                <Chip
                  key={option}
                  active={option === season}
                  onClick={() => setSeason(option)}
                >
                  {shortSeason(option)}
                </Chip>
              ))}
          </FilterRow>
        ) : null}
        <FilterRow label="Category">
          {CATEGORIES.filter(
            (item) => item.id !== "advanced" || hasAdvanced
          ).map((item) => (
            <Chip
              key={item.id}
              active={item.id === category}
              onClick={() => setCategory(item.id)}
            >
              {item.label}
            </Chip>
          ))}
        </FilterRow>
        <FilterRow label="Location">
          {(
            [
              ["all", "All"],
              ["home", "Home"],
              ["away", "Away"],
            ] as const
          ).map(([id, label]) => (
            <Chip key={id} active={place === id} onClick={() => setPlace(id)}>
              {label}
            </Chip>
          ))}
        </FilterRow>
        <FilterRow label="Role">
          {(
            [
              ["all", "All"],
              ["starter", "Starter"],
              ["bench", "Bench"],
            ] as const
          ).map(([id, label]) => (
            <Chip key={id} active={role === id} onClick={() => setRole(id)}>
              {label}
            </Chip>
          ))}
        </FilterRow>
      </div>

      {totals ? (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {summaryCells.map((cell) => (
            <MiniStat key={cell.label} label={cell.label} value={cell.value} />
          ))}
        </dl>
      ) : null}

      {filtered.length === 0 ? (
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          No {seasonTypeLabel} games match these filters
          {games.length ? "" : ` for ${season}`}.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[14px]">
            <thead
              className={cn(
                type.caption,
                "border-b border-border font-semibold uppercase tracking-wide text-muted-foreground"
              )}
            >
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-2 py-2">Opp</th>
                {category === "overview" || category === "scoring" ? (
                  <th className="px-2 py-2 text-right">MIN</th>
                ) : null}
                {category === "overview" || category === "scoring" ? (
                  <>
                    <th className="px-2 py-2 text-right">PTS</th>
                    <th className="px-2 py-2 text-right">AST</th>
                    <th className="px-2 py-2 text-right">REB</th>
                  </>
                ) : null}
                {category === "scoring" ? (
                  <>
                    <th className="px-2 py-2 text-right">TOV</th>
                    <th className="px-2 py-2 text-right">+/-</th>
                  </>
                ) : null}
                {category === "overview" ? (
                  <>
                    <th className="px-2 py-2 text-right">STL</th>
                    <th className="px-2 py-2 text-right">BLK</th>
                    <th className="px-2 py-2 text-right">FG</th>
                    <th className="px-2 py-2 text-right">3P</th>
                    <th className="px-2 py-2 text-right">+/-</th>
                    <th className="px-3 py-2 text-right">TS%</th>
                  </>
                ) : null}
                {category === "shooting" ? (
                  <>
                    <th className="px-2 py-2 text-right">FG</th>
                    <th className="px-2 py-2 text-right">3P</th>
                    <th className="px-2 py-2 text-right">FT</th>
                    <th className="px-2 py-2 text-right">eFG%</th>
                    <th className="px-3 py-2 text-right">TS%</th>
                  </>
                ) : null}
                {category === "defense" ? (
                  <>
                    <th className="px-2 py-2 text-right">REB</th>
                    <th className="px-2 py-2 text-right">STL</th>
                    <th className="px-2 py-2 text-right">BLK</th>
                    <th className="px-2 py-2 text-right">+/-</th>
                  </>
                ) : null}
                {category === "advanced" ? (
                  <>
                    <th className="px-2 py-2 text-right">USG%</th>
                    <th className="px-2 py-2 text-right">ORtg</th>
                    <th className="px-2 py-2 text-right">DRtg</th>
                    <th className="px-2 py-2 text-right">NET</th>
                    <th className="px-2 py-2 text-right">GmSc</th>
                    <th className="px-3 py-2 text-right">PIE</th>
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((g) => {
                const ts = tsFromLine(g);
                const efg = efgFromLine(g);
                const opp = teamChartColor(g.opponentTeamId).abbr;
                return (
                  <tr key={g.id} className="hover:bg-secondary/40">
                    <td className="px-3 py-2">
                      <TextLink
                        href={`/games/${g.gameId}`}
                        className={type.caption}
                      >
                        {g.gameDate}
                      </TextLink>
                    </td>
                    <td className="px-2 py-2 tabular-nums">
                      {g.isHome ? "vs" : "@"} {opp}
                    </td>
                    {category === "overview" || category === "scoring" ? (
                      <td className="px-2 py-2 text-right tabular-nums">
                        {formatNumber(g.minutes, 1)}
                      </td>
                    ) : null}
                    {category === "overview" || category === "scoring" ? (
                      <>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {g.points}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {g.assists}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {g.rebounds}
                        </td>
                      </>
                    ) : null}
                    {category === "scoring" ? (
                      <>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {g.turnovers}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {g.plusMinus}
                        </td>
                      </>
                    ) : null}
                    {category === "overview" ? (
                      <>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {g.steals}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {g.blocks}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {g.fieldGoalsMade}-{g.fieldGoalsAttempted}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {g.threePointersMade}-{g.threePointersAttempted}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {g.plusMinus}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {ts != null ? formatPct(ts) : "-"}
                        </td>
                      </>
                    ) : null}
                    {category === "shooting" ? (
                      <>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {g.fieldGoalsMade}-{g.fieldGoalsAttempted}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {g.threePointersMade}-{g.threePointersAttempted}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {g.freeThrowsMade}-{g.freeThrowsAttempted}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {efg != null ? formatPct(efg) : "-"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {ts != null ? formatPct(ts) : "-"}
                        </td>
                      </>
                    ) : null}
                    {category === "defense" ? (
                      <>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {g.rebounds}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {g.steals}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {g.blocks}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {g.plusMinus}
                        </td>
                      </>
                    ) : null}
                    {category === "advanced" ? (
                      <>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {g.usagePct != null ? formatPct(g.usagePct) : "-"}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {g.offensiveRating != null
                            ? formatNumber(g.offensiveRating, 1)
                            : "-"}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {g.defensiveRating != null
                            ? formatNumber(g.defensiveRating, 1)
                            : "-"}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {g.netRating != null
                            ? formatNumber(g.netRating, 1)
                            : "-"}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {g.gameScore != null
                            ? formatNumber(g.gameScore, 1)
                            : "-"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {g.pie != null ? formatPct(g.pie) : "-"}
                        </td>
                      </>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
