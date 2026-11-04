import { activeMentor } from "@/gm/engine/development";
import entryDrblTable from "@/gm/seed/entry-drbl.json";
import type { GmBoxScore, GmCountingLine, GmLeagueState, GmPlayer } from "@/gm/types";
import { P1_POINTS_PER_WIN } from "@/lib/drbl-public-labels";

/** Pace when a stored box has no possession count. */
const FALLBACK_PACE = 99.2;

type EntryPair = [number, number | null];
const entryByNbaId = entryDrblTable as unknown as Record<string, EntryPair>;

export function war1FromRate(drbl100: number, possessions: number): number {
  return (drbl100 * possessions) / 100 / P1_POINTS_PER_WIN;
}

export function entryValue(player: GmPlayer): {
  drbl100: number | null;
  war1: number | null;
} {
  const storedRate = player.drbl100;
  const storedWar = player.entryWar1;
  if (typeof storedRate === "number" && Number.isFinite(storedRate)) {
    return {
      drbl100: storedRate,
      war1: typeof storedWar === "number" && Number.isFinite(storedWar) ? storedWar : null,
    };
  }
  const pair = player.nbaPlayerId && player.nbaSeason?.season === "2025-26" ? entryByNbaId[player.nbaPlayerId] : undefined;
  if (!pair || !Number.isFinite(pair[0])) return { drbl100: null, war1: null };
  const r1 = pair[1];
  return {
    drbl100: pair[0],
    war1: typeof r1 === "number" && Number.isFinite(r1) ? r1 / P1_POINTS_PER_WIN : null,
  };
}

/** Attach the published entry rating. Used when a real season row becomes a GM player. */
export function entryValueForNbaId(nbaPlayerId: string | undefined, season = "2025-26"): {
  drbl100: number | null;
  war1: number | null;
} {
  if (!nbaPlayerId || season !== "2025-26") return { drbl100: null, war1: null };
  const pair = entryByNbaId[nbaPlayerId];
  if (!pair || !Number.isFinite(pair[0])) return { drbl100: null, war1: null };
  const r1 = pair[1];
  return {
    drbl100: pair[0],
    war1: typeof r1 === "number" && Number.isFinite(r1) ? r1 / P1_POINTS_PER_WIN : null,
  };
}

function onCourtPossessions(minutes: number, gamePossessions: number | undefined): number {
  const pace =
    typeof gamePossessions === "number" && gamePossessions > 0
      ? gamePossessions
      : FALLBACK_PACE;
  return (Math.max(0, minutes) / 48) * pace;
}

function blankLine(season: number, teamId: string): GmCountingLine {
  return {
    season: String(season),
    team: teamId,
    gp: 0,
    gs: 0,
    min: 0,
    pts: 0,
    reb: 0,
    ast: 0,
    stl: 0,
    blk: 0,
    tov: 0,
    fgm: 0,
    fga: 0,
    tpm: 0,
    tpa: 0,
    ftm: 0,
    fta: 0,
  };
}

function addLine(base: GmCountingLine, box: GmBoxScore, playerId: string): GmCountingLine {
  const line = box.players.find((entry) => entry.playerId === playerId);
  if (!line || line.minutes <= 0) return base;
  return {
    ...base,
    team: line.teamId,
    gp: base.gp + 1,
    gs: (base.gs ?? 0) + (line.started ? 1 : 0),
    min: base.min + line.minutes,
    pts: base.pts + line.points,
    reb: base.reb + line.rebounds,
    orb: line.offensiveRebounds == null ? base.orb : (base.orb ?? 0) + line.offensiveRebounds,
    drb: line.defensiveRebounds == null ? base.drb : (base.drb ?? 0) + line.defensiveRebounds,
    ast: base.ast + line.assists,
    stl: base.stl + line.steals,
    blk: base.blk + line.blocks,
    tov: base.tov + line.turnovers,
    pf: (base.pf ?? 0) + (line.personalFouls ?? 0),
    fgm: base.fgm + line.fgm,
    fga: base.fga + line.fga,
    tpm: base.tpm + line.tpm,
    tpa: base.tpa + line.tpa,
    ftm: base.ftm + line.ftm,
    fta: base.fta + line.fta,
  };
}

function foldBoxes(
  boxes: GmBoxScore[],
  playerId: string,
  season: number
): { line: GmCountingLine; possessions: number } {
  let line = blankLine(season, "");
  let possessions = 0;
  for (const box of boxes) {
    if (box.season !== season || box.postseason) continue;
    const played = box.players.find((entry) => entry.playerId === playerId);
    if (!played || played.minutes <= 0) continue;
    line = addLine(line, box, playerId);
    possessions += onCourtPossessions(played.minutes, box.possessions);
  }
  return { line, possessions };
}

/**
 * Add one simulated game to the running season line.
 * The first time a save grows a line, earlier boxes still in memory are folded in
 * so the total is not only the games played after this change.
 */
