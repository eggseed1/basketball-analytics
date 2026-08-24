import "server-only";

import type { Game, GameBoxScore, PlayerGame } from "@/data/types";
import { getCanonicalTeamFromProvider } from "@/data/identity/team-map";
import { finalizeBoxScorePlayers } from "@/data/providers/nba/enrich-box-score";
import { seasonFromNbaGameId } from "@/lib/game-presentation";
import { parseBasketballMinutes } from "@/lib/parse-basketball-minutes";

const HEADERS: Record<string, string> = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Origin: "https://www.nba.com",
  Referer: "https://www.nba.com/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
};

type RawPlayer = Record<string, unknown>;
type RawTeam = {
  teamId?: number | string;
  teamTricode?: string;
  teamCity?: string;
  teamName?: string;
  score?: number | string;
  players?: RawPlayer[];
  periods?: Array<{ score?: number | string }>;
};
type RawBox = {
  game?: {
    gameId?: string;
    gameEt?: string;
    gameTimeLocal?: string;
    gameTimeUTC?: string;
    gameStatus?: number | string;
    gameStatusText?: string;
    period?: number | string;
    gameClock?: string;
    homeTeam?: RawTeam;
    awayTeam?: RawTeam;
  };
};

function parseMinutes(raw: unknown): number {
  if (raw == null) return 0;
  return parseBasketballMinutes(raw as string | number);
}

