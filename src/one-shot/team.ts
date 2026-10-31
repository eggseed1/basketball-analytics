import { hashString } from "./rng";
import type { LifeState } from "./types";

/** How the current staff runs the room. Set when you join; reshuffled on a trade. */
export type CoachTone = "patient" | "demanding" | "chaos";

export const TONE_LABEL: Record<CoachTone, string> = {
  patient: "Patient coach",
  demanding: "Demanding coach",
  chaos: "Chaotic staff",
};

export function coachToneOf(s: LifeState): CoachTone | null {
  const t = s.flags.coachTone;
  return t === "patient" || t === "demanding" || t === "chaos" ? t : null;
}

/** Coaching quality biases the draw, but every staff still rolls patient / demanding / chaos. */
export function pickCoachTone(coaching: number, seed: number, key: string): CoachTone {
  const h = hashString(`${seed}:tone:${key}`) % 100;
  if (coaching >= 88) return h < 55 ? "patient" : h < 88 ? "demanding" : "chaos";
  if (coaching <= 62) return h < 55 ? "chaos" : h < 82 ? "demanding" : "patient";
  return h < 34 ? "patient" : h < 67 ? "demanding" : "chaos";
}

/** Role-ladder nudges while you are with this staff. */
export function toneRoleBias(tone: CoachTone | null): { up: number; down: number; settleMonths: number; fillChance: number } {
  if (tone === "patient") return { up: -0.6, down: -0.8, settleMonths: 4, fillChance: 0.04 };
  if (tone === "demanding") return { up: 0.5, down: 0.4, settleMonths: 2, fillChance: 0.07 };
  if (tone === "chaos") return { up: 0.15, down: 0.9, settleMonths: 2, fillChance: 0.11 };
  return { up: 0, down: 0, settleMonths: 3, fillChance: 0.06 };
}

/** Deadline trade probability delta. Chaos shops more; patient holds. */
export function toneTradeBias(tone: CoachTone | null): number {
  if (tone === "chaos") return 0.05;
  if (tone === "patient") return -0.03;
  if (tone === "demanding") return 0.015;
  return 0;
}
