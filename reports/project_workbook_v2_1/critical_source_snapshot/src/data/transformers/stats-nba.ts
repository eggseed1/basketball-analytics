import type { Player, PlayerSeason, Position, TeamSeason } from "@/data/types";
import type { BrefAdvancedRow } from "@/data/providers/nba/bref-scraper";
import type { DarkoPlayerRow } from "@/data/providers/nba/darko-scraper";
import type { DrblPlayerRow } from "@/data/providers/nba/drbl-loader";
import {
  freeThrowRate,
  safePct,
  threePointAttemptRate,
  turnoverPct,
  twoPointPct,
} from "@/data/providers/nba/compute-advanced";
import { NBA_TEAM_META } from "@/data/providers/nba/nba-team-meta";
import { getCanonicalTeamFromProvider } from "@/data/identity/team-map";

function n(row: Record<string, string | number | null>, key: string): number {
  const value = row[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function s(row: Record<string, string | number | null>, key: string): string {
  const value = row[key];
  return value == null ? "" : String(value);
}

/** Multi-team aggregate abbreviations from NBA Stats / BRef. */
const MULTI_TEAM_ABBRS = new Set(["TOT", "2TM", "3TM", "4TM"]);

/**
 * Normalize NBA Stats TEAM_ID → canonical ESPN product id at the transform
 * boundary. Preserves provider provenance; never invents a franchise for TOT.
 */
export function normalizeNbaPlayerSeasonTeam(input: {
  teamId: string;
  teamAbbreviation?: string;
}): {
  teamId: string;
  teamName: string;
  teamAbbreviation?: string;
  teamIdProvider: "nba";
  providerTeamId?: string;
  nbaTeamId?: string;
} {
  const providerTeamId = String(input.teamId ?? "").trim();
  const abbr = (input.teamAbbreviation ?? "").trim().toUpperCase();

  if (MULTI_TEAM_ABBRS.has(abbr) || providerTeamId === "0" || !providerTeamId) {
    return {
      teamId: "TOT",
      teamName: abbr || "TOT",
      teamAbbreviation: abbr || "TOT",
      teamIdProvider: "nba",
      providerTeamId: providerTeamId || undefined,
      nbaTeamId: providerTeamId || undefined,
    };
  }

  const canonical = getCanonicalTeamFromProvider("nba", providerTeamId);
  if (canonical) {
    return {
      teamId: canonical.canonicalTeamId,
      teamName: canonical.displayName,
      teamAbbreviation: canonical.abbr,
      teamIdProvider: "nba",
      providerTeamId,
      nbaTeamId: providerTeamId,
    };
  }

  // Unresolved NBA id — keep provenance; do not invent ESPN/BDL mapping.
  const meta = NBA_TEAM_META[providerTeamId];
  return {
    teamId: providerTeamId,
    teamName: meta?.fullName || abbr || "Unknown",
    teamAbbreviation: meta?.abbreviation ?? (abbr || undefined),
    teamIdProvider: "nba",
    providerTeamId,
    nbaTeamId: providerTeamId,
  };
}

function mapPosition(raw?: string): Position | undefined {
  if (!raw) return undefined;
  const key = raw.toUpperCase();
  if (key === "PG" || key === "SG" || key === "SF" || key === "PF" || key === "C") {
    return key;
  }
  if (key.includes("G") && key.includes("F")) return "SF";
  if (key.startsWith("G")) return "SG";
  if (key.startsWith("F")) return "SF";
  if (key.startsWith("C")) return "C";
  return undefined;
}

function pctMaybeFraction(value: number): number {
  if (value > 1) return value / 100;
  return value;
}

/**
 * Merge stats.nba.com Base (Totals) + Advanced with optional BRef + DARKO + DRBL.
 */
export function transformStatsNbaPlayerSeason(
  base: Record<string, string | number | null>,
  advanced: Record<string, string | number | null> | undefined,
  season: string,
  bref?: BrefAdvancedRow,
  darko?: DarkoPlayerRow,
  drbl?: DrblPlayerRow
): PlayerSeason {
  const playerId = String(base.PLAYER_ID ?? "");
  const playerName = s(base, "PLAYER_NAME");
  const team = normalizeNbaPlayerSeasonTeam({
    teamId: String(base.TEAM_ID ?? ""),
    teamAbbreviation: s(base, "TEAM_ABBREVIATION"),
  });

  const fgm = n(base, "FGM");
  const fga = n(base, "FGA");
  const tpm = n(base, "FG3M");
  const tpa = n(base, "FG3A");
  const ftm = n(base, "FTM");
  const fta = n(base, "FTA");
  const tov = n(base, "TOV");
  const points = n(base, "PTS");
  const minutes = n(base, "MIN");
  const gamesPlayed = n(base, "GP");

  const tsFromNba = advanced ? n(advanced, "TS_PCT") : 0;
  const efgFromNba = advanced ? n(advanced, "EFG_PCT") : 0;
  const usgFromNba = advanced ? n(advanced, "USG_PCT") : 0;

  return {
    playerId,
    playerName,
    teamId: team.teamId,
    teamName: team.teamName,
    teamAbbreviation: team.teamAbbreviation,
    teamIdProvider: team.teamIdProvider,
    providerTeamId: team.providerTeamId,
    nbaTeamId: team.nbaTeamId,
    season,
    position: mapPosition(bref?.position),
    age: n(base, "AGE") || undefined,
    gamesPlayed,
    gamesStarted: bref?.gamesStarted ?? gamesPlayed,
    minutes,
    fieldGoalsMade: fgm,
    fieldGoalsAttempted: fga,
    threePointersMade: tpm,
    threePointersAttempted: tpa,
    freeThrowsMade: ftm,
    freeThrowsAttempted: fta,
    offensiveRebounds: n(base, "OREB"),
    defensiveRebounds: n(base, "DREB"),
    rebounds: n(base, "REB"),
    assists: n(base, "AST"),
    steals: n(base, "STL"),
    blocks: n(base, "BLK"),
    turnovers: tov,
    personalFouls: n(base, "PF"),
    points,
    plusMinus: n(base, "PLUS_MINUS"),
    fieldGoalPct: n(base, "FG_PCT") || safePct(fgm, fga),
    twoPointPct: twoPointPct(fgm, tpm, fga, tpa),
    threePointPct: n(base, "FG3_PCT") || safePct(tpm, tpa),
    freeThrowPct: n(base, "FT_PCT") || safePct(ftm, fta),
    effectiveFieldGoalPct:
      efgFromNba ||
      (fga > 0 ? (fgm + 0.5 * tpm) / fga : 0) ||
      0,
    trueShootingPct:
      tsFromNba ||
      (points > 0 && fga + fta > 0
        ? points / (2 * (fga + 0.44 * fta))
        : 0) ||
      bref?.trueShootingPct ||
      0,
    threePointAttemptRate:
      bref?.threePointAttemptRate || threePointAttemptRate(tpa, fga),
    freeThrowRate: bref?.freeThrowRate || freeThrowRate(fta, fga),
    turnoverPct:
      bref?.turnoverPct ||
      (advanced ? pctMaybeFraction(n(advanced, "E_TOV_PCT") || n(advanced, "TM_TOV_PCT")) : 0) ||
      turnoverPct(tov, fga, fta) ||
      0,
    usagePct: usgFromNba || bref?.usagePct,
    assistPct: advanced
      ? n(advanced, "AST_PCT")
      : bref?.assistPct ?? 0,
    offensiveReboundPct: advanced
      ? n(advanced, "OREB_PCT")
      : bref?.offensiveReboundPct ?? 0,
    defensiveReboundPct: advanced
      ? n(advanced, "DREB_PCT")
      : bref?.defensiveReboundPct ?? 0,
    reboundPct: advanced
      ? n(advanced, "REB_PCT")
      : bref?.reboundPct ?? 0,
    stealPct: bref?.stealPct ?? 0,
    blockPct: bref?.blockPct ?? 0,
    pie: advanced ? n(advanced, "PIE") : 0,
    offensiveRating: advanced ? n(advanced, "OFF_RATING") : 0,
    defensiveRating: advanced ? n(advanced, "DEF_RATING") : 0,
    netRating: advanced ? n(advanced, "NET_RATING") : 0,
    per: bref?.per ?? 0,
    ows: bref?.ows ?? 0,
    dws: bref?.dws ?? 0,
    winShares: bref?.winShares ?? 0,
    winSharesPer48: bref?.winSharesPer48 ?? 0,
    obpm: bref?.obpm ?? 0,
    dbpm: bref?.dbpm ?? 0,
    bpm: bref?.bpm ?? 0,
    vorp: bref?.vorp ?? 0,
    dpm: darko?.dpm ?? 0,
    oDpm: darko?.oDpm ?? 0,
    dDpm: darko?.dDpm ?? 0,
    boxDpm: darko?.boxDpm ?? 0,
    onOffDpm: darko?.onOffDpm ?? 0,
    drbl100: drbl?.drbl100 ?? 0,
    rawAbilityRate: drbl?.rawAbilityRate,
    drblPossessions:
      drbl?.actualPossessions ?? drbl?.possessions ?? undefined,
    abilityModelVersion: (drbl as { abilityModelVersion?: string } | undefined)
      ?.abilityModelVersion,
    drblRank: drbl?.rank,
    drblP: drbl?.drblP ?? 0,
    drblLn: drbl?.drblLn ?? 0,
    drblB: drbl?.drblB ?? 0,
    drblO: drbl?.drblO ?? 0,
    drblD: drbl?.drblD ?? 0,
    sdv100: drbl?.sdv100 ?? 0,
    shotMaking100: drbl?.shotMaking100 ?? 0,
    epvShootMean: drbl?.epvShootMean ?? 0,
    vContMean: drbl?.vContMean ?? 0,
    r1Points:
      drbl?.r1Points != null && Number.isFinite(drbl.r1Points)
        ? drbl.r1Points
        : null,
    r1WinEquivalents:
      drbl?.r1WinEquivalents != null && Number.isFinite(drbl.r1WinEquivalents)
        ? drbl.r1WinEquivalents
        : null,
    r1PointValueVersion: drbl?.r1PointValueVersion ?? null,
    r1WinEquivalentVersion: drbl?.r1WinEquivalentVersion ?? null,
    drblWar: drbl?.drblWar ?? 0,
    drblSeasonalImpact: drbl?.seasonalImpact ?? 0,
    drblL: drbl?.drblL ?? 0,
    drblMeanLeverage: drbl?.meanLeverage ?? 0,
    drblDisagreement: drbl?.disagreement ?? 0,
    drblUncertainty: drbl?.uncertainty ?? 0,
    drblIntervalLo: drbl?.intervalLo ?? 0,
    drblIntervalHi: drbl?.intervalHi ?? 0,
  };
}

/**
 * Identity from stats.nba.com commonplayerinfo (works for retired players).
 */
export function transformStatsNbaCommonPlayerInfo(
  row: Record<string, string | number | null>
): Player | null {
  const id = String(row.PERSON_ID ?? row.PLAYER_ID ?? "");
  if (!id) return null;
  const fullName =
    s(row, "DISPLAY_FIRST_LAST") ||
    [s(row, "FIRST_NAME"), s(row, "LAST_NAME")].filter(Boolean).join(" ") ||
    `Player ${id}`;
  const firstName = s(row, "FIRST_NAME") || fullName.split(" ")[0] || fullName;
  const lastName =
    s(row, "LAST_NAME") || fullName.split(" ").slice(1).join(" ") || fullName;
  const height = parseHeightInches(s(row, "HEIGHT"));
  const weight = n(row, "WEIGHT") || undefined;
  const birth = s(row, "BIRTHDATE").slice(0, 10) || undefined;
  const rawTeamId = String(row.TEAM_ID ?? "");
  const team =
    rawTeamId && rawTeamId !== "0"
      ? normalizeNbaPlayerSeasonTeam({ teamId: rawTeamId })
      : null;
  return {
    id,
    fullName,
    firstName,
    lastName,
    position: mapPosition(s(row, "POSITION") || s(row, "POSITION_ABBREVIATION")),
    birthDate: birth && birth !== "0000-00-00" ? birth : undefined,
    heightInches: height,
    weightLbs: weight,
    currentTeamId: team?.teamId,
  };
}

function parseHeightInches(raw: string): number | undefined {
  if (!raw) return undefined;
  const match = /^(\d+)-(\d+)$/.exec(raw.trim());
  if (!match) return undefined;
  return Number(match[1]) * 12 + Number(match[2]);
}

export function transformStatsNbaCareerTotalsRow(
  row: Record<string, string | number | null>,
  playerName: string,
  season: string
): PlayerSeason {
  const fgm = n(row, "FGM");
  const fga = n(row, "FGA");
  const tpm = n(row, "FG3M");
  const tpa = n(row, "FG3A");
  const ftm = n(row, "FTM");
  const fta = n(row, "FTA");
  const tov = n(row, "TOV");
  const points = n(row, "PTS");

  const team = normalizeNbaPlayerSeasonTeam({
    teamId: String(row.TEAM_ID ?? ""),
    teamAbbreviation: s(row, "TEAM_ABBREVIATION"),
  });

  return {
    playerId: String(row.PLAYER_ID ?? ""),
    playerName,
    teamId: team.teamId,
    teamName: team.teamName,
    teamAbbreviation: team.teamAbbreviation,
    teamIdProvider: team.teamIdProvider,
    providerTeamId: team.providerTeamId,
    nbaTeamId: team.nbaTeamId,
    season,
    age: n(row, "PLAYER_AGE") || undefined,
    gamesPlayed: n(row, "GP"),
    gamesStarted: n(row, "GS"),
    minutes: n(row, "MIN"),
    fieldGoalsMade: fgm,
    fieldGoalsAttempted: fga,
    threePointersMade: tpm,
    threePointersAttempted: tpa,
    freeThrowsMade: ftm,
    freeThrowsAttempted: fta,
    offensiveRebounds: n(row, "OREB"),
    defensiveRebounds: n(row, "DREB"),
    rebounds: n(row, "REB"),
    assists: n(row, "AST"),
    steals: n(row, "STL"),
    blocks: n(row, "BLK"),
    turnovers: tov,
    personalFouls: n(row, "PF"),
    points,
    plusMinus: 0,
    fieldGoalPct: n(row, "FG_PCT") || safePct(fgm, fga),
    twoPointPct: twoPointPct(fgm, tpm, fga, tpa),
    threePointPct: n(row, "FG3_PCT") || safePct(tpm, tpa),
    freeThrowPct: n(row, "FT_PCT") || safePct(ftm, fta),
    effectiveFieldGoalPct: fga > 0 ? (fgm + 0.5 * tpm) / fga : undefined,
    trueShootingPct:
      points > 0 && fga + fta > 0
        ? points / (2 * (fga + 0.44 * fta))
        : undefined,
    threePointAttemptRate: threePointAttemptRate(tpa, fga),
    freeThrowRate: freeThrowRate(fta, fga),
    turnoverPct: turnoverPct(tov, fga, fta) ?? 0,
    usagePct: undefined,
    assistPct: 0,
    offensiveReboundPct: 0,
    defensiveReboundPct: 0,
    reboundPct: 0,
    stealPct: 0,
    blockPct: 0,
    pie: 0,
    offensiveRating: undefined,
    defensiveRating: undefined,
    netRating: undefined,
    per: 0,
    ows: 0,
    dws: 0,
    winShares: 0,
    winSharesPer48: 0,
    obpm: 0,
    dbpm: 0,
    bpm: 0,
    vorp: 0,
    dpm: 0,
    oDpm: 0,
    dDpm: 0,
    boxDpm: 0,
    onOffDpm: 0,
    drbl100: 0,
    r1Points: null,
    r1WinEquivalents: null,
    drblP: 0,
    drblLn: 0,
    drblB: 0,
    drblO: 0,
    drblD: 0,
    sdv100: 0,
    shotMaking100: 0,
    epvShootMean: 0,
    vContMean: 0,
    drblWar: 0,
    drblSeasonalImpact: 0,
    drblL: 0,
    drblMeanLeverage: 0,
    drblDisagreement: 0,
    drblUncertainty: 0,
    drblIntervalLo: 0,
    drblIntervalHi: 0,
  };
}

/**
 * Merge stats.nba.com team Base (PerGame) + Advanced into TeamSeason.
 */
export function transformStatsNbaTeamSeason(
  base: Record<string, string | number | null>,
  advanced: Record<string, string | number | null> | undefined,
  season: string
): TeamSeason {
  const providerTeamId = String(base.TEAM_ID ?? "");
  const canonical = getCanonicalTeamFromProvider("nba", providerTeamId);
  const meta = NBA_TEAM_META[providerTeamId];
  const teamId = canonical?.canonicalTeamId ?? providerTeamId;
  const teamName =
    s(base, "TEAM_NAME") || canonical?.displayName || meta?.fullName || "Unknown";
  const abbr =
    canonical?.abbr ?? meta?.abbreviation ?? "UNK";

  return {
    teamId,
    teamName,
    teamAbbreviation: abbr,
    season,
    conference: meta?.conference,
    division: meta?.division,
    gamesPlayed: n(base, "GP"),
    wins: n(base, "W"),
    losses: n(base, "L"),
    winPct: n(base, "W_PCT"),
    pointsPerGame: n(base, "PTS"),
    assistsPerGame: n(base, "AST"),
    reboundsPerGame: n(base, "REB"),
    offensiveReboundsPerGame: n(base, "OREB"),
    defensiveReboundsPerGame: n(base, "DREB"),
    stealsPerGame: n(base, "STL"),
    blocksPerGame: n(base, "BLK"),
    turnoversPerGame: n(base, "TOV"),
    fieldGoalsMadePerGame: n(base, "FGM"),
    fieldGoalsAttemptedPerGame: n(base, "FGA"),
    threePointersMadePerGame: n(base, "FG3M"),
    threePointersAttemptedPerGame: n(base, "FG3A"),
    freeThrowsMadePerGame: n(base, "FTM"),
    freeThrowsAttemptedPerGame: n(base, "FTA"),
    fieldGoalPct: n(base, "FG_PCT"),
    threePointPct: n(base, "FG3_PCT"),
    freeThrowPct: n(base, "FT_PCT"),
    effectiveFieldGoalPct: advanced
      ? pctMaybeFraction(n(advanced, "EFG_PCT"))
      : 0,
    trueShootingPct: advanced
      ? pctMaybeFraction(n(advanced, "TS_PCT"))
      : 0,
    offensiveRating: advanced ? n(advanced, "OFF_RATING") : 0,
    defensiveRating: advanced ? n(advanced, "DEF_RATING") : 0,
    netRating: advanced ? n(advanced, "NET_RATING") : 0,
    pace: advanced ? n(advanced, "PACE") : 0,
    assistPct: advanced ? pctMaybeFraction(n(advanced, "AST_PCT")) : 0,
    turnoverPct: advanced ? pctMaybeFraction(n(advanced, "TM_TOV_PCT")) : 0,
    offensiveReboundPct: advanced
      ? pctMaybeFraction(n(advanced, "OREB_PCT"))
      : 0,
    defensiveReboundPct: advanced
      ? pctMaybeFraction(n(advanced, "DREB_PCT"))
      : 0,
    reboundPct: advanced ? pctMaybeFraction(n(advanced, "REB_PCT")) : 0,
    pie: advanced ? pctMaybeFraction(n(advanced, "PIE")) : 0,
    plusMinus: n(base, "PLUS_MINUS"),
  };
}
