import type { PlayerSeason, Position } from "@/data/types";
import type { RawLocalPlayerSeason } from "@/data/providers/sample/local-sample-data";
import {
  freeThrowRate,
  perGame,
  safePct,
  threePointAttemptRate,
  turnoverPct,
  twoPointPct,
} from "@/data/providers/nba/compute-advanced";

const POSITIONS: Position[] = ["PG", "SG", "SF", "PF", "C"];

function toPosition(value: string): Position | undefined {
  return POSITIONS.includes(value as Position)
    ? (value as Position)
    : undefined;
}

/**
 * When local sample rows only expose rates + box totals, synthesize a
 * plausible BRef-style shot profile so views stay complete.
 */
function estimateCounting(raw: RawLocalPlayerSeason) {
  const gp = Math.max(1, raw.gp);
  const fga =
    raw.fga ??
    Math.max(1, Math.round(raw.pts / Math.max(raw.ts_pct * 2.15, 0.35)));
  const fgm = raw.fgm ?? Math.round(fga * raw.fg_pct);
  const tpa = raw.fg3a ?? Math.round(fga * 0.38);
  const tpm = raw.fg3m ?? Math.round(tpa * raw.fg3_pct);
  const fta = raw.fta ?? Math.round(fga * 0.28);
  const ftm = raw.ftm ?? Math.round(fta * raw.ft_pct);
  const orb = raw.orb ?? Math.round(raw.reb * 0.22);
  const drb = raw.drb ?? Math.max(0, raw.reb - orb);
  const pf = raw.pf ?? Math.round(perGame(raw.min, gp) * 0.06 * gp);

  return { fgm, fga, tpm, tpa, ftm, fta, orb, drb, pf };
}

/**
 * Maps messy local JSON / CSV-shaped rows into canonical PlayerSeason.
 * Keep all field remapping here ??never in UI components.
 */
export function transformLocalPlayerSeason(
  raw: RawLocalPlayerSeason
): PlayerSeason {
  const c = estimateCounting(raw);

  return {
    playerId: raw.player_id,
    playerName: raw.player_name,
    teamId: raw.team_id,
    teamName: raw.team_name,
    teamAbbreviation: raw.team_id.toUpperCase(),
    season: raw.season,
    position: toPosition(raw.pos),
    gamesPlayed: raw.gp,
    gamesStarted: raw.gs ?? raw.gp,
    minutes: raw.min,
    fieldGoalsMade: c.fgm,
    fieldGoalsAttempted: c.fga,
    threePointersMade: c.tpm,
    threePointersAttempted: c.tpa,
    freeThrowsMade: c.ftm,
    freeThrowsAttempted: c.fta,
    offensiveRebounds: c.orb,
    defensiveRebounds: c.drb,
    rebounds: raw.reb,
    assists: raw.ast,
    steals: raw.stl,
    blocks: raw.blk,
    turnovers: raw.tov,
    personalFouls: c.pf,
    points: raw.pts,
    plusMinus: 0,
    fieldGoalPct: raw.fg_pct || safePct(c.fgm, c.fga),
    twoPointPct: twoPointPct(c.fgm, c.tpm, c.fga, c.tpa),
    threePointPct: raw.fg3_pct || safePct(c.tpm, c.tpa),
    freeThrowPct: raw.ft_pct || safePct(c.ftm, c.fta),
    effectiveFieldGoalPct: raw.efg_pct,
    trueShootingPct: raw.ts_pct,
    threePointAttemptRate: threePointAttemptRate(c.tpa, c.fga),
    freeThrowRate: freeThrowRate(c.fta, c.fga),
    turnoverPct: turnoverPct(raw.tov, c.fga, c.fta) ?? 0,
    usagePct: raw.usg_pct,
    assistPct: 0,
    offensiveReboundPct: 0,
    defensiveReboundPct: 0,
    reboundPct: 0,
    stealPct: 0,
    blockPct: 0,
    pie: 0,
    offensiveRating: raw.ortg,
    defensiveRating: raw.drtg,
    netRating: raw.net_rtg,
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
    drblP: 0,
    drblLn: 0,
    drblB: 0,
    drblO: 0,
    drblD: 0,
    sdv100: 0,
    shotMaking100: 0,
    epvShootMean: 0,
    vContMean: 0,
    r1Points: null,
    r1WinEquivalents: null,
    r1PointValueVersion: null,
    r1WinEquivalentVersion: null,
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

export function transformLocalPlayerSeasons(
  rows: RawLocalPlayerSeason[]
): PlayerSeason[] {
  return rows.map(transformLocalPlayerSeason);
}
