/**
 * Canonical player-season totals grain (P18C.1.3R).
 * Additive fields are TOTALS only — never per-game / per-36.
 */

import type { HistoryPlayerSeason } from "@/data/history/player-career-types";
import {
  getHistoryPlayerGames,
  getHistorySeasonsForPlayer,
} from "@/data/history/player-career";
import { parseBasketballMinutes } from "@/lib/parse-basketball-minutes";
import {
  efgPct,
  fgPct,
  per36,
  perGame,
  tsPct,
  type PlayerStatMode,
} from "@/lib/player-page-contract";

export type PlayerSeasonTotals = {
  playerId: string;
  season: string;
  playerName: string;
  teamIds: string[];
  primaryTeamId: string;
  teamGrain: "single" | "multi";
  source: "history_season+game_minutes" | "history_season" | "game_aggregate";
  gp: number;
  gs: number | null;
  minutesTotal: number | null;
  fgm: number | null;
  fga: number | null;
  threePm: number | null;
  threePa: number | null;
  twoPm: number | null;
  twoPa: number | null;
  ftm: number | null;
  fta: number | null;
  orb: number | null;
  drb: number | null;
  reb: number | null;
  ast: number | null;
  stl: number | null;
  blk: number | null;
  tov: number | null;
  pf: number | null;
  pts: number | null;
};

export type DerivedRates = {
  fgPct: number | null;
  threePct: number | null;
  twoPct: number | null;
  ftPct: number | null;
  efgPct: number | null;
  tsPct: number | null;
};

function sumGameMinutes(playerId: string, season: string): {
  minutes: number;
  gp: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  fgm: number;
  fga: number;
  threePm: number;
  threePa: number;
  ftm: number;
  fta: number;
} {
  const games = getHistoryPlayerGames(playerId, season, { limit: 5000 });
  const out = {
    minutes: 0,
    gp: games.length,
    pts: 0,
    reb: 0,
    ast: 0,
    stl: 0,
    blk: 0,
    tov: 0,
    fgm: 0,
    fga: 0,
    threePm: 0,
    threePa: 0,
    ftm: 0,
    fta: 0,
  };
  for (const g of games) {
    out.minutes += parseBasketballMinutes(g.minutes);
    out.pts += g.points;
    out.reb += g.rebounds;
    out.ast += g.assists;
    out.stl += g.steals;
    out.blk += g.blocks;
    out.tov += g.turnovers;
    out.fgm += g.fgm;
    out.fga += g.fga;
    out.threePm += g.threePm;
    out.threePa += g.threePa;
    out.ftm += g.ftm;
    out.fta += g.fta;
  }
  return out;
}

/**
 * Normalize a history season row into canonical totals.
 * Recovers minutes (and counting stats if needed) from player-games using
 * ISO-8601-aware minute parsing — fixes 2019-20+ PT duration corruption.
 */
export function toPlayerSeasonTotals(
  season: HistoryPlayerSeason
): PlayerSeasonTotals {
  const games = sumGameMinutes(season.playerId, season.season);
  const storedMin =
    season.minutes != null &&
    Number.isFinite(season.minutes) &&
    season.minutes > 0
      ? season.minutes
      : null;

  // Prefer game-aggregated minutes when stored minutes look broken:
  // - zero / null while games exist
  // - far below game aggregate (mixed MM:SS + PT eras)
  let minutesTotal = storedMin;
  let source: PlayerSeasonTotals["source"] = "history_season";
  if (games.gp > 0) {
    const gameMin = Number(games.minutes.toFixed(1));
    if (
      minutesTotal == null ||
      minutesTotal <= 0 ||
      (gameMin > 0 && minutesTotal < gameMin * 0.5)
    ) {
      minutesTotal = gameMin > 0 ? gameMin : null;
      source = "history_season+game_minutes";
    }
  }

  const fgm = season.fgm ?? (games.gp > 0 ? games.fgm : null);
  const fga = season.fga ?? (games.gp > 0 ? games.fga : null);
  const threePm = season.threePm ?? (games.gp > 0 ? games.threePm : null);
  const threePa = season.threePa ?? (games.gp > 0 ? games.threePa : null);

  return {
    playerId: season.playerId,
    season: season.season,
    playerName: season.playerName,
    teamIds: season.teamIds,
    primaryTeamId: season.primaryTeamId,
    teamGrain: season.teamIds.length > 1 ? "multi" : "single",
    source,
    gp: season.gp > 0 ? season.gp : games.gp,
    gs: season.gs,
    minutesTotal,
    fgm,
    fga,
    threePm,
    threePa,
    twoPm:
      fgm != null && threePm != null ? fgm - threePm : null,
    twoPa:
      fga != null && threePa != null ? fga - threePa : null,
    ftm: season.ftm ?? (games.gp > 0 ? games.ftm : null),
    fta: season.fta ?? (games.gp > 0 ? games.fta : null),
    orb: null,
    drb: null,
    reb: season.rebounds ?? (games.gp > 0 ? games.reb : null),
    ast: season.assists ?? (games.gp > 0 ? games.ast : null),
    stl: season.steals ?? (games.gp > 0 ? games.stl : null),
    blk: season.blocks ?? (games.gp > 0 ? games.blk : null),
    tov: season.turnovers ?? (games.gp > 0 ? games.tov : null),
    pf: null,
    pts: season.points ?? (games.gp > 0 ? games.pts : null),
  };
}

