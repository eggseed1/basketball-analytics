"use client";

import { useMemo, useState, type ReactNode } from "react";

import { TeamLogo } from "@/components/brand/team-logo";
import { useQueryNavOptional } from "@/components/continuity/query-nav";
import { TeamIdentity } from "@/components/teams/team-identity";
import { TextLink } from "@/components/ui/text-link";
import type { PlayerGame } from "@/data/types";
import { type } from "@/lib/design-system";
import { formatNumber, formatPct } from "@/lib/format";
import { teamChartColor } from "@/lib/nba-brand";
import type { PlayerSeasonKind } from "@/lib/player-destination";
import { brandableTeamKey } from "@/lib/player-team-context";
import { PERCENTILE_CATEGORY_CHIPS, type SheetStatCategory } from "@/lib/player-stat-sheet-registry";
import { cn } from "@/lib/utils";

type LogCategory = SheetStatCategory;
type PlaceFilter = "all" | "home" | "away";
type RoleFilter = "all" | "starter" | "bench";

const CATEGORIES = PERCENTILE_CATEGORY_CHIPS;

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

function GlassChip({
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
        "glass-pill rounded-md px-2.5 py-1 font-semibold transition-colors",
        active
          ? "glass-pill-active"
          : "text-muted-foreground hover:text-foreground"
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

function OppCell({
  game,
  season,
}: {
  game: PlayerGame;
  season: string;
}) {
  const oppKey = brandableTeamKey(game.opponentTeamId);
  const abbr = teamChartColor(game.opponentTeamId).abbr;
  const prefix = game.isHome ? "vs" : "@";

  if (!oppKey) {
    return (
      <span className={cn(type.caption, "tabular-nums")}>
        {prefix} {abbr}
      </span>
    );
  }

  return (
    <TeamIdentity
      teamKey={oppKey}
      season={season}
      label={abbr}
      nameClassName={cn(type.caption, "no-underline hover:underline")}
    >
      <span className="inline-flex items-center gap-1.5">
        <span className="text-muted-foreground">{prefix}</span>
        <TeamLogo teamKey={oppKey} size="2xs" />
        <span className="font-semibold tabular-nums">{abbr}</span>
      </span>
    </TeamIdentity>
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
  const [category, setCategory] = useState<LogCategory>("impact");
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

  function setSeason(next: string) {
    queryNav?.replaceParams({ season: next });
  }

  function setSeasonType(next: PlayerSeasonKind) {
    queryNav?.replaceParams({
      seasonType: next === "playoffs" ? "playoffs" : null,
    });
  }

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
            <GlassChip
              key={id}
              active={seasonType === id}
              onClick={() => setSeasonType(id)}
            >
              {label}
            </GlassChip>
          ))}
        </FilterRow>
        {seasons.length > 1 ? (
          <FilterRow label="Season">
            {[...seasons]
              .sort((a, b) => a.localeCompare(b))
              .map((option) => (
                <GlassChip
                  key={option}
                  active={option === season}
                  onClick={() => setSeason(option)}
                >
                  {shortSeason(option)}
                </GlassChip>
              ))}
          </FilterRow>
        ) : null}
        <FilterRow label="Category">
          {CATEGORIES.map((item) => (
            <GlassChip
              key={item.id}
              active={item.id === category}
              onClick={() => setCategory(item.id)}
            >
              {item.label}
            </GlassChip>
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
            <GlassChip
              key={id}
              active={place === id}
              onClick={() => setPlace(id)}
            >
              {label}
            </GlassChip>
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
            <GlassChip
              key={id}
              active={role === id}
              onClick={() => setRole(id)}
            >
              {label}
            </GlassChip>
          ))}
        </FilterRow>
      </div>

      {filtered.length === 0 ? (
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          No {seasonTypeLabel} games match these filters
          {games.length ? "" : ` for ${season}`}.
        </p>
      ) : (
        <div className="board-scroll-host overflow-x-auto rounded-md">
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
                {category === "impact" ||
                category === "counting" ||
                category === "rates" ||
                category === "advanced" ? (
                  <th className="px-2 py-2 text-right">MP</th>
                ) : null}
                {category === "impact" || category === "counting" ? (
                  <>
                    <th className="px-2 py-2 text-right">PTS</th>
                    <th className="px-2 py-2 text-right">AST</th>
                    <th className="px-2 py-2 text-right">TRB</th>
                  </>
                ) : null}
                {category === "counting" ? (
                  <>
                    <th className="px-2 py-2 text-right">ORB</th>
                    <th className="px-2 py-2 text-right">DRB</th>
                    <th className="px-2 py-2 text-right">STL</th>
                    <th className="px-2 py-2 text-right">BLK</th>
                    <th className="px-2 py-2 text-right">TOV</th>
                    <th className="px-2 py-2 text-right">PF</th>
                    <th className="px-2 py-2 text-right">+/-</th>
                  </>
                ) : null}
                {category === "impact" ? (
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
                {category === "rates" ? (
                  <>
                    <th className="px-2 py-2 text-right">USG%</th>
                    <th className="px-2 py-2 text-right">AST%</th>
                    <th className="px-2 py-2 text-right">TOV%</th>
                    <th className="px-3 py-2 text-right">TRB%</th>
                  </>
                ) : null}
                {category === "advanced" ? (
                  <>
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
                    <td className="px-2 py-2">
                      <OppCell game={g} season={season} />
                    </td>
                    {category === "impact" ||
                    category === "counting" ||
                    category === "rates" ||
                    category === "advanced" ? (
                      <td className="px-2 py-2 text-right tabular-nums">
                        {formatNumber(g.minutes, 1)}
                      </td>
                    ) : null}
                    {category === "impact" || category === "counting" ? (
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
                    {category === "counting" ? (
                      <>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {g.offensiveRebounds ?? "-"}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {g.defensiveRebounds ?? "-"}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {g.steals}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {g.blocks}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {g.turnovers}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {g.personalFouls ?? "-"}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {g.plusMinus}
                        </td>
                      </>
                    ) : null}
                    {category === "impact" ? (
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
                    {category === "rates" ? (
                      <>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {g.usagePct != null ? formatPct(g.usagePct) : "-"}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {g.assistPct != null ? formatPct(g.assistPct) : "-"}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {g.turnoverPct != null
                            ? formatPct(g.turnoverPct)
                            : "-"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {g.reboundPct != null ? formatPct(g.reboundPct) : "-"}
                        </td>
                      </>
                    ) : null}
                    {category === "advanced" ? (
                      <>
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
