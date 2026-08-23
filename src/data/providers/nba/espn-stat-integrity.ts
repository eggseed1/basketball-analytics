import type { PlayerSeason } from "@/data/types";
import {
  transformEspnPlayerSeason,
  type EspnAthleteStatsRow,
  type EspnStatCategorySchema,
  type EspnStatCategoryValues,
  type EspnTeamStatsRow,
  type TeamSeasonTotals,
} from "@/data/transformers/espn";
import {
  transformEspnAthleteCareerStats,
  type EspnAthleteCareerStatsResponse,
  type EspnCareerCategory,
  type EspnCareerStatRow,
} from "@/data/transformers/espn-career";
import {
  effectiveFieldGoalPct,
  freeThrowRate,
  threePointAttemptRate,
  trueShootingPct,
  turnoverPct,
  twoPointPct,
  usagePct,
} from "@/data/providers/nba/compute-advanced";
import { canonicalSeasonFromEspnYear } from "@/data/providers/nba/season";

function parseNumeric(raw: string | number | null | undefined): number | undefined {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : undefined;
  }
  if (typeof raw !== "string") return undefined;
  const normalized = raw.replace(/,/g, "").replace(/^\+/, "").trim();
  if (!normalized || normalized === "-" || normalized === "—") return undefined;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : undefined;
}

function setNamedValue(
  map: Map<string, number>,
  name: string,
  raw: string | number | null | undefined
): void {
  if (!name || map.has(name)) return;

  if (typeof raw === "string" && name.includes("-") && raw.includes("-")) {
    const nameParts = name.split("-");
    const valueParts = raw.split("-");
    if (nameParts.length === 2 && valueParts.length === 2) {
      const made = parseNumeric(valueParts[0]);
      const attempted = parseNumeric(valueParts[1]);
      if (made != null) map.set(nameParts[0]!, made);
      if (attempted != null) map.set(nameParts[1]!, attempted);
      if (made != null) map.set(name, made);
      if (attempted != null) map.set(`${name}__attempted`, attempted);
      return;
    }
  }

  const value = parseNumeric(raw);
  if (value != null) map.set(name, value);
}

/**
 * ESPN season boards vary between `values` (numbers) and `totals` (strings).
 * Read both, preserve explicit zeroes, and leave omitted cells absent.
 */
export function completeCategoryMap(
  valueCategories: EspnStatCategoryValues[],
  schemaCategories: EspnStatCategorySchema[] = []
): Map<string, number> {
  const map = new Map<string, number>();
  const schemasByName = new Map<string, string[]>();

  for (const schema of schemaCategories) {
    if (schema.names?.length && !schemasByName.has(schema.name)) {
      schemasByName.set(schema.name, schema.names);
    }
  }

  for (const category of valueCategories) {
    if (category.displayName?.startsWith("Opponent")) continue;
    const names = category.names ?? schemasByName.get(category.name) ?? [];
    names.forEach((name, index) => {
      const raw = category.values?.[index] ?? category.totals?.[index];
      setNamedValue(map, name, raw);
    });
  }

  return map;
}

function maybe(map: Map<string, number>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = map.get(key);
    if (value != null && Number.isFinite(value)) return value;
  }
  return undefined;
}

function finiteOr(...values: Array<number | null | undefined>): number {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return Number.NaN;
}

function fraction(value: number | undefined): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  return value > 1 ? value / 100 : value;
}

function totalOrAverage(
  stats: Map<string, number>,
  totals: string[],
  averages: string[],
  gamesPlayed: number,
  fallback?: number
): number {
  const total = maybe(stats, ...totals);
  if (total != null) return total;
  const average = maybe(stats, ...averages);
  if (average != null && Number.isFinite(gamesPlayed) && gamesPlayed > 0) {
    return average * gamesPlayed;
  }
  return finiteOr(fallback);
}

/**
 * Full ESPN athlete-board transform. The legacy transformer remains the shape
 * adapter; this layer restores every measured total and rate that used to be
 * lost when the response used string `totals` arrays.
 */
