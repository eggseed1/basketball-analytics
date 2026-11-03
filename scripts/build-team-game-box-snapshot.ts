/**
 * Team box score totals per game. Numbers only.
 *
 * Archive mode reads the local NBA box score archive
 * (data/drbl/raw/games/{nbaGameId}/boxscore.json).
 * Fetch mode pulls the season's final games from the NBA CDN and only
 * downloads box scores the snapshot doesn't have yet.
 * Both merge into the existing snapshot; other seasons stay as they are.
 *
 * Run: npx tsx scripts/build-team-game-box-snapshot.ts
 *      npx tsx scripts/build-team-game-box-snapshot.ts --season 2026-27 --fetch
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { resolveTeamBrand } from "../src/lib/nba-brand";
import { fetchEspnCdnGameSummary, findEspnCdnSummary } from "../src/data/providers/nba/espn-cdn-summary";
import { transformEspnBoxScore } from "../src/data/transformers/espn";
import { teamRowsFromEspnBox } from "../src/lib/team-game-box-espn";
import type { Game } from "../src/data/types";
import {
  TEAM_GAME_BOX_COLUMNS,
  type TeamGameBoxRow,
  type TeamGameBoxSnapshot,
} from "../src/lib/team-game-box";

const ROOT = join(__dirname, "..");
const RAW = join(ROOT, "data", "drbl", "raw", "games");
const OUT = join(ROOT, "src", "data", "runtime", "team-game-box-snapshot.json");
const SCHEDULE_URL = "https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json";
const boxUrl = (gameId: string) => `https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${gameId}.json`;
const HEADERS = {
  Accept: "application/json, text/plain, */*",
  Origin: "https://www.nba.com",
  Referer: "https://www.nba.com/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

type BoxTeam = {
  teamTricode: string;
  score: number;
  statistics: Record<string, number>;
};

type BoxGame = { gameStatus: number; gameEt: string; homeTeam: BoxTeam; awayTeam: BoxTeam };

