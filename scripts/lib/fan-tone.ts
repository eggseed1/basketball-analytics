/**
 * Rates new fan posts toward each player they name with the Workers AI model
 * (FAN_MODEL_SYSTEM in src/sentiment/headline-model.ts) while the text is
 * still in memory. Post text is never stored, so rows that miss tonight's cap
 * or arrive while the model is unavailable keep their word-list score for good.
 */
import { FAN_MODEL_VERSION, HeadlineModelError, rateFanTone } from "@/sentiment/headline-model";
import { readIngestItems, type FanPostIngestItem } from "@/sentiment/ingest-store";

type Pair = { row: FanPostIngestItem; playerId: string; playerName: string; text: string };

/** Llama 3.3 70B fp8-fast list price in neurons per token (input, output). */
const NEURONS_PER_INPUT_TOKEN = 26_668 / 1e6;
const NEURONS_PER_OUTPUT_TOKEN = 204_805 / 1e6;

export async function rateNewFanPosts(options: {
  source: "bluesky" | "youtube";
  rows: FanPostIngestItem[];
  textById: Map<string, string>;
  nameById: Map<string, string>;
  maxPairs: number;
  concurrency?: number;
}): Promise<void> {
  const token = process.env.CLOUDFLARE_AI_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !accountId) {
    console.log("  model: skipped (CLOUDFLARE_AI_TOKEN or CLOUDFLARE_ACCOUNT_ID is not set)");
    return;
  }
  const stored = new Set(readIngestItems<FanPostIngestItem>(options.source).map((row) => row.id));
  const pending: Pair[] = [];
  for (const row of options.rows) {
    const text = options.textById.get(row.id);
    if (stored.has(row.id) || !text) continue;
    for (const playerId of row.playerIds) {
      const playerName = options.nameById.get(playerId);
      if (playerName) pending.push({ row, playerId, playerName, text });
    }
  }
  // Ids are hashes, so this order spreads the cap across channels and queries.
  pending.sort((a, b) => `${a.row.id}:${a.playerId}`.localeCompare(`${b.row.id}:${b.playerId}`));
  const batch = pending.slice(0, options.maxPairs);

  let next = 0;
  let ok = 0;
  let unparsed = 0;
  let failed = 0;
  let authFailures = 0;
  let inputChars = 0;
  const worker = async () => {
    while (authFailures < 3 && next < batch.length) {
      const pair = batch[next++]!;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const tone = await rateFanTone({ accountId, token, playerName: pair.playerName, text: pair.text });
          inputChars += pair.text.length + pair.playerName.length;
          if (tone == null) {
            unparsed += 1;
          } else {
            ok += 1;
            pair.row.playerTones = { ...pair.row.playerTones, [pair.playerId]: tone };
            pair.row.toneModelVersion = FAN_MODEL_VERSION;
          }
          break;
        } catch (error) {
          const status = error instanceof HeadlineModelError ? error.status : 0;
          if (status === 401 || status === 403) {
            authFailures += 1;
            failed += 1;
            break;
          }
          if (attempt === 2 || (status && status < 429)) {
            failed += 1;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 2_000 * (attempt + 1)));
        }
      }
    }
  };
  await Promise.all(Array.from({ length: options.concurrency ?? 8 }, worker));

  const calls = ok + unparsed;
  // ~4 characters per token, plus the system prompt and chat template on every call.
  const neurons = (inputChars / 4 + calls * 150) * NEURONS_PER_INPUT_TOKEN + calls * 2 * NEURONS_PER_OUTPUT_TOKEN;
  console.log(
    `  model: newPairs=${pending.length} thisRun=${batch.length} rated=${ok} unparsed=${unparsed} failed=${failed} ~neurons=${Math.round(neurons)}`
  );
  if (authFailures >= 3) {
    console.warn("  model: stopped, token rejected. CLOUDFLARE_AI_TOKEN needs the Workers AI permission.");
  }
}
