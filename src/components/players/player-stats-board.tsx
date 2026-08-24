"use client";

import { useMemo, useState, type ReactNode } from "react";

import {
  GlassSurface,
  type GlassSurfaceHonor,
} from "@/components/brand/glass-surface";
import { TeamSeasonSwatch } from "@/components/brand/team-season-swatch";
import { useQueryNavOptional } from "@/components/continuity/query-nav";
import { TextLink } from "@/components/ui/text-link";
import type { PlayerSeason } from "@/data/types";
import { type } from "@/lib/design-system";
import { formatNumber } from "@/lib/format";
import { brandAtmosphereColors } from "@/lib/game-matchup-theme";
import { resolveTeamBrand } from "@/lib/nba-brand";
import {
  playerDepthHref,
  type PlayerSeasonKind,
} from "@/lib/player-destination";
import {
  cardStintsForSeason,
  isMultiTeamSeasonRow,
  multiTeamDisplayLabel,
} from "@/lib/player-team-context";
import { teamSeasonIsMulti } from "@/lib/team-season-colors";
import type { ThemeMode } from "@/themes/era-theme";
import { cn } from "@/lib/utils";

import {
  SHEET_STAT_CATEGORY_CHIPS,
  formatSheetStatValue,
  getSheetStatValue,
  sheetStatHasAnyValue,
  sheetStatsForCategory,
  visibleSheetStats,
  type SheetRateMode,
  type SheetStatCategory,
} from "@/lib/player-stat-sheet-registry";

type RateMode = Extract<SheetRateMode, "perGame" | "totals" | "per100">;
type StatCategory = "all" | SheetStatCategory;

const RATE_MODES: Array<{ id: RateMode; label: string }> = [
  { id: "perGame", label: "Per game" },
  { id: "totals", label: "Totals" },
  { id: "per100", label: "Per 100" },
];

function visibleCategoryChips(
  rows: PlayerSeason[],
  mode: SheetRateMode
): typeof SHEET_STAT_CATEGORY_CHIPS {
  return SHEET_STAT_CATEGORY_CHIPS.filter((item) => {
    if (item.id !== "hustle") return true;
    return sheetStatsForCategory("hustle").some((def) =>
      sheetStatHasAnyValue(rows, def.id, mode)
    );
  });
}

function GlassChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
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
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        className={cn(
          type.caption,
          "mr-0.5 font-semibold uppercase tracking-wide text-muted-foreground"
        )}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