function numField(st: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const value = st[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
}

function optionalNumField(
  st: Record<string, unknown>,
  ...keys: string[]
): number | null {
  for (const key of keys) {
    const value = st[key];
    if (value == null || value === "") continue;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function status(code: unknown, text: unknown): Game["status"] {
  const label = String(text ?? "").toLowerCase();
  if (label.includes("postpon")) return "postponed";
  if (label.includes("cancel")) return "cancelled";
  if (label.includes("suspend")) return "suspended";
  if (label.includes("delay")) return "delayed";
  if (label.includes("half")) return "halftime";
  const n = Number(code);
  if (n === 1) return "scheduled";
  if (n === 2) return "in_progress";
  if (n === 3) return "final";
  return "unknown";
}

function score(team: RawTeam | undefined): number {
  const n = Number(team?.score);
  return Number.isFinite(n) ? n : 0;
}

function periodScores(team: RawTeam | undefined): number[] | undefined {
  if (!team?.periods?.length) return undefined;
  return team.periods.map((period) => {
    const n = Number(period.score);
    return Number.isFinite(n) ? n : 0;
  });
}

function dateFromRaw(raw: RawBox["game"]): string {
  for (const value of [raw?.gameTimeUTC, raw?.gameEt, raw?.gameTimeLocal]) {
    const text = String(value ?? "");
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(text);
    if (match?.[1]) return match[1];
  }
  return "";
}

export function transformNbaCdnBoxScore(raw: RawBox): GameBoxScore | null {
  const source = raw.game;
  const id = String(source?.gameId ?? "").trim();
  const home = source?.homeTeam;
  const away = source?.awayTeam;
  const homeProvider = String(home?.teamId ?? "").trim();
  const awayProvider = String(away?.teamId ?? "").trim();
  if (!id || !homeProvider || !awayProvider || !home || !away) return null;

  const homeTeamId =
    getCanonicalTeamFromProvider("nba", homeProvider)?.canonicalTeamId ??
    homeProvider;
  const awayTeamId =
    getCanonicalTeamFromProvider("nba", awayProvider)?.canonicalTeamId ??
    awayProvider;
  const season = seasonFromNbaGameId(id) ?? "";
  const gameDate = dateFromRaw(source);
  const gameStatus = status(source?.gameStatus, source?.gameStatusText);
  const homePeriods = periodScores(home);
  const awayPeriods = periodScores(away);
  const period = Number(source?.period);
  const clock = String(source?.gameClock ?? "").trim();

  const game: Game = {
    id,
    season,
    gameDate,
    homeTeamId,
    awayTeamId,
    homeTeamAbbr: home.teamTricode,
    awayTeamAbbr: away.teamTricode,
    homeTeamName: [home.teamCity, home.teamName].filter(Boolean).join(" "),
    awayTeamName: [away.teamCity, away.teamName].filter(Boolean).join(" "),
    homeScore: score(home),
    awayScore: score(away),
    ...(homePeriods && awayPeriods
      ? { homePeriodScores: homePeriods, awayPeriodScores: awayPeriods }
      : {}),
    gameType: id.startsWith("004") ? "playoff" : "regular",
    status: gameStatus,
    teamIdProvider: "nba",
    homeProviderTeamId: homeProvider,
    awayProviderTeamId: awayProvider,
    ...(Number.isFinite(period) && period > 0 ? { period } : {}),
    ...(clock ? { displayClock: clock } : {}),
    ...(String(source?.gameStatusText ?? "").trim()
      ? { statusDetail: String(source?.gameStatusText).trim() }
      : {}),
    retrievedAt: new Date().toISOString(),
  };

  const mapPlayers = (team: RawTeam, isHome: boolean): PlayerGame[] => {
    const teamId = isHome ? homeTeamId : awayTeamId;
    const opponentTeamId = isHome ? awayTeamId : homeTeamId;
    const rows: PlayerGame[] = [];
    for (const player of team.players ?? []) {
      const personId = player.personId ?? player.playerId;
      if (personId == null) continue;
      const st = (player.statistics ?? {}) as Record<string, unknown>;
      const minutes = parseMinutes(st.minutes ?? st.minutesCalculated);
      const played = player.played === "1" || player.played === 1 || minutes > 0;
      const starter =
        player.starter === true || player.starter === 1 || player.starter === "1";
      const statusReason = String(player.status ?? player.notPlayingReason ?? "").trim();
      const oreb = optionalNumField(
        st,
        "reboundsOffensive",
        "offensiveRebounds",
        "oreb"
      );
      const dreb = optionalNumField(
        st,
        "reboundsDefensive",
        "defensiveRebounds",
        "dreb"
      );
      const fouls = optionalNumField(
        st,
        "foulsPersonal",
        "personalFouls",
        "fouls",
        "pf"
      );

      rows.push({
        id: `${personId}-${id}`,
        gameId: id,
        playerId: String(personId),
        playerName: String(
          player.name ||
            [player.firstName, player.familyName].filter(Boolean).join(" ") ||
            ""
        ),
        teamId,
        season,
        gameDate,
        opponentTeamId,
        isHome,
        startPosition: starter ? String(player.position ?? "") || undefined : undefined,
        minutes,
        points: numField(st, "points"),
        rebounds: numField(st, "reboundsTotal", "rebounds", "reb"),
        ...(oreb != null ? { offensiveRebounds: oreb } : {}),
        ...(dreb != null ? { defensiveRebounds: dreb } : {}),
        assists: numField(st, "assists"),
        steals: numField(st, "steals"),
        blocks: numField(st, "blocks"),
        turnovers: numField(st, "turnovers"),
        ...(fouls != null ? { personalFouls: fouls } : {}),
        fieldGoalsMade: numField(st, "fieldGoalsMade"),
        fieldGoalsAttempted: numField(st, "fieldGoalsAttempted"),
        threePointersMade: numField(st, "threePointersMade"),
        threePointersAttempted: numField(st, "threePointersAttempted"),
        freeThrowsMade: numField(st, "freeThrowsMade"),
        freeThrowsAttempted: numField(st, "freeThrowsAttempted"),
        plusMinus: numField(st, "plusMinusPoints", "plusMinus"),
        didNotPlay: !played,
        ...(statusReason ? { statusReason } : {}),
      });
    }
    return rows;
  };

  return {
    game,
    players: finalizeBoxScorePlayers([
      ...mapPlayers(home, true),
      ...mapPlayers(away, false),
    ]),
  };
}

export async function fetchNbaCdnBoxScore(
  gameId: string
): Promise<GameBoxScore | null> {
  const id = String(gameId ?? "").trim();
  if (!/^00\d{8}$/.test(id)) return null;
  const url = `https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${encodeURIComponent(id)}.json`;
  const response = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(3_500),
    next: { revalidate: 30 },
  } as RequestInit);
  if (!response.ok) return null;
  return transformNbaCdnBoxScore((await response.json()) as RawBox);
}