export function transformCompleteEspnPlayerSeason(
  raw: EspnAthleteStatsRow,
  season: string,
  teamTotals: Map<string, TeamSeasonTotals>,
  schemaCategories: EspnStatCategorySchema[] = []
): PlayerSeason {
  const base = transformEspnPlayerSeason(raw, season, teamTotals, schemaCategories);
  const stats = completeCategoryMap(raw.categories, schemaCategories);
  const teamId = String(raw.athlete.teamId ?? "");
  const team = teamTotals.get(teamId);

  const gamesPlayed = finiteOr(maybe(stats, "gamesPlayed"), base.gamesPlayed);
  const gamesStarted = finiteOr(maybe(stats, "gamesStarted"), base.gamesStarted);
  const minutes = totalOrAverage(
    stats,
    ["minutes"],
    ["avgMinutes"],
    gamesPlayed,
    base.minutes
  );
  const points = totalOrAverage(
    stats,
    ["points"],
    ["avgPoints"],
    gamesPlayed,
    base.points
  );
  const assists = totalOrAverage(
    stats,
    ["assists"],
    ["avgAssists"],
    gamesPlayed,
    base.assists
  );
  const rebounds = totalOrAverage(
    stats,
    ["totalRebounds", "rebounds"],
    ["avgRebounds"],
    gamesPlayed,
    base.rebounds
  );
  const offensiveRebounds = totalOrAverage(
    stats,
    ["offensiveRebounds"],
    ["avgOffensiveRebounds"],
    gamesPlayed,
    base.offensiveRebounds
  );
  const defensiveRebounds = totalOrAverage(
    stats,
    ["defensiveRebounds"],
    ["avgDefensiveRebounds"],
    gamesPlayed,
    base.defensiveRebounds
  );
  const steals = totalOrAverage(
    stats,
    ["steals"],
    ["avgSteals"],
    gamesPlayed,
    base.steals
  );
  const blocks = totalOrAverage(
    stats,
    ["blocks"],
    ["avgBlocks"],
    gamesPlayed,
    base.blocks
  );
  const turnovers = totalOrAverage(
    stats,
    ["turnovers"],
    ["avgTurnovers"],
    gamesPlayed,
    base.turnovers
  );
  const personalFouls = totalOrAverage(
    stats,
    ["fouls", "personalFouls"],
    ["avgFouls", "avgPersonalFouls"],
    gamesPlayed,
    base.personalFouls
  );

  const fieldGoalsMade = totalOrAverage(
    stats,
    ["fieldGoalsMade"],
    ["avgFieldGoalsMade"],
    gamesPlayed,
    base.fieldGoalsMade
  );
  const fieldGoalsAttempted = totalOrAverage(
    stats,
    ["fieldGoalsAttempted"],
    ["avgFieldGoalsAttempted"],
    gamesPlayed,
    base.fieldGoalsAttempted
  );
  const threePointersMade = totalOrAverage(
    stats,
    ["threePointFieldGoalsMade", "threePointersMade"],
    ["avgThreePointFieldGoalsMade", "avgThreePointersMade"],
    gamesPlayed,
    base.threePointersMade
  );
  const threePointersAttempted = totalOrAverage(
    stats,
    ["threePointFieldGoalsAttempted", "threePointersAttempted"],
    ["avgThreePointFieldGoalsAttempted", "avgThreePointersAttempted"],
    gamesPlayed,
    base.threePointersAttempted
  );
  const freeThrowsMade = totalOrAverage(
    stats,
    ["freeThrowsMade"],
    ["avgFreeThrowsMade"],
    gamesPlayed,
    base.freeThrowsMade
  );
  const freeThrowsAttempted = totalOrAverage(
    stats,
    ["freeThrowsAttempted"],
    ["avgFreeThrowsAttempted"],
    gamesPlayed,
    base.freeThrowsAttempted
  );

  const fieldGoalPct = finiteOr(
    fraction(maybe(stats, "fieldGoalPct")),
    fieldGoalsAttempted > 0 ? fieldGoalsMade / fieldGoalsAttempted : undefined,
    base.fieldGoalPct
  );
  const threePointPct = finiteOr(
    fraction(maybe(stats, "threePointFieldGoalPct", "threePointPct")),
    threePointersAttempted > 0
      ? threePointersMade / threePointersAttempted
      : undefined,
    base.threePointPct
  );
  const freeThrowPct = finiteOr(
    fraction(maybe(stats, "freeThrowPct")),
    freeThrowsAttempted > 0 ? freeThrowsMade / freeThrowsAttempted : undefined,
    base.freeThrowPct
  );
  const twoPct = twoPointPct(
    fieldGoalsMade,
    threePointersMade,
    fieldGoalsAttempted,
    threePointersAttempted
  );
  const ts = trueShootingPct(points, fieldGoalsAttempted, freeThrowsAttempted);
  const efg = effectiveFieldGoalPct(
    fieldGoalsMade,
    threePointersMade,
    fieldGoalsAttempted
  );
  const tovPct = turnoverPct(
    turnovers,
    fieldGoalsAttempted,
    freeThrowsAttempted
  );
  const usage =
    team &&
    Number.isFinite(minutes) &&
    Number.isFinite(team.gamesPlayed) &&
    Number.isFinite(team.fieldGoalsAttempted) &&
    Number.isFinite(team.freeThrowsAttempted) &&
    Number.isFinite(team.turnovers)
      ? usagePct({
          minutes,
          fieldGoalsAttempted,
          freeThrowsAttempted,
          turnovers,
          teamGamesPlayed: team.gamesPlayed || gamesPlayed,
          teamFieldGoalsAttempted: team.fieldGoalsAttempted,
          teamFreeThrowsAttempted: team.freeThrowsAttempted,
          teamTurnovers: team.turnovers,
        })
      : undefined;
  const possessions = fieldGoalsAttempted + 0.44 * freeThrowsAttempted + turnovers;
  const offensiveRating =
    Number.isFinite(possessions) && possessions > 0
      ? (points / possessions) * 100
      : undefined;

  return {
    ...base,
    gamesPlayed,
    gamesStarted,
    minutes,
    fieldGoalsMade,
    fieldGoalsAttempted,
    threePointersMade,
    threePointersAttempted,
    freeThrowsMade,
    freeThrowsAttempted,
    offensiveRebounds,
    defensiveRebounds,
    rebounds,
    assists,
    steals,
    blocks,
    turnovers,
    personalFouls,
    points,
    plusMinus: finiteOr(maybe(stats, "plusMinus"), base.plusMinus),
    fieldGoalPct,
    twoPointPct: finiteOr(twoPct, base.twoPointPct),
    threePointPct,
    freeThrowPct,
    threePointAttemptRate: finiteOr(
      threePointAttemptRate(threePointersAttempted, fieldGoalsAttempted),
      base.threePointAttemptRate
    ),
    freeThrowRate: finiteOr(
      freeThrowRate(freeThrowsAttempted, fieldGoalsAttempted),
      base.freeThrowRate
    ),
    turnoverPct: finiteOr(tovPct, base.turnoverPct),
    assistPct: finiteOr(
      fraction(maybe(stats, "assistPct")),
      base.assistPct
    ),
    offensiveReboundPct: finiteOr(
      fraction(maybe(stats, "offensiveReboundPct")),
      base.offensiveReboundPct
    ),
    defensiveReboundPct: finiteOr(
      fraction(maybe(stats, "defensiveReboundPct")),
      base.defensiveReboundPct
    ),
    reboundPct: finiteOr(
      fraction(maybe(stats, "reboundPct")),
      base.reboundPct
    ),
    stealPct: finiteOr(fraction(maybe(stats, "stealPct")), base.stealPct),
    blockPct: finiteOr(fraction(maybe(stats, "blockPct")), base.blockPct),
    pie: finiteOr(
      fraction(maybe(stats, "playerImpactEstimate", "pie")),
      base.pie
    ),
    ...(ts != null ? { trueShootingPct: ts } : {}),
    ...(efg != null ? { effectiveFieldGoalPct: efg } : {}),
    ...(usage != null ? { usagePct: usage } : {}),
    ...(offensiveRating != null ? { offensiveRating } : {}),
  };
}

