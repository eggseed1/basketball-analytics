import fs from "node:fs/promises";
import path from "node:path";

const OUT = path.join(process.cwd(), "src/data/runtime/game-snapshot.json");
const OUT_TIPS = path.join(
  process.cwd(),
  "src/data/runtime/first-regular-season-tips.json"
);
const OUT_FULL = path.join(
  process.cwd(),
  "src/data/runtime/game-snapshot-full.json"
);
const ESPN = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";
const now = new Date();
const currentStartYear = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
// Fetch up to six league years into game-snapshot-full.json (Node tests / local).
// Worker-inlined game-snapshot.json stays at GAME_SNAPSHOT_LITE_SEASONS (default 2).
function canonicalSeason(startYear) {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

const seasonSpan = Number(process.env.GAME_SNAPSHOT_SEASONS ?? 6);
const span = Number.isFinite(seasonSpan) && seasonSpan > 0 ? Math.min(6, seasonSpan) : 6;
const seasons = Array.from({ length: span }, (_, i) => currentStartYear - (span - 1 - i));
const liteSpanRaw = Number(process.env.GAME_SNAPSHOT_LITE_SEASONS ?? 2);
const liteSpan =
  Number.isFinite(liteSpanRaw) && liteSpanRaw > 0 ? Math.min(span, liteSpanRaw) : 2;
const liteSeasonSet = new Set(
  Array.from({ length: liteSpan }, (_, i) =>
    canonicalSeason(currentStartYear - (liteSpan - 1 - i))
  )
);

function monthsForSeason(startYear) {
  return [10, 11, 12].map((m) => `${startYear}${String(m).padStart(2, "0")}`).concat(
    [1, 2, 3, 4, 5, 6].map((m) => `${startYear + 1}${String(m).padStart(2, "0")}`)
  );
}

const etDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** League calendar day (US Eastern). ESPN stamps evening tips with the next UTC day. */
function nbaCalendarDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : etDate.format(d);
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
  if (type === 5) return "play-in";
  return "regular";
}

/** NBA Cup Championship: typed regular season by ESPN, but not in standings. */
function isCupChampionship(comp) {
  if (comp?.type?.abbreviation === "CC") return true;
  return (comp?.notes ?? []).some((n) =>
    /NBA Cup Championship/i.test(String(n?.headline ?? ""))
  );
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
    gameDate: nbaCalendarDate(date),
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
    ...(isCupChampionship(comp) ? { cupChampionship: true } : {}),
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

  const generatedAt = new Date().toISOString();
  const seasonLabels = seasons.map(canonicalSeason);
  const liteGames = games.filter((g) => liteSeasonSet.has(g.season));
  const liteSeasons = seasonLabels.filter((s) => liteSeasonSet.has(s));

  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(
    OUT_FULL,
    JSON.stringify(
      {
        generatedAt,
        source: "espn-build-snapshot",
        seasons: seasonLabels,
        games,
      },
      null,
      2
    ) + "\n",
    "utf8"
  );
  // Lite snapshot: public/runtime (ASSETS) + src mirror for scripts.
  const liteBody =
    JSON.stringify(
      {
        generatedAt,
        source: "espn-build-snapshot",
        seasons: liteSeasons,
        games: liteGames,
      },
      null,
      2
    ) + "\n";
  const OUT_PUBLIC = path.join(
    process.cwd(),
    "public",
    "runtime",
    "game-snapshot.json"
  );
  await fs.mkdir(path.dirname(OUT_PUBLIC), { recursive: true });
  await fs.writeFile(OUT, liteBody);
  await fs.writeFile(OUT_PUBLIC, liteBody);
  // Older seasons for Worker Static Assets (team tabs / brackets).
  const seasonsDir = path.join(
    process.cwd(),
    "public",
    "runtime",
    "game-seasons"
  );
  await fs.mkdir(seasonsDir, { recursive: true });
  for (const season of seasonLabels) {
    if (liteSeasonSet.has(season)) continue;
    const seasonGames = games.filter((g) => g.season === season);
    await fs.writeFile(
      path.join(seasonsDir, `${season}.json`),
      JSON.stringify({
        season,
        generatedAt,
        games: seasonGames,
      }) + "\n",
      "utf8"
    );
  }

  const tips = {};
  for (const game of games) {
    if ((game.gameType ?? "regular") !== "regular" || !game.gameDate) continue;
    const season = String(game.season ?? "");
    const d = String(game.gameDate).slice(0, 10);
    if (!season || !/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    if (!tips[season] || d < tips[season]) tips[season] = d;
  }
  await fs.writeFile(
    OUT_TIPS,
    JSON.stringify(
      {
        generatedAt,
        source: "espn-build-snapshot",
        tips,
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  console.log(
    `[runtime-snapshot] wrote full ${games.length} games → ${OUT_FULL}; lite ${liteGames.length} (${liteSeasons.join(",")}) → ${OUT}; tips ${Object.keys(tips).length} → ${OUT_TIPS}`
  );
}

await main();