export function recordSimGame(
  players: GmPlayer[],
  box: GmBoxScore,
  priorBoxes: GmBoxScore[]
): GmPlayer[] {
  const playedIds = new Set(
    box.players.filter((line) => line.minutes > 0).map((line) => line.playerId)
  );
  if (playedIds.size === 0) return players;
  const seasonKey = String(box.season);
  return players.map((player) => {
    const promise = player.rolePromise;
    if (promise && promise.teamId === player.teamId && promise.lastGameId !== box.gameId && !player.injury && [box.homeTeamId, box.awayTeamId].includes(player.teamId ?? "")) {
      const games = (promise.games ?? 0) + 1;
      const totalMinutes = (promise.totalMinutes ?? 0) + (box.players.find(p => p.playerId === player.id)?.minutes ?? 0);
      const status = games < 10 ? "pending" as const : totalMinutes / games >= promise.minutes - 2 ? "met" as const : "unmet" as const;
      player = { ...player, rolePromise: { ...promise, games, totalMinutes, status, lastGameId: box.gameId } };
    }
    if (!playedIds.has(player.id)) return player;
    if (player.developmentBaseline?.season !== box.season) player = { ...player, developmentBaseline: { season: box.season, overall: player.sheet?.overall ?? 70 } };
    // An actual shared appearance requires the mentor to play as well.
    // The former counter only checked the student and could award a rare
    // permanent discovery while the supposed mentor never entered a game.
    const mentor = player.mentorship ? activeMentor(player, players) : undefined;
    if (player.mentorship && mentor && box.players.some(row =>
      row.playerId === mentor.id && row.teamId === player.teamId && row.minutes > 0
    ) && player.mentorship.lastGameId !== box.gameId) {
      const previous = player.mentorship.season === box.season ? player.mentorship.sharedGames : 0;
      player = { ...player, mentorship: { ...player.mentorship, season: box.season, sharedGames: previous + 1, lastGameId: box.gameId } };
    }
    let line = player.seasonLine;
    let possessions = player.seasonPossessions ?? 0;
    if (!line || line.season !== seasonKey) {
      const rebuilt = foldBoxes(priorBoxes, player.id, box.season);
      line = rebuilt.line.gp > 0 ? rebuilt.line : blankLine(box.season, "");
      possessions = rebuilt.possessions;
    }
    const played = box.players.find((entry) => entry.playerId === player.id);
    return {
      ...player,
      seasonLine: addLine(line, box, player.id),
      seasonPossessions:
        possessions + onCourtPossessions(played?.minutes ?? 0, box.possessions),
    };
  });
}

export function seasonHasGames(league: GmLeagueState): boolean {
  const seasonKey = String(league.season);
  if (league.players.some((player) => player.seasonLine?.season === seasonKey && player.seasonLine.gp > 0)) {
    return true;
  }
  return league.boxScores.some((box) => box.season === league.season);
}

function boxLine(league: GmLeagueState, playerId: string): GmCountingLine | null {
  const folded = foldBoxes(league.boxScores, playerId, league.season);
  return folded.line.gp > 0 ? folded.line : null;
}

/** Counting line for the board. This save once it has games, otherwise the entry season. */
export function countingForBoard(
  league: GmLeagueState,
  player: GmPlayer
): GmCountingLine | null {
  const seasonKey = String(league.season);
  if (player.seasonLine?.season === seasonKey && player.seasonLine.gp > 0) {
    return player.seasonLine;
  }
  const fromBoxes = boxLine(league, player.id);
  if (fromBoxes) return fromBoxes;
  if (seasonHasGames(league)) return null;
  return player.nbaSeason && player.nbaSeason.gp > 0 ? player.nbaSeason : null;
}

function possessionsForBoard(league: GmLeagueState, player: GmPlayer): number | null {
  const seasonKey = String(league.season);
  if (
    player.seasonLine?.season === seasonKey &&
    player.seasonLine.gp > 0 &&
    typeof player.seasonPossessions === "number" &&
    Number.isFinite(player.seasonPossessions)
  ) {
    return player.seasonPossessions;
  }
  const folded = foldBoxes(league.boxScores, player.id, league.season);
  if (folded.line.gp < 1) return null;
  return folded.possessions;
}

/**
 * The published NBA entry value is a starting prior, NOT a forever-frozen
 * rating. In simulated future seasons the player's current in-game impact
 * updates that prior. Generated players have no external NBA DRBL estimate;
 * use their current simulation impact instead, clearly marked as an estimate.
 * WAR1 is earned only from possessions actually played in this save.
 */
export function valueForBoard(
  league: GmLeagueState,
  player: GmPlayer
): { drbl100: number | null; war1: number | null; estimated: boolean } {
  const entry = entryValue(player);
  const generated = !player.nbaPlayerId && entry.drbl100 == null;
  const impact = player.ratings.impact;
  const baseline = player.simProfile?.impact ?? impact;
  const adjusted = Number.isFinite(impact) ? Math.max(-10, Math.min(12,
    entry.drbl100 == null ? impact : entry.drbl100 + (impact - baseline)
  )) : entry.drbl100;
  const drbl100 = generated || seasonHasGames(league) || league.season > 2026
    ? adjusted : entry.drbl100;
  const estimated = generated || (entry.drbl100 != null && drbl100 !== entry.drbl100);
  if (!seasonHasGames(league)) {
    return { drbl100, war1: generated || estimated ? null : entry.war1, estimated };
  }
  const possessions = possessionsForBoard(league, player);
  return { drbl100, war1: drbl100 != null && possessions != null
    ? war1FromRate(drbl100, possessions) : null, estimated };
}