export function transformCompleteEspnTeamTotals(
  row: EspnTeamStatsRow,
  schemaCategories: EspnStatCategorySchema[] = []
): TeamSeasonTotals {
  const stats = completeCategoryMap(row.categories, schemaCategories);
  return {
    teamId: String(row.team.id),
    abbreviation: row.team.abbreviation,
    fullName: row.team.displayName,
    gamesPlayed: finiteOr(maybe(stats, "gamesPlayed")),
    fieldGoalsAttempted: finiteOr(maybe(stats, "fieldGoalsAttempted")),
    freeThrowsAttempted: finiteOr(maybe(stats, "freeThrowsAttempted")),
    turnovers: finiteOr(maybe(stats, "turnovers")),
    points: finiteOr(maybe(stats, "points")),
  };
}

function careerMap(category: EspnCareerCategory | undefined): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  if (!category?.statistics?.length) return out;
  const names = category.names ?? [];
  for (const row of category.statistics) {
    const map = new Map<string, number>();
    names.forEach((name, index) => setNamedValue(map, name, row.stats[index]));
    out.set(careerRowKey(row), map);
  }
  return out;
}

function careerRowKey(row: EspnCareerStatRow): string {
  const season = canonicalSeasonFromEspnYear(row.season.year);
  return `${season}:${row.teamId ?? row.teamSlug ?? ""}`;
}

