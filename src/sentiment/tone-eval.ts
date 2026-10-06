/**
 * How often each tone rater agrees with a hand label, from the labeled sets in
 * data/sentiment/eval/v1. scripts/test-tone-eval.ts recounts these from the
 * eval files, so a lexicon or prompt change that moves them fails the tests.
 *
 * Headlines use the odd rows only: the even rows were used to tune the
 * headline word list. Labels came from the coding agent, not a human panel.
 */

export type ToneEvalRater = "model" | "wordList";

export type ToneEvalCounts = {
  /** Same rating as the label. */
  match: number;
  /** Neutral where the label had a side, or a side where the label was neutral. */
  offByOne: number;
  /** Positive where the label was negative, or the reverse. */
  opposite: number;
};

export type ToneEvalSet = {
  id: "headlines" | "fan-bluesky" | "fan-youtube";
  label: string;
  unit: string;
  raters: Record<ToneEvalRater, ToneEvalCounts>;
};

export const TONE_EVAL_SETS: readonly ToneEvalSet[] = [
  {
    id: "headlines",
    label: "News headlines",
    unit: "headlines",
    raters: {
      model: { match: 45, offByOne: 18, opposite: 0 },
      wordList: { match: 33, offByOne: 28, opposite: 2 },
    },
  },
  {
    id: "fan-bluesky",
    label: "Social posts",
    unit: "posts",
    raters: {
      model: { match: 55, offByOne: 17, opposite: 0 },
      wordList: { match: 32, offByOne: 34, opposite: 6 },
    },
  },
  {
    id: "fan-youtube",
    label: "Video comments",
    unit: "comments",
    raters: {
      model: { match: 51, offByOne: 18, opposite: 2 },
      wordList: { match: 38, offByOne: 21, opposite: 12 },
    },
  },
];

export function toneEvalTotal(c: ToneEvalCounts): number {
  return c.match + c.offByOne + c.opposite;
}
