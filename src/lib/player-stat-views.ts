import type { PlayerSeason } from "@/data/types";
import { formatMinutes, formatNumber, formatPct } from "@/lib/format";
import { per36, perGame } from "@/data/providers/nba/compute-advanced";
import { nbaTeamAbbr } from "@/data/providers/nba/nba-team-meta";

/** BRef-style table modes on the player page. */
export type BrefTableMode = "perGame" | "totals" | "per36" | "advanced";

export interface BrefColumn {
  key: string;
  label: string;
  align?: "left" | "right";
  format: (row: PlayerSeason) => string;
}

function twoMade(row: PlayerSeason): number {
  return row.fieldGoalsMade - row.threePointersMade;
}

function twoAttempted(row: PlayerSeason): number {
  return row.fieldGoalsAttempted - row.threePointersAttempted;
}

const identityCols: BrefColumn[] = [
  {
    key: "season",
    label: "Season",
    align: "left",
    format: (r) => r.season,
  },
  {
    key: "team",
    label: "Team",
    align: "left",
    format: (r) =>
      nbaTeamAbbr(r.teamId, r.teamAbbreviation) ||
      r.teamAbbreviation ||
      "-",
  },
  {
    key: "pos",
    label: "Pos",
    align: "left",
    format: (r) => r.position ?? "-",
  },
  {
    key: "g",
    label: "G",
    format: (r) => formatNumber(r.gamesPlayed),
  },
  {
    key: "gs",
    label: "GS",
    format: (r) => formatNumber(r.gamesStarted),
  },
];

export const BREF_PER_GAME_COLUMNS: BrefColumn[] = [
  ...identityCols,
  {
    key: "mp",
    label: "MP",
    format: (r) => formatNumber(perGame(r.minutes, r.gamesPlayed), 1),
  },
  {
    key: "fg",
    label: "FG",
    format: (r) => formatNumber(perGame(r.fieldGoalsMade, r.gamesPlayed), 1),
  },
  {
    key: "fga",
    label: "FGA",
    format: (r) =>
      formatNumber(perGame(r.fieldGoalsAttempted, r.gamesPlayed), 1),
  },
  {
    key: "fgPct",
    label: "FG%",
    format: (r) => formatPct(r.fieldGoalPct),
  },
  {
    key: "3p",
    label: "3P",
    format: (r) =>
      formatNumber(perGame(r.threePointersMade, r.gamesPlayed), 1),
  },
  {
    key: "3pa",
    label: "3PA",
    format: (r) =>
      formatNumber(perGame(r.threePointersAttempted, r.gamesPlayed), 1),
  },
  {
    key: "3pPct",
    label: "3P%",
    format: (r) => formatPct(r.threePointPct),
  },
  {
    key: "2p",
    label: "2P",
    format: (r) => formatNumber(perGame(twoMade(r), r.gamesPlayed), 1),
  },
  {
    key: "2pa",
    label: "2PA",
    format: (r) => formatNumber(perGame(twoAttempted(r), r.gamesPlayed), 1),
  },
  {
    key: "2pPct",
    label: "2P%",
    format: (r) => formatPct(r.twoPointPct),
  },
  {
    key: "efg",
    label: "eFG%",
    format: (r) => formatPct(r.effectiveFieldGoalPct ?? 0),
  },
  {
    key: "ft",
    label: "FT",
    format: (r) => formatNumber(perGame(r.freeThrowsMade, r.gamesPlayed), 1),
  },
  {
    key: "fta",
    label: "FTA",
    format: (r) =>
      formatNumber(perGame(r.freeThrowsAttempted, r.gamesPlayed), 1),
  },
  {
    key: "ftPct",
    label: "FT%",
    format: (r) => formatPct(r.freeThrowPct),
  },
  {
    key: "orb",
    label: "ORB",
    format: (r) =>
      formatNumber(perGame(r.offensiveRebounds, r.gamesPlayed), 1),
  },
  {
    key: "drb",
    label: "DRB",
    format: (r) =>
      formatNumber(perGame(r.defensiveRebounds, r.gamesPlayed), 1),
  },
  {
    key: "trb",
    label: "TRB",
    format: (r) => formatNumber(perGame(r.rebounds, r.gamesPlayed), 1),
  },
  {
    key: "ast",
    label: "AST",
    format: (r) => formatNumber(perGame(r.assists, r.gamesPlayed), 1),
  },
  {
    key: "stl",
    label: "STL",
    format: (r) => formatNumber(perGame(r.steals, r.gamesPlayed), 1),
  },
  {
    key: "blk",
    label: "BLK",
    format: (r) => formatNumber(perGame(r.blocks, r.gamesPlayed), 1),
  },
  {
    key: "tov",
    label: "TOV",
    format: (r) => formatNumber(perGame(r.turnovers, r.gamesPlayed), 1),
  },
  {
    key: "pf",
    label: "PF",
    format: (r) => formatNumber(perGame(r.personalFouls, r.gamesPlayed), 1),
  },
  {
    key: "pts",
    label: "PTS",
    format: (r) => formatNumber(perGame(r.points, r.gamesPlayed), 1),
  },
];

