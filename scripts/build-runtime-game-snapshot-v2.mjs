import fs from "node:fs/promises";
import path from "node:path";

const OUT = path.join(process.cwd(), "src/data/runtime/game-snapshot.json");
const ESPN = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";
const ARCHIVE = "https://raw.githubusercontent.com/moizk/nba-schedule-2025-26/main/nba_2025_26_schedule.json";
const now = new Date();
const currentStart = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
const previousStart = currentStart - 1;

function season(start) {
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}
const previousSeason = season(previousStart);
const currentSeason = season(currentStart);

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function seasonDateRanges(start) {
  const pairs = [
    [start, 9], [start, 10], [start, 11], [start, 12],
    [start + 1, 1], [start + 1, 2], [start + 1, 3],
    [start + 1, 4], [start + 1, 5], [start + 1, 6],
  ];
  return pairs.map(([year, month]) => {
    const mm = String(month).padStart(2, "0");
    const last = String(daysInMonth(year, month)).padStart(2, "0");
    return `${year}${mm}01-${year}${mm}${last}`;
  });
}

function n(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function statusKind(status) {
  const type = status?.type ?? {};
  const name = String(type.name ?? "").toLowerCase();
  const state = String(type.state ?? "").toLowerCase();
  const detail = String(type.detail ?? type.shortDetail ?? "").toLowerCase();
  if (name.includes("postpon") || detail.includes("postpon")) return "postponed";
  if (name.includes("cancel") || detail.includes("cancel")) return "cancelled";
  if (name.includes("suspend") || detail.includes("suspend")) return "suspended";
  if (name.includes("delay") || detail.includes("delay")) return "delayed";
  if (detail.includes("halftime")) return "halftime";
  if (type.completed || state === "post") return "final";
  if (state === "in") return "in_progress";
  if (state === "pre") return "scheduled";
  return "unknown";
}

function gameType(event) {
  const value = Number(event?.season?.type ?? event?.seasonType ?? 2);
  if (value === 1) return "preseason";
  if (value === 3) return "playoff";
  return "regular";
}

function side(comp, homeAway) {
  const row = (comp?.competitors ?? []).find((c) => c?.homeAway === homeAway);
  if (!row?.team?.id) return null;
  const record = Array.isArray(row.records)
    ? row.records.find((r) => r?.type === "total") ?? row.records[0]
    : null;
  return {
    id: String(row.team.id),
    abbr: String(row.team.abbreviation ?? "").toUpperCase(),
    name: row.team.displayName ?? row.team.shortDisplayName ?? undefined,
    score: n(row.score),
    record: record?.summary ?? undefined,
    periods: Array.isArray(row.linescores)
      ? row.linescores.map((p) => n(p?.value ?? p?.displayValue))
      : undefined,
  };
}

function transformEspn(event, canonicalSeason) {
  const comp = event?.competitions?.[0];
  const home = side(comp, "home");
  const away = side(comp, "away");
  const id = String(event?.id ?? "").trim();
  const date = String(event?.date ?? comp?.date ?? "").trim();
  if (!id || !home || !away || !/^\d{4}-\d{2}-\d{2}/.test(date)) return null;
  const statusType = comp?.status?.type ?? event?.status?.type ?? {};
  return {
    id,
    season: canonicalSeason,
    gameDate: date.slice(0, 10),
    tipOffAt: date || undefined,
    statusDetail: statusType.shortDetail ?? statusType.detail ?? undefined,
    homeTeamId: home.id,
    awayTeamId: away.id,
    homeTeamAbbr: home.abbr,
    awayTeamAbbr: away.abbr,
    homeTeamName: home.name,
    awayTeamName: away.name,
    homeRecord: home.record,
    awayRecord: away.record,
    teamIdProvider: "espn",
    homeProviderTeamId: home.id,
    awayProviderTeamId: away.id,
    homeScore: home.score,
    awayScore: away.score,
    ...(home.periods?.length && away.periods?.length
      ? { homePeriodScores: home.periods, awayPeriodScores: away.periods }
      : {}),
    gameType: gameType(event),
    status: statusKind(event?.status ?? comp?.status),
    period: n(event?.status?.period ?? comp?.status?.period) || undefined,
    displayClock: event?.status?.displayClock ?? comp?.status?.displayClock ?? undefined,
    retrievedAt: new Date().toISOString(),
  };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json, text/plain, */*",
      "User-Agent": "Mozilla/5.0 DRBL-build-snapshot/5.0",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

async function fetchEspnSeason(start) {
  const canonical = season(start);
  const byId = new Map();
  const failures = [];
  for (const range of seasonDateRanges(start)) {
    try {
      const payload = await fetchJson(`${ESPN}?dates=${range}&limit=400`);
      for (const event of payload?.events ?? []) {
        const game = transformEspn(event, canonical);
        if (game) byId.set(game.id, game);
      }
    } catch (error) {
      failures.push(`${range}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { games: [...byId.values()], failures };
}

function archivedAbbr(value) {
  return String(value ?? "").trim().split(/\s+/)[0]?.toUpperCase() ?? "";
}

function key(game) {
  return `${game.season}|${game.gameDate}|${String(game.awayTeamAbbr ?? "").toUpperCase()}|${String(game.homeTeamAbbr ?? "").toUpperCase()}`;
}

async function fetchArchivedPrevious() {
  if (previousSeason !== "2025-26") {
    throw new Error(`No canonical completed-season archive configured for ${previousSeason}`);
  }
  const payload = await fetchJson(ARCHIVE);
  if (payload?.season !== previousSeason || !Array.isArray(payload?.games)) {
    throw new Error("Unexpected 2025-26 archive shape");
  }
  return payload.games.map((raw) => {
    const id = String(raw?.game_id ?? "").trim();
    const tip = String(raw?.tip_utc ?? "").trim();
    const awayTeamAbbr = archivedAbbr(raw?.away_team);
    const homeTeamAbbr = archivedAbbr(raw?.home_team);
    if (!/^00\d{8}$/.test(id) || !tip || !awayTeamAbbr || !homeTeamAbbr) return null;
    return {
      id,
      season: previousSeason,
      gameDate: tip.slice(0, 10),
      tipOffAt: tip,
      awayTeamAbbr,
      homeTeamAbbr,
      gameType: String(raw?.season_type ?? "").toLowerCase().includes("preseason")
        ? "preseason"
        : "regular",
    };
  }).filter(Boolean);
}

async function main() {
  const [previousEspn, currentEspn, archived] = await Promise.all([
    fetchEspnSeason(previousStart),
    fetchEspnSeason(currentStart),
    fetchArchivedPrevious(),
  ]);

  const espnByMatchup = new Map(previousEspn.games.map((g) => [key(g), g]));
  const aliases = {};
  const byId = new Map();
  let canonicalPrevious = 0;

  for (const archivedGame of archived) {
    const espn = espnByMatchup.get(key(archivedGame));
    if (!espn) continue;
    const merged = {
      ...espn,
      id: archivedGame.id,
      season: archivedGame.season,
      gameDate: archivedGame.gameDate,
      tipOffAt: archivedGame.tipOffAt,
      gameType: archivedGame.gameType,
      retrievedAt: new Date().toISOString(),
    };
    byId.set(merged.id, merged);
    aliases[merged.id] = merged.id;
    aliases[espn.id] = merged.id;
    canonicalPrevious += 1;
  }

  for (const game of previousEspn.games) {
    if (aliases[game.id]) continue;
    byId.set(game.id, game);
    aliases[game.id] = game.id;
  }
  for (const game of currentEspn.games) {
    byId.set(game.id, game);
    aliases[game.id] = game.id;
  }

  const games = [...byId.values()].sort((a, b) =>
    a.gameDate === b.gameDate ? a.id.localeCompare(b.id) : a.gameDate.localeCompare(b.gameDate)
  );
  const previousGames = games.filter((g) => g.season === previousSeason);
  const currentGames = games.filter((g) => g.season === currentSeason);
  const example = aliases["401811018"];

  if (
    previousGames.length < 1000 ||
    canonicalPrevious < 1000 ||
    currentGames.length < 1000 ||
    !/^00\d{8}$/.test(String(example ?? ""))
  ) {
    throw new Error(
      `Snapshot incomplete: ${previousSeason}=${previousGames.length}/${canonicalPrevious} canonical, ` +
        `${currentSeason}=${currentGames.length}, 401811018=>${example ?? "missing"}; ` +
        `failures=${[...previousEspn.failures, ...currentEspn.failures].slice(0, 8).join(" | ")}`
    );
  }

  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(
    OUT,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      source: "espn-valid-date-range-snapshot",
      seasons: [previousSeason, currentSeason],
      aliases,
      games,
    }, null, 2) + "\n",
    "utf8"
  );

  console.log(
    `[runtime-snapshot] ${previousSeason}=${previousGames.length}/${canonicalPrevious} canonical; ` +
      `${currentSeason}=${currentGames.length}; aliases=${Object.keys(aliases).length}`
  );
}

await main();