/** Regular season, playoffs, play-in and the Cup final. */
function seasonFromGameId(gameId: string): string | null {
  const m = /^00[2456](\d{2})\d{5}$/.exec(gameId);
  if (!m) return null;
  const start = 2000 + Number(m[1]);
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

function teamRow(date: string, t: BoxTeam): TeamGameBoxRow | null {
  const s = t.statistics;
  const values = [
    t.score,
    s.fieldGoalsMade,
    s.fieldGoalsAttempted,
    s.threePointersMade,
    s.threePointersAttempted,
    s.freeThrowsMade,
    s.freeThrowsAttempted,
    s.reboundsOffensive,
    s.reboundsDefensive,
    s.assists,
    s.steals,
    s.blocks,
    s.turnoversTotal,
    s.foulsPersonal,
  ];
  if (values.some((v) => typeof v !== "number" || !Number.isFinite(v))) return null;
  return [date, ...values] as TeamGameBoxRow;
}

function gameRows(game: BoxGame | undefined): Array<{ espnId: string; row: TeamGameBoxRow }> | null {
  if (game?.gameStatus !== 3 || typeof game.gameEt !== "string") return null;
  const date = game.gameEt.slice(0, 10);
  const rows = [game.homeTeam, game.awayTeam].map((t) => ({
    espnId: resolveTeamBrand(t?.teamTricode ?? "")?.espnTeamId,
    row: t ? teamRow(date, t) : null,
  }));
  if (rows.some((r) => !r.espnId || !r.row)) return null;
  return rows as Array<{ espnId: string; row: TeamGameBoxRow }>;
}

function loadSnapshot(): TeamGameBoxSnapshot {
  if (!existsSync(OUT)) return { generatedAt: null, source: "", columns: [...TEAM_GAME_BOX_COLUMNS], teams: {} };
  return JSON.parse(readFileSync(OUT, "utf8")) as TeamGameBoxSnapshot;
}

/** season → team → date → row */
type Collected = Map<string, Map<string, Map<string, TeamGameBoxRow>>>;

function collect(into: Collected, season: string, rows: Array<{ espnId: string; row: TeamGameBoxRow }>) {
  let bySeason = into.get(season);
  if (!bySeason) into.set(season, (bySeason = new Map()));
  for (const { espnId, row } of rows) {
    let byTeam = bySeason.get(espnId);
    if (!byTeam) bySeason.set(espnId, (byTeam = new Map()));
    byTeam.set(row[0], row);
  }
}

function fromArchive(): { collected: Collected; games: number; skipped: number } {
  const collected: Collected = new Map();
  let games = 0;
  let skipped = 0;
  if (!existsSync(RAW)) return { collected, games, skipped };
  for (const gameId of readdirSync(RAW).sort()) {
    const season = seasonFromGameId(gameId);
    if (!season) continue;
    let rows: ReturnType<typeof gameRows> = null;
    try {
      rows = gameRows(JSON.parse(readFileSync(join(RAW, gameId, "boxscore.json"), "utf8")).game);
    } catch {
      rows = null;
    }
    if (!rows) {
      skipped++;
      continue;
    }
    collect(collected, season, rows);
    games++;
  }
  return { collected, games, skipped };
}

async function fetchJson<T>(url: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return (await res.json()) as T;
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Fetch failed: ${url}`);
}

async function fromCdn(
  season: string,
  existing: TeamGameBoxSnapshot
): Promise<{ collected: Collected; games: number; skipped: number; known: number }> {
  const schedule = await fetchJson<{
    leagueSchedule?: { gameDates?: Array<{ games?: Array<{ gameId?: string; gameStatus?: number; gameDateTimeEst?: string; homeTeam?: { teamTricode?: string }; awayTeam?: { teamTricode?: string } }> }> };
  }>(SCHEDULE_URL);
  const have = existing.teams[season] ?? {};
  const hasRow = (tricode: string | undefined, date: string) => {
    const id = resolveTeamBrand(tricode ?? "")?.espnTeamId;
    return Boolean(id && have[id]?.some((r) => r[0] === date));
  };
  const todo: string[] = [];
  let known = 0;
  for (const block of schedule.leagueSchedule?.gameDates ?? []) {
    for (const g of block.games ?? []) {
      if (!g.gameId || g.gameStatus !== 3 || seasonFromGameId(g.gameId) !== season) continue;
      const date = (g.gameDateTimeEst ?? "").slice(0, 10);
      if (date && hasRow(g.homeTeam?.teamTricode, date) && hasRow(g.awayTeam?.teamTricode, date)) {
        known++;
        continue;
      }
      todo.push(g.gameId);
    }
  }

  const collected: Collected = new Map();
  let games = 0;
  let skipped = 0;
  const queue = [...todo];
  const worker = async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      try {
        const rows = gameRows((await fetchJson<{ game?: BoxGame }>(boxUrl(id))).game);
        if (rows) {
          collect(collected, season, rows);
          games++;
        } else skipped++;
      } catch {
        skipped++;
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return { collected, games, skipped, known };
}

/**
 * ESPN schedule is already baked every night, even when cdn.nba.com returns
 * HTTP 403 from GitHub runners. Only fetch final, unrecorded games. The
 * underlying ESPN CDN game feed also works from the Workers runtime.
 */
async function espnBoxWithPlayers(gameId: string) {
  // The general game/play-by-play CDN response can have plays but no player
  // totals; fetch the dedicated boxscore first to avoid that false success.
  try {
    const res = await fetch(
      `https://cdn.espn.com/core/nba/boxscore?xhr=1&gameId=${encodeURIComponent(gameId)}`,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12_000) }
    );
    if (res.ok) {
      const summary = findEspnCdnSummary(await res.json());
      if (summary?.boxscore?.players?.length) return summary;
    }
  } catch {
    // ESPN's game page is an independent fallback.
  }
  return fetchEspnCdnGameSummary(gameId);
}

