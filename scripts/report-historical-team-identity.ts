/**
 * Diagnostic: historical team-era correctness over cached game seasons.
 * Run: npm run report:historical-team-identity
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import type { Game } from "../src/data/types";
import {
  listMappedCanonicalTeamIds,
  resolveTeamEra,
  TEAM_ERAS_BY_CANONICAL_ID,
} from "../src/data/identity/team-era";
import { ensureGameTeamIdentity } from "../src/lib/game-team-identity";

const CACHE_DIR = path.join(process.cwd(), "data", "cache", "games");

type Issue = {
  season: string;
  gameId: string;
  gameDate: string;
  side: "home" | "away";
  canonicalTeamId: string;
  storedAbbr?: string;
  storedName?: string;
  expectedAbbr: string;
  expectedName: string;
};

async function main() {
  const files = (await readdir(CACHE_DIR).catch(() => [])).filter((f) =>
    f.endsWith(".json")
  );

  let gamesScanned = 0;
  let eraEligible = 0;
  let eraCorrect = 0;
  const issues: Issue[] = [];
  const byFranchise = new Map<string, { ok: number; bad: number }>();

  for (const file of files) {
    const season = file.replace(/\.json$/, "");
    const raw = JSON.parse(
      await readFile(path.join(CACHE_DIR, file), "utf8")
    ) as { games?: Game[] };
    const games = raw.games ?? [];
    for (const g0 of games) {
      gamesScanned += 1;
      const g = ensureGameTeamIdentity(g0, g0.teamIdProvider ?? "bdl");
      for (const side of ["home", "away"] as const) {
        const id = side === "home" ? g.homeTeamId : g.awayTeamId;
        const era = resolveTeamEra(id, g.season || season);
        if (!era) continue;
        eraEligible += 1;
        const key = id;
        const bucket = byFranchise.get(key) ?? { ok: 0, bad: 0 };
        const abbr = side === "home" ? g.homeTeamAbbr : g.awayTeamAbbr;
        const name = side === "home" ? g.homeTeamName : g.awayTeamName;
        const ok =
          abbr?.toUpperCase() === era.abbr.toUpperCase() &&
          name === era.displayName;
        if (ok) {
          eraCorrect += 1;
          bucket.ok += 1;
        } else {
          bucket.bad += 1;
          if (issues.length < 40) {
            issues.push({
              season: g.season || season,
              gameId: g.id,
              gameDate: g.gameDate,
              side,
              canonicalTeamId: id,
              storedAbbr: abbr,
              storedName: name,
              expectedAbbr: era.abbr,
              expectedName: era.displayName,
            });
          }
        }
        byFranchise.set(key, bucket);
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        cacheSeasons: files.length,
        gamesScanned,
        mappedFranchises: listMappedCanonicalTeamIds().length,
        eraSideChecks: eraEligible,
        eraCorrect,
        eraMismatch: eraEligible - eraCorrect,
        mismatchRate:
          eraEligible === 0
            ? 0
            : Number(((eraEligible - eraCorrect) / eraEligible).toFixed(4)),
        byFranchise: Object.fromEntries(
          [...byFranchise.entries()].map(([id, v]) => [
            id,
            {
              ...v,
              eras: TEAM_ERAS_BY_CANONICAL_ID[id]?.map((e) => e.displayName),
            },
          ])
        ),
        sampleIssues: issues,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
