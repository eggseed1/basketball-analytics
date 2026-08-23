import { isCareerQualifyingSeason, peakCareerSeason } from "@/analytics";
import type { PlayerSeason } from "@/data/types";
import { hasValidDrblEstimate } from "@/data/queries/percentiles";
import {
  cardStintsForSeason,
  isMultiTeamSeasonRow,
  isRetiredPlayerCareer,
  primaryTeamForSeason as primaryTeamForSeasonContext,
} from "@/lib/player-team-context";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";

/** Resolve selected season from URL, or a smart default. */
export function resolvePlayerSeason(
  career: PlayerSeason[],
  seasonParam?: string | null,
  historySeasons?: string[],
  options?: {
    /**
     * For retired / inactive careers, default to Career Resume peak season
     * instead of the most recent (often decline) year.
     */
    preferPeakWhenHistorical?: boolean;
    nowSeason?: string;
    isActive?: boolean | null;
  }
): string {
  if (seasonParam) return seasonParam;
  const seasons = [
    ...new Set([
      ...career.map((row) => row.season),
      ...(historySeasons ?? []),
    ]),
  ].sort((a, b) => b.localeCompare(a));
  const latest = seasons[0];
  const nowSeason =
    options?.nowSeason ??
    canonicalSeasonFromStartYear(currentNbaStartYear());

  if (options?.preferPeakWhenHistorical !== false && career.length > 0) {
    const historical = isRetiredPlayerCareer({
      lastSeason: latest,
      nowSeason,
      isActive: options?.isActive,
      hasCurrentSeasonGames: career.some(
        (row) => row.season === nowSeason && row.gamesPlayed > 0
      ),
    });
    if (historical) {
      const peak = peakCareerSeason(career);
      if (peak) return peak;
    }
  }

  return latest ?? "2024-25";
}

/**
 * Primary team row for a season.
 * Prefer multi-team aggregate (TOT) when present; else max GP stint.
 */
export function primaryTeamForSeason(
  career: PlayerSeason[],
  season: string
): PlayerSeason | null {
  return primaryTeamForSeasonContext(career, season);
}

/** Prefer peer (valid DRBL) then career when seasonRaw lacks a valid estimate. */
function pickAbilitySource(
  seasonRaw: PlayerSeason | null,
  peerRow: PlayerSeason | null | undefined,
  careerSeason: PlayerSeason | null | undefined
): PlayerSeason | null {
  if (seasonRaw && hasValidDrblEstimate(seasonRaw)) return seasonRaw;
  if (peerRow && hasValidDrblEstimate(peerRow)) return peerRow;
  if (careerSeason && hasValidDrblEstimate(careerSeason)) return careerSeason;
  return seasonRaw ?? peerRow ?? careerSeason ?? null;
}

/** Never invent zeros for R1* — keep null when all sources are missing. */
function pickR1Number(
  ...vals: Array<number | null | undefined>
): number | null {
  for (const v of vals) {
    if (v != null && Number.isFinite(v)) return v;
  }
  return null;
}

function pickR1Version(
  ...vals: Array<string | null | undefined>
): string | null {
  for (const v of vals) {
    if (v != null && String(v).trim()) return v;
  }
  return null;
}