async function fromEspnSnapshot(
  season: string,
  existing: TeamGameBoxSnapshot
): Promise<{ collected: Collected; games: number; skipped: number; known: number }> {
  const snapshotFile = join(ROOT, "src", "data", "runtime", "game-snapshot.json");
  if (!existsSync(snapshotFile)) throw new Error("Missing ESPN game snapshot");
  const snapshot = JSON.parse(readFileSync(snapshotFile, "utf8")) as { games?: Game[] };
  const completed = (snapshot.games ?? []).filter(game =>
    game.season === season && game.status === "final" &&
    game.gameType !== "preseason" && !game.cupChampionship &&
    /^40\d{6,}$/.test(game.id)
  );
  if (!completed.length) throw new Error("No ESPN final games for " + season);
  const have = existing.teams[season] ?? {};
  const hasRow = (teamId: string, date: string) =>
    Boolean(have[teamId]?.some(row => row[0] === date));
  const todo: Game[] = [];
  let known = 0;
  for (const game of completed) {
    if (hasRow(game.homeTeamId, game.gameDate) && hasRow(game.awayTeamId, game.gameDate)) known++;
    else todo.push(game);
  }
  const collected: Collected = new Map();
  let games = 0;
  let skipped = 0;
  const queue = [...todo];
  const worker = async () => {
    for (let game = queue.shift(); game; game = queue.shift()) {
      try {
        const summary = await espnBoxWithPlayers(game.id);
        const box = summary && transformEspnBoxScore(summary, season);
        const rows = box && teamRowsFromEspnBox(game, box);
        if (!rows) { skipped++; continue; }
        collect(collected, season, rows);
        games++;
      } catch {
        skipped++;
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return { collected, games, skipped, known };
}

function merge(snapshot: TeamGameBoxSnapshot, collected: Collected): TeamGameBoxSnapshot {
  const teams = { ...snapshot.teams };
  for (const [season, bySeason] of collected) {
    const next: Record<string, TeamGameBoxRow[]> = { ...(teams[season] ?? {}) };
    for (const [espnId, byDate] of bySeason) {
      const rows = new Map((next[espnId] ?? []).map((r) => [r[0], r] as const));
      for (const [date, row] of byDate) rows.set(date, row);
      next[espnId] = [...rows.values()].sort((a, b) => a[0].localeCompare(b[0]));
    }
    teams[season] = next;
  }
  const ordered = Object.fromEntries(Object.entries(teams).sort(([a], [b]) => a.localeCompare(b)));
  return {
    generatedAt: new Date().toISOString(),
    source: "NBA/ESPN final box scores (team totals)",
    columns: [...TEAM_GAME_BOX_COLUMNS],
    teams: ordered,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const seasonArg = args.includes("--season") ? args[args.indexOf("--season") + 1] : null;
  const existing = loadSnapshot();

  if (args.includes("--fetch")) {
    if (!seasonArg || !/^\d{4}-\d{2}$/.test(seasonArg)) throw new Error("--fetch needs --season YYYY-YY");
    // NBA's schedule endpoint is frequently 403 on GitHub Actions. Treat the
    // existing nightly ESPN game snapshot as primary and use NBA CDN only
    // if ESPN itself cannot provide any of the outstanding game boxes.
    let result: Awaited<ReturnType<typeof fromEspnSnapshot>>;
    let provider = "ESPN";
    try {
      result = await fromEspnSnapshot(seasonArg, existing);
      if (result.skipped > 0 && result.games === 0) throw new Error("ESPN summaries unavailable for " + result.skipped + " missing final games");
    } catch (error) {
      console.warn("ESPN team boxes unavailable; trying NBA CDN: " + String(error));
      provider = "NBA";
      result = await fromCdn(seasonArg, existing);
    }
    const { collected, games, skipped, known } = result;
    if (!games) {
      console.log(`team box totals ${seasonArg}: nothing new (${known} already stored, ${skipped} unavailable; source=${provider})`);
      return;
    }
    writeFileSync(OUT, `${JSON.stringify(merge(existing, collected))}\n`);
    console.log(`team box totals ${seasonArg}: +${games} games (${known} already stored, ${skipped} unavailable; source=${provider})`);
    return;
  }

  const { collected, games, skipped } = fromArchive();
  if (seasonArg) for (const season of [...collected.keys()]) if (season !== seasonArg) collected.delete(season);
  writeFileSync(OUT, `${JSON.stringify(merge(existing, collected))}\n`);
  console.log(`team box totals: ${games} archived games, ${skipped} skipped, seasons ${[...collected.keys()].join(", ")}`);
}

main().catch((error) => {
  console.error(`team box totals failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