function careerPair(
  totals: Map<string, number> | undefined,
  averages: Map<string, number> | undefined,
  totalMade: string[],
  totalAttempted: string[],
  averageMade: string[],
  averageAttempted: string[],
  gamesPlayed: number,
  fallbackMade: number,
  fallbackAttempted: number
): [number, number] {
  const made = totals ? maybe(totals, ...totalMade) : undefined;
  const attempted = totals ? maybe(totals, ...totalAttempted) : undefined;
  if (made != null && attempted != null) return [made, attempted];

  const avgMade = averages ? maybe(averages, ...averageMade) : undefined;
  const avgAttempted = averages ? maybe(averages, ...averageAttempted) : undefined;
  if (
    avgMade != null &&
    avgAttempted != null &&
    Number.isFinite(gamesPlayed) &&
    gamesPlayed > 0
  ) {
    return [avgMade * gamesPlayed, avgAttempted * gamesPlayed];
  }
  return [finiteOr(fallbackMade), finiteOr(fallbackAttempted)];
}

function careerSourceKey(row: PlayerSeason): string {
  return `${row.season}:${row.teamId}`;
}

/** Restore the shooting/counting totals omitted by the legacy ESPN career adapter. */
export function transformCompleteEspnAthleteCareerStats(
  playerId: string,
  playerName: string,
  payload: EspnAthleteCareerStatsResponse
): PlayerSeason[] {
  const rows = transformEspnAthleteCareerStats(playerId, playerName, payload);
  const totalsByKey = careerMap(
    payload.categories?.find((category) => category.name === "totals")
  );
  const averagesByKey = careerMap(
    payload.categories?.find((category) => category.name === "averages")
  );

  return rows.map((row) => {
    const key = careerSourceKey(row);
    const totals = totalsByKey.get(key);
    const averages = averagesByKey.get(key);
    const gamesPlayed = row.gamesPlayed;
    const [fieldGoalsMade, fieldGoalsAttempted] = careerPair(
      totals,
      averages,
      ["fieldGoalsMade"],
      ["fieldGoalsAttempted"],
      ["avgFieldGoalsMade"],
      ["avgFieldGoalsAttempted"],
      gamesPlayed,
      row.fieldGoalsMade,
      row.fieldGoalsAttempted
    );
    const [threePointersMade, threePointersAttempted] = careerPair(
      totals,
      averages,
      ["threePointFieldGoalsMade", "threePointersMade"],
      ["threePointFieldGoalsAttempted", "threePointersAttempted"],
      ["avgThreePointFieldGoalsMade", "avgThreePointersMade"],
      ["avgThreePointFieldGoalsAttempted", "avgThreePointersAttempted"],
      gamesPlayed,
      row.threePointersMade,
      row.threePointersAttempted
    );
    const [freeThrowsMade, freeThrowsAttempted] = careerPair(
      totals,
      averages,
      ["freeThrowsMade"],
      ["freeThrowsAttempted"],
      ["avgFreeThrowsMade"],
      ["avgFreeThrowsAttempted"],
      gamesPlayed,
      row.freeThrowsMade,
      row.freeThrowsAttempted
    );

    const total = (keys: string[], averageKeys: string[], fallback: number) => {
      const direct = totals ? maybe(totals, ...keys) : undefined;
      if (direct != null) return direct;
      const average = averages ? maybe(averages, ...averageKeys) : undefined;
      if (average != null && gamesPlayed > 0) return average * gamesPlayed;
      return finiteOr(fallback);
    };

    const offensiveRebounds = total(
      ["offensiveRebounds"],
      ["avgOffensiveRebounds"],
      row.offensiveRebounds
    );
    const defensiveRebounds = total(
      ["defensiveRebounds"],
      ["avgDefensiveRebounds"],
      row.defensiveRebounds
    );
    const personalFouls = total(
      ["fouls", "personalFouls"],
      ["avgFouls", "avgPersonalFouls"],
      row.personalFouls
    );
    const gamesStarted = finiteOr(
      totals ? maybe(totals, "gamesStarted") : undefined,
      averages ? maybe(averages, "gamesStarted") : undefined,
      row.gamesStarted
    );
    const efg = effectiveFieldGoalPct(
      fieldGoalsMade,
      threePointersMade,
      fieldGoalsAttempted
    );
    const ts = trueShootingPct(row.points, fieldGoalsAttempted, freeThrowsAttempted);

    return {
      ...row,
      gamesStarted,
      fieldGoalsMade,
      fieldGoalsAttempted,
      threePointersMade,
      threePointersAttempted,
      freeThrowsMade,
      freeThrowsAttempted,
      offensiveRebounds,
      defensiveRebounds,
      personalFouls,
      fieldGoalPct:
        fieldGoalsAttempted > 0
          ? fieldGoalsMade / fieldGoalsAttempted
          : row.fieldGoalPct,
      twoPointPct: finiteOr(
        twoPointPct(
          fieldGoalsMade,
          threePointersMade,
          fieldGoalsAttempted,
          threePointersAttempted
        ),
        row.twoPointPct
      ),
      threePointPct:
        threePointersAttempted > 0
          ? threePointersMade / threePointersAttempted
          : row.threePointPct,
      freeThrowPct:
        freeThrowsAttempted > 0
          ? freeThrowsMade / freeThrowsAttempted
          : row.freeThrowPct,
      threePointAttemptRate: finiteOr(
        threePointAttemptRate(threePointersAttempted, fieldGoalsAttempted),
        row.threePointAttemptRate
      ),
      freeThrowRate: finiteOr(
        freeThrowRate(freeThrowsAttempted, fieldGoalsAttempted),
        row.freeThrowRate
      ),
      turnoverPct: finiteOr(
        turnoverPct(row.turnovers, fieldGoalsAttempted, freeThrowsAttempted),
        row.turnoverPct
      ),
      ...(efg != null ? { effectiveFieldGoalPct: efg } : {}),
      ...(ts != null ? { trueShootingPct: ts } : {}),
    };
  });
}

