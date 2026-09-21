/**
 * Bake regular-season window deltas from the local game-log assets.
 * Run: npx tsx scripts/build-stat-detective-windows.ts
 */
import fs from "node:fs";
import path from "node:path";

import {
  playerWindowDeltas,
  qualifiesWindow,
  type StatDetectiveMetricId,
  type StatWindowId,
  type WindowDelta,
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
const METRICS: StatDetectiveMetricId[] = ["ppg", "ts", "rpg"];

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

function packRow(
  espnId: string,
  playerName: string,
  teamAbbr: string,
  hit: WindowDelta
): Record<string, unknown> {
  return {
    playerId: espnId,
    playerName,
    teamAbbr,
    windowPpg: round(hit.windowPpg, 1),
    baselinePpg: round(hit.baselinePpg, 1),
    deltaPpg: round(hit.deltaPpg, 1),
    windowMpg: round(hit.windowMpg, 1),
    baselineMpg: round(hit.baselineMpg, 1),
    windowTs: hit.windowTs == null ? null : round(hit.windowTs, 3),
    baselineTs: hit.baselineTs == null ? null : round(hit.baselineTs, 3),
    deltaTs: hit.deltaTs == null ? null : round(hit.deltaTs, 3),
    windowRpg: hit.windowRpg == null ? null : round(hit.windowRpg, 1),
    baselineRpg: hit.baselineRpg == null ? null : round(hit.baselineRpg, 1),
    deltaRpg: hit.deltaRpg == null ? null : round(hit.deltaRpg, 1),
  };
}

function main() {
  const season = latestSeason();
  if (!season) {
    throw new Error("No baked player game logs found.");
  }
  const names = namesByNba();
  const dir = path.join(LOG_ROOT, season);
  const windows: StatWindowId[] = ["last5", "last10", "split5"];
  const buckets = new Map<
    StatWindowId,
    Map<StatDetectiveMetricId, Map<string, Record<string, unknown>>>
  >();
  for (const id of windows) {
    const metricMap = new Map<
      StatDetectiveMetricId,
      Map<string, Record<string, unknown>>
    >();
    for (const metric of METRICS) metricMap.set(metric, new Map());
    buckets.set(id, metricMap);
  }

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
    const games = rawGames.map((game) => {
      const rebRaw = game.rebounds;
      const rebounds =
        rebRaw == null || rebRaw === ""
          ? null
          : Number.isFinite(Number(rebRaw))
            ? Number(rebRaw)
            : null;
      return {
        date: String(game.date ?? ""),
        gameId: String(game.gameId ?? ""),
        minutesNum: Number(game.minutesNum ?? 0),
        points: Number(game.points ?? 0),
        fga: Number(game.fga ?? 0),
        fta: Number(game.fta ?? 0),
        rebounds,
        seasonType: game.seasonType ? String(game.seasonType) : undefined,
        teamAbbr: game.teamAbbr ? String(game.teamAbbr) : "",
      };
    });
    const deltas = playerWindowDeltas(games);
    const teamAbbr =
      [...games]
        .filter((game) => game.seasonType === "regular")
        .sort((a, b) => a.date.localeCompare(b.date))
        .at(-1)?.teamAbbr ?? "";
    for (const id of windows) {
      const hit = deltas[id];
      if (!hit) continue;
      const row = packRow(espnId, playerName, teamAbbr, hit);
      for (const metric of METRICS) {
        if (!qualifiesWindow(hit, metric)) continue;
        buckets.get(id)?.get(metric)?.set(espnId, row);
      }
    }
  }

  const packed: Record<string, unknown> = {};
  for (const id of windows) {
    const metrics: Record<string, unknown> = {};
    for (const metric of METRICS) {
      const rows = [...(buckets.get(id)?.get(metric)?.values() ?? [])];
      const sortKey = (row: Record<string, unknown>) => {
        if (metric === "ppg") return Number(row.deltaPpg);
        if (metric === "ts") return Number(row.deltaTs);
        return Number(row.deltaRpg);
      };
      const risers = [...rows]
        .filter((row) => sortKey(row) > 0)
        .sort((a, b) => sortKey(b) - sortKey(a))
        .slice(0, LIMIT);
      const fallers = [...rows]
        .filter((row) => sortKey(row) < 0)
        .sort((a, b) => sortKey(a) - sortKey(b))
        .slice(0, LIMIT);
      metrics[metric] = { risers, fallers };
    }
    // Legacy PPG top-level for older readers.
    packed[id] = {
      risers: (metrics.ppg as { risers: unknown[] }).risers,
      fallers: (metrics.ppg as { fallers: unknown[] }).fallers,
      metrics,
    };
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
      const block = packed[id] as {
        metrics: Record<string, { risers: unknown[]; fallers: unknown[] }>;
      };
      return METRICS.map(
        (m) =>
          `${id}/${m} +${block.metrics[m]!.risers.length}/-${block.metrics[m]!.fallers.length}`
      ).join(", ");
    })
    .join("; ");
  console.log(`Wrote ${OUT} (${season}: ${counts})`);
}

main();
