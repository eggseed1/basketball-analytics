/**
 * Load CDN-shaped boxscore from the local DRBL raw archive (no network).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { Game, GameBoxScore, PlayerGame } from "@/data/types";
import { getCanonicalTeamFromProvider } from "@/data/identity/team-map";
import { seasonFromNbaGameId } from "@/lib/game-presentation";
import { parseBasketballMinutes } from "@/lib/parse-basketball-minutes";

function rawGamesRoot(): string {
  return (
    process.env.DRBL_DATA_ROOT?.trim() ||
    path.join(process.cwd(), "data", "drbl", "raw")
  );
}

function parseMinutes(raw: unknown): number {
  if (raw == null) return 0;
  if (typeof raw === "number" || typeof raw === "string") {
    return parseBasketballMinutes(raw);
  }
  return parseBasketballMinutes(String(raw));
}

/**
 * Read `data/drbl/raw/games/{gameId}/boxscore.json` when present.
 * Returns null if missing or incomplete (never invents empty FINAL shells).
 */
export function loadRawArchiveBoxScore(gameId: string): GameBoxScore | null {
  const id = String(gameId ?? "").trim();
  if (!id) return null;
  const boxPath = path.join(rawGamesRoot(), "games", id, "boxscore.json");
  if (!existsSync(boxPath)) return null;

  let raw: {
    game?: {
      gameId?: string;
      gameEt?: string;
      homeTeam?: {
        teamId?: number;
        teamTricode?: string;
        teamCity?: string;
        teamName?: string;
        score?: number;
        players?: Array<Record<string, unknown>>;
      };
      awayTeam?: {
        teamId?: number;
        teamTricode?: string;
        teamCity?: string;
        teamName?: string;
        score?: number;
        players?: Array<Record<string, unknown>>;
      };
    };
  };
  try {
    raw = JSON.parse(readFileSync(boxPath, "utf8"));
  } catch {
    return null;
  }

  const home = raw.game?.homeTeam;
  const away = raw.game?.awayTeam;
  if (!home?.teamId || !away?.teamId) return null;

  const homeProvider = String(home.teamId);
  const awayProvider = String(away.teamId);
  const homeTeamId =
    getCanonicalTeamFromProvider("nba", homeProvider)?.canonicalTeamId ??
    homeProvider;
  const awayTeamId =
    getCanonicalTeamFromProvider("nba", awayProvider)?.canonicalTeamId ??
    awayProvider;
  const homeScore = Number(home.score);
  const awayScore = Number(away.score);
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return null;

  const season = seasonFromNbaGameId(id) ?? "";
  let date =
    typeof raw.game?.gameEt === "string" &&
    /^\d{4}-\d{2}-\d{2}/.test(raw.game.gameEt)
      ? raw.game.gameEt.slice(0, 10)
      : "";

  if (!date && season) {
    try {
      const schedPath = path.join(
        rawGamesRoot(),
        season,
        "meta",
        "games_regular_season.json"
      );
      if (existsSync(schedPath)) {
        const rows = JSON.parse(readFileSync(schedPath, "utf8")) as Array<{
          gameId: string;
          gameDate?: string;
        }>;
        const hit = rows.find((r) => String(r.gameId) === id);
        if (hit?.gameDate) date = String(hit.gameDate).slice(0, 10);
      }
    } catch {
      /* */
    }
  }

  const game: Game = {
    id,
    season,
    gameDate: date,
    homeTeamId,
    awayTeamId,
    homeTeamAbbr: home.teamTricode,
    awayTeamAbbr: away.teamTricode,
    homeTeamName: [home.teamCity, home.teamName].filter(Boolean).join(" "),
    awayTeamName: [away.teamCity, away.teamName].filter(Boolean).join(" "),
    homeScore,
    awayScore,
    gameType: "regular",
    status: "final",
    teamIdProvider: "nba",
    homeProviderTeamId: homeProvider,
    awayProviderTeamId: awayProvider,
  };

  const mapPlayers = (
    team: NonNullable<typeof home>,
    isHome: boolean
  ): PlayerGame[] => {
    const teamId = isHome ? homeTeamId : awayTeamId;
    const opp = isHome ? awayTeamId : homeTeamId;
    const out: PlayerGame[] = [];
    for (const pl of team.players ?? []) {
      const personId = pl.personId ?? pl.playerId;
      if (personId == null) continue;
      const st = (pl.statistics ?? {}) as Record<string, unknown>;
      const minutes = parseMinutes(st.minutes ?? st.minutesCalculated);
      const played =
        pl.played === "1" || pl.played === 1 || minutes > 0;
      const starter =
        pl.starter === true || pl.starter === 1 || pl.starter === "1";
      if (!played && !starter) continue;
      out.push({
        id: `${personId}-${id}`,
        gameId: id,
        playerId: String(personId),
        playerName: String(
          pl.name ||
            [pl.firstName, pl.familyName].filter(Boolean).join(" ") ||
            ""
        ),
        teamId,
        season,
        gameDate: date,
        opponentTeamId: opp,
        isHome,
        startPosition: starter ? String(pl.position ?? "G") : undefined,
        minutes,
        points: Number(st.points) || 0,
        rebounds: Number(st.reboundsTotal) || 0,
        assists: Number(st.assists) || 0,
        steals: Number(st.steals) || 0,
        blocks: Number(st.blocks) || 0,
        turnovers: Number(st.turnovers) || 0,
        fieldGoalsMade: Number(st.fieldGoalsMade) || 0,
        fieldGoalsAttempted: Number(st.fieldGoalsAttempted) || 0,
        threePointersMade: Number(st.threePointersMade) || 0,
        threePointersAttempted: Number(st.threePointersAttempted) || 0,
        freeThrowsMade: Number(st.freeThrowsMade) || 0,
        freeThrowsAttempted: Number(st.freeThrowsAttempted) || 0,
        plusMinus: Number(st.plusMinusPoints) || 0,
      });
    }
    return out;
  };

  return {
    game,
    players: [...mapPlayers(home, true), ...mapPlayers(away, false)],
  };
}