/**
 * Merge two rows without treating zero as missing. `preferred` owns identity;
 * every non-finite number may be filled from `fallback`.
 */
export function mergePlayerSeasonRows(
  preferred: PlayerSeason,
  fallback: PlayerSeason | null | undefined
): PlayerSeason {
  if (!fallback) return preferred;
  const merged: Record<string, unknown> = { ...fallback, ...preferred };
  const keys = new Set([...Object.keys(fallback), ...Object.keys(preferred)]);

  for (const key of keys) {
    const primary = (preferred as unknown as Record<string, unknown>)[key];
    const secondary = (fallback as unknown as Record<string, unknown>)[key];
    if (typeof primary === "number" || typeof secondary === "number") {
      if (typeof primary === "number" && Number.isFinite(primary)) {
        merged[key] = primary;
      } else if (typeof secondary === "number" && Number.isFinite(secondary)) {
        merged[key] = secondary;
      } else {
        merged[key] = primary ?? secondary;
      }
    }
  }

  merged.playerId = preferred.playerId;
  merged.playerName = preferred.playerName || fallback.playerName;
  merged.season = preferred.season;
  merged.teamId = preferred.teamId || fallback.teamId;
  merged.teamName =
    preferred.teamName && preferred.teamName !== "Unknown"
      ? preferred.teamName
      : fallback.teamName;
  merged.teamAbbreviation =
    preferred.teamAbbreviation ?? fallback.teamAbbreviation;
  merged.position = preferred.position ?? fallback.position;
  return merged as unknown as PlayerSeason;
}
