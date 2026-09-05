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
  SHEET_STAT_CATEGORY_ORDER,
  formatSheetStatValue,
  getSheetStatValue,
  sheetStatHasAnyValue,
  sheetStatsForCategory,
  visibleSheetStats,
  type SheetRateMode,
  type SheetStatCategory,
  type SheetStatDef,
} from "@/lib/player-stat-sheet-registry";

type RateMode = Extract<SheetRateMode, "perGame" | "totals" | "per100">;
type StatCategory = "all" | SheetStatCategory;

const RATE_MODES: Array<{ id: RateMode; label: string }> = [
  { id: "perGame", label: "Per game" },
  { id: "totals", label: "Totals" },
  { id: "per100", label: "Per 100" },
];

/** Sticky season col — inner box locks width; table max-width is ignored on <td>. */
const SEASON_COL_WIDTH = "4.75rem";
const SEASON_COL_CLASS =
  "board-sticky-frost sticky left-0 z-10 box-border p-0";
const SEASON_COL_STYLE = {
  width: SEASON_COL_WIDTH,
  minWidth: SEASON_COL_WIDTH,
  maxWidth: SEASON_COL_WIDTH,
} as const;

type StatGroup = {
  id: SheetStatCategory;
  label: string;
  cols: SheetStatDef[];
};

function groupSheetCols(cols: SheetStatDef[]): StatGroup[] {
  return SHEET_STAT_CATEGORY_ORDER.map((id) => ({
    id,
    label:
      SHEET_STAT_CATEGORY_CHIPS.find((c) => c.id === id)?.label ?? id,
    cols: cols.filter((col) => col.category === id),
  })).filter((group) => group.cols.length > 0);
}

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
    <div
      className="flex flex-wrap items-center gap-1.5"
      role="group"
      aria-label={label}
    >
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

  const groups = useMemo(() => groupSheetCols(cols), [cols]);

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
          <FilterRow label="Season type">
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
          <FilterRow label="Columns">
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
                <colgroup>
                  <col style={SEASON_COL_STYLE} />
                </colgroup>
                <thead
                  className={cn(
                    type.caption,
                    "uppercase tracking-wide text-muted-foreground"
                  )}
                >
                  <tr className="border-b border-border/60">
                    <th
                      rowSpan={2}
                      style={SEASON_COL_STYLE}
                      className={cn(
                        SEASON_COL_CLASS,
                        "z-20 align-bottom font-semibold"
                      )}
                    >
                      <div
                        className="box-border overflow-hidden py-2 pr-3"
                        style={SEASON_COL_STYLE}
                      >
                        Season
                      </div>
                    </th>
                    <th
                      rowSpan={2}
                      className="px-2 py-2 align-bottom text-right font-semibold"
                    >
                      Age
                    </th>
                    <th
                      rowSpan={2}
                      className="px-2 py-2 align-bottom text-right font-semibold"
                    >
                      Tm
                    </th>
                    <th
                      rowSpan={2}
                      className="px-2 py-2 align-bottom text-left font-semibold"
                    >
                      Pos
                    </th>
                    <th
                      rowSpan={2}
                      className="px-2 py-2 align-bottom text-right font-semibold"
                    >
                      G
                    </th>
                    <th
                      rowSpan={2}
                      className="px-2 py-2 align-bottom text-right font-semibold"
                    >
                      GS
                    </th>
                    {groups.map((group) => (
                      <th
                        key={group.id}
                        colSpan={group.cols.length}
                        className="h-7 border-l border-border/70 px-2 py-1.5 text-center font-semibold"
                      >
                        {group.label}
                      </th>
                    ))}
                  </tr>
                  <tr className="border-b border-border/60">
                    {groups.flatMap((group) =>
                      group.cols.map((col, ki) => (
                        <th
                          key={col.id}
                          className={cn(
                            "whitespace-nowrap px-2 py-2 text-right font-semibold",
                            ki === 0 && "border-l border-border/70"
                          )}
                        >
                          {col.label}
                        </th>
                      ))
                    )}
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
                        <td
                          style={SEASON_COL_STYLE}
                          className={SEASON_COL_CLASS}
                        >
                          <div
                            className="box-border overflow-hidden py-1.5 pr-3"
                            style={SEASON_COL_STYLE}
                          >
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
                                "block truncate font-semibold tabular-nums",
                                active && "underline decoration-foreground/40"
                              )}
                            >
                              {row.season}
                            </TextLink>
                          </div>
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
                        {groups.flatMap((group) =>
                          group.cols.map((col, ki) => (
                            <td
                              key={col.id}
                              className={cn(
                                type.caption,
                                "whitespace-nowrap px-2 py-1.5 text-right tabular-nums",
                                ki === 0 && "border-l border-border/70"
                              )}
                            >
                              {formatSheetStatValue(
                                getSheetStatValue(row, col.id, mode),
                                col,
                                mode
                              )}
                            </td>
                          ))
                        )}
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
