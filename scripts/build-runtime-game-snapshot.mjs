import fs from "node:fs/promises";
import path from "node:path";

const OUT = path.join(process.cwd(), "src/data/runtime/game-snapshot.json");
const ESPN_SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";
const NBA_SCHEDULE = "https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json";
const NBA_STATS = "https://stats.nba.com/stats/leaguegamelog";
const now = new Date();
const currentStartYear = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
const previousStartYear = currentStartYear - 1;
const previousSeason = canonicalSeason(previousStartYear);
const upcomingSeason = canonicalSeason(currentStartYear);

const NBA_HEADERS = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Origin: "https://www.nba.com",
  Referer: "https://www.nba.com/",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
  "x-nba-stats-origin": "stats",
  "x-nba-stats-token": "true",
};

function canonicalSeason(startYear) {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

function monthsForSeason(startYear) {
  return [10, 11, 12]
    .map((m) => `${startYear}${String(m).padStart(2, "0")}`)
    .concat([1, 2, 3, 4, 5, 6].map((m) => `${startYear + 1}${String(m).padStart(2, "0")}`));
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function parseStatsDate(raw) {
  const text = String(raw ?? "").trim();
  const d = new Date(text);
  if (!Number.isNaN(d.valueOf())) return d.toISOString().slice(0, 10);
  return text.slice(0, 10);
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

function espnGameType(event) {
  const type = Number(event?.season?.type ?? event?.seasonType ?? 2);
  if (type === 1) return "preseason";
  if (type === 3) return "playoff";
  return "regular";
}

function espnSide(comp, homeAway) {
  const row = (comp?.competitors ?? []).find((c) => c?.homeAway === homeAway);
  if (!row?.team?.id) return null;
  const record = Array.isArray(row.records)
    ? row.records.find((r) => r?.type === "total") ?? row.records[0]
    : null;
  return {
    teamId: String(row.team.id),
    abbr: String(row.team.abbreviation ?? "").toUpperCase(),
    name: row.team.displayName ?? row.team.shortDisplayName ?? undefined,
    score: num(row.score),
    record: record?.summary ?? undefined,
    periods: Array.isArray(row.linescores)
      ? row.linescores.map((p) => num(p?.value ?? p?.displayValue))
      : undefined,
  };
}

function transformEspn(event, season) {
  const comp = event?.competitions?.[0];
  const home = espnSide(comp, "home");
  const away = espnSide(comp, "away");
  const id = String(event?.id ?? "").trim();
  const date = String(event?.date ?? comp?.date ?? "");
  if (!id || !home || !away || !/^\d{4}-\d{2}-\d{2}/.test(date)) return null;
  const status = statusKind(event?.status ?? comp?.status);
  const detail =
    event?.status?.type?.shortDetail ??
    event?.status?.type?.detail ??
    comp?.status?.type?.shortDetail;
  return {
    id,
    season,
    gameDate: date.slice(0, 10),
    tipOffAt: date || undefined,
    statusDetail: detail || undefined,
    homeTeamId: home.teamId,
    awayTeamId: away.teamId,
    homeTeamAbbr: home.abbr,
    awayTeamAbbr: away.abbr,
    homeTeamName: home.name,
    awayTeamName: away.name,
    homeRecord: home.record,
    awayRecord: away.record,
    teamIdProvider: "espn",
    homeProviderTeamId: home.teamId,
    awayProviderTeamId: away.teamId,
    homeScore: home.score,
    awayScore: away.score,
    ...(home.periods?.length && away.periods?.length
      ? { homePeriodScores: home.periods, awayPeriodScores: away.periods }
      : {}),
    gameType: espnGameType(event),
    status,
    period: num(event?.status?.period ?? comp?.status?.period) || undefined,
    displayClock: event?.status?.displayClock ?? comp?.status?.displayClock ?? undefined,
    retrievedAt: new Date().toISOString(),
  };
}

function matchupKey(game) {
  return `${game.season}|${game.gameDate}|${String(game.awayTeamAbbr ?? "").toUpperCase()}|${String(game.homeTeamAbbr ?? "").toUpperCase()}`;
}

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, {
    headers: { Accept: "application/json, text/plain, */*", ...headers },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

async function fetchEspnSeasons() {
  const games = [];
  const failures = [];
  for (const startYear of [previousStartYear, currentStartYear]) {
    const season = canonicalSeason(startYear);
    for (const month of monthsForSeason(startYear)) {
      try {
        const payload = await fetchJson(`${ESPN_SCOREBOARD}?dates=${month}&limit=400`, {
          "User-Agent": "Mozilla/5.0 DRBL-build-snapshot/2.0",
        });
        for (const event of payload?.events ?? []) {
          const game = transformEspn(event, season);
          if (game) games.push(game);
        }
      } catch (error) {
        failures.push(`${month}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  return { games, failures };
}

function resultSet(payload) {
  if (Array.isArray(payload?.resultSets)) return payload.resultSets[0] ?? null;
  return payload?.resultSet ?? null;
}

function rowsToObjects(set) {
  if (!set?.headers || !Array.isArray(set.rowSet)) return [];
  return set.rowSet.map((row) => Object.fromEntries(set.headers.map((h, i) => [h, row[i] ?? null])));
}

async function fetchPreviousNbaGames() {
  const byId = new Map();
  for (const seasonType of ["Regular Season", "Playoffs"]) {
    const query = new URLSearchParams({
      Counter: "0",
      DateFrom: "",
      DateTo: "",
      Direction: "DESC",
      LeagueID: "00",
      PlayerOrTeam: "T",
      Season: previousSeason,
      SeasonType: seasonType,
      Sorter: "DATE",
    });
    const payload = await fetchJson(`${NBA_STATS}?${query}`, NBA_HEADERS);
    for (const row of rowsToObjects(resultSet(payload))) {
      const id = String(row.GAME_ID ?? "").trim();
      if (!/^00\d{8}$/.test(id)) continue;
      const matchup = String(row.MATCHUP ?? "");
      const isHome = matchup.includes(" vs.");
      const abbr = String(row.TEAM_ABBREVIATION ?? "").toUpperCase();
      const game = byId.get(id) ?? {
        id,
        season: previousSeason,
        gameDate: parseStatsDate(row.GAME_DATE),
        homeTeamAbbr: undefined,
        awayTeamAbbr: undefined,
        homeScore: 0,
        awayScore: 0,
        gameType: seasonType === "Playoffs" ? "playoff" : "regular",
        status: "final",
        teamIdProvider: "nba",
        homeProviderTeamId: undefined,
        awayProviderTeamId: undefined,
      };
      if (isHome) {
        game.homeTeamAbbr = abbr;
        game.homeScore = num(row.PTS);
        game.homeProviderTeamId = String(row.TEAM_ID ?? "") || undefined;
      } else {
        game.awayTeamAbbr = abbr;
        game.awayScore = num(row.PTS);
        game.awayProviderTeamId = String(row.TEAM_ID ?? "") || undefined;
      }
      byId.set(id, game);
    }
  }
  return [...byId.values()].filter((g) => g.homeTeamAbbr && g.awayTeamAbbr);
}

function nbaStatus(code, text) {
  const lower = String(text ?? "").toLowerCase();
  if (lower.includes("postpon")) return "postponed";
  if (lower.includes("cancel")) return "cancelled";
  if (lower.includes("delay")) return "delayed";
  if (Number(code) === 2) return "in_progress";
  if (Number(code) === 3) return "final";
  return "scheduled";
}

async function fetchUpcomingNbaGames() {
  const payload = await fetchJson(NBA_SCHEDULE, NBA_HEADERS);
  const out = [];
  for (const block of payload?.leagueSchedule?.gameDates ?? []) {
    for (const raw of block?.games ?? []) {
      const id = String(raw?.gameId ?? "").trim();
      const homeAbbr = String(raw?.homeTeam?.teamTricode ?? "").toUpperCase();
      const awayAbbr = String(raw?.awayTeam?.teamTricode ?? "").toUpperCase();
      if (!/^00\d{8}$/.test(id) || !homeAbbr || !awayAbbr) continue;
      const dateRaw = String(raw?.gameDateTimeUTC ?? raw?.gameDateTimeEst ?? block?.gameDate ?? "");
      out.push({
        id,
        season: upcomingSeason,
        gameDate: dateRaw.slice(0, 10),
        tipOffAt: /^\d{4}-\d{2}-\d{2}T/.test(String(raw?.gameDateTimeUTC ?? ""))
          ? String(raw.gameDateTimeUTC)
          : undefined,
        statusDetail: String(raw?.gameStatusText ?? "") || undefined,
        homeTeamAbbr: homeAbbr,
        awayTeamAbbr: awayAbbr,
        homeScore: num(raw?.homeTeam?.score),
        awayScore: num(raw?.awayTeam?.score),
        gameType: String(raw?.gameLabel ?? raw?.gameSubtype ?? "").toLowerCase().includes("preseason")
          ? "preseason"
          : "regular",
        status: nbaStatus(raw?.gameStatus, raw?.gameStatusText),
        teamIdProvider: "nba",
        homeProviderTeamId: String(raw?.homeTeam?.teamId ?? "") || undefined,
        awayProviderTeamId: String(raw?.awayTeam?.teamId ?? "") || undefined,
        retrievedAt: new Date().toISOString(),
      });
    }
  }
  return out;
}

function enrichNbaGame(nba, espn) {
  if (!espn) {
    return {
      ...nba,
      homeTeamId: nba.homeProviderTeamId ?? "",
      awayTeamId: nba.awayProviderTeamId ?? "",
      homeTeamName: nba.homeTeamAbbr,
      awayTeamName: nba.awayTeamAbbr,
    };
  }
  return {
    ...espn,
    id: nba.id,
    season: nba.season,
    gameDate: nba.gameDate || espn.gameDate,
    tipOffAt: nba.tipOffAt ?? espn.tipOffAt,
    statusDetail: nba.statusDetail ?? espn.statusDetail,
    homeScore: nba.status === "final" ? nba.homeScore : espn.homeScore,
    awayScore: nba.status === "final" ? nba.awayScore : espn.awayScore,
    gameType: nba.gameType ?? espn.gameType,
    status: nba.status ?? espn.status,
    teamIdProvider: "nba",
    homeProviderTeamId: nba.homeProviderTeamId,
    awayProviderTeamId: nba.awayProviderTeamId,
    retrievedAt: new Date().toISOString(),
  };
}

async function main() {
  const [{ games: espnGames, failures }, previousNba, upcomingNba] = await Promise.all([
    fetchEspnSeasons(),
    fetchPreviousNbaGames(),
    fetchUpcomingNbaGames(),
  ]);

  const espnByKey = new Map(espnGames.map((g) => [matchupKey(g), g]));
  const aliases = {};
  const byId = new Map();

  for (const nba of [...previousNba, ...upcomingNba]) {
    const espn = espnByKey.get(matchupKey(nba));
    const game = enrichNbaGame(nba, espn);
    if (!game.homeTeamId || !game.awayTeamId) continue;
    byId.set(game.id, game);
    aliases[game.id] = game.id;
    if (espn?.id) aliases[espn.id] = game.id;
  }

  // Keep unmatched ESPN events (exhibitions / edge schedule changes) reachable,
  // but NBA GameIDs are canonical whenever the league provides one.
  for (const espn of espnGames) {
    if (aliases[espn.id]) continue;
    byId.set(espn.id, espn);
    aliases[espn.id] = espn.id;
  }

  const games = [...byId.values()].sort((a, b) =>
    a.gameDate === b.gameDate ? a.id.localeCompare(b.id) : a.gameDate.localeCompare(b.gameDate)
  );
  const previousGames = games.filter((g) => g.season === previousSeason);
  const upcomingGames = games.filter((g) => g.season === upcomingSeason);
  const previousNbaCount = previousGames.filter((g) => /^00\d{8}$/.test(g.id)).length;
  const upcomingNbaCount = upcomingGames.filter((g) => /^00\d{8}$/.test(g.id)).length;
  const exampleTarget = aliases["401811018"];

  if (
    previousGames.length < 1000 ||
    upcomingGames.length < 1000 ||
    previousNbaCount < 1000 ||
    upcomingNbaCount < 1000 ||
    !/^00\d{8}$/.test(String(exampleTarget ?? ""))
  ) {
    throw new Error(
      `Canonical game snapshot incomplete: total=${games.length}, ` +
        `${previousSeason}=${previousGames.length}/${previousNbaCount} NBA ids, ` +
        `${upcomingSeason}=${upcomingGames.length}/${upcomingNbaCount} NBA ids, ` +
        `401811018=>${exampleTarget ?? "missing"}. ESPN failures: ${failures.slice(0, 4).join(" | ")}`
    );
  }

  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(
    OUT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: "nba-canonical-build-snapshot",
        seasons: [previousSeason, upcomingSeason],
        aliases,
        games,
      },
      null,
      2
    ) + "\n",
    "utf8"
  );
  console.log(
    `[runtime-snapshot] canonical NBA games=${games.length}; ${previousSeason}=${previousNbaCount}; ${upcomingSeason}=${upcomingNbaCount}; ESPN aliases=${Object.keys(aliases).length - games.length}`
  );
}

await main();
