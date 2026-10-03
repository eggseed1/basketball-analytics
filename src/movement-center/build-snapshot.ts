import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { fetchLiveEspnTransactionRows } from "@/data/providers/transactions/transaction-live-enrich";
import { MOVEMENT_RULES_VERSION } from "@/movement-center/classify-headline";
import { buildNewsClusters } from "@/movement-center/news-claims";
import { EVIDENCE_SCORE_METHODOLOGY } from "@/movement-center/scoring";
import { linkLedger, type LedgerRow } from "@/movement-center/transaction-clusters";
import type { MovementCuratedSnapshot } from "@/movement-center/types";
import { readJsonFile, SEEDS_DIR, SNAPSHOT_PATH } from "@/movement-center/seed-paths";
import {
  createHeadlineEntityResolver,
  ESPN_TEAM_NICKNAMES,
} from "@/sentiment/headline-entities";
import { loadIngestRoster } from "@/sentiment/ingest-roster";
import { readIngestItems, type NewsIngestItem } from "@/sentiment/ingest-store";

export type MovementSeedManifest = {
  status: string;
  disclaimer: string;
};

/** Headlines older than this are not re-clustered on each build. */
const NEWS_LOOKBACK_DAYS = 180;

const LEDGER_FILES = [
  ["data", "transactions", "espn-site-v2", "v1", "transactions.jsonl"],
  ["data", "transactions", "curated", "v1", "transactions.jsonl"],
];

function readLedgerArchive(): LedgerRow[] {
  const rows: LedgerRow[] = [];
  for (const parts of LEDGER_FILES) {
    const file = path.join(process.cwd(), ...parts);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const row = JSON.parse(line) as LedgerRow & { status?: string };
      if (row.status && row.status !== "real") continue;
      rows.push({ id: row.id, date: row.date, description: row.description, teamIds: row.teamIds ?? [] });
    }
  }
  return rows;
}

export type BuildMovementSnapshotOptions = {
  now?: Date;
  dryRun?: boolean;
  verbose?: boolean;
  /** Skip the live ESPN overlay (offline builds and tests). */
  offline?: boolean;
};

export type BuildMovementSnapshotResult = {
  snapshot: MovementCuratedSnapshot;
  clusterCount: number;
  claimCount: number;
  resolutionCount: number;
  storyCount: number;
  materialized: number;
  expired: number;
  outputPath: string;
};

export async function buildMovementSnapshot(
  options: BuildMovementSnapshotOptions = {}
): Promise<BuildMovementSnapshotResult> {
  const now = options.now ?? new Date();
  const manifest = readJsonFile<MovementSeedManifest>(path.join(SEEDS_DIR, "manifest.json"));
  const startYear = currentNbaStartYear(now);
  const season = canonicalSeasonFromStartYear(startYear);
  const tradeWindowStart = `${startYear}-06-01`;

  const roster = loadIngestRoster();
  const resolve = createHeadlineEntityResolver(roster);
  const resolveLedger = createHeadlineEntityResolver(roster, { fullNamesOnly: true });
  const rosterById = new Map(roster.map((p) => [p.playerId, p]));
  const playerName = (id: string) => rosterById.get(id)?.name;
  const teamName = (id: string) => ESPN_TEAM_NICKNAMES[id]?.[0];

  const cutoff = new Date(now.getTime() - NEWS_LOOKBACK_DAYS * 86_400_000).toISOString();
  const newsRows = readIngestItems<NewsIngestItem>("news").filter(
    (row) => row.nba && row.publishedAt >= cutoff && row.publishedAt <= now.toISOString()
  );

  const news = buildNewsClusters(newsRows, { resolveTitle: resolve, playerName, teamName });
  for (const cluster of news.clusters) {
    const teams = new Set(cluster.linkedTeamIds);
    for (const id of cluster.linkedPlayerIds) {
      const teamId = rosterById.get(id)?.teamId;
      if (teamId) teams.add(teamId);
    }
    cluster.linkedTeamIds = [...teams];
  }

  let ledger = readLedgerArchive();
  if (!options.offline) {
    const live = await fetchLiveEspnTransactionRows(now).catch(() => []);
    const byId = new Map(ledger.map((row) => [row.id, row]));
    for (const tx of live) {
      byId.set(tx.id, { id: tx.id, date: tx.date, description: tx.description, teamIds: tx.teamIds });
    }
    ledger = [...byId.values()];
  }

  const linked = linkLedger(
    {
      newsClusters: news.clusters,
      newsClaims: news.claims,
      families: news.families,
      ledger,
      tradeWindowStart,
      now,
    },
    { resolveText: resolveLedger, playerName, teamName }
  );

  const latestLedgerDate = ledger.map((row) => row.date).sort().at(-1) ?? null;
  const latestHeadline = newsRows.map((row) => row.publishedAt).sort().at(-1) ?? null;

  const snapshot: MovementCuratedSnapshot = {
    meta: {
      methodologyVersion: `${EVIDENCE_SCORE_METHODOLOGY}+${MOVEMENT_RULES_VERSION}`,
      status: manifest.status,
      season,
      snapshotDate: now.toISOString().slice(0, 10),
      disclaimer: manifest.disclaimer,
      builtAt: now.toISOString(),
      rosterPlayerCount: roster.length,
      headlinesScanned: newsRows.length,
      latestHeadlineAt: latestHeadline,
      latestTransactionDate: latestLedgerDate,
      tradeWindowStart,
      feeds: [...new Set(newsRows.map((row) => row.outlet))].sort(),
    },
    sources: { ...news.sources, ...linked.sources },
    clusters: linked.clusters,
    claims: linked.claims,
    resolutions: linked.resolutions,
  };

  if (!options.dryRun) {
    writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
  }

  if (options.verbose) {
    console.log(
      `movement:build season=${season} headlines=${newsRows.length} stories=${news.clusters.length} claims=${linked.claims.length} clusters=${linked.clusters.length} materialized=${linked.materialized} expired=${linked.expired} ledgerThrough=${latestLedgerDate}`
    );
  }

  return {
    snapshot,
    clusterCount: linked.clusters.length,
    claimCount: linked.claims.length,
    resolutionCount: linked.resolutions.length,
    storyCount: news.clusters.length,
    materialized: linked.materialized,
    expired: linked.expired,
    outputPath: SNAPSHOT_PATH,
  };
}