export function PlayerStatsBoard({
  playerId,
  season,
  statsSeason,
  seasonType,
  rows,
  teamKey,
  fromHistory = false,
  themeMode = "historical",
  honor,
}: {
  playerId: string;
  season: string;
  statsSeason?: string;
  seasonType: PlayerSeasonKind;
  rows: PlayerSeason[];
  teamKey?: string | null;
  fromHistory?: boolean;
  themeMode?: ThemeMode;
  honor?: GlassSurfaceHonor;
}) {
  const queryNav = useQueryNavOptional();
  const [mode, setMode] = useState<RateMode>("perGame");
  const [category, setCategory] = useState<StatCategory>("all");
  const wash = brandAtmosphereColors(
    resolveTeamBrand(teamKey)?.primary,
    resolveTeamBrand(teamKey)?.secondary
  );

  const highlightSeason = statsSeason ?? season;

  const newestFirst = useMemo(
    () => [...rows].sort((a, b) => b.season.localeCompare(a.season)),
    [rows]
  );

  const cols = useMemo(
    () => visibleSheetStats(newestFirst, category, mode),
    [newestFirst, category, mode]
  );

  const categories = useMemo(
    () => visibleCategoryChips(newestFirst, mode),
    [newestFirst, mode]
  );

  function setSeasonType(next: PlayerSeasonKind) {
    queryNav?.replaceParams({
      seasonType: next === "playoffs" ? "playoffs" : null,
    });
  }

  const kindLabel =
    seasonType === "playoffs" ? "Playoffs" : "Regular season";

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
        honor={honor}
      >
        <div>
          <h2 className={type.heading}>Statistics</h2>
          <p className={cn(type.bodySm, "mt-1 text-muted-foreground")}>
            Spreadsheet view — scroll sideways for every published column.
            Counting stats follow the rate toggle; percentages and ratings stay
            unscaled.
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          <FilterRow label="Type">
            <GlassChip
              active={seasonType === "regular"}
              onClick={() => setSeasonType("regular")}
            >
              Regular
            </GlassChip>
            <GlassChip
              active={seasonType === "playoffs"}
              onClick={() => setSeasonType("playoffs")}
            >
              Playoffs
            </GlassChip>
          </FilterRow>
          <FilterRow label="Rate">
            {RATE_MODES.map((item) => (
              <GlassChip
                key={item.id}
                active={mode === item.id}
                onClick={() => setMode(item.id)}
              >
                {item.label}
              </GlassChip>
            ))}
          </FilterRow>
          <FilterRow label="Cols">
            {categories.map((item) => (
              <GlassChip
                key={item.id}
                active={category === item.id}
                onClick={() => setCategory(item.id)}
              >
                {item.label}
              </GlassChip>
            ))}
          </FilterRow>
        </div>

        {newestFirst.length === 0 ? (
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            No {kindLabel.toLowerCase()} seasons available.
          </p>
        ) : (
          <>
            <div className="sports-card board-scroll-host -mx-1 overflow-x-auto rounded-md px-1">
              <table className="w-max min-w-full border-collapse text-left">
                <thead
                  className={cn(
                    type.caption,
                    "uppercase tracking-wide text-muted-foreground"
                  )}
                >
                  <tr className="border-b border-border/60">
                    <th className="board-sticky-frost sticky left-0 z-20 py-2 pr-3 font-semibold">
                      Season
                    </th>
                    <th className="px-2 py-2 text-right font-semibold">Age</th>
                    <th className="px-2 py-2 text-right font-semibold">Tm</th>
                    <th className="px-2 py-2 text-left font-semibold">Pos</th>
                    <th className="px-2 py-2 text-right font-semibold">G</th>
                    <th className="px-2 py-2 text-right font-semibold">GS</th>
                    {cols.map((col) => (
                      <th
                        key={col.id}
                        className="whitespace-nowrap px-2 py-2 text-right font-semibold"
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {newestFirst.map((row) => {
                    const active = row.season === highlightSeason;
                    const multiTeam = isMultiTeamSeasonRow(row);
                    const tm = multiTeam
                      ? multiTeamDisplayLabel(row)
                      : row.teamAbbreviation ?? "-";
                    const tmKeys = multiTeam
                      ? cardStintsForSeason(rows, row.season).map(
                          (stint) => stint.teamKey
                        )
                      : [];
                    return (
                      <tr
                        key={`${row.season}-${row.teamId}`}
                        className={cn(
                          "border-b border-border/40",
                          active && "board-row-active"
                        )}
                      >
                        <td className="board-sticky-frost sticky left-0 z-10 py-1.5 pr-3">
                          <TextLink
                            href={playerDepthHref(playerId, {
                              season: row.season,
                              depth: "stats",
                              seasonType,
                              fromHistory,
                              themeMode,
                            })}
                            scroll={false}
                            className={cn(
                              type.caption,
                              "font-semibold tabular-nums",
                              active && "underline decoration-foreground/40"
                            )}
                          >
                            {row.season}
                          </TextLink>
                        </td>
                        <td
                          className={cn(
                            type.caption,
                            "px-2 py-1.5 text-right tabular-nums"
                          )}
                        >
                          {row.age != null ? formatNumber(row.age, 0) : "-"}
                        </td>
                        <td
                          className={cn(
                            type.caption,
                            "px-2 py-1.5 text-right tabular-nums"
                          )}
                        >
                          <span className="inline-flex items-center justify-end gap-1">
                            {teamSeasonIsMulti(tmKeys) ? (
                              <TeamSeasonSwatch teamKeys={tmKeys} size="xs" />
                            ) : null}
                            {tm}
                          </span>
                        </td>
                        <td
                          className={cn(
                            type.caption,
                            "px-2 py-1.5 text-left tabular-nums"
                          )}
                        >
                          {row.position ?? "-"}
                        </td>
                        <td
                          className={cn(
                            type.caption,
                            "px-2 py-1.5 text-right tabular-nums"
                          )}
                        >
                          {formatNumber(row.gamesPlayed, 0)}
                        </td>
                        <td
                          className={cn(
                            type.caption,
                            "px-2 py-1.5 text-right tabular-nums"
                          )}
                        >
                          {formatNumber(row.gamesStarted, 0)}
                        </td>
                        {cols.map((col) => (
                          <td
                            key={col.id}
                            className={cn(
                              type.caption,
                              "whitespace-nowrap px-2 py-1.5 text-right tabular-nums"
                            )}
                          >
                            {formatSheetStatValue(
                              getSheetStatValue(row, col.id, mode),
                              col,
                              mode
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className={cn(type.caption, "text-muted-foreground")}>
              {kindLabel} · {mode === "perGame"
                ? "per game"
                : mode === "totals"
                  ? "season totals"
                  : "per 100 possessions (estimated)"}{" "}
              · {cols.length} columns
            </p>
          </>
        )}
      </GlassSurface>
    </section>
  );
}