/** Merge season raw + career + peer overlays (USG / impact / DRBL). */
export function mergePlayerSeasonStats(
  seasonRaw: PlayerSeason | null,
  careerSeason: PlayerSeason | null | undefined,
  peerRow: PlayerSeason | null | undefined
): PlayerSeason | null {
  if (seasonRaw) {
    const ability = pickAbilitySource(seasonRaw, peerRow, careerSeason);
    return {
      ...seasonRaw,
      usagePct:
        seasonRaw.usagePct != null && seasonRaw.usagePct > 0
          ? seasonRaw.usagePct
          : peerRow?.usagePct != null && peerRow.usagePct > 0
            ? peerRow.usagePct
            : careerSeason?.usagePct != null && careerSeason.usagePct > 0
              ? careerSeason.usagePct
              : seasonRaw.usagePct,
      darkoDpm:
        seasonRaw.darkoDpm ?? careerSeason?.darkoDpm ?? peerRow?.darkoDpm,
      darkoOff:
        seasonRaw.darkoOff ?? careerSeason?.darkoOff ?? peerRow?.darkoOff,
      darkoDef:
        seasonRaw.darkoDef ?? careerSeason?.darkoDef ?? peerRow?.darkoDef,
      lebron: seasonRaw.lebron ?? careerSeason?.lebron ?? peerRow?.lebron,
      oLebron:
        seasonRaw.oLebron ?? careerSeason?.oLebron ?? peerRow?.oLebron,
      dLebron:
        seasonRaw.dLebron ?? careerSeason?.dLebron ?? peerRow?.dLebron,
      winsAdded:
        seasonRaw.winsAdded ??
        careerSeason?.winsAdded ??
        peerRow?.winsAdded,
      // Ability / rate fields — peer overlay when seasonRaw lacks valid DRBL.
      drbl100: ability?.drbl100 ?? seasonRaw.drbl100,
      rawAbilityRate: ability?.rawAbilityRate ?? seasonRaw.rawAbilityRate,
      drblPossessions: ability?.drblPossessions ?? seasonRaw.drblPossessions,
      abilityModelVersion:
        ability?.abilityModelVersion ?? seasonRaw.abilityModelVersion,
      drblRank: ability?.drblRank ?? seasonRaw.drblRank,
      drblP: ability?.drblP ?? seasonRaw.drblP,
      drblLn: ability?.drblLn ?? seasonRaw.drblLn,
      drblB: ability?.drblB ?? seasonRaw.drblB,
      drblO: ability?.drblO ?? seasonRaw.drblO,
      drblD: ability?.drblD ?? seasonRaw.drblD,
      sdv100: ability?.sdv100 ?? seasonRaw.sdv100,
      shotMaking100: ability?.shotMaking100 ?? seasonRaw.shotMaking100,
      epvShootMean: ability?.epvShootMean ?? seasonRaw.epvShootMean,
      vContMean: ability?.vContMean ?? seasonRaw.vContMean,
      // Realized value — never invent zeros.
      r1Points: pickR1Number(
        seasonRaw.r1Points,
        peerRow?.r1Points,
        careerSeason?.r1Points
      ),
      r1WinEquivalents: pickR1Number(
        seasonRaw.r1WinEquivalents,
        peerRow?.r1WinEquivalents,
        careerSeason?.r1WinEquivalents
      ),
      r1PointValueVersion: pickR1Version(
        seasonRaw.r1PointValueVersion,
        peerRow?.r1PointValueVersion,
        careerSeason?.r1PointValueVersion
      ),
      r1WinEquivalentVersion: pickR1Version(
        seasonRaw.r1WinEquivalentVersion,
        peerRow?.r1WinEquivalentVersion,
        careerSeason?.r1WinEquivalentVersion
      ),
    };
  }
  // Prefer peer then career when seasonRaw missing.
  return peerRow ?? careerSeason ?? null;
}

/** Mean PPG / TS / USG over resume-qualifying seasons only. */
export function careerSeasonAverages(career: PlayerSeason[]): {
  ppg: number;
  ts: number | null;
  usg: number | null;
} | null {
  const rows = career.filter(isCareerQualifyingSeason);
  if (!rows.length) return null;
  let ppg = 0;
  let tsSum = 0;
  let tsN = 0;
  let usgSum = 0;
  let usgN = 0;
  for (const r of rows) {
    ppg += r.points / Math.max(1, r.gamesPlayed);
    if (
      r.trueShootingPct != null &&
      Number.isFinite(r.trueShootingPct) &&
      r.trueShootingPct > 0
    ) {
      tsSum += r.trueShootingPct;
      tsN += 1;
    }
    if (r.usagePct != null && Number.isFinite(r.usagePct) && r.usagePct > 0) {
      usgSum += r.usagePct;
      usgN += 1;
    }
  }
  return {
    ppg: ppg / rows.length,
    ts: tsN > 0 ? tsSum / tsN : null,
    usg: usgN > 0 ? usgSum / usgN : null,
  };
}

