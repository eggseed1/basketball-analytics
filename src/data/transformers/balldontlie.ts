import type {
  AdvancedPlayerGameStats,
  Game,
  GameBoxScore,
  Player,
  PlayerGame,
  Team,
} from "@/data/types";
import { canonicalSeasonFromStartYear } from "@/data/providers/historical/season-range";
import type {
  BdlAdvancedStat,
  BdlBoxScore,
  BdlBoxScorePlayerLine,
  BdlGame,
  BdlPlayer,
  BdlStats,
  BdlTeam,
} from "@/data/providers/balldontlie/client";
import {
  finalizeBoxScorePlayers,
  withDerivedBoxScoreMetrics,
} from "@/data/providers/nba/enrich-box-score";
import { normalizeGameTeamSide, applyHistoricalTeamEraToGame } from "@/lib/game-team-identity";
import { parseBasketballMinutes } from "@/lib/parse-basketball-minutes";

export function transformBdlTeam(raw: BdlTeam): Team {
  const fullName = raw.full_name ?? raw.name ?? String(raw.id);
  const city =
    raw.city ??
    (fullName.split(" ").slice(0, -1).join(" ") || fullName);
  const nickname = raw.name ?? fullName.split(" ").slice(-1)[0] ?? fullName;
  const conference =
    raw.conference === "East" || raw.conference === "West"
      ? raw.conference
      : "East";

  return {
    id: String(raw.id),
    abbreviation: raw.abbreviation ?? String(raw.id),
    fullName,
    city,
    nickname,
    conference,
    division: raw.division ?? "",
  };
}

export function transformBdlPlayer(raw: BdlPlayer): Player {
  return {
    id: String(raw.id),
    fullName: `${raw.first_name} ${raw.last_name}`.trim(),
    firstName: raw.first_name,
    lastName: raw.last_name,
    position: (raw.position || undefined) as Player["position"],
    currentTeamId:
      raw.team_id != null
        ? String(raw.team_id)
        : raw.team?.id != null
          ? String(raw.team.id)
          : undefined,
  };
}

export function transformBdlGame(raw: BdlGame): Game {
  const season = canonicalSeasonFromStartYear(raw.season);
  const status = mapStatus(raw.status);
  const home = normalizeGameTeamSide({
    provider: "bdl",
    providerTeamId: String(raw.home_team.id),
    abbr: raw.home_team.abbreviation,
    name: raw.home_team.full_name ?? raw.home_team.name,
  });
  const away = normalizeGameTeamSide({
    provider: "bdl",
    providerTeamId: String(raw.visitor_team.id),
    abbr: raw.visitor_team.abbreviation,
    name: raw.visitor_team.full_name ?? raw.visitor_team.name,
  });
  return applyHistoricalTeamEraToGame({
    id: String(raw.id),
    season,
    gameDate: (raw.date ?? "").slice(0, 10),
    homeTeamId: home.canonicalTeamId,
    awayTeamId: away.canonicalTeamId,
    homeTeamAbbr: home.abbr,
    awayTeamAbbr: away.abbr,
    homeTeamName: home.name,
    awayTeamName: away.name,
    teamIdProvider: "bdl",
    homeProviderTeamId: home.providerTeamId,
    awayProviderTeamId: away.providerTeamId,
    homeScore: raw.home_team_score ?? 0,
    awayScore: raw.visitor_team_score ?? 0,
    gameType: raw.postseason ? "playoff" : "regular",
    status,
  });
}

