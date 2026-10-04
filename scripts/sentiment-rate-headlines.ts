/**
 * Rate the tone of stored headlines toward each player they name with the
 * Workers AI model in src/sentiment/headline-model.ts, and append the ratings
 * to data/sentiment/ingest/v1/headline-tones.
 *
 *   npm run sentiment:rate:headlines [-- --days 30 --max 2500 --dry-run]
 *
 * Covers news and fan-blog rows from the last --days (30, the length of the
 * daily series), newest first, skipping pairs already rated and players named
 * only in the summary. Exits 0 without
 * CLOUDFLARE_AI_TOKEN / CLOUDFLARE_ACCOUNT_ID, and the snapshot keeps word-list
 * scores for anything unrated. About 3.3 neurons per rating, so --max 2500
 * stays inside the 10,000 free neurons a day.
 */

import { createHeadlineEntityResolver } from "@/sentiment/headline-entities";
import {
  HEADLINE_MODEL_VERSION,
  HeadlineModelError,
  rateHeadlineTone,
} from "@/sentiment/headline-model";
import { loadIngestRoster } from "@/sentiment/ingest-roster";
import {
  appendIngestItems,
  readIngestItems,
  type HeadlineToneItem,
  type NewsIngestItem,
} from "@/sentiment/ingest-store";

function argNumber(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? Number(process.argv[index + 1]) : NaN;
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

type Pair = { store: "news" | "fanblogs"; row: NewsIngestItem; playerId: string; playerName: string };

async function main() {
  const days = argNumber("days", 30);
  const max = argNumber("max", 2500);
  const concurrency = argNumber("concurrency", 8);
  const dryRun = process.argv.includes("--dry-run");
  const token = process.env.CLOUDFLARE_AI_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

  const roster = loadIngestRoster();
  const nameById = new Map(roster.map((p) => [p.playerId, p.name]));
  // The model sees only the headline, as in the evaluation. Players named only
  // in the summary (not stored) keep their word-list score.
  const resolve = createHeadlineEntityResolver(roster);
  const rated = new Set(readIngestItems<HeadlineToneItem>("headline-tones").map((row) => row.id));
  const since = Date.now() - days * 86_400_000;

  const pending: Pair[] = [];
  for (const store of ["news", "fanblogs"] as const) {
    for (const row of readIngestItems<NewsIngestItem>(store)) {
      if (!row.nba || !row.playerIds.length || Date.parse(row.publishedAt) <= since) continue;
      const inTitle = new Set(resolve(row.title).playerIds);
      for (const playerId of row.playerIds) {
        if (!inTitle.has(playerId)) continue;
        const playerName = nameById.get(playerId);
        if (!playerName || rated.has(`${store}:${row.id}:${playerId}`)) continue;
        pending.push({ store, row, playerId, playerName });
      }
    }
  }
  pending.sort((a, b) => b.row.publishedAt.localeCompare(a.row.publishedAt));
  const batch = pending.slice(0, max);
  console.log(
    `sentiment:rate:headlines pending=${pending.length} thisRun=${batch.length} (last ${days} days)`
  );

  if (dryRun) {
    for (const pair of batch.slice(0, 20)) {
      console.log(`  ${pair.store} ${pair.playerName} | ${pair.row.title}`);
    }
    return;
  }
  if (!token || !accountId) {
    console.log("  skipped: CLOUDFLARE_AI_TOKEN or CLOUDFLARE_ACCOUNT_ID is not set");
    return;
  }

  let next = 0;
  let ok = 0;
  let unparsed = 0;
  let failed = 0;
  let authFailures = 0;
  let stop = false;
  const buffer: HeadlineToneItem[] = [];
  const flush = () => {
    if (!buffer.length) return;
    appendIngestItems("headline-tones", buffer.splice(0), (row) => row.publishedAt);
  };

  const worker = async () => {
    while (!stop && next < batch.length) {
      const pair = batch[next++]!;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const tone = await rateHeadlineTone({
            accountId,
            token,
            playerName: pair.playerName,
            title: pair.row.title,
          });
          if (tone == null) {
            unparsed += 1;
          } else {
            ok += 1;
            buffer.push({
              id: `${pair.store}:${pair.row.id}:${pair.playerId}`,
              store: pair.store,
              rowId: pair.row.id,
              playerId: pair.playerId,
              publishedAt: pair.row.publishedAt,
              tone,
              modelVersion: HEADLINE_MODEL_VERSION,
              ratedAt: new Date().toISOString(),
            });
            if (buffer.length >= 100) flush();
          }
          break;
        } catch (error) {
          const status = error instanceof HeadlineModelError ? error.status : 0;
          if (status === 401 || status === 403) {
            authFailures += 1;
            if (authFailures >= 3) stop = true;
            failed += 1;
            break;
          }
          if (attempt === 2 || (status && status < 429)) {
            failed += 1;
            break;
          }
          await new Promise((r) => setTimeout(r, 2_000 * (attempt + 1)));
        }
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));
  flush();
  console.log(`  rated=${ok} unparsed=${unparsed} failed=${failed} ~neurons=${Math.round((ok + unparsed) * 3.3)}`);
  if (stop) {
    console.error(
      "  stopped: the token was rejected. CLOUDFLARE_AI_TOKEN needs the Workers AI permission on this account."
    );
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
