/**
 * Load CDN-shaped boxscore from the local DRBL raw archive (no network).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { Game, GameBoxScore, PlayerGame } from "@/data/types";
import { getCanonicalTeamFromProvider } from "@/data/identity/team-map";
import { finalizeBoxScorePlayers } from "@/data/providers/nba/enrich-box-score";
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

function numField(st: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const v = st[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v !== "") {
      const n = Number(v);
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
    const v = st[key];
    if (v == null || v === "") continue;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
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
      const pf = optionalNumField(
        st,
        "foulsPersonal",
        "personalFouls",
        "fouls",
        "pf"
      );
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
        points: numField(st, "points"),
        rebounds: numField(st, "reboundsTotal", "rebounds", "reb"),
        ...(oreb != null ? { offensiveRebounds: oreb } : {}),
        ...(dreb != null ? { defensiveRebounds: dreb } : {}),
        assists: numField(st, "assists"),
        steals: numField(st, "steals"),
        blocks: numField(st, "blocks"),
        turnovers: numField(st, "turnovers"),
        ...(pf != null ? { personalFouls: pf } : {}),
        fieldGoalsMade: numField(st, "fieldGoalsMade"),
        fieldGoalsAttempted: numField(st, "fieldGoalsAttempted"),
        threePointersMade: numField(st, "threePointersMade"),
        threePointersAttempted: numField(st, "threePointersAttempted"),
        freeThrowsMade: numField(st, "freeThrowsMade"),
        freeThrowsAttempted: numField(st, "freeThrowsAttempted"),
        plusMinus: numField(st, "plusMinusPoints", "plusMinus"),
      });
    }
    return out;
  };

  return {
    game,
    players: finalizeBoxScorePlayers([
      ...mapPlayers(home, true),
      ...mapPlayers(away, false),
    ]),
  };
}