export function transformBdlStatsRow(raw: BdlStats): PlayerGame {
  const season = canonicalSeasonFromStartYear(raw.game.season);
  const minutes = parseMinutes(raw.min);
  const fgm = raw.fgm ?? 0;
  const fga = raw.fga ?? 0;
  const fg3m = raw.fg3m ?? 0;
  const fta = raw.fta ?? 0;
  const pts = raw.pts ?? 0;
  const team = normalizeGameTeamSide({
    provider: "bdl",
    providerTeamId: String(raw.team.id),
    abbr: raw.team.abbreviation,
    name: raw.team.full_name ?? raw.team.name,
  });
  const home = normalizeGameTeamSide({
    provider: "bdl",
    providerTeamId: String(raw.game.home_team.id),
    abbr: raw.game.home_team.abbreviation,
    name: raw.game.home_team.full_name ?? raw.game.home_team.name,
  });
  const away = normalizeGameTeamSide({
    provider: "bdl",
    providerTeamId: String(raw.game.visitor_team.id),
    abbr: raw.game.visitor_team.abbreviation,
    name: raw.game.visitor_team.full_name ?? raw.game.visitor_team.name,
  });
  const isHome = team.canonicalTeamId === home.canonicalTeamId;
  const oreb = raw.oreb ?? undefined;
  const dreb = raw.dreb ?? undefined;
  const pf = raw.pf ?? undefined;

  return withDerivedBoxScoreMetrics({
    id: String(raw.id),
    gameId: String(raw.game.id),
    playerId: String(raw.player.id),
    playerName: `${raw.player.first_name} ${raw.player.last_name}`.trim(),
    teamId: team.canonicalTeamId,
    season,
    gameDate: (raw.game.date ?? "").slice(0, 10),
    opponentTeamId: isHome ? away.canonicalTeamId : home.canonicalTeamId,
    isHome,
    minutes,
    points: pts,
    assists: raw.ast ?? 0,
    rebounds: raw.reb ?? 0,
    ...(oreb != null ? { offensiveRebounds: oreb } : {}),
    ...(dreb != null ? { defensiveRebounds: dreb } : {}),
    steals: raw.stl ?? 0,
    blocks: raw.blk ?? 0,
    turnovers: raw.turnover ?? 0,
    ...(pf != null ? { personalFouls: pf } : {}),
    fieldGoalsMade: fgm,
    fieldGoalsAttempted: fga,
    threePointersMade: fg3m,
    threePointersAttempted: raw.fg3a ?? 0,
    freeThrowsMade: raw.ftm ?? 0,
    freeThrowsAttempted: fta,
    plusMinus: raw.plus_minus ?? 0,
  });
}

export function transformBdlBoxScore(raw: BdlBoxScore): GameBoxScore {
  const season = canonicalSeasonFromStartYear(raw.season);
  const homeRaw = raw.home_team.team;
  const awayRaw = raw.visitor_team.team;
  const home = normalizeGameTeamSide({
    provider: "bdl",
    providerTeamId: String(homeRaw.id),
    abbr: homeRaw.abbreviation,
    name: homeRaw.full_name ?? homeRaw.name,
  });
  const away = normalizeGameTeamSide({
    provider: "bdl",
    providerTeamId: String(awayRaw.id),
    abbr: awayRaw.abbreviation,
    name: awayRaw.full_name ?? awayRaw.name,
  });
  const game: Game = applyHistoricalTeamEraToGame({
    id: `${raw.date}-${homeRaw.id}-${awayRaw.id}`,
    season,
    gameDate: raw.date.slice(0, 10),
    homeTeamId: home.canonicalTeamId,
    awayTeamId: away.canonicalTeamId,
    homeTeamAbbr: home.abbr,
    awayTeamAbbr: away.abbr,
    homeTeamName: home.name,
    awayTeamName: away.name,
    teamIdProvider: "bdl",
    homeProviderTeamId: home.providerTeamId,
    awayProviderTeamId: away.providerTeamId,
    homeScore: raw.home_team_score ?? 0,
    awayScore: raw.visitor_team_score ?? 0,
    gameType: raw.postseason ? "playoff" : "regular",
    status: mapStatus(raw.status),
  });

  const players: PlayerGame[] = [
    ...raw.home_team.players.map((line, index) =>
      transformBoxLine(line, game, true, index)
    ),
    ...raw.visitor_team.players.map((line, index) =>
      transformBoxLine(line, game, false, index)
    ),
  ];

  return { game, players: finalizeBoxScorePlayers(players) };
}