export function getCanonicalCareerTotals(
  playerId: string
): PlayerSeasonTotals[] {
  return getHistorySeasonsForPlayer(playerId).map(toPlayerSeasonTotals);
}

export function deriveRates(t: PlayerSeasonTotals): DerivedRates {
  return {
    fgPct: fgPct(t.fgm, t.fga),
    threePct: fgPct(t.threePm, t.threePa),
    twoPct: fgPct(t.twoPm, t.twoPa),
    ftPct: fgPct(t.ftm, t.fta),
    efgPct: efgPct(t.fgm, t.fga, t.threePm),
    tsPct: tsPct(t.pts, t.fga, t.fta),
  };
}

export function presentAdditive(
  total: number | null | undefined,
  mode: PlayerStatMode,
  gp: number,
  minutesTotal: number | null | undefined,
  digits = 1
): string {
  if (total == null || !Number.isFinite(total)) return "—";
  if (mode === "totals") {
    return Number.isInteger(total) ? String(total) : total.toFixed(0);
  }
  if (mode === "per36") {
    const v = per36(total, minutesTotal);
    return v == null ? "—" : v.toFixed(digits);
  }
  const v = perGame(total, gp);
  return v == null ? "—" : v.toFixed(digits);
}

export function presentMinutes(
  minutesTotal: number | null | undefined,
  mode: PlayerStatMode,
  gp: number
): string {
  if (minutesTotal == null || !Number.isFinite(minutesTotal) || minutesTotal <= 0) {
    return "—";
  }
  if (mode === "totals") return minutesTotal.toFixed(0);
  if (mode === "per36") return "36.0";
  const v = perGame(minutesTotal, gp);
  return v == null ? "—" : v.toFixed(1);
}

export function presentPct(rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(rate)) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

/** Unit sanity diagnostics — does not mutate data. */
export function validateTotalsSanity(t: PlayerSeasonTotals): string[] {
  const fails: string[] = [];
  if (t.fgm != null && t.fga != null && t.fgm > t.fga) fails.push("FGM_GT_FGA");
  if (t.threePm != null && t.threePa != null && t.threePm > t.threePa)
    fails.push("3PM_GT_3PA");
  if (t.ftm != null && t.fta != null && t.ftm > t.fta) fails.push("FTM_GT_FTA");
  if (t.threePm != null && t.fgm != null && t.threePm > t.fgm)
    fails.push("3PM_GT_FGM");
  if (t.threePa != null && t.fga != null && t.threePa > t.fga)
    fails.push("3PA_GT_FGA");
  if (
    t.twoPm != null &&
    t.threePm != null &&
    t.fgm != null &&
    t.twoPm + t.threePm !== t.fgm
  ) {
    fails.push("2P_3P_FGM_MISMATCH");
  }
  if (
    t.twoPa != null &&
    t.threePa != null &&
    t.fga != null &&
    t.twoPa + t.threePa !== t.fga
  ) {
    fails.push("2P_3P_FGA_MISMATCH");
  }
  const pts36 = per36(t.pts, t.minutesTotal);
  if (pts36 != null && pts36 > 80) fails.push("EXTREME_PTS36");
  const fga36 = per36(t.fga, t.minutesTotal);
  if (fga36 != null && fga36 > 50) fails.push("EXTREME_FGA36");
  return fails;
}
