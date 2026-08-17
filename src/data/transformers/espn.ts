import type {
  Game,
  Player,
  PlayerGame,
  PlayerSeason,
  Position,
  Shot,
  Team,
} from "@/data/types";
import {
  effectiveFieldGoalPct,
  estimatePossessions,
  freeThrowRate,
  ratingPerHundred,
  safePct,
  threePointAttemptRate,
  trueShootingPct,
  turnoverPct,
  twoPointPct,
  usagePct,
} from "@/data/providers/nba/compute-advanced";

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
  /** Opponent points scored against this team (season total). */
  pointsAllowed: number;
  opponentFieldGoalsAttempted: number;
  opponentFreeThrowsAttempted: number;
  opponentTurnovers: number;
}

/**
 * ESPN puts metric *names* on the response-level category schema and only
 * *values* on each athlete/team row. Merge them here.
 */
export function categoryMap(
  valueCategories: EspnStatCategoryValues[],
  schemaCategories: EspnStatCategorySchema[] = [],
  split: "own" | "opponent" | "all" = "own"
): Map<string, number> {
  const map = new Map<string, number>();

  const schemasByName = new Map<string, string[]>();
  for (const schema of schemaCategories) {
    if (schema.names?.length && !schemasByName.has(schema.name)) {
      schemasByName.set(schema.name, schema.names);
    }
  }

  for (const category of valueCategories) {
    const isOpponent = Boolean(category.displayName?.startsWith("Opponent"));
    if (split === "own" && isOpponent) continue;
    if (split === "opponent" && !isOpponent) continue;

    const names = category.names ?? schemasByName.get(category.name) ?? [];

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
  const stats = categoryMap(row.categories, schemaCategories, "own");
  const opp = categoryMap(row.categories, schemaCategories, "opponent");
  return {
    teamId: row.team.id,
    abbreviation: row.team.abbreviation,
    fullName: row.team.displayName,
    gamesPlayed: num(stats, "gamesPlayed"),
    fieldGoalsAttempted: num(stats, "fieldGoalsAttempted"),
    freeThrowsAttempted: num(stats, "freeThrowsAttempted"),
    turnovers: num(stats, "turnovers"),
    points: num(stats, "points"),
    pointsAllowed: num(opp, "points"),
    opponentFieldGoalsAttempted: num(opp, "fieldGoalsAttempted"),
    opponentFreeThrowsAttempted: num(opp, "freeThrowsAttempted"),
    opponentTurnovers: num(opp, "turnovers"),
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
  const tpa = num(stats, "threePointFieldGoalsAttempted");
  const ftm = num(stats, "freeThrowsMade");
  const fta = num(stats, "freeThrowsAttempted");
  const turnovers = num(stats, "turnovers");
  const minutes = num(stats, "minutes");
  const gamesPlayed = num(stats, "gamesPlayed");
  const gamesStarted = num(stats, "gamesStarted", gamesPlayed);
  const offensiveRebounds = num(stats, "offensiveRebounds");
  const defensiveRebounds = num(
    stats,
    "defensiveRebounds",
    Math.max(
      0,
      num(stats, "rebounds", num(stats, "avgRebounds") * gamesPlayed) -
        offensiveRebounds
    )
  );
  const rebFallback =
    offensiveRebounds + defensiveRebounds > 0
      ? offensiveRebounds + defensiveRebounds
      : num(stats, "avgRebounds") * gamesPlayed;
  const rebounds = num(stats, "rebounds", rebFallback);
  const personalFouls = num(
    stats,
    "fouls",
    num(stats, "personalFouls", num(stats, "avgFouls") * gamesPlayed)
  );

  const fgPct = safePct(fgm, fga) || pctToFraction(num(stats, "fieldGoalPct"));
  const fg3Pct =
    safePct(tpm, tpa) ||
    pctToFraction(
      num(stats, "threePointFieldGoalPct", num(stats, "threePointPct"))
    );
  const ftPct =
    safePct(ftm, fta) || pctToFraction(num(stats, "freeThrowPct"));

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

  const possessions = estimatePossessions(fga, fta, turnovers);
  const offensiveRating = ratingPerHundred(points, possessions);
  // Player-level DRtg is not published on ESPN's athlete dashboard; use the
  // team defensive rating (points allowed per 100 opponent possessions).
  const teamDefPoss = team
    ? estimatePossessions(
        team.opponentFieldGoalsAttempted,
        team.opponentFreeThrowsAttempted,
        team.opponentTurnovers
      )
    : 0;
  const defensiveRating = team
    ? ratingPerHundred(team.pointsAllowed, teamDefPoss)
    : 0;
  const netRating =
    offensiveRating && defensiveRating
      ? offensiveRating - defensiveRating
      : 0;

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
    gamesStarted,
    minutes,
    fieldGoalsMade: fgm,
    fieldGoalsAttempted: fga,
    threePointersMade: tpm,
    threePointersAttempted: tpa,
    freeThrowsMade: ftm,
    freeThrowsAttempted: fta,
    offensiveRebounds,
    defensiveRebounds,
    rebounds,
    assists: num(stats, "assists"),
    steals: num(stats, "steals"),
    blocks: num(stats, "blocks"),
    turnovers,
    personalFouls,
    points,
    plusMinus: 0,
    fieldGoalPct: fgPct,
    twoPointPct: twoPointPct(fgm, tpm, fga, tpa),
    threePointPct: fg3Pct,
    freeThrowPct: ftPct,
    effectiveFieldGoalPct: efg,
    trueShootingPct: ts,
    threePointAttemptRate: threePointAttemptRate(tpa, fga),
    freeThrowRate: freeThrowRate(fta, fga),
    turnoverPct: turnoverPct(turnovers, fga, fta),
    usagePct: usg,
    assistPct: 0,
    offensiveReboundPct: 0,
    defensiveReboundPct: 0,
    reboundPct: 0,
    stealPct: 0,
    blockPct: 0,
    pie: 0,
    offensiveRating,
    defensiveRating,
    netRating,
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
  competitions?: Array<{
    status?: {
      type?: {
        state?: string;
        completed?: boolean;
        name?: string;
      };
    };
    competitors?: Array<{
      homeAway?: string;
      score?: unknown;
      winner?: boolean;
      team?: {
        id?: string;
        abbreviation?: string;
        displayName?: string;
      };
      id?: string;
    }>;
  }>;
}

export function transformEspnScheduleEvent(
  event: EspnScheduleEvent,
  season: string,
  gameType: Game["gameType"] = "regular"
): Game | null {
  const competition = event.competitions?.[0];
  if (!competition) return null;

  const home = competition.competitors?.find((c) => c.homeAway === "home");
  const away = competition.competitors?.find((c) => c.homeAway === "away");
  if (!home || !away) return null;

  const statusType = competition.status?.type;
  let status: Game["status"] = "scheduled";
  if (statusType?.completed || statusType?.state === "post") status = "final";
  else if (statusType?.state === "in") status = "in_progress";

  return {
    id: event.id,
    season,
    gameDate: (event.date ?? "").slice(0, 10),
    homeTeamId: String(home.team?.id ?? home.id ?? ""),
    awayTeamId: String(away.team?.id ?? away.id ?? ""),
    homeTeamAbbr: home.team?.abbreviation,
    awayTeamAbbr: away.team?.abbreviation,
    homeTeamName: home.team?.displayName,
    awayTeamName: away.team?.displayName,
    homeScore: parseEspnScore(home.score),
    awayScore: parseEspnScore(away.score),
    gameType,
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
  plays?: EspnPlay[];
  gameInfo?: { date?: string };
}

export interface EspnPlay {
  id?: string;
  text?: string;
  shootingPlay?: boolean;
  scoringPlay?: boolean;
  scoreValue?: number;
  pointsAttempted?: number;
  coordinate?: { x?: number; y?: number };
  period?: { number?: number };
  clock?: { displayValue?: string; value?: number };
  team?: { id?: string };
  participants?: Array<{ athlete?: { id?: string } }>;
  type?: { text?: string };
}

/**
 * ESPN shot coordinates use roughly feet with basket near (25, 0) on a
 * half-court grid. Convert to our canonical basket-at-(0,0) system.
 */
export function transformEspnPlaysToShots(
  plays: EspnPlay[],
  meta: {
    gameId: string;
    season: string;
    gameDate: string;
  }
): Shot[] {
  const shots: Shot[] = [];

  for (const play of plays) {
    if (!play.shootingPlay) continue;
    const playerId = play.participants?.[0]?.athlete?.id;
    const teamId = play.team?.id;
    if (!playerId || !teamId) continue;

    const rawX = play.coordinate?.x;
    const rawY = play.coordinate?.y;
    if (rawX == null || rawY == null) continue;

    const locX = rawX - 25;
    const locY = rawY;
    const shotDistance = Math.sqrt(locX * locX + locY * locY);
    const pointsAttempted = play.pointsAttempted ?? play.scoreValue ?? 2;
    const shotType: Shot["shotType"] = pointsAttempted >= 3 ? "3PT" : "2PT";
    const made = Boolean(play.scoringPlay);
    const assistPlayerId = play.participants?.[1]?.athlete?.id;

    const clock = play.clock?.displayValue ?? "0:00";
    const [mins, secs] = clock.split(":").map((p) => Number(p) || 0);
    const secondsRemaining = mins * 60 + secs;

    shots.push({
      id: String(play.id ?? `${meta.gameId}-${playerId}-${shots.length}`),
      gameId: meta.gameId,
      playerId: String(playerId),
      teamId: String(teamId),
      season: meta.season,
      gameDate: meta.gameDate,
      period: play.period?.number ?? 1,
      secondsRemaining,
      shotDistance: Number(shotDistance.toFixed(1)),
      locX: Number(locX.toFixed(1)),
      locY: Number(locY.toFixed(1)),
      made,
      shotType,
      shotZoneBasic: play.type?.text,
      assisted: Boolean(assistPlayerId),
      assistPlayerId: assistPlayerId ? String(assistPlayerId) : undefined,
    });
  }

  return shots;
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

function boxPair(stats: Map<string, string>, key: string): [number, number] {
  const raw = stats.get(key) ?? "0-0";
  const [made, attempted] = raw.split("-").map((part) => Number(part) || 0);
  return [made, attempted];
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
    const names = statsBlock?.names ?? [];
    const opponent =
      teamId === game.homeTeamId ? game.awayTeamId : game.homeTeamId;
    const isHome = teamId === game.homeTeamId;

    for (const row of statsBlock?.athletes ?? []) {
      if (!row.athlete?.id || row.didNotPlay) continue;
      const map = new Map<string, string>();
      names.forEach((name, index) => {
        map.set(name, row.stats?.[index] ?? "0");
      });

      const [fgm, fga] = boxPair(map, "FG");
      const [tpm, tpa] = boxPair(map, "3PT");
      const [ftm, fta] = boxPair(map, "FT");

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
        minutes: boxStat(map, "MIN", "minutes"),
        points: boxStat(map, "PTS", "points"),
        assists: boxStat(map, "AST", "assists"),
        rebounds: boxStat(map, "REB", "totalRebounds"),
        steals: boxStat(map, "STL", "steals"),
        blocks: boxStat(map, "BLK", "blocks"),
        turnovers: boxStat(map, "TO", "turnovers"),
        fieldGoalsMade: fgm,
        fieldGoalsAttempted: fga,
        threePointersMade: tpm,
        threePointersAttempted: tpa,
        freeThrowsMade: ftm,
        freeThrowsAttempted: fta,
        plusMinus: boxStat(map, "+/-", "plusMinus"),
      });
    }
  }

  return { game, players };
}
