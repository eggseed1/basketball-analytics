/**
 * Current-season player shot charts from NBA CDN play-by-play, for the nightly
 * deploy. CDN shots carry the same court coordinates, event ids and zone names
 * as stats.nba.com shotchartdetail, which GitHub Actions can't reach.
 *
 * Output: public/runtime/player-shots/{season}/{nbaPlayerId}.json (plus an
 * ESPN-id copy when the alias snapshot knows one), same shape as
 * scripts/build-runtime-player-shots.mjs.
 *
 *   npx tsx scripts/build-season-shots-from-pbp.ts
 *   npx tsx scripts/build-season-shots-from-pbp.ts --season 2025-26
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { downloadCdnPlayByPlay } from "../drbl/download/cdn-client";
import { rawPath, readOrFetchJson } from "../drbl/download/disk-cache";
import { listSeasonGames } from "../drbl/download/season-games";
import type { PlayerSeasonShotIndex } from "../src/data/history/player-season-shots";
import { nbaSeasonPhaseInfo } from "./lib/nba-season-phase.mjs";

const ROOT = process.cwd();
const CONCURRENCY = 8;

type PbpAction = {
  actionNumber?: number;
  clock?: string;
  period?: number;
  personId?: number;
  actionType?: string;
  isFieldGoal?: number;
  shotResult?: string;
  xLegacy?: number | null;
  yLegacy?: number | null;
  area?: string;
};
type Shot = PlayerSeasonShotIndex["shots"][number];

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

/** "PT08M57.00S" → "8:57", matching shotchartdetail's whole minutes and seconds. */
function clockLabel(iso: string | undefined): string {
  const m = /PT(\d+)M([\d.]+)S/.exec(iso ?? "");
  if (!m) return "0:00";
  return `${Number(m[1])}:${String(Math.floor(Number(m[2]))).padStart(2, "0")}`;
}

async function loadActions(gameId: string): Promise<PbpAction[]> {
  const { data } = await readOrFetchJson<{ game?: { actions?: PbpAction[] } }>(
    rawPath("games", gameId, "playbyplay.json"),
    () => downloadCdnPlayByPlay(gameId) as Promise<{ game?: { actions?: PbpAction[] } }>,
    { endpoint: `cdn.nba.com/liveData/playbyplay/playbyplay_${gameId}.json` }
  );
  return data.game?.actions ?? [];
}

async function espnIdsByNbaId(): Promise<Map<string, string>> {
  const file = path.join(ROOT, "src/data/runtime/player-id-aliases-snapshot.json");
  const { aliases = [] } = JSON.parse(await readFile(file, "utf8")) as {
    aliases?: Array<{ nbaPlayerId?: string; espnPlayerId?: string }>;
  };
  const out = new Map<string, string>();
  for (const a of aliases) {
    if (a.nbaPlayerId && a.espnPlayerId && a.espnPlayerId !== a.nbaPlayerId) {
      out.set(String(a.nbaPlayerId), String(a.espnPlayerId));
    }
  }
  return out;
}

async function main() {
  const season = argValue("--season") ?? nbaSeasonPhaseInfo(new Date()).season;
  const games = await listSeasonGames(season);
  console.log(`[season-shots] ${season}: ${games.length} final regular-season games`);
  if (games.length === 0) return;

  const byPlayer = new Map<string, Shot[]>();
  let failedGames = 0;
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < games.length) {
        const game = games[next++]!;
        let actions: PbpAction[];
        try {
          actions = await loadActions(game.gameId);
        } catch {
          failedGames += 1;
          continue;
        }
        for (const a of actions) {
          if (a.isFieldGoal !== 1 || !a.personId || a.xLegacy == null || a.yLegacy == null) continue;
          const id = String(a.personId);
          const shots = byPlayer.get(id) ?? [];
          shots.push({
            gameId: game.gameId,
            eventId: String(a.actionNumber ?? shots.length),
            x: a.xLegacy / 10,
            y: a.yLegacy / 10,
            made: a.shotResult === "Made",
            shotValue: a.actionType === "3pt" ? 3 : 2,
            period: Number(a.period) || 0,
            clock: clockLabel(a.clock),
            zone: a.area?.trim() || "Unknown",
          });
          byPlayer.set(id, shots);
        }
      }
    })
  );

  const espnIds = await espnIdsByNbaId();
  const dir = path.join(ROOT, "public/runtime/player-shots", season);
  await mkdir(dir, { recursive: true });
  const generatedAt = new Date().toISOString();
  for (const [nbaId, shots] of byPlayer) {
    shots.sort((a, b) => a.gameId.localeCompare(b.gameId) || Number(a.eventId) - Number(b.eventId));
    const index: PlayerSeasonShotIndex & { source: string; generatedAt: string } = {
      playerId: nbaId,
      season,
      boxFga: shots.length,
      shotEvents: shots.length,
      coordinateShots: shots.length,
      coverage: 1,
      shots,
      source: "cdn.nba.com/liveData/playbyplay",
      generatedAt,
    };
    const body = JSON.stringify(index);
    await writeFile(path.join(dir, `${nbaId}.json`), body);
    const espnId = espnIds.get(nbaId);
    if (espnId) await writeFile(path.join(dir, `${espnId}.json`), body);
  }
  console.log(
    `[season-shots] wrote ${byPlayer.size} players → ${path.relative(ROOT, dir)} (games failed: ${failedGames})`
  );
  if (failedGames > games.length / 10) {
    throw new Error(`${failedGames} of ${games.length} games had no play-by-play`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