export const BREF_TOTALS_COLUMNS: BrefColumn[] = [
  ...identityCols,
  {
    key: "mp",
    label: "MP",
    format: (r) => formatMinutes(r.minutes),
  },
  {
    key: "fg",
    label: "FG",
    format: (r) => formatNumber(r.fieldGoalsMade),
  },
  {
    key: "fga",
    label: "FGA",
    format: (r) => formatNumber(r.fieldGoalsAttempted),
  },
  {
    key: "fgPct",
    label: "FG%",
    format: (r) => formatPct(r.fieldGoalPct),
  },
  {
    key: "3p",
    label: "3P",
    format: (r) => formatNumber(r.threePointersMade),
  },
  {
    key: "3pa",
    label: "3PA",
    format: (r) => formatNumber(r.threePointersAttempted),
  },
  {
    key: "3pPct",
    label: "3P%",
    format: (r) => formatPct(r.threePointPct),
  },
  {
    key: "2p",
    label: "2P",
    format: (r) => formatNumber(twoMade(r)),
  },
  {
    key: "2pa",
    label: "2PA",
    format: (r) => formatNumber(twoAttempted(r)),
  },
  {
    key: "2pPct",
    label: "2P%",
    format: (r) => formatPct(r.twoPointPct),
  },
  {
    key: "efg",
    label: "eFG%",
    format: (r) => formatPct(r.effectiveFieldGoalPct ?? 0),
  },
  {
    key: "ft",
    label: "FT",
    format: (r) => formatNumber(r.freeThrowsMade),
  },
  {
    key: "fta",
    label: "FTA",
    format: (r) => formatNumber(r.freeThrowsAttempted),
  },
  {
    key: "ftPct",
    label: "FT%",
    format: (r) => formatPct(r.freeThrowPct),
  },
  {
    key: "orb",
    label: "ORB",
    format: (r) => formatNumber(r.offensiveRebounds),
  },
  {
    key: "drb",
    label: "DRB",
    format: (r) => formatNumber(r.defensiveRebounds),
  },
  {
    key: "trb",
    label: "TRB",
    format: (r) => formatNumber(r.rebounds),
  },
  {
    key: "ast",
    label: "AST",
    format: (r) => formatNumber(r.assists),
  },
  {
    key: "stl",
    label: "STL",
    format: (r) => formatNumber(r.steals),
  },
  {
    key: "blk",
    label: "BLK",
    format: (r) => formatNumber(r.blocks),
  },
  {
    key: "tov",
    label: "TOV",
    format: (r) => formatNumber(r.turnovers),
  },
  {
    key: "pf",
    label: "PF",
    format: (r) => formatNumber(r.personalFouls),
  },
  {
    key: "pts",
    label: "PTS",
    format: (r) => formatNumber(r.points),
  },
];