export function buildSeasonTeamKeysMap(
  career: PlayerSeason[]
): Record<string, string[]> {
  const seasonTeamKeys: Record<string, string[]> = {};
  const seasons = [...new Set(career.map((row) => row.season))];
  for (const season of seasons) {
    seasonTeamKeys[season] = cardStintsForSeason(career, season).map(
      (stint) => stint.teamKey
    );
  }
  return seasonTeamKeys;
}

/**
 * Primary team id per season for timeline / chip theming.
 * Multi-team seasons map to `TOT` so chips stay NEUTRAL (no franchise color).
 */
export function buildSeasonTeamsMap(
  career: PlayerSeason[]
): Record<string, string> {
  const seasonTeams: Record<string, string> = {};
  const seasons = [...new Set(career.map((row) => row.season))];
  for (const season of seasons) {
    const primary = primaryTeamForSeasonContext(career, season);
    if (!primary) continue;
    seasonTeams[season] = isMultiTeamSeasonRow(primary)
      ? "TOT"
      : primary.teamId;
  }
  return seasonTeams;
}

/** Hannah depth-tab ids (legacy URL). Prefer P18 `view=` via player-page-contract. */
export type PlayerDepthTab = "career" | "stats" | "games" | "viz";
export type PlayerSeasonKind = "regular" | "playoffs";

export function parsePlayerDepthTab(
  raw?: string | null
): PlayerDepthTab {
  if (raw === "stats" || raw === "games" || raw === "viz") return raw;
  return "career";
}

export function parsePlayerSeasonKind(
  raw?: string | null
): PlayerSeasonKind {
  return raw === "playoffs" ? "playoffs" : "regular";
}

function historyParams(
  q: URLSearchParams,
  opts?: { fromHistory?: boolean; themeMode?: "historical" | "modern" }
) {
  if (!opts?.fromHistory) return;
  q.set("from", "history");
  q.set("theme", opts.themeMode === "modern" ? "modern" : "historical");
}

/**
 * Season chip href — preserves Time Machine arrival.
 * Accepts P18 `view` or Hannah `depth` (mapped for identity chips).
 */
export function playerSeasonChipHref(
  playerId: string,
  season: string,
  opts?: {
    fromHistory?: boolean;
    themeMode?: "historical" | "modern";
    view?: string;
    depth?: PlayerDepthTab;
    seasonType?: PlayerSeasonKind;
  }
): string {
  if (opts?.view || !opts?.depth) {
    const q = new URLSearchParams();
    q.set("season", season);
    if (opts?.view && opts.view !== "overview") q.set("view", opts.view);
    historyParams(q, opts);
    return `/players/${encodeURIComponent(playerId)}?${q.toString()}`;
  }
  return playerDepthHref(playerId, {
    season,
    depth: opts.depth,
    seasonType: opts.seasonType,
    fromHistory: opts.fromHistory,
    themeMode: opts.themeMode,
  });
}

/** Hannah-compatible depth href (kept for exact frontend ports). */
export function playerDepthHref(
  playerId: string,
  opts: {
    season: string;
    depth?: PlayerDepthTab;
    seasonType?: PlayerSeasonKind;
    compare?: string;
    fromHistory?: boolean;
    themeMode?: "historical" | "modern";
  }
): string {
  const q = new URLSearchParams();
  q.set("season", opts.season);
  if (opts.depth && opts.depth !== "career") q.set("depth", opts.depth);
  if (opts.seasonType && opts.seasonType !== "regular") {
    q.set("seasonType", opts.seasonType);
  }
  if (opts.compare) q.set("compare", opts.compare);
  historyParams(q, opts);
  return `/players/${encodeURIComponent(playerId)}?${q.toString()}`;
}
