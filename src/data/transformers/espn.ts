import type {
  Game,
  Player,
  PlayerGame,
  PlayerSeason,
  Position,
  Team,
} from "@/data/types";
import {
  approxOffensiveRating,
  effectiveFieldGoalPct,
  gameScore,
  trueShootingPct,
  turnoverPct,
  usagePct,
} from "@/data/providers/nba/compute-advanced";
import { enrichBoxScoreAdvanced } from "@/data/providers/nba/enrich-box-score";

export interface EspnStatCategorySchema {
  name: string;
  displayName?: string;
  names?: string[];
}

export interface EspnStatCategoryValues {
  name: string;
  displayName?: string;
  names?: string[];
  totals?: Array<string | number>;
  values?: number[];
}

export interface EspnAthleteCard {
  id: string;
  firstName?: string;
  lastName?: string;
  displayName: string;
  position?: { abbreviation?: string };
  teamId?: string;
  teamName?: string;
  teamShortName?: string;
  teams?: Array<{ name?: string; abbreviation?: string }>;
}

export interface EspnAthleteStatsRow {
  athlete: EspnAthleteCard;
  categories: EspnStatCategoryValues[];
}

export interface EspnTeamCard {
  id: string;
  abbreviation: string;
  displayName: string;
  name?: string;
  shortDisplayName?: string;
  location?: string;
  isActive?: boolean;
}

export interface EspnTeamStatsRow {
  team: EspnTeamCard;
  categories: EspnStatCategoryValues[];
}

export interface TeamSeasonTotals {
  teamId: string;
  abbreviation: string;
  fullName: string;
  gamesPlayed: number;
  fieldGoalsAttempted: number;
  freeThrowsAttempted: number;
  turnovers: number;
  points: number;
}

/**
 * ESPN puts metric *names* on the response-level category schema and only
 * *values* on each athlete/team row. Merge them here.
 */
export function categoryMap(
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

    const names =
      category.names ?? schemasByName.get(category.name) ?? [];

    names.forEach((name, nameIndex) => {
      const value = category.values?.[nameIndex];
      if (typeof value === "number" && Number.isFinite(value) && !map.has(name)) {
        map.set(name, value);
      }
    });
  }

  return map;
}

function num(map: Map<string, number>, key: string, fallback = 0): number {
  return map.get(key) ?? fallback;
}

function pctToFraction(value: number): number {
  if (value > 1) return value / 100;
  return value;
}

export function mapEspnPosition(abbreviation?: string): Position | undefined {
  if (!abbreviation) return undefined;
  const key = abbreviation.toUpperCase();
  if (key === "PG" || key === "SG" || key === "SF" || key === "PF" || key === "C") {
    return key;
  }
  if (key === "G") return "SG";
  if (key === "F") return "SF";
  if (key === "G-F" || key === "F-G") return "SF";
  if (key === "F-C" || key === "C-F") return "PF";
  return undefined;
}

export function transformEspnTeam(raw: EspnTeamCard): Team {
  const city =
    raw.location ||
    raw.displayName.replace(new RegExp(`\\s*${raw.name ?? ""}$`), "").trim() ||
    raw.displayName;

  return {
    id: raw.id,
    abbreviation: raw.abbreviation,
    fullName: raw.displayName,
    city,
    nickname: raw.name || raw.shortDisplayName || raw.abbreviation,
    conference: "East",
    division: "Unknown",
  };
}

export function transformEspnTeamTotals(
  row: EspnTeamStatsRow,
  schemaCategories: EspnStatCategorySchema[] = []
): TeamSeasonTotals {
  const stats = categoryMap(row.categories, schemaCategories);
  return {
    teamId: row.team.id,
    abbreviation: row.team.abbreviation,
    fullName: row.team.displayName,
    gamesPlayed: num(stats, "gamesPlayed"),
    fieldGoalsAttempted: num(stats, "fieldGoalsAttempted"),
    freeThrowsAttempted: num(stats, "freeThrowsAttempted"),
    turnovers: num(stats, "turnovers"),
    points: num(stats, "points"),
  };
}

export function transformEspnPlayer(raw: EspnAthleteCard): Player {
  return {
    id: String(raw.id),
    fullName: raw.displayName,
    firstName: raw.firstName ?? raw.displayName.split(" ")[0] ?? "",
    lastName:
      raw.lastName ??
      raw.displayName.split(" ").slice(1).join(" ") ??
      raw.displayName,
    position: mapEspnPosition(raw.position?.abbreviation),
    currentTeamId: raw.teamId ? String(raw.teamId) : undefined,
  };
}

