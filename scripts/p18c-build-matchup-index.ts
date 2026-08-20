/**
 * Build compact franchise matchup indexes from history product seasons.
 * Run: npx tsx scripts/p18c-build-matchup-index.ts
 *
 * Output:
 *   data/drbl/history/drbl-history-v1/indexes/matchup-pair-summaries.json
 *   data/drbl/history/drbl-history-v1/indexes/matchups/{pairKey}.json
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  getCanonicalTeamFromProvider,
  type CanonicalTeamId,
} from "../src/data/identity/team-map";
import { HISTORY_VERSION } from "../src/lib/history/capabilities";

const ROOT = path.join(
  process.cwd(),
  "data",
  "drbl",
  "history",
  HISTORY_VERSION
);
const INDEX_DIR = path.join(ROOT, "indexes");
const MATCHUPS_DIR = path.join(INDEX_DIR, "matchups");

type SummaryGame = {
  gameId: string;
  season: string;
  seasonType?: string;
  date: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTricode?: string | null;
  awayTricode?: string | null;
  homeScore: number;
  awayScore: number;
  winnerTeamId: string | null;
  periodCount: number;
};

export type CompactMatchupGame = {
  gameId: string;
  season: string;
  date: string;
  homeNbaId: string;
  awayNbaId: string;
  homeCanonicalId: string;
  awayCanonicalId: string;
  homeTricode: string;
  awayTricode: string;
  homeScore: number;
  awayScore: number;
  ot: boolean;
  seasonType: string;
};

type PairBucket = {
  franchiseA: string;
  franchiseB: string;
  games: CompactMatchupGame[];
};

function pairKey(a: string, b: string): string {
  return a < b ? `${a}__${b}` : `${b}__${a}`;
}

function canonicalFromNba(nbaId: string): CanonicalTeamId | null {
  return getCanonicalTeamFromProvider("nba", nbaId)?.canonicalTeamId ?? null;
}

function listSeasons(): string[] {
  const { readdirSync } = require("node:fs") as typeof import("node:fs");
  return readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{4}-\d{2}$/.test(d.name))
    .map((d) => d.name)
    .filter((s) => s >= "1996-97")
    .sort();
}

function main() {
  mkdirSync(MATCHUPS_DIR, { recursive: true });
  const pairs = new Map<string, PairBucket>();
  let gamesIndexed = 0;
  let doubleCountAttempts = 0;
  const seenGlobal = new Set<string>();

  for (const season of listSeasons()) {
    const p = path.join(ROOT, season, "game-summaries.json");
    if (!existsSync(p)) continue;
    const raw = JSON.parse(readFileSync(p, "utf8")) as {
      games: SummaryGame[];
    };
    for (const g of raw.games ?? []) {
      if (seenGlobal.has(g.gameId)) {
        doubleCountAttempts += 1;
        continue;
      }
      seenGlobal.add(g.gameId);
      const homeC = canonicalFromNba(g.homeTeamId);
      const awayC = canonicalFromNba(g.awayTeamId);
      if (!homeC || !awayC || homeC === awayC) continue;
      const key = pairKey(homeC, awayC);
      const [franchiseA, franchiseB] =
        homeC < awayC ? [homeC, awayC] : [awayC, homeC];
      let bucket = pairs.get(key);
      if (!bucket) {
        bucket = { franchiseA, franchiseB, games: [] };
        pairs.set(key, bucket);
      }
      bucket.games.push({
        gameId: g.gameId,
        season: g.season,
        date: g.date,
        homeNbaId: g.homeTeamId,
        awayNbaId: g.awayTeamId,
        homeCanonicalId: homeC,
        awayCanonicalId: awayC,
        homeTricode: g.homeTricode ?? "HOME",
        awayTricode: g.awayTricode ?? "AWAY",
        homeScore: g.homeScore,
        awayScore: g.awayScore,
        ot: g.periodCount > 4,
        seasonType: g.seasonType ?? "Regular Season",
      });
      gamesIndexed += 1;
    }
  }

  const summaries: Record<
    string,
    {
      pairKey: string;
      franchiseA: string;
      franchiseB: string;
      scope: "Since 1996-97";
      games: number;
      winsA: number;
      winsB: number;
      playoffGames: number;
      otGames: number;
      seasonFrom: string | null;
      seasonTo: string | null;
    }
  > = {};

  for (const [key, bucket] of pairs) {
    bucket.games.sort((a, b) =>
      a.date === b.date
        ? b.gameId.localeCompare(a.gameId)
        : b.date.localeCompare(a.date)
    );
    let winsA = 0;
    let winsB = 0;
    let playoffGames = 0;
    let otGames = 0;
    for (const g of bucket.games) {
      if (g.ot) otGames += 1;
      if (g.seasonType.toLowerCase().includes("playoff")) playoffGames += 1;
      const winner =
        g.homeScore > g.awayScore ? g.homeCanonicalId : g.awayCanonicalId;
      if (winner === bucket.franchiseA) winsA += 1;
      else if (winner === bucket.franchiseB) winsB += 1;
    }
    const seasonFrom =
      bucket.games.length > 0
        ? bucket.games[bucket.games.length - 1]!.season
        : null;
    const seasonTo =
      bucket.games.length > 0 ? bucket.games[0]!.season : null;
    summaries[key] = {
      pairKey: key,
      franchiseA: bucket.franchiseA,
      franchiseB: bucket.franchiseB,
      scope: "Since 1996-97",
      games: bucket.games.length,
      winsA,
      winsB,
      playoffGames,
      otGames,
      seasonFrom,
      seasonTo,
    };
    writeFileSync(
      path.join(MATCHUPS_DIR, `${key}.json`),
      JSON.stringify(
        {
          ...summaries[key],
          games: bucket.games,
        },
        null,
        0
      )
    );
  }

  writeFileSync(
    path.join(INDEX_DIR, "matchup-pair-summaries.json"),
    JSON.stringify(
      {
        scope: "Since 1996-97",
        pairCount: pairs.size,
        gamesIndexed,
        doubleCountAttempts,
        pairs: summaries,
      },
      null,
      2
    )
  );

  console.log(
    JSON.stringify(
      {
        pairs: pairs.size,
        gamesIndexed,
        doubleCountAttempts,
        out: INDEX_DIR,
      },
      null,
      2
    )
  );
}

main();
