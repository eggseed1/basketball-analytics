/**
 * Build compact player-season shot indexes from raw PBP (offline only).
 * Output: data/drbl/history/{ver}/indexes/player-shots/{season}/{playerId}.json
 *
 *   npx tsx scripts/p18c13r-build-player-shot-index.ts [season...]
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
} from "node:fs";
import path from "node:path";
import { HISTORY_VERSION } from "../src/lib/history/capabilities";
import { loadRawArchiveShotEvents } from "../src/data/history/raw-archive-shots";
import { assignShotZone } from "../src/lib/shots/court-geometry";

const ROOT = process.cwd();
const HISTORY = path.join(ROOT, "data", "drbl", "history", HISTORY_VERSION);
const OUT = path.join(HISTORY, "indexes", "player-shots");

type CompactShot = {
  gameId: string;
  eventId: string;
  x: number;
  y: number;
  made: boolean;
  shotValue: 2 | 3;
  period: number;
  clock: string;
  zone: string;
};

const seasonsArg = process.argv.slice(2);
const seasons =
  seasonsArg.length > 0
    ? seasonsArg
    : ["2005-06", "2018-19", "2019-20", "2022-23", "2023-24"];

function main() {
  mkdirSync(OUT, { recursive: true });
  const summary: Array<Record<string, unknown>> = [];

  for (const season of seasons) {
    const pgPath = path.join(HISTORY, season, "player-games.json");
    if (!existsSync(pgPath)) {
      console.log("skip missing", season);
      continue;
    }
    const seasonOut = path.join(OUT, season);
    mkdirSync(seasonOut, { recursive: true });

    const pg = JSON.parse(readFileSync(pgPath, "utf8")) as {
      rows: Array<{
        playerId: string;
        gameId: string;
        fga: number;
      }>;
    };

    // player → gameIds + box FGA
    const byPlayer = new Map<
      string,
      { gameIds: Set<string>; boxFga: number }
    >();
    for (const r of pg.rows) {
      let e = byPlayer.get(r.playerId);
      if (!e) {
        e = { gameIds: new Set(), boxFga: 0 };
        byPlayer.set(r.playerId, e);
      }
      e.gameIds.add(r.gameId);
      e.boxFga += r.fga;
    }

    const gameCache = new Map<string, ReturnType<typeof loadRawArchiveShotEvents>>();
    let playersWritten = 0;
    let shotsWritten = 0;
    let playersWithCoords = 0;

    for (const [playerId, meta] of byPlayer) {
      const shots: CompactShot[] = [];
      for (const gameId of meta.gameIds) {
        let events = gameCache.get(gameId);
        if (!events) {
          events = loadRawArchiveShotEvents(gameId);
          gameCache.set(gameId, events);
          if (gameCache.size > 64) {
            const first = gameCache.keys().next().value;
            if (first) gameCache.delete(first);
          }
        }
        for (const s of events) {
          if (s.playerId !== playerId) continue;
          if (!s.coordinateAvailable || s.x == null || s.y == null) continue;
          const zone = assignShotZone(
            { x: s.x, y: s.y },
            s.shotType
          );
          shots.push({
            gameId: s.gameId,
            eventId: s.eventId,
            x: Number(s.x.toFixed(2)),
            y: Number(s.y.toFixed(2)),
            made: s.made,
            shotValue: s.shotType === "3PT" ? 3 : 2,
            period: s.period,
            clock: s.clock,
            zone,
          });
        }
      }

      if (shots.length === 0 && meta.boxFga === 0) continue;

      const payload = {
        playerId,
        season,
        boxFga: meta.boxFga,
        shotEvents: shots.length,
        coordinateShots: shots.length,
        coverage:
          meta.boxFga > 0
            ? Number((shots.length / meta.boxFga).toFixed(4))
            : 0,
        shots,
        generatedAt: new Date().toISOString(),
      };
      writeFileSync(
        path.join(seasonOut, `${playerId}.json`),
        JSON.stringify(payload)
      );
      playersWritten++;
      shotsWritten += shots.length;
      if (shots.length > 0) playersWithCoords++;
    }

    summary.push({
      season,
      playersWritten,
      playersWithCoords,
      shotsWritten,
    });
    console.log(JSON.stringify(summary[summary.length - 1]));
  }

  writeFileSync(
    path.join(OUT, "_build-summary.json"),
    JSON.stringify(
      {
        summary,
        hash: createHash("sha256")
          .update(JSON.stringify(summary))
          .digest("hex"),
      },
      null,
      2
    )
  );
}

main();