export function transformEspnPlayerSeason(
  row: EspnAthleteStatsRow,
  season: string,
  teamTotals: Map<string, TeamSeasonTotals>,
  schemaCategories: EspnStatCategorySchema[] = []
): PlayerSeason {
  const stats = categoryMap(row.categories, schemaCategories);
  const athlete = row.athlete;
  const teamId = String(athlete.teamId ?? "");
  const team = teamTotals.get(teamId);

  const points = num(stats, "points");
  const fgm = num(stats, "fieldGoalsMade");
  const fga = num(stats, "fieldGoalsAttempted");
  const tpm = num(stats, "threePointFieldGoalsMade");
  const fta = num(stats, "freeThrowsAttempted");
  const turnovers = num(stats, "turnovers");
  const minutes = num(stats, "minutes");
  const gamesPlayed = num(stats, "gamesPlayed");

  const fgPct = pctToFraction(num(stats, "fieldGoalPct"));
  const fg3Pct = pctToFraction(
    num(stats, "threePointFieldGoalPct", num(stats, "threePointPct"))
  );
  const ftPct = pctToFraction(num(stats, "freeThrowPct"));

  const ts = trueShootingPct(points, fga, fta);
  const efg = effectiveFieldGoalPct(fgm, tpm, fga);
  const usg = team
    ? usagePct({
        minutes,
        fieldGoalsAttempted: fga,
        freeThrowsAttempted: fta,
        turnovers,
        teamGamesPlayed: team.gamesPlayed || gamesPlayed,
        teamFieldGoalsAttempted: team.fieldGoalsAttempted,
        teamFreeThrowsAttempted: team.freeThrowsAttempted,
        teamTurnovers: team.turnovers,
      })
    : 0;

  const possessions = fga + 0.44 * fta + turnovers;
  const offensiveRating = possessions > 0 ? (points / possessions) * 100 : 0;
  const defensiveRating = 0;
  const netRating = offensiveRating ? offensiveRating - 110 : 0;

  return {
    playerId: String(athlete.id),
    playerName: athlete.displayName,
    teamId,
    teamName:
      team?.fullName ||
      athlete.teamName ||
      athlete.teams?.[0]?.name ||
      athlete.teamShortName ||
      "Unknown",
    season,
    position: mapEspnPosition(athlete.position?.abbreviation),
    gamesPlayed,
    minutes,
    points,
    assists: num(stats, "assists"),
    rebounds: num(stats, "rebounds", num(stats, "avgRebounds") * gamesPlayed),
    steals: num(stats, "steals"),
    blocks: num(stats, "blocks"),
    turnovers,
    fieldGoalPct: fgPct,
    threePointPct: fg3Pct,
    freeThrowPct: ftPct,
    trueShootingPct: ts,
    effectiveFieldGoalPct: efg,
    usagePct: usg,
    offensiveRating,
    defensiveRating,
    netRating,
  };
}

export interface EspnGameLogEvent {
  id: string;
  gameDate?: string;
  atVs?: string;
  opponent?: { id?: string; abbreviation?: string; displayName?: string };
  homeAway?: string;
  score?: string;
  outcome?: { text?: string };
  stats?: string[];
}

export function transformEspnPlayerGame(
  event: EspnGameLogEvent,
  names: string[],
  playerId: string,
  teamId: string,
  season: string
): PlayerGame {
  const stats = new Map<string, string>();
  names.forEach((name, index) => {
    stats.set(name, event.stats?.[index] ?? "0");
  });

  const parsePair = (key: string): [number, number] => {
    const raw = stats.get(key) ?? "0-0";
    const [made, attempted] = raw.split("-").map((part) => Number(part) || 0);
    return [made, attempted];
  };

  const [fgm, fga] = parsePair("fieldGoalsMade-fieldGoalsAttempted");
  const [tpm, tpa] = parsePair(
    "threePointFieldGoalsMade-threePointFieldGoalsAttempted"
  );
  const [ftm, fta] = parsePair("freeThrowsMade-freeThrowsAttempted");

  return {
    id: `${playerId}-${event.id}`,
    gameId: event.id,
    playerId,
    teamId,
    season,
    gameDate: (event.gameDate ?? "").slice(0, 10),
    opponentTeamId: String(event.opponent?.id ?? ""),
    isHome: (event.homeAway ?? event.atVs ?? "").toLowerCase() === "home",
    minutes: Number(stats.get("minutes") ?? 0) || 0,
    points: Number(stats.get("points") ?? 0) || 0,
    assists: Number(stats.get("assists") ?? 0) || 0,
    rebounds: Number(stats.get("totalRebounds") ?? 0) || 0,
    steals: Number(stats.get("steals") ?? 0) || 0,
    blocks: Number(stats.get("blocks") ?? 0) || 0,
    turnovers: Number(stats.get("turnovers") ?? 0) || 0,
    fieldGoalsMade: fgm,
    fieldGoalsAttempted: fga,
    threePointersMade: tpm,
    threePointersAttempted: tpa,
    freeThrowsMade: ftm,
    freeThrowsAttempted: fta,
    plusMinus: 0,
  };
}

