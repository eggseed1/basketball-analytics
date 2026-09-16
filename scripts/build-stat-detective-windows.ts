/**
 * Bake regular-season window deltas from the local game-log assets.
 * Run: npx tsx scripts/build-stat-detective-windows.ts
 */
import fs from "node:fs";
import path from "node:path";

import {
  playerWindowDeltas,
  qualifiesWindow,
  type StatWindowId,
} from "../src/analytics/stat-detective-windows";

const ROOT = process.cwd();
const LOG_ROOT = path.join(ROOT, "public", "runtime", "player-game-logs");
const ALIAS_PATH = path.join(
  ROOT,
  "src",
  "data",
  "runtime",
  "player-id-aliases-snapshot.json"
);
const OUT = path.join(
  ROOT,
  "src",
  "data",
  "runtime",
  "stat-detective-windows.json"
);
const LIMIT = 8;

type Alias = {
  espnPlayerId?: string;
  nbaPlayerId?: string;
  playerName?: string;
};

function latestSeason(): string | null {
  if (!fs.existsSync(LOG_ROOT)) return null;
  const seasons = fs
    .readdirSync(LOG_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  for (const season of [...seasons].reverse()) {
    const dir = path.join(LOG_ROOT, season);
    if (fs.readdirSync(dir).some((name) => name.endsWith(".json"))) return season;
  }
  return null;
}

function namesByNba(): Map<string, { name: string; espnId: string }> {
  const raw = JSON.parse(fs.readFileSync(ALIAS_PATH, "utf8")) as {
    aliases?: Alias[];
  };
  const map = new Map<string, { name: string; espnId: string }>();
  for (const row of raw.aliases ?? []) {
    const nba = String(row.nbaPlayerId ?? "").trim();
    const espn = String(row.espnPlayerId ?? "").trim();
    const name = String(row.playerName ?? "").trim();
    if (!nba || !espn || !name) continue;
    if (!map.has(nba)) map.set(nba, { name, espnId: espn });
  }
  return map;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function main() {
  const season = latestSeason();
  if (!season) {
    throw new Error("No baked player game logs found.");
  }
  const names = namesByNba();
  const dir = path.join(LOG_ROOT, season);
  const windows: StatWindowId[] = ["last5", "last10", "split5"];
  const buckets = new Map<StatWindowId, Map<string, Record<string, unknown>>>();
  for (const id of windows) buckets.set(id, new Map());

  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const payload = JSON.parse(
      fs.readFileSync(path.join(dir, file), "utf8")
    ) as {
      playerId?: string;
      espnId?: string;
      games?: Array<Record<string, unknown>>;
    };
    const nbaId = String(payload.playerId ?? file.replace(/\.json$/, "")).trim();
    const alias = names.get(nbaId);
    const espnId = String(payload.espnId ?? alias?.espnId ?? "").trim();
    const playerName = alias?.name;
    if (!espnId || !playerName) continue;
    const rawGames = payload.games ?? [];
    const games = rawGames.map((game) => ({
      date: String(game.date ?? ""),
      gameId: String(game.gameId ?? ""),
      minutesNum: Number(game.minutesNum ?? 0),
      points: Number(game.points ?? 0),
      fga: Number(game.fga ?? 0),
      fta: Number(game.fta ?? 0),
      seasonType: game.seasonType ? String(game.seasonType) : undefined,
      teamAbbr: game.teamAbbr ? String(game.teamAbbr) : "",
    }));
    const deltas = playerWindowDeltas(games);
    const teamAbbr =
      [...games]
        .filter((game) => game.seasonType === "regular")
        .sort((a, b) => a.date.localeCompare(b.date))
        .at(-1)?.teamAbbr ?? "";
    for (const id of windows) {
      const hit = deltas[id];
      if (!hit || !qualifiesWindow(hit)) continue;
      buckets.get(id)?.set(espnId, {
        playerId: espnId,
        playerName,
        teamAbbr,
        windowPpg: round(hit.windowPpg, 1),
        baselinePpg: round(hit.baselinePpg, 1),
        deltaPpg: round(hit.deltaPpg, 1),
        windowMpg: round(hit.windowMpg, 1),
        baselineMpg: round(hit.baselineMpg, 1),
        deltaTs: hit.deltaTs == null ? null : round(hit.deltaTs, 3),
      });
    }
  }

  const packed: Record<string, unknown> = {};
  for (const id of windows) {
    const rows = [...(buckets.get(id)?.values() ?? [])];
    const risers = [...rows]
      .filter((row) => Number(row.deltaPpg) > 0)
      .sort((a, b) => Number(b.deltaPpg) - Number(a.deltaPpg))
      .slice(0, LIMIT);
    const fallers = [...rows]
      .filter((row) => Number(row.deltaPpg) < 0)
      .sort((a, b) => Number(a.deltaPpg) - Number(b.deltaPpg))
      .slice(0, LIMIT);
    packed[id] = { risers, fallers };
  }

  const snapshot = {
    generatedAt: new Date().toISOString(),
    season,
    source: "regular-season game logs",
    windows: packed,
  };
  fs.writeFileSync(OUT, `${JSON.stringify(snapshot, null, 2)}\n`);
  const counts = windows
    .map((id) => {
      const block = packed[id] as { risers: unknown[]; fallers: unknown[] };
      return `${id} +${block.risers.length}/-${block.fallers.length}`;
    })
    .join(", ");
  console.log(`Wrote ${OUT} (${season}: ${counts})`);
}

main();
