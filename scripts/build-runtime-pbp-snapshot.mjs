/**
 * Bake normalized play-by-play into public/ for Cloudflare Static Assets.
 * ESPN upstream is flaky from Workers; Game Lab + Possession Explorer need this.
 *
 * Output:
 *   public/runtime/play-by-play/{gameId}.json
 *   src/data/runtime/pbp-index.json
 *
 *   node scripts/build-runtime-pbp-snapshot.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";

const ROOT = process.cwd();
const SNAPSHOT = path.join(ROOT, "src", "data", "runtime", "game-snapshot.json");
const OUT_ROOT = path.join(ROOT, "public", "runtime", "play-by-play");
const INDEX_OUT = path.join(ROOT, "src", "data", "runtime", "pbp-index.json");

const FORCE = process.env.FORCE === "1";
const CONCURRENCY = Number(process.env.PBP_CONCURRENCY || 8);
const GAME_LIMIT = Number(process.env.PBP_GAME_LIMIT || 400);
const SEASON_LIMIT = Number(process.env.PBP_SEASON_LIMIT || 2);
const INCLUDE_PRESEASON = process.env.PBP_INCLUDE_PRESEASON === "1";

const ESPN_SITE =
  "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary";
const ESPN_CDN = "https://cdn.espn.com/core/nba";

const HEADERS = {
  Accept: "application/json, text/plain, */*",
  "User-Agent": "Mozilla/5.0 DRBL-PBP-Bake/1.0",
};

function canonicalSeason(startYear) {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

function recentSeasons(limit) {
  const now = new Date();
  const currentStart =
    now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return [currentStart, currentStart - 1, currentStart - 2]
    .slice(0, limit)
    .map(canonicalSeason);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, retries = 2) {
  let lastError;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: HEADERS,
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      lastError = error;
      if (attempt < retries - 1) await delay(300 * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function hasActions(raw) {
  const root = raw?.game;
  return Array.isArray(root?.actions) && root.actions.length > 0;
}

function clockToIso(value) {
  const text = String(value ?? "").trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (!match) return "PT0S";
  return `PT${Number(match[1])}M${Number(match[2])}S`;
}

function inferEspnAction(textRaw, scoreValueRaw) {
  const text = String(textRaw ?? "").toLowerCase();
  const scoreValue = Number(scoreValueRaw ?? 0) || 0;
  if (text.includes("free throw")) return "freethrow";
  if (text.includes("3-pt") || text.includes("three point") || scoreValue === 3)
    return "3pt";
  if (
    text.includes("layup") ||
    text.includes("dunk") ||
    text.includes("jumper") ||
    text.includes("jump shot") ||
    text.includes("hook shot") ||
    scoreValue === 2
  )
    return "2pt";
  if (text.includes("rebound")) return "rebound";
  if (text.includes("turnover")) return "turnover";
  if (text.includes("foul")) return "foul";
  if (text.includes("substitution")) return "substitution";
  if (text.includes("timeout")) return "timeout";
  if (text.includes("jump ball")) return "jumpball";
  if (text.includes("end of") || text.includes("start of")) return "period";
  return "unknown";
}

function normalizeEspnSummary(raw) {
  const plays = Array.isArray(raw?.plays) ? raw.plays : [];
  const actions = plays.map((play, index) => {
    const text = String(play.text ?? "");
    const actionType = inferEspnAction(text, play.scoreValue);
    const isShot =
      actionType === "2pt" || actionType === "3pt" || actionType === "freethrow";
    const made =
      isShot &&
      (Boolean(play.scoringPlay) || Number(play.scoreValue ?? 0) > 0);
    const participant = play.participants?.[0]?.athlete;
    const actionNumber =
      Number(play.sequenceNumber ?? play.id ?? index + 1) || index + 1;
    return {
      actionNumber,
      orderNumber: actionNumber,
      period: Number(play.period?.number ?? 0) || 0,
      clock: clockToIso(play.clock?.displayValue),
      actionType,
      subType: "",
      description: text,
      teamId: String(play.team?.id ?? ""),
      teamTricode: String(play.team?.abbreviation ?? ""),
      personId: Number(participant?.id ?? 0) || 0,
      playerName: participant?.displayName ?? participant?.shortName ?? "",
      scoreHome: Number(play.homeScore ?? 0) || 0,
      scoreAway: Number(play.awayScore ?? 0) || 0,
      shotResult: isShot ? (made ? "Made" : "Missed") : "",
      isFieldGoal: actionType === "2pt" || actionType === "3pt" ? 1 : 0,
      points: Number(play.scoreValue ?? 0) || 0,
    };
  });
  return { game: { actions } };
}

function findEspnCdnSummary(value, depth = 0) {
  if (depth > 7) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return findEspnCdnSummary(JSON.parse(trimmed), depth + 1);
      } catch {
        return null;
      }
    }
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findEspnCdnSummary(item, depth + 1);
      if (found && Array.isArray(found.plays) && found.plays.length) return found;
    }
    return null;
  }
  if (value && typeof value === "object") {
    const plays = value.plays;
    if (Array.isArray(plays) && plays.length) return value;
    for (const v of Object.values(value)) {
      const found = findEspnCdnSummary(v, depth + 1);
      if (found && Array.isArray(found.plays) && found.plays.length) return found;
    }
  }
  return null;
}