export function parseEspnScore(score: unknown): number {
  if (typeof score === "number") return score;
  if (typeof score === "string") return Number(score) || 0;
  if (score && typeof score === "object" && "value" in score) {
    return Number((score as { value?: number }).value) || 0;
  }
  return 0;
}

export interface EspnScheduleEvent {
  id: string;
  date?: string;
  name?: string;
  status?: {
    type?: {
      state?: string;
      completed?: boolean;
      name?: string;
      shortDetail?: string;
      detail?: string;
    };
  };
  competitions?: Array<{
    status?: {
      type?: {
        state?: string;
        completed?: boolean;
        name?: string;
        shortDetail?: string;
        detail?: string;
      };
    };
    competitors?: Array<{
      homeAway?: string;
      score?: unknown;
      winner?: boolean;
      /** Period-by-period points when ESPN includes linescores. */
      linescores?: Array<{ value?: number | string; displayValue?: string }>;
      team?: {
        id?: string;
        abbreviation?: string;
        displayName?: string;
      };
      id?: string;
    }>;
  }>;
}

function parseEspnLinescores(
  linescores: Array<{ value?: number | string; displayValue?: string }> | undefined
): number[] | undefined {
  if (!linescores?.length) return undefined;
  const values = linescores.map((row) => {
    if (typeof row.value === "number" && Number.isFinite(row.value)) {
      return row.value;
    }
    if (typeof row.value === "string") {
      const n = Number(row.value);
      if (Number.isFinite(n)) return n;
    }
    if (row.displayValue != null) {
      const n = Number(row.displayValue);
      if (Number.isFinite(n)) return n;
    }
    return NaN;
  });
  if (!values.every((n) => Number.isFinite(n))) return undefined;
  return values;
}

export function transformEspnScheduleEvent(
  event: EspnScheduleEvent,
  season: string
): Game | null {
  const competition = event.competitions?.[0];
  if (!competition) return null;

  const home = competition.competitors?.find((c) => c.homeAway === "home");
  const away = competition.competitors?.find((c) => c.homeAway === "away");
  if (!home || !away) return null;

  const statusType = competition.status?.type ?? event.status?.type;
  let status: Game["status"] = "scheduled";
  if (statusType?.completed || statusType?.state === "post") status = "final";
  else if (statusType?.state === "in") status = "in_progress";

  const tipOffAt = event.date?.trim() || undefined;
  const statusDetail =
    statusType?.shortDetail?.trim() || statusType?.detail?.trim() || undefined;

  const homePeriodScores = parseEspnLinescores(home.linescores);
  const awayPeriodScores = parseEspnLinescores(away.linescores);

  return {
    id: event.id,
    season,
    gameDate: (event.date ?? "").slice(0, 10),
    tipOffAt,
    statusDetail,
    homeTeamId: String(home.team?.id ?? home.id ?? ""),
    awayTeamId: String(away.team?.id ?? away.id ?? ""),
    homeTeamAbbr: home.team?.abbreviation,
    awayTeamAbbr: away.team?.abbreviation,
    homeTeamName: home.team?.displayName,
    awayTeamName: away.team?.displayName,
    homeScore: parseEspnScore(home.score),
    awayScore: parseEspnScore(away.score),
    ...(homePeriodScores && awayPeriodScores
      ? { homePeriodScores, awayPeriodScores }
      : {}),
    gameType: "regular",
    status,
  };
}

export interface EspnBoxScoreAthlete {
  athlete?: {
    id?: string;
    displayName?: string;
  };
  starter?: boolean;
  didNotPlay?: boolean;
  stats?: string[];
}

export interface EspnBoxScoreTeamBlock {
  team?: {
    id?: string;
    abbreviation?: string;
    displayName?: string;
  };
  statistics?: Array<{
    names?: string[];
    labels?: string[];
    athletes?: EspnBoxScoreAthlete[];
  }>;
}

export interface EspnSummaryResponse {
  header?: {
    id?: string;
    season?: { year?: number; type?: number };
    competitions?: EspnScheduleEvent["competitions"];
  };
  boxscore?: {
    players?: EspnBoxScoreTeamBlock[];
  };
}

