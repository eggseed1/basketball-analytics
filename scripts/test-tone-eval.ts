/**
 * Recounts TONE_EVAL_SETS from the labeled eval files with the current word
 * lists, so the agreement chart on the sentiment board can't drift from them.
 * Run: npx tsx scripts/test-tone-eval.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { FAN_LEXICON_VERSION, scoreHeadline } from "../src/sentiment/headline-lexicon";
import { TONE_EVAL_SETS, type ToneEvalCounts, type ToneEvalSet } from "../src/sentiment/tone-eval";

type Tone = -1 | 0 | 1;
const toTone = (score: number): Tone => (score > 0.15 ? 1 : score < -0.15 ? -1 : 0);

function count(pairs: [Tone, Tone][]): ToneEvalCounts {
  const match = pairs.filter(([label, rating]) => label === rating).length;
  const opposite = pairs.filter(([label, rating]) => label * rating === -1).length;
  return { match, offByOne: pairs.length - match - opposite, opposite };
}

function load(file: string) {
  const json = JSON.parse(readFileSync(`data/sentiment/eval/v1/${file}`, "utf8"));
  return json as { lexicon: string; items: Record<string, unknown>[] };
}

const expected = new Map<ToneEvalSet["id"], ToneEvalSet>(TONE_EVAL_SETS.map((s) => [s.id, s]));

const media = load("media-headline-vs-article-2026-10.json");
const holdout = media.items
  .map((item, i) => ({ ...item, i }) as Record<string, unknown> & { i: number })
  .filter((item) => item.i % 2 === 1 && typeof item.label === "number");
assert.deepEqual(expected.get("headlines")!.raters, {
  model: count(holdout.map((x) => [x.label as Tone, x.llama33_70b as Tone])),
  wordList: count(
    holdout.map((x) => [
      x.label as Tone,
      toTone(scoreHeadline(x.title as string, "", [x.playerName as string]).score),
    ])
  ),
});

const fan = load("fan-posts-2026-10.json");
assert.equal(fan.lexicon, FAN_LEXICON_VERSION, "fan eval scores are from an older word list; rescore them");
for (const [id, platform] of [
  ["fan-bluesky", "bluesky"],
  ["fan-youtube", "youtube"],
] as const) {
  const items = fan.items.filter((x) => x.platform === platform && typeof x.label === "number");
  assert.deepEqual(
    expected.get(id)!.raters,
    {
      model: count(items.map((x) => [x.label as Tone, x.llama33_70b as Tone])),
      wordList: count(items.map((x) => [x.label as Tone, toTone(x.score as number)])),
    },
    id
  );
}

console.log("tone eval: ok");
