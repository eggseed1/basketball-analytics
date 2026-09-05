/**
 * Bake homepage Recent Insights from completed 2025-26 games + player logs.
 * Prefer last slate dates; expand backward until we have enough material.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const require = createRequire(import.meta.url);

async function main() {
  const { buildRecentInsights } = await import(
    pathToFileURL(path.join(ROOT, "src/lib/recent-insights.ts")).href
  );

  const gameSnap = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "src/data/runtime/game-snapshot.json"),
      "utf8"
    )
  );
  const aliases = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "src/data/runtime/player-id-aliases-snapshot.json"),
      "utf8"
    )
  );
  const bref = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "src/data/runtime/bref-advanced-snapshot.json"),
      "utf8"
    )
  );

  const season = "2025-26";
  const nbaToEspn = new Map();
  const nbaToName = new Map();
  for (const a of aliases.aliases ?? []) {
    if (!a?.nbaPlayerId) continue;
    nbaToName.set(String(a.nbaPlayerId), a.playerName);
    if (a.espnPlayerId && a.productionApproved !== false) {
      nbaToEspn.set(String(a.nbaPlayerId), String(a.espnPlayerId));
    }
  }

  /** Season PPG from BRef per-game (name key). */
  const ppgByName = new Map();
  const seasonBlock = bref.seasons?.[season];
  for (const row of seasonBlock?.perGame ?? []) {
    const name = String(row.n ?? "").trim();
    const gp = Number(row.gp ?? 0);
    // BRef slim perGame stores counting rates already as per-game.
    const ppg = Number(row.pts ?? 0);
    if (!name || !(gp > 0) || !(ppg > 0)) continue;
    const key = name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const prev = ppgByName.get(key);
    if (!prev || gp > prev.gp) ppgByName.set(key, { ppg, gp });
  }

  const finals = (gameSnap.games ?? []).filter(
    (g) =>
      g.season === season &&
      g.status === "final" &&
      (g.gameType === "regular" ||
        g.gameType === "playoff" ||
        g.gameType === "play-in") &&
      Number(g.homeScore) + Number(g.awayScore) > 0
  );
  finals.sort((a, b) => b.gameDate.localeCompare(a.gameDate));
  if (!finals.length) {
    throw new Error(`No final ${season} games in game-snapshot`);
  }

  const dates = [...new Set(finals.map((g) => g.gameDate))].sort((a, b) =>
    b.localeCompare(a)
  );
  /** Expand from newest date until we have enough games (or 10 dates). */
  const selectedDates = [];
  let slateGames = [];
  for (const d of dates) {
    selectedDates.push(d);
    slateGames = finals.filter((g) => selectedDates.includes(g.gameDate));
    if (slateGames.length >= 6 || selectedDates.length >= 5) break;
  }
  const dateSet = new Set(selectedDates);
  console.log(
    `[recent-insights] slate dates ${selectedDates.join(", ")} (${slateGames.length} games)`
  );

  const logDir = path.join(ROOT, "public/runtime/player-game-logs", season);
  const files = fs.readdirSync(logDir).filter((f) => f.endsWith(".json"));
  const lines = [];
  const recentByPlayer = new Map();

  for (const file of files) {
    const nbaId = file.replace(/\.json$/, "");
    let json;
    try {
      json = JSON.parse(fs.readFileSync(path.join(logDir, file), "utf8"));
    } catch {
      continue;
    }
    const games = Array.isArray(json.games) ? json.games : [];
    const name = nbaToName.get(nbaId) ?? null;
    const profileId = nbaToEspn.get(nbaId) ?? nbaId;
    if (!name) continue;

    const nameKey = name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const seasonPpg = ppgByName.get(nameKey)?.ppg ?? null;

    const chrono = [];
    for (const g of games) {
      if (!g?.date || !g?.gameId) continue;
      const teamAbbr = String(g.teamAbbr ?? "").trim();
      const line = {
        gameId: String(g.gameId),
        gameDate: String(g.date),
        profileId,
        playerName: name,
        teamId: "", // filled from slate game
        teamAbbr,
        opponentAbbr: String(g.opponentAbbr ?? ""),
        homeAway: g.homeAway === "home" ? "home" : "away",
        result: g.result ?? "",
        minutesNum: Number(g.minutesNum ?? 0),
        points: Number(g.points ?? 0),
        rebounds: Number(g.rebounds ?? 0),
        assists: Number(g.assists ?? 0),
        steals: Number(g.steals ?? 0),
        blocks: Number(g.blocks ?? 0),
        turnovers: Number(g.turnovers ?? 0),
        fgm: Number(g.fgm ?? 0),
        fga: Number(g.fga ?? 0),
        threePm: Number(g.threePm ?? 0),
        threePa: Number(g.threePa ?? 0),
        ftm: Number(g.ftm ?? 0),
        fta: Number(g.fta ?? 0),
        seasonPpg,
      };
      chrono.push(line);
      if (dateSet.has(line.gameDate) && line.minutesNum >= 1) {
        lines.push(line);
      }
    }
    chrono.sort((a, b) => a.gameDate.localeCompare(b.gameDate));
    if (chrono.length) recentByPlayer.set(profileId, chrono);
  }

  const gameById = new Map(slateGames.map((g) => [String(g.id), g]));
  for (const line of lines) {
    const g = gameById.get(line.gameId);
    if (!g) continue;
    const abbr = line.teamAbbr.toUpperCase();
    if (abbr && abbr === String(g.homeTeamAbbr ?? "").toUpperCase()) {
      line.teamId = String(g.homeTeamId);
    } else if (abbr && abbr === String(g.awayTeamAbbr ?? "").toUpperCase()) {
      line.teamId = String(g.awayTeamId);
    } else if (line.homeAway === "home") {
      line.teamId = String(g.homeTeamId);
    } else {
      line.teamId = String(g.awayTeamId);
    }
  }

  const slateInputs = slateGames.map((g) => ({
    id: String(g.id),
    season: String(g.season),
    gameDate: String(g.gameDate),
    homeTeamId: String(g.homeTeamId),
    awayTeamId: String(g.awayTeamId),
    homeTeamAbbr: String(g.homeTeamAbbr ?? "HOME"),
    awayTeamAbbr: String(g.awayTeamAbbr ?? "AWAY"),
    homeScore: Number(g.homeScore ?? 0),
    awayScore: Number(g.awayScore ?? 0),
    homePeriodScores: Array.isArray(g.homePeriodScores)
      ? g.homePeriodScores.map(Number)
      : undefined,
    awayPeriodScores: Array.isArray(g.awayPeriodScores)
      ? g.awayPeriodScores.map(Number)
      : undefined,
    gameType: g.gameType,
    period: g.period,
  }));

  const insights = buildRecentInsights({
    games: slateInputs,
    lines: lines.filter((l) => gameById.has(l.gameId)),
    recentByPlayer,
    limit: 6,
  });

  const out = {
    version: 1,
    generatedAt: new Date().toISOString(),
    season,
    slateDates: selectedDates,
    gameCount: slateInputs.length,
    lineCount: lines.length,
    insights,
  };

  const dest = path.join(
    ROOT,
    "src/data/runtime/recent-insights-snapshot.json"
  );
  fs.writeFileSync(dest, `${JSON.stringify(out)}\n`);
  console.log(
    `[recent-insights] wrote ${insights.length} cards → ${dest} (${lines.length} lines)`
  );
  for (const i of insights) {
    console.log(`  · ${i.category} | ${i.headline}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