async function fetchEspnSummary(gameId) {
  try {
    const summary = await fetchJson(
      `${ESPN_SITE}?event=${encodeURIComponent(gameId)}`
    );
    if (Array.isArray(summary?.plays) && summary.plays.length) return summary;
  } catch {
    // fall through
  }
  try {
    const cdn = await fetchJson(
      `${ESPN_CDN}/summary?event=${encodeURIComponent(gameId)}`
    );
    return findEspnCdnSummary(cdn);
  } catch {
    return null;
  }
}

function gamePriority(game) {
  const typeRank =
    game.gameType === "playoff" ? 0 : game.gameType === "regular" ? 1 : 2;
  return { typeRank, date: game.gameDate ?? "" };
}

function selectGames(allGames, seasons) {
  const seasonSet = new Set(seasons);
  const today = new Date().toISOString().slice(0, 10);
  return allGames
    .filter((g) => g.status === "final" && seasonSet.has(g.season))
    .filter((g) => INCLUDE_PRESEASON || g.gameType !== "preseason")
    .filter((g) => !g.gameDate || g.gameDate <= today)
    .sort((a, b) => {
      const pa = gamePriority(a);
      const pb = gamePriority(b);
      if (pa.typeRank !== pb.typeRank) return pa.typeRank - pb.typeRank;
      return pb.date.localeCompare(pa.date);
    });
}

async function bakeGame(game) {
  const outPath = path.join(OUT_ROOT, `${game.id}.json`);
  if (!FORCE && existsSync(outPath)) {
    try {
      const existing = JSON.parse(await fs.readFile(outPath, "utf8"));
      if (existing?.eventCount > 0) {
        return { gameId: game.id, skipped: true, eventCount: existing.eventCount };
      }
    } catch {
      // rewrite corrupt file
    }
  }

  const summary = await fetchEspnSummary(game.id);
  if (!summary) return { gameId: game.id, ok: false, reason: "fetch_failed" };

  const raw = normalizeEspnSummary(summary);
  if (!hasActions(raw)) return { gameId: game.id, ok: false, reason: "empty" };

  const eventCount = raw.game.actions.length;
  const payload = {
    gameId: game.id,
    source: "espn",
    season: game.season,
    gameDate: game.gameDate,
    raw,
    eventCount,
    bakedAt: new Date().toISOString(),
  };
  await fs.writeFile(outPath, JSON.stringify(payload));
  return { gameId: game.id, ok: true, eventCount, season: game.season };
}

const snapshot = JSON.parse(await fs.readFile(SNAPSHOT, "utf8"));
const seasons = recentSeasons(SEASON_LIMIT);
const candidates = selectGames(snapshot.games ?? [], seasons);

await fs.mkdir(OUT_ROOT, { recursive: true });

console.log(
  `[pbp-bake] seasons=${seasons.join(",")} candidates=${candidates.length} target=${GAME_LIMIT}`
);

const games = {};
let baked = 0;
let skipped = 0;
let failed = 0;
let verifyGameId = null;
let cursor = 0;

async function worker() {
  while (cursor < candidates.length && Object.keys(games).length < GAME_LIMIT) {
    const i = cursor++;
    const game = candidates[i];
    const result = await bakeGame(game);
    if (result.skipped) {
      skipped += 1;
      games[result.gameId] = { eventCount: result.eventCount };
      if (!verifyGameId) verifyGameId = result.gameId;
      continue;
    }
    if (result.ok) {
      baked += 1;
      games[result.gameId] = {
        eventCount: result.eventCount,
        season: result.season,
      };
      if (!verifyGameId && result.season === seasons[0]) {
        verifyGameId = result.gameId;
      }
    } else {
      failed += 1;
    }
  }
}

await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, () => worker())
);

const STABLE_VERIFY_GAME_ID = "401766128";

if (!verifyGameId) {
  const playoff = candidates.find(
    (g) => g.gameType === "playoff" && games[g.id]
  );
  verifyGameId =
    playoff?.id ??
    Object.keys(games)[0] ??
    candidates.find((g) => g.gameType === "playoff")?.id ??
    candidates[0]?.id ??
    "401766128";
}

if (games[STABLE_VERIFY_GAME_ID]) {
  verifyGameId = STABLE_VERIFY_GAME_ID;
}

const index = {
  version: 1,
  generatedAt: new Date().toISOString(),
  seasons,
  verifyGameId,
  gameCount: Object.keys(games).length,
  games,
};

await fs.writeFile(INDEX_OUT, JSON.stringify(index, null, 2));

console.log(
  `[pbp-bake] done baked=${baked} skipped=${skipped} failed=${failed} index=${index.gameCount} verify=${verifyGameId}`
);
