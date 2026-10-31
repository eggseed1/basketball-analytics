import { hashString } from "./rng";
import type { ChallengeId, LifeState, NewLifeOptions } from "./types";

/** Same rule as engine.isUnicornSeed; kept here to avoid an import cycle. */
const UNICORN_ODDS = 1 / 200;
const isUnicornSeed = (seed: number) => hashString(`unicorn:${seed >>> 0}`) / 4294967296 < UNICORN_ODDS;

export const CHALLENGES: {
  id: ChallengeId;
  label: string;
  hint: string;
  /** Daily mode stays free of challenges. */
  randomOnly: true;
}[] = [
  { id: "equal-odds", label: "Equal odds", hint: "Every country has the same birth chance.", randomOnly: true },
  { id: "no-us-hs", label: "No US high school", hint: "US prep and HS scholarship offers never appear.", randomOnly: true },
  { id: "undrafted-nba", label: "Undrafted NBA", hint: "Debut in an NBA game without ever being drafted.", randomOnly: true },
  { id: "coach-by-40", label: "Coach by 40", hint: "Leave the floor for a coaching job before age 40.", randomOnly: true },
  { id: "unicorn-only", label: "Unicorn only", hint: "Start on a unicorn seed (about 1 in 200).", randomOnly: true },
];

export const CHALLENGE_LABEL: Record<ChallengeId, string> = Object.fromEntries(CHALLENGES.map((c) => [c.id, c.label])) as Record<ChallengeId, string>;

export function challengeHint(id: ChallengeId | null | undefined): string | null {
  if (!id) return null;
  return CHALLENGES.find((c) => c.id === id)?.hint ?? null;
}

/** Adjust birth options for a challenge. May rewrite seed / draw. */
export function applyChallengeOptions(opts: NewLifeOptions): NewLifeOptions {
  const challenge = opts.challenge ?? null;
  if (!challenge || opts.mode === "daily") return { ...opts, challenge: null };
  if (challenge === "equal-odds") return { ...opts, draw: "equal", challenge };
  if (challenge === "unicorn-only") {
    let seed = opts.seed;
    if (!isUnicornSeed(seed)) {
      for (let i = 0; i < 400_000; i++) {
        const trySeed = (opts.seed + i) >>> 0;
        if (isUnicornSeed(trySeed)) {
          seed = trySeed;
          break;
        }
      }
    }
    return { ...opts, seed, challenge };
  }
  return { ...opts, challenge };
}

export type ChallengeResult = "cleared" | "failed" | "open";

/** How the challenge stands at the end of a life (or mid-run for UI). */
export function challengeResult(s: LifeState): ChallengeResult | null {
  const id = s.challenge;
  if (!id) return null;
  const age = s.ageMonths / 12;
  const ended = Boolean(s.ended);
  switch (id) {
    case "equal-odds":
      return ended ? "cleared" : "open";
    case "no-us-hs": {
      const usedHs = s.seasons.some((x) => x.node === "us-high-school") || s.placement.node === "us-high-school";
      if (usedHs) return "failed";
      return ended ? "cleared" : "open";
    }
    case "undrafted-nba": {
      if (s.achievements.drafted) return "failed";
      if (s.achievements.nbaDebut !== null) return "cleared";
      return ended ? "failed" : "open";
    }
    case "coach-by-40": {
      if (s.after?.track === "coach" && age < 40) return "cleared";
      if (ended || age >= 40) return s.after?.track === "coach" && Math.floor((s.after.since ?? s.ageMonths) / 12) < 40 ? "cleared" : "failed";
      return "open";
    }
    case "unicorn-only":
      return s.unicorn ? (ended ? "cleared" : "open") : "failed";
    default:
      return null;
  }
}

export function challengeStatusLine(s: LifeState): string | null {
  const id = s.challenge;
  if (!id) return null;
  const result = challengeResult(s);
  const label = CHALLENGE_LABEL[id];
  if (result === "cleared") return `${label}: cleared`;
  if (result === "failed") return `${label}: missed`;
  return `${label}: still open`;
}