export const BREF_PER_36_COLUMNS: BrefColumn[] = [
  ...identityCols,
  {
    key: "mp",
    label: "MP",
    format: (r) => formatMinutes(r.minutes),
  },
  {
    key: "fg",
    label: "FG",
    format: (r) => formatNumber(per36(r.fieldGoalsMade, r.minutes), 1),
  },
  {
    key: "fga",
    label: "FGA",
    format: (r) => formatNumber(per36(r.fieldGoalsAttempted, r.minutes), 1),
  },
  {
    key: "fgPct",
    label: "FG%",
    format: (r) => formatPct(r.fieldGoalPct),
  },
  {
    key: "3p",
    label: "3P",
    format: (r) => formatNumber(per36(r.threePointersMade, r.minutes), 1),
  },
  {
    key: "3pa",
    label: "3PA",
    format: (r) =>
      formatNumber(per36(r.threePointersAttempted, r.minutes), 1),
  },
  {
    key: "3pPct",
    label: "3P%",
    format: (r) => formatPct(r.threePointPct),
  },
  {
    key: "2p",
    label: "2P",
    format: (r) => formatNumber(per36(twoMade(r), r.minutes), 1),
  },
  {
    key: "2pa",
    label: "2PA",
    format: (r) => formatNumber(per36(twoAttempted(r), r.minutes), 1),
  },
  {
    key: "2pPct",
    label: "2P%",
    format: (r) => formatPct(r.twoPointPct),
  },
  {
    key: "efg",
    label: "eFG%",
    format: (r) => formatPct(r.effectiveFieldGoalPct ?? 0),
  },
  {
    key: "ft",
    label: "FT",
    format: (r) => formatNumber(per36(r.freeThrowsMade, r.minutes), 1),
  },
  {
    key: "fta",
    label: "FTA",
    format: (r) => formatNumber(per36(r.freeThrowsAttempted, r.minutes), 1),
  },
  {
    key: "ftPct",
    label: "FT%",
    format: (r) => formatPct(r.freeThrowPct),
  },
  {
    key: "orb",
    label: "ORB",
    format: (r) => formatNumber(per36(r.offensiveRebounds, r.minutes), 1),
  },
  {
    key: "drb",
    label: "DRB",
    format: (r) => formatNumber(per36(r.defensiveRebounds, r.minutes), 1),
  },
  {
    key: "trb",
    label: "TRB",
    format: (r) => formatNumber(per36(r.rebounds, r.minutes), 1),
  },
  {
    key: "ast",
    label: "AST",
    format: (r) => formatNumber(per36(r.assists, r.minutes), 1),
  },
  {
    key: "stl",
    label: "STL",
    format: (r) => formatNumber(per36(r.steals, r.minutes), 1),
  },
  {
    key: "blk",
    label: "BLK",
    format: (r) => formatNumber(per36(r.blocks, r.minutes), 1),
  },
  {
    key: "tov",
    label: "TOV",
    format: (r) => formatNumber(per36(r.turnovers, r.minutes), 1),
  },
  {
    key: "pf",
    label: "PF",
    format: (r) => formatNumber(per36(r.personalFouls, r.minutes), 1),
  },
  {
    key: "pts",
    label: "PTS",
    format: (r) => formatNumber(per36(r.points, r.minutes), 1),
  },
];

/**
 * Advanced columns - stats.nba.com Advanced + BRef PER/WS/BPM/VORP + DARKO DPM.
 */