function boxStat(stats: Map<string, string>, ...keys: string[]): number {
  for (const key of keys) {
    const raw = stats.get(key);
    if (raw != null && raw !== "") {
      const n = Number(String(raw).replace("+", ""));
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
}

function boxPair(stats: Map<string, string>, ...keys: string[]): [number, number] {
  for (const key of keys) {
    const raw = stats.get(key);
    if (raw == null || raw === "") continue;
    const [made, attempted] = raw.split("-").map((part) => Number(part) || 0);
    return [made, attempted];
  }
  return [0, 0];
}

export function transformEspnBoxScore(
  summary: EspnSummaryResponse,
  season: string
): { game: Game; players: PlayerGame[] } | null {
  const competition = summary.header?.competitions?.[0];
  if (!competition) return null;

  const synthetic: EspnScheduleEvent = {
    id: String(summary.header?.id ?? ""),
    date: undefined,
    competitions: summary.header?.competitions,
  };

  // Prefer date from competitors' side if present later; callers may patch.
  const game = transformEspnScheduleEvent(
    {
      ...synthetic,
      date: (summary as { gameInfo?: { date?: string } }).gameInfo?.date,
    },
    season
  );
  if (!game || !game.id) return null;

  const players: PlayerGame[] = [];
  for (const block of summary.boxscore?.players ?? []) {
    const teamId = String(block.team?.id ?? "");
    const statsBlock = block.statistics?.[0];
    const names = statsBlock?.names ?? statsBlock?.labels ?? [];
    const opponent =
      teamId === game.homeTeamId ? game.awayTeamId : game.homeTeamId;
    const isHome = teamId === game.homeTeamId;

    for (const row of statsBlock?.athletes ?? []) {
      if (!row.athlete?.id || row.didNotPlay) continue;
      const map = new Map<string, string>();
      names.forEach((name, index) => {
        map.set(name, row.stats?.[index] ?? "0");
      });

      const [fgm, fga] = boxPair(map, "FG", "fieldGoalsMade-fieldGoalsAttempted");
      const [tpm, tpa] = boxPair(
        map,
        "3PT",
        "threePointFieldGoalsMade-threePointFieldGoalsAttempted"
      );
      const [ftm, fta] = boxPair(map, "FT", "freeThrowsMade-freeThrowsAttempted");
      const oreb = boxStat(map, "OREB", "offensiveRebounds");
      const dreb = boxStat(map, "DREB", "defensiveRebounds");
      const reb =
        boxStat(map, "REB", "totalRebounds") || oreb + dreb;
      const pf = boxStat(map, "PF", "fouls", "personalFouls");
      const points = boxStat(map, "PTS", "points");
      const assists = boxStat(map, "AST", "assists");
      const steals = boxStat(map, "STL", "steals");
      const blocks = boxStat(map, "BLK", "blocks");
      const turnovers = boxStat(map, "TO", "turnovers");
      const minutes = boxStat(map, "MIN", "minutes");

      players.push({
        id: `${row.athlete.id}-${game.id}`,
        gameId: game.id,
        playerId: String(row.athlete.id),
        playerName: row.athlete.displayName,
        teamId,
        season,
        gameDate: game.gameDate,
        opponentTeamId: opponent,
        isHome,
        minutes,
        points,
        assists,
        rebounds: reb,
        offensiveRebounds: oreb,
        defensiveRebounds: dreb,
        steals,
        blocks,
        turnovers,
        personalFouls: pf,
        fieldGoalsMade: fgm,
        fieldGoalsAttempted: fga,
        threePointersMade: tpm,
        threePointersAttempted: tpa,
        freeThrowsMade: ftm,
        freeThrowsAttempted: fta,
        plusMinus: boxStat(map, "+/-", "plusMinus"),
        trueShootingPct: trueShootingPct(points, fga, fta),
        effectiveFieldGoalPct: effectiveFieldGoalPct(fgm, tpm, fga),
        offensiveRating: approxOffensiveRating(points, fga, fta, turnovers),
        turnoverPct: turnoverPct(turnovers, fga, fta),
        gameScore: gameScore({
          points,
          fieldGoalsMade: fgm,
          fieldGoalsAttempted: fga,
          freeThrowsMade: ftm,
          freeThrowsAttempted: fta,
          offensiveRebounds: oreb,
          defensiveRebounds: dreb,
          steals,
          assists,
          blocks,
          personalFouls: pf,
          turnovers,
        }),
      });
    }
  }

  return {
    game,
    players: enrichBoxScoreAdvanced(players),
  };
}
