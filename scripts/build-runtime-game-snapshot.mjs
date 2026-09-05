import fs from "node:fs/promises";
import path from "node:path";

const OUT = path.join(process.cwd(), "src/data/runtime/game-snapshot.json");
const ESPN = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";
const now = new Date();
const currentStartYear = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
// Six league years of schedules for team Games/Splits/Playoffs tabs on CF.
const seasons = [
  currentStartYear - 5,
  currentStartYear - 4,
  currentStartYear - 3,
  currentStartYear - 2,
  currentStartYear - 1,
  currentStartYear,
];

function canonicalSeason(startYear) {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

function monthsForSeason(startYear) {
  return [10, 11, 12].map((m) => `${startYear}${String(m).padStart(2, "0")}`).concat(
    [1, 2, 3, 4, 5, 6].map((m) => `${startYear + 1}${String(m).padStart(2, "0")}`)
  );
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
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

function side(comp, homeAway) {
  const row = (comp?.competitors ?? []).find((c) => c?.homeAway === homeAway);
  if (!row?.team?.id) return null;
  const record = Array.isArray(row.records)
    ? row.records.find((r) => r?.type === "total") ?? row.records[0]
    : null;
  return {
    teamId: String(row.team.id),
    abbr: row.team.abbreviation ?? undefined,
    name: row.team.displayName ?? row.team.shortDisplayName ?? undefined,
    score: num(row.score),
    record: record?.summary ?? undefined,
    periods: Array.isArray(row.linescores)
      ? row.linescores.map((p) => num(p?.value ?? p?.displayValue))
      : undefined,
  };
}

function transform(event, season) {
  const comp = event?.competitions?.[0];
  const home = side(comp, "home");
  const away = side(comp, "away");
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
    gameType: gameType(event),
    status,
    period: num(event?.status?.period ?? comp?.status?.period) || undefined,
    displayClock:
      event?.status?.displayClock ?? comp?.status?.displayClock ?? undefined,
    retrievedAt: new Date().toISOString(),
  };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json, text/plain, */*",
      "User-Agent": "Mozilla/5.0 DRBL-build-snapshot/1.0",
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${url}`);
  }
  return response.json();
}

async function main() {
  const byId = new Map();
  const failures = [];

  for (const startYear of seasons) {
    const season = canonicalSeason(startYear);
    for (const month of monthsForSeason(startYear)) {
      const url = `${ESPN}?dates=${month}&limit=400`;
      try {
        const payload = await fetchJson(url);
        for (const event of payload?.events ?? []) {
          const game = transform(event, season);
          if (game) byId.set(game.id, game);
        }
      } catch (error) {
        failures.push(
          `${month}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  const games = [...byId.values()].sort((a, b) =>
    a.gameDate === b.gameDate
      ? a.id.localeCompare(b.id)
      : a.gameDate.localeCompare(b.gameDate)
  );
  const completedSeason = canonicalSeason(currentStartYear - 2);
  const previousSeason = canonicalSeason(currentStartYear - 1);
  const upcomingSeason = canonicalSeason(currentStartYear);
  const completedCount = games.filter((g) => g.season === completedSeason).length;
  const previousCount = games.filter((g) => g.season === previousSeason).length;
  const upcomingCount = games.filter((g) => g.season === upcomingSeason).length;
  const requiredExample = games.some((g) => g.id === "401811018");

  const adequate =
    completedCount >= 1000 && previousCount >= 1000 && requiredExample;

  if (!adequate) {
    let previous = null;
    try {
      previous = JSON.parse(await fs.readFile(OUT, "utf8"));
    } catch {}
    const previousGames = Array.isArray(previous?.games) ? previous.games : [];
    const priorCompletedCount = previousGames.filter(
      (g) => g.season === completedSeason
    ).length;
    const priorPreviousCount = previousGames.filter(
      (g) => g.season === previousSeason
    ).length;
    const priorHasExample = previousGames.some((g) => g.id === "401811018");
    if (
      priorCompletedCount >= 1000 &&
      priorPreviousCount >= 1000 &&
      priorHasExample
    ) {
      console.warn(
        `[runtime-snapshot] refresh incomplete (${games.length} games); retaining prior snapshot`
      );
      return;
    }
    throw new Error(
      `Runtime game snapshot incomplete: total=${games.length}, ${completedSeason}=${completedCount}, ${previousSeason}=${previousCount}, ${upcomingSeason}=${upcomingCount}, example=${requiredExample}. ` +
        `Failures: ${failures.slice(0, 6).join(" | ")}`
    );
  }

  // Three league years (Workers Paid size budget) for team/history + Game Lab PBP.
  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(
    OUT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: "espn-build-snapshot",
        seasons: seasons.map(canonicalSeason),
        games,
      },
      null,
      2
    ) + "\n",
    "utf8"
  );
  console.log(
    `[runtime-snapshot] wrote ${games.length} games (${completedSeason}: ${completedCount}, ${previousSeason}: ${previousCount}, ${upcomingSeason}: ${upcomingCount}) to ${OUT}`
  );
}

await main();