export const BREF_ADVANCED_COLUMNS: BrefColumn[] = [
  ...identityCols,
  {
    key: "mp",
    label: "MP",
    format: (r) => formatMinutes(r.minutes),
  },
  {
    key: "per",
    label: "PER",
    format: (r) => formatNumber(r.per, 1),
  },
  {
    key: "ts",
    label: "TS%",
    format: (r) => formatPct(r.trueShootingPct ?? 0),
  },
  {
    key: "3par",
    label: "3PAr",
    format: (r) => formatPct(r.threePointAttemptRate),
  },
  {
    key: "ftr",
    label: "FTr",
    format: (r) => formatNumber(r.freeThrowRate, 3),
  },
  {
    key: "orbPct",
    label: "ORB%",
    format: (r) => formatPct(r.offensiveReboundPct),
  },
  {
    key: "drbPct",
    label: "DRB%",
    format: (r) => formatPct(r.defensiveReboundPct),
  },
  {
    key: "trbPct",
    label: "TRB%",
    format: (r) => formatPct(r.reboundPct),
  },
  {
    key: "astPct",
    label: "AST%",
    format: (r) => formatPct(r.assistPct),
  },
  {
    key: "stlPct",
    label: "STL%",
    format: (r) => formatPct(r.stealPct),
  },
  {
    key: "blkPct",
    label: "BLK%",
    format: (r) => formatPct(r.blockPct),
  },
  {
    key: "tovPct",
    label: "TOV%",
    format: (r) => formatPct(r.turnoverPct),
  },
  {
    key: "usg",
    label: "USG%",
    format: (r) => formatPct(r.usagePct ?? 0),
  },
  {
    key: "ows",
    label: "OWS",
    format: (r) => formatNumber(r.ows, 1),
  },
  {
    key: "dws",
    label: "DWS",
    format: (r) => formatNumber(r.dws, 1),
  },
  {
    key: "ws",
    label: "WS",
    format: (r) => formatNumber(r.winShares, 1),
  },
  {
    key: "ws48",
    label: "WS/48",
    format: (r) => formatNumber(r.winSharesPer48, 3),
  },
  {
    key: "obpm",
    label: "OBPM",
    format: (r) => formatNumber(r.obpm, 1),
  },
  {
    key: "dbpm",
    label: "DBPM",
    format: (r) => formatNumber(r.dbpm, 1),
  },
  {
    key: "bpm",
    label: "BPM",
    format: (r) => formatNumber(r.bpm, 1),
  },
  {
    key: "vorp",
    label: "VORP",
    format: (r) => formatNumber(r.vorp, 1),
  },
  {
    key: "dpm",
    label: "DPM",
    format: (r) => formatNumber(r.dpm, 1),
  },
  {
    key: "oDpm",
    label: "O-DPM",
    format: (r) => formatNumber(r.oDpm, 1),
  },
  {
    key: "dDpm",
    label: "D-DPM",
    format: (r) => formatNumber(r.dDpm, 1),
  },
  {
    key: "boxDpm",
    label: "Box DPM",
    format: (r) => formatNumber(r.boxDpm, 1),
  },
  {
    key: "onOffDpm",
    label: "On/Off DPM",
    format: (r) => formatNumber(r.onOffDpm, 1),
  },
  {
    key: "r1Points",
    label: "R1 Points",
    format: (r) =>
      r.r1Points == null ? "-" : formatNumber(r.r1Points, 1),
  },
  {
    key: "r1WinEquivalents",
    label: "WAR1",
    format: (r) =>
      r.r1WinEquivalents == null
        ? "-"
        : formatNumber(r.r1WinEquivalents, 1),
  },
  {
    key: "drbl100",
    label: "DRBL/100",
    format: (r) => formatNumber(r.drbl100, 1),
  },
  {
    key: "drblP",
    label: "DRBL-P",
    format: (r) => formatNumber(r.drblP, 1),
  },
  {
    key: "drblLn",
    label: "DRBL-LN",
    format: (r) => formatNumber(r.drblLn, 1),
  },
  {
    key: "drblB",
    label: "DRBL-B",
    format: (r) => formatNumber(r.drblB, 1),
  },
  {
    key: "drblDisagreement",
    label: "DRBL Δ",
    format: (r) => formatNumber(r.drblDisagreement, 2),
  },
  {
    key: "drblO",
    label: "Offense",
    format: (r) => formatNumber(r.drblO, 1),
  },
  {
    key: "drblD",
    label: "Defense",
    format: (r) => formatNumber(r.drblD, 1),
  },
  {
    key: "drblSeasonalImpact",
    label: "DRBL impact",
    format: (r) => formatNumber(r.drblSeasonalImpact, 1),
  },
  {
    key: "drblL",
    label: "DRBL-L",
    format: (r) => formatNumber(r.drblL, 1),
  },
  {
    key: "ortg",
    label: "ORtg",
    format: (r) => formatNumber(r.offensiveRating ?? 0, 1),
  },
  {
    key: "drtg",
    label: "DRtg",
    format: (r) => formatNumber(r.defensiveRating ?? 0, 1),
  },
  {
    key: "nrtg",
    label: "NRtg",
    format: (r) => formatNumber(r.netRating ?? 0, 1),
  },
  {
    key: "pie",
    label: "PIE",
    format: (r) => formatPct(r.pie),
  },
];

