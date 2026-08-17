/**
 * Re-attribute DRBL-P from normalized games using sequential attribution,
 * then compare to the previous precomputed leaderboard.
 *
 * Usage: npx tsx scripts/drbl-sequential-reattribute.ts [season] [limit]
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { DrblBoxScore, DrblEvent, DrblPossession } from "../drbl/types";
import {
  accumulateReplacementSignals,
  buildReplacementPool,
  finalizeRoleAccum,
  type RoleVector,
} from "../drbl/models/replacement";
import {
  attributeGamePlayerValue,
  finalizePlayerSeasonRows,
  type DrblPlayerSeasonRow,
} from "../drbl/models/player-value";
import { loadEpvCoefficients } from "../drbl/models/expected-points";
import { SEQUENTIAL_ATTRIBUTION_VERSION } from "../drbl/models/sequential-attribution";
import {
  ABILITY_LINEAGE_VERSION,
  mergeSequentialIntoPublishedPlayer,
  type PlayerRecord,
} from "../drbl/models/ability-lineage";

async function loadNormalizedGames(
  season: string,
  limit: number
): Promise<
  Array<{
    box: DrblBoxScore;
    events: DrblEvent[];
    possessions: DrblPossession[];
  }>
> {
  const root = path.join(process.cwd(), "data", "drbl", "normalized", season);
  const entries = await readdir(root, { withFileTypes: true });
  const dirs = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
    .map((e) => e.name)
    .sort();
  const out: Array<{
    box: DrblBoxScore;
    events: DrblEvent[];
    possessions: DrblPossession[];
  }> = [];
  for (const name of dirs) {
    if (out.length >= limit) break;
    const gameDir = path.join(root, name);
    try {
      const [boxRaw, eventsRaw, possRaw, recRaw] = await Promise.all([
        readFile(path.join(gameDir, "box.json"), "utf8"),
        readFile(path.join(gameDir, "events.json"), "utf8"),
        readFile(path.join(gameDir, "possessions.json"), "utf8"),
        readFile(path.join(gameDir, "reconcile.json"), "utf8").catch(() => null),
      ]);
      if (recRaw) {
        const rec = JSON.parse(recRaw) as { quarantined?: boolean };
        if (rec.quarantined) continue;
      }
      out.push({
        box: JSON.parse(boxRaw) as DrblBoxScore,
        events: JSON.parse(eventsRaw) as DrblEvent[],
        possessions: JSON.parse(possRaw) as DrblPossession[],
      });
    } catch {
      // skip
    }
  }
  return out;
}

function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

async function main() {
  const season = process.argv[2] ?? "2024-25";
  const limit = Number(process.argv[3] ?? 400);
  await loadEpvCoefficients();

  const games = await loadNormalizedGames(season, limit);
  console.log(`Loaded ${games.length} games for ${season}`);

  const roleAccum = new Map();
  for (const g of games) {
    accumulateReplacementSignals(g.box, g.events, g.possessions, roleAccum);
  }
  const candidates = finalizeRoleAccum(roleAccum);
  const rolesByPlayer = new Map<string, RoleVector>(
    candidates.map((c) => [c.playerId, c.role])
  );
  let cutoffDate = "";
  for (const g of games) {
    if (g.box.gameDate && g.box.gameDate > cutoffDate) cutoffDate = g.box.gameDate;
  }
  const replacementPool = buildReplacementPool(candidates, {
    cutoffDate: cutoffDate || "9999-12-31",
    level: "R1",
  });

  const accumulators = new Map();
  for (const g of games) {
    attributeGamePlayerValue(g.box, g.events, g.possessions, accumulators, {
      replacementPool,
      rolesByPlayer,
    });
  }

  const players = finalizePlayerSeasonRows(accumulators, {
    minPossessions: 50,
    ranking: { rankingMode: "season_value" },
  });

  const outDir = path.join(process.cwd(), "reports", "sequential-attribution");
  await mkdir(outDir, { recursive: true });

  const seasonKey = season.replace("-", "_");
  const top = players.slice(0, 100);
  const cols = [
    "rank",
    "playerId",
    "playerName",
    "actualPossessions",
    "drblWar",
    "seasonalImpact",
    "drbl100",
    "drblP",
    "creationValuePer100",
    "connectionValuePer100",
    "conversionOpportunityPer100",
    "executionValuePer100",
    "turnoverValuePer100",
    "defensiveValuePer100",
    "finalRankingScore",
    "rankingMode",
    "sequentialAttributionVersion",
  ];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(",")];
  for (const p of top) {
    lines.push(cols.map((c) => esc((p as Record<string, unknown>)[c])).join(","));
  }
  await writeFile(
    path.join(outDir, `top100_${seasonKey}_sequential.csv`),
    lines.join("\n") + "\n",
    "utf8"
  );

  // Before/after vs current precomputed
  const prePath = path.join(
    process.cwd(),
    "src/data/drbl/precomputed",
    `${season}.json`
  );
  let beforeAfter: unknown = null;
  try {
    const oldArtifact = JSON.parse(await readFile(prePath, "utf8")) as {
      players: Array<{
        playerId: string;
        playerName: string;
        possessions: number;
        drblWar: number;
        drbl100: number;
        rank?: number;
      }>;
      season?: string;
      rankingFormulaVersion?: string;
      gamesProcessed?: number;
      gameCount?: number;
      artifactGenerationId?: string;
      abilityLineageVersion?: string;
      [key: string]: unknown;
    };
    const old = oldArtifact;
    const oldByWar = old.players
      .slice()
      .sort((a, b) => b.drblWar - a.drblWar)
      .map((p, i) => ({ ...p, oldRank: i + 1 }));
    const oldMap = new Map(oldByWar.map((p) => [p.playerId, p]));
    const cmp = top.map((p) => {
      const o = oldMap.get(p.playerId);
      return {
        player: p.playerName,
        playerId: p.playerId,
        oldRank: o?.oldRank ?? null,
        newRank: p.rank,
        oldWar: o?.drblWar ?? null,
        newWar: p.drblWar,
        possessions: p.actualPossessions,
        creationPer100: p.creationValuePer100,
        connectionPer100: p.connectionValuePer100,
        executionPer100: p.executionValuePer100,
      };
    });
    await writeFile(
      path.join(outDir, `before_after_${seasonKey}.csv`),
      [
        "player,playerId,oldRank,newRank,oldWar,newWar,possessions,creationPer100,connectionPer100,executionPer100",
        ...cmp.map((r) =>
          [
            r.player,
            r.playerId,
            r.oldRank,
            r.newRank,
            r.oldWar,
            r.newWar,
            r.possessions,
            r.creationPer100,
            r.connectionPer100,
            r.executionPer100,
          ]
            .map(esc)
            .join(",")
        ),
      ].join("\n") + "\n",
      "utf8"
    );

    // A1/A2: overlay sequential P diagnostics; preserve LN/B/SDV + fused ability lineage.
    const byId = new Map(players.map((p) => [p.playerId, p]));
    const artifactMeta = {
      season: oldArtifact.season ?? season,
      gameCount: oldArtifact.gamesProcessed ?? oldArtifact.gameCount,
      gamesProcessed: oldArtifact.gamesProcessed ?? oldArtifact.gameCount,
      artifactGenerationId: oldArtifact.artifactGenerationId,
      abilityLineageVersion:
        oldArtifact.abilityLineageVersion ?? ABILITY_LINEAGE_VERSION,
      sequentialGameCount: games.length,
    };
    if (
      artifactMeta.gameCount != null &&
      Number(artifactMeta.gameCount) !== games.length
    ) {
      throw new Error(
        `GenerationMismatchError: refusing sequential merge — published gameCount=${artifactMeta.gameCount} but sequential loaded ${games.length} games`
      );
    }
    const merged = old.players.map((op) => {
      const n = byId.get(op.playerId);
      if (!n) return op;
      const seqRow = {
        ...(n as unknown as PlayerRecord),
        season: season,
        gameCount: games.length,
        gamesProcessed: games.length,
        artifactGenerationId: oldArtifact.artifactGenerationId,
        abilityLineageVersion: ABILITY_LINEAGE_VERSION,
        parentArtifactGenerationId: oldArtifact.artifactGenerationId,
      };
      const pubRow = {
        ...(op as PlayerRecord),
        season: (op as PlayerRecord).season ?? season,
        gameCount:
          (op as PlayerRecord).gameCount ??
          oldArtifact.gamesProcessed ??
          games.length,
        artifactGenerationId:
          (op as PlayerRecord).artifactGenerationId ??
          oldArtifact.artifactGenerationId,
        abilityLineageVersion:
          (op as PlayerRecord).abilityLineageVersion ?? ABILITY_LINEAGE_VERSION,
      };
      return mergeSequentialIntoPublishedPlayer(pubRow, seqRow, artifactMeta);
    });
    // Players only in new set (no published LN/B/fusion to preserve)
    for (const n of players) {
      if (!old.players.some((o) => o.playerId === n.playerId)) {
        merged.push({
          ...(n as unknown as (typeof merged)[number]),
          publishedAbilityInput: "fused_rate",
          abilityLineageVersion: ABILITY_LINEAGE_VERSION,
          sequentialAttributionVersion: SEQUENTIAL_ATTRIBUTION_VERSION,
        });
      }
    }
    merged.sort(
      (a, b) =>
        Number((b as { finalRankingScore?: number }).finalRankingScore ?? b.drblWar) -
        Number((a as { finalRankingScore?: number }).finalRankingScore ?? a.drblWar)
    );
    const ranked = merged.map((p, i) => ({ ...p, rank: i + 1 }));

    const next = {
      ...oldArtifact,
      version: "drbl-ranking-v2-seq",
      sequentialAttributionVersion: SEQUENTIAL_ATTRIBUTION_VERSION,
      abilityLineageVersion: ABILITY_LINEAGE_VERSION,
      publishedAbilityInput: "fused_rate",
      rankingMode: "season_value",
      rankingFormulaVersion: oldArtifact.rankingFormulaVersion ?? "2.1.0",
      gamesProcessed: games.length,
      generatedAt: new Date().toISOString(),
      players: ranked,
    };
    await writeFile(prePath, JSON.stringify(next, null, 2) + "\n", "utf8");

    beforeAfter = {
      oldTop10: oldByWar.slice(0, 10).map((p) => p.playerName),
      newTop10: top.slice(0, 10).map((p: DrblPlayerSeasonRow) => p.playerName),
      medianPossOldTop10: median(oldByWar.slice(0, 10).map((p) => p.possessions)),
      medianPossNewTop10: median(top.slice(0, 10).map((p) => p.actualPossessions)),
      meanConnectionTop25: median(
        top.slice(0, 25).map((p) => p.connectionValuePer100)
      ),
      meanCreationTop25: median(
        top.slice(0, 25).map((p) => p.creationValuePer100)
      ),
    };
  } catch (e) {
    console.warn("Could not merge precomputed:", e);
  }

  const summary = {
    season,
    games: games.length,
    players: players.length,
    sequentialAttributionVersion: SEQUENTIAL_ATTRIBUTION_VERSION,
    top10: top.slice(0, 10).map((p) => ({
      player: p.playerName,
      war: p.drblWar,
      poss: p.actualPossessions,
      creation: p.creationValuePer100,
      connection: p.connectionValuePer100,
      execution: p.executionValuePer100,
    })),
    beforeAfter,
  };
  await writeFile(
    path.join(outDir, `summary_${seasonKey}.json`),
    JSON.stringify(summary, null, 2),
    "utf8"
  );
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
