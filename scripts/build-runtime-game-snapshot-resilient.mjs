import fs from "node:fs/promises";
import path from "node:path";

const OUT = path.join(process.cwd(), "src/data/runtime/game-snapshot.json");
const ESPN_SCOREBOARD =
  "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";
const ARCHIVED_2025_26 =
  "https://raw.githubusercontent.com/moizk/nba-schedule-2025-26/main/nba_2025_26_schedule.json";

const now = new Date();
const currentStartYear =
  now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
const previousStartYear = currentStartYear - 1;

function canonicalSeason(startYear) {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

const previousSeason = canonicalSeason(previousStartYear);
const currentSeason = canonicalSeason(currentStartYear);

function monthsForSeason(startYear) {
  return [10, 11, 12]
    .map((month) => `${startYear}${String(month).padStart(2, "0")}`)
    .concat(
      [1, 2, 3, 4, 5, 6].map(
        (month) => `${startYear + 1}${String(month).padStart(2, "0")}`
      )
    );
}

function num(value) {
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
  const type = Number(event?.season?.type ?? event?.seasonType ?? 2);
  if (type === 1) return "preseason";
  if (type === 3) return "playoff";
  return "regular";
}

function side(competition, homeAway) {
  const row = (competition?.competitors ?? []).find(
    (competitor) => competitor?.homeAway === homeAway
  );
  if (!row?.team?.id) return null;
  const record = Array.isArray(row.records)
    ? row.records.find((item) => item?.type === "total") ?? row.records[0]
    : null;
  return {
    teamId: String(row.team.id),
    abbreviation: String(row.team.abbreviation ?? "").toUpperCase(),
    name: row.team.displayName ?? row.team.shortDisplayName ?? undefined,
    score: num(row.score),
    record: record?.summary ?? undefined,
    periods: Array.isArray(row.linescores)
      ? row.linescores.map((period) => num(period?.value ?? period?.displayValue))
      : undefined,
  };
}

function transformEspn(event, season) {
  const competition = event?.competitions?.[0];
  const home = side(competition, "home");
  const away = side(competition, "away");
  const id = String(event?.id ?? "").trim();
  const date = String(event?.date ?? competition?.date ?? "").trim();
  if (!id || !home || !away || !/^\d{4}-\d{2}-\d{2}/.test(date)) return null;

  const status = statusKind(event?.status ?? competition?.status);
  const statusType = competition?.status?.type ?? event?.status?.type ?? {};
  return {
    id,
    season,
    gameDate: date.slice(0, 10),
    tipOffAt: date || undefined,
    statusDetail:
      statusType.shortDetail ?? statusType.detail ?? statusType.description ?? undefined,
    homeTeamId: home.teamId,
    awayTeamId: away.teamId,
    homeTeamAbbr: home.abbreviation,
    awayTeamAbbr: away.abbreviation,
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
    gameType: gameType(event),
    status,
    period: num(event?.status?.period ?? competition?.status?.period) || undefined,
    displayClock:
      event?.status?.displayClock ?? competition?.status?.displayClock ?? undefined,
    retrievedAt: new Date().toISOString(),
  };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json, text/plain, */*",
      "User-Agent": "Mozilla/5.0 DRBL-build-snapshot/4.0",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${url}`);
  }
  return response.json();
}

async function fetchEspnSeason(startYear) {
  const season = canonicalSeason(startYear);
  const byId = new Map();
  const failures = [];
  for (const month of monthsForSeason(startYear)) {
    try {
      const payload = await fetchJson(`${ESPN_SCOREBOARD}?dates=${month}&limit=400`);
      for (const event of payload?.events ?? []) {
        const game = transformEspn(event, season);
        if (game) byId.set(game.id, game);
      }
    } catch (error) {
      failures.push(
        `${month}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  return { games: [...byId.values()], failures };
}

function archiveTeamAbbr(value) {
  return String(value ?? "").trim().split(/\s+/)[0]?.toUpperCase() ?? "";
}

function matchupKey(game) {
  return [
    game.season,
    game.gameDate,
    String(game.awayTeamAbbr ?? "").toUpperCase(),
    String(game.homeTeamAbbr ?? "").toUpperCase(),
  ].join("|");
}

async function fetchArchivedPreviousSchedule() {
  if (previousSeason !== "2025-26") {
    throw new Error(
      `Completed-season canonical source is only configured for 2025-26; got ${previousSeason}`
    );
  }
  const payload = await fetchJson(ARCHIVED_2025_26);
  if (payload?.season !== previousSeason || !Array.isArray(payload?.games)) {
    throw new Error("Archived 2025-26 schedule has an unexpected shape");
  }
  return payload.games
    .map((raw) => {
      const id = String(raw?.game_id ?? "").trim();
      const tipOffAt = String(raw?.tip_utc ?? "").trim();
      const awayTeamAbbr = archiveTeamAbbr(raw?.away_team);
      const homeTeamAbbr = archiveTeamAbbr(raw?.home_team);
      if (!/^00\d{8}$/.test(id) || !tipOffAt || !awayTeamAbbr || !homeTeamAbbr) {
        return null;
      }
      return {
        id,
        season: previousSeason,
        gameDate: tipOffAt.slice(0, 10),
        tipOffAt,
        awayTeamAbbr,
        homeTeamAbbr,
        gameType: String(raw?.season_type ?? "")
          .toLowerCase()
          .includes("preseason")
          ? "preseason"
          : "regular",
      };
    })
    .filter(Boolean);
}

function enrichArchivedGame(archive, espn) {
  if (!espn) return null;
  return {
    ...espn,
    id: archive.id,
    season: archive.season,
    gameDate: archive.gameDate,
    tipOffAt: archive.tipOffAt ?? espn.tipOffAt,
    gameType: archive.gameType ?? espn.gameType,
    retrievedAt: new Date().toISOString(),
  };
}

async function main() {
  const [previousEspn, currentEspn, archivedPrevious] = await Promise.all([
    fetchEspnSeason(previousStartYear),
    fetchEspnSeason(currentStartYear),
    fetchArchivedPreviousSchedule(),
  ]);

  const previousEspnByMatchup = new Map(
    previousEspn.games.map((game) => [matchupKey(game), game])
  );
  const aliases = {};
  const byId = new Map();
  let canonicalPreviousCount = 0;

  for (const archive of archivedPrevious) {
    const espn = previousEspnByMatchup.get(matchupKey(archive));
    const game = enrichArchivedGame(archive, espn);
    if (!game) continue;
    byId.set(game.id, game);
    aliases[game.id] = game.id;
    aliases[espn.id] = game.id;
    canonicalPreviousCount += 1;
  }

  // Keep unmatched previous-season ESPN events, including playoffs. The
  // completed regular season above remains canonical NBA-ID space.
  for (const game of previousEspn.games) {
    if (aliases[game.id]) continue;
    byId.set(game.id, game);
    aliases[game.id] = game.id;
  }

  // Future games do not have box/PBP yet, so availability does not depend on an
  // NBA GameID. ESPN event IDs are factual and stable; they can be upgraded by
  // a later build when the league CDN publishes a matching canonical id.
  for (const game of currentEspn.games) {
    byId.set(game.id, game);
    aliases[game.id] = game.id;
  }

  const games = [...byId.values()].sort((a, b) =>
    a.gameDate === b.gameDate
      ? a.id.localeCompare(b.id)
      : a.gameDate.localeCompare(b.gameDate)
  );
  const previousGames = games.filter((game) => game.season === previousSeason);
  const currentGames = games.filter((game) => game.season === currentSeason);
  const exampleTarget = aliases["401811018"];

  if (
    previousGames.length < 1000 ||
    canonicalPreviousCount < 1000 ||
    currentGames.length < 1000 ||
    !/^00\d{8}$/.test(String(exampleTarget ?? ""))
  ) {
    throw new Error(
      `Runtime game snapshot incomplete: ${previousSeason}=${previousGames.length} ` +
        `(${canonicalPreviousCount} canonical), ${currentSeason}=${currentGames.length}, ` +
        `401811018=>${exampleTarget ?? "missing"}. ` +
        `ESPN failures: ${[...previousEspn.failures, ...currentEspn.failures]
          .slice(0, 6)
          .join(" | ")}`
    );
  }

  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(
    OUT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: "resilient-build-snapshot",
        seasons: [previousSeason, currentSeason],
        aliases,
        games,
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  console.log(
    `[runtime-snapshot] ${previousSeason}=${previousGames.length} ` +
      `(${canonicalPreviousCount} canonical); ${currentSeason}=${currentGames.length}; ` +
      `aliases=${Object.keys(aliases).length}`
  );
}

await main();