export function columnsForMode(mode: BrefTableMode): BrefColumn[] {
  switch (mode) {
    case "totals":
      return BREF_TOTALS_COLUMNS;
    case "per36":
      return BREF_PER_36_COLUMNS;
    case "advanced":
      return BREF_ADVANCED_COLUMNS;
    case "perGame":
    default:
      return BREF_PER_GAME_COLUMNS;
  }
}

export interface SeasonSummaryStat {
  key: string;
  label: string;
  value: string;
  hint?: string;
}

/** BRef SUMMARY strip analog for the selected season. */
export function buildSeasonSummary(row: PlayerSeason): SeasonSummaryStat[] {
  return [
    {
      key: "g",
      label: "G",
      value: formatNumber(row.gamesPlayed),
    },
    {
      key: "pts",
      label: "PTS",
      value: formatNumber(perGame(row.points, row.gamesPlayed), 1),
      hint: "Per game",
    },
    {
      key: "trb",
      label: "TRB",
      value: formatNumber(perGame(row.rebounds, row.gamesPlayed), 1),
    },
    {
      key: "ast",
      label: "AST",
      value: formatNumber(perGame(row.assists, row.gamesPlayed), 1),
    },
    {
      key: "fg",
      label: "FG%",
      value: formatPct(row.fieldGoalPct),
    },
    {
      key: "fg3",
      label: "3P%",
      value: formatPct(row.threePointPct),
    },
    {
      key: "ft",
      label: "FT%",
      value: formatPct(row.freeThrowPct),
    },
    {
      key: "efg",
      label: "eFG%",
      value: formatPct(row.effectiveFieldGoalPct ?? 0),
    },
    {
      key: "ts",
      label: "TS%",
      value: formatPct(row.trueShootingPct ?? 0),
    },
    {
      key: "usg",
      label: "USG%",
      value: formatPct(row.usagePct ?? 0),
    },
  ];
}

export interface ShotDietSlice {
  key: string;
  label: string;
  attempts: number;
  share: number;
}

/** Attempt mix by shot type / zone share. */
export function buildShotDiet(row: PlayerSeason): ShotDietSlice[] {
  const twoA = Math.max(0, row.fieldGoalsAttempted - row.threePointersAttempted);
  const threeA = Math.max(0, row.threePointersAttempted);
  const fta = Math.max(0, row.freeThrowsAttempted);
  const total = twoA + threeA + fta;
  if (total <= 0) {
    return [
      { key: "2pa", label: "2PA", attempts: 0, share: 0 },
      { key: "3pa", label: "3PA", attempts: 0, share: 0 },
      { key: "fta", label: "FTA", attempts: 0, share: 0 },
    ];
  }
  return [
    { key: "2pa", label: "2PA", attempts: twoA, share: twoA / total },
    { key: "3pa", label: "3PA", attempts: threeA, share: threeA / total },
    { key: "fta", label: "FTA", attempts: fta, share: fta / total },
  ];
}

export interface EfficiencyProfileMetric {
  key: string;
  label: string;
  value: number;
  display: string;
}

export function buildEfficiencyProfile(
  row: PlayerSeason
): EfficiencyProfileMetric[] {
  return [
    {
      key: "fg",
      label: "FG%",
      value: row.fieldGoalPct,
      display: formatPct(row.fieldGoalPct),
    },
    {
      key: "2p",
      label: "2P%",
      value: row.twoPointPct,
      display: formatPct(row.twoPointPct),
    },
    {
      key: "3p",
      label: "3P%",
      value: row.threePointPct,
      display: formatPct(row.threePointPct),
    },
    {
      key: "efg",
      label: "eFG%",
      value: row.effectiveFieldGoalPct ?? 0,
      display: formatPct(row.effectiveFieldGoalPct ?? 0),
    },
    {
      key: "ts",
      label: "TS%",
      value: row.trueShootingPct ?? 0,
      display: formatPct(row.trueShootingPct ?? 0),
    },
    {
      key: "ft",
      label: "FT%",
      value: row.freeThrowPct,
      display: formatPct(row.freeThrowPct),
    },
  ];
}