export function transformBdlAdvanced(
  raw: BdlAdvancedStat
): AdvancedPlayerGameStats | null {
  if (!raw.player || !raw.game || !raw.team) return null;
  const season = canonicalSeasonFromStartYear(raw.game.season);
  return {
    id: String(raw.id ?? `${raw.game.id}-${raw.player.id}`),
    gameId: String(raw.game.id),
    playerId: String(raw.player.id),
    playerName: `${raw.player.first_name} ${raw.player.last_name}`.trim(),
    teamId: String(raw.team.id),
    season,
    gameDate: (raw.game.date ?? "").slice(0, 10),
    minutes: 0,
    offensiveRating: raw.offensive_rating,
    defensiveRating: raw.defensive_rating,
    netRating: raw.net_rating,
    trueShootingPct: raw.true_shooting_percentage,
    effectiveFieldGoalPct: raw.effective_field_goal_percentage,
    usagePct: raw.usage_percentage,
    assistPct: raw.assist_percentage,
    reboundPct: raw.rebound_percentage,
    turnoverPct: raw.turnover_ratio,
    pace: raw.pace,
    pie: raw.pie,
  };
}

function transformBoxLine(
  line: BdlBoxScorePlayerLine,
  game: Game,
  isHome: boolean,
  index: number
): PlayerGame {
  const fgm = line.fgm ?? 0;
  const fga = line.fga ?? 0;
  const fg3m = line.fg3m ?? 0;
  const fta = line.fta ?? 0;
  const pts = line.pts ?? 0;
  const oreb = line.oreb;
  const dreb = line.dreb;
  const pf = line.pf;
  return {
    id: `${game.id}-${line.player.id}-${index}`,
    gameId: game.id,
    playerId: String(line.player.id),
    playerName: `${line.player.first_name} ${line.player.last_name}`.trim(),
    teamId: isHome ? game.homeTeamId : game.awayTeamId,
    season: game.season,
    gameDate: game.gameDate,
    opponentTeamId: isHome ? game.awayTeamId : game.homeTeamId,
    isHome,
    minutes: parseMinutes(line.min),
    points: pts,
    assists: line.ast ?? 0,
    rebounds: line.reb ?? 0,
    ...(oreb != null ? { offensiveRebounds: oreb } : {}),
    ...(dreb != null ? { defensiveRebounds: dreb } : {}),
    steals: line.stl ?? 0,
    blocks: line.blk ?? 0,
    turnovers: line.turnover ?? 0,
    ...(pf != null ? { personalFouls: pf } : {}),
    fieldGoalsMade: fgm,
    fieldGoalsAttempted: fga,
    threePointersMade: fg3m,
    threePointersAttempted: line.fg3a ?? 0,
    freeThrowsMade: line.ftm ?? 0,
    freeThrowsAttempted: fta,
    plusMinus: line.plus_minus ?? 0,
  };
}

function parseMinutes(value: string | null | undefined): number {
  return parseBasketballMinutes(value);
}

function mapStatus(
  status: string | null | undefined
): Game["status"] | undefined {
  if (!status) return undefined;
  const lower = status.toLowerCase();
  if (lower.includes("postpon")) return "postponed";
  if (lower.includes("cancel")) return "cancelled";
  if (lower.includes("suspend")) return "suspended";
  if (lower.includes("delay")) return "delayed";
  if (lower.includes("halftime")) return "halftime";
  if (lower.includes("final")) return "final";
  if (lower.includes("in progress") || lower.includes("in_progress")) {
    return "in_progress";
  }
  if (lower.includes("scheduled") || lower.includes("tip")) {
    return "scheduled";
  }
  return "unknown";
}
