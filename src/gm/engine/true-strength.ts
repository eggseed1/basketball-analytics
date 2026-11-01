/**
 * Single latent strength for Franchise Lab.
 *
 * `offense` / `defense` (pts/100) drive the possession sim.
 * Display OVR is a monotone readout of that latent — never an independent input.
 * DRBL / production corrections edit the latent at seed, not the card alone.
 */

import { clamp } from "@/gm/engine/rng";
import type { GmRatings } from "@/gm/types";

/** Public board scale: Jokic ~7.3 → ~97, starter ~1.5 → ~77, fringe −1 → ~69. */
export const OVR_SPINE_BASE = 72;
export const OVR_SPINE_PER_IMPACT = 3.45;

export function impactToOverall(impact: number): number {
  return clamp(OVR_SPINE_BASE + impact * OVR_SPINE_PER_IMPACT, 42, 98);
}

/** Inverse of `impactToOverall` (ignores the clamp shoulders). */
export function overallToImpact(overall: number): number {
  return Math.round(((overall - OVR_SPINE_BASE) / OVR_SPINE_PER_IMPACT) * 100) / 100;
}

/** Net pts/100. Prefer O+D when both exist so OVR tracks the sim drivers. */
export function netStrength(ratings: {
  impact: number;
  offense?: number;
  defense?: number;
}): number {
  if (
    typeof ratings.offense === "number" &&
    Number.isFinite(ratings.offense) &&
    typeof ratings.defense === "number" &&
    Number.isFinite(ratings.defense)
  ) {
    return ratings.offense + ratings.defense;
  }
  return ratings.impact;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Box-score floor for high-minute producers. Used only to correct the latent —
 * not as a display-only OVR bump.
 */
export function productionOverallSpine(extras: {
  mpg?: number | null;
  ppg?: number | null;
  apg?: number | null;
  rpg?: number | null;
}): number | null {
  const mpg = extras.mpg;
  const ppg = extras.ppg;
  if (
    mpg == null ||
    ppg == null ||
    !Number.isFinite(mpg) ||
    !Number.isFinite(ppg) ||
    mpg < 24 ||
    ppg < 12
  ) {
    return null;
  }
  const apg = Number.isFinite(extras.apg) ? (extras.apg as number) : 0;
  const rpg = Number.isFinite(extras.rpg) ? (extras.rpg as number) : 0;
  // ~27/34/6 → ~91; ~21/33/7 → ~86; ~15/28/3 → ~78.
  return clamp(
    55 + ppg * 1.05 + Math.max(0, mpg - 24) * 0.5 + apg * 0.9 + rpg * 0.4,
    68,
    96
  );
}

export type ConsensusCorrectArgs = {
  impact: number;
  offense: number;
  defense: number;
  drbl100?: number | null;
  mpg?: number | null;
  ppg?: number | null;
  apg?: number | null;
  rpg?: number | null;
  gp?: number | null;
  minutes?: number | null;
};

/**
 * Production lift cap. High-minute volume scorers can be miles below their
 * counting spine under cold DARKO (Keyonte 23ppg → 66 OVR). Caps scale with
 * how loud the box is so Maxey/Paolo/KD move, without minting every 15/24 guy.
 */
function productionLiftCap(args: {
  mpg: number;
  ppg: number;
  apg: number;
  impact: number;
}): number {
  const { mpg, ppg, apg, impact } = args;
  let cap = mpg >= 32 ? 2.0 : mpg >= 28 ? 1.6 : mpg >= 25 ? 1.25 : 0.7;
  if (ppg >= 26) cap += 1.5;
  else if (ppg >= 22) cap += 1.15;
  else if (ppg >= 18) cap += 0.75;
  else if (ppg >= 15) cap += 0.35;
  if (apg >= 7) cap += 0.45;
  else if (apg >= 5) cap += 0.25;
  // Cold DARKO on a clear usage star gets more room to climb.
  if (impact < 0 && ppg >= 18 && mpg >= 28) cap += 0.9;
  if (impact < -1.5 && ppg >= 20 && mpg >= 30) cap += 0.75;
  return clamp(cap, 0.5, 4.5);
}

/**
 * When entry DRBL and/or high-minute counting imply more strength than DARKO,
 * blend the latent toward that target with hard caps. Thin samples never lift.
 * Growth/decline split matches `progressSheet` (62/38 up, 45/55 down).
 */
export function consensusCorrectLatent(
  args: ConsensusCorrectArgs
): Pick<GmRatings, "impact" | "offense" | "defense"> {
  const gp = args.gp ?? 0;
  const minutes = args.minutes ?? 0;
  const mpg =
    args.mpg != null && Number.isFinite(args.mpg)
      ? args.mpg
      : gp > 0 && minutes > 0
        ? minutes / gp
        : null;
  const ppg = Number.isFinite(args.ppg) ? (args.ppg as number) : null;
  const apg = Number.isFinite(args.apg) ? (args.apg as number) : 0;
  const thin = gp < 10 || minutes < 200;

  let impact = args.impact;
  const offense = args.offense;
  const defense = args.defense;

  // Keep impact aligned with the sim drivers when they diverge.
  const net = offense + defense;
  if (Math.abs(net - impact) > 0.15) {
    impact = round2(net * 0.65 + impact * 0.35);
  }

  let targetImpact = impact;

  const drbl = args.drbl100;
  if (
    !thin &&
    typeof drbl === "number" &&
    Number.isFinite(drbl) &&
    drbl > 1.0
  ) {
    const drblSpine = clamp(69 + drbl * 6.0, 48, 98);
    const drblImpact = overallToImpact(drblSpine);
    if (impact >= 2.5 || (impact >= 1.2 && drbl >= 2.8) || drbl >= 3.5) {
      const lift = Math.min(1.3, Math.max(0, (drblImpact - impact) * 0.55));
      targetImpact = Math.max(targetImpact, impact + lift);
    } else if (impact < 1.2 && drbl >= 1.4) {
      targetImpact = Math.max(
        targetImpact,
        impact * 0.55 + drblImpact * 0.45
      );
    }
  }

  const production = productionOverallSpine({
    mpg,
    ppg,
    apg: args.apg,
    rpg: args.rpg,
  });
  if (!thin && production != null && mpg != null && ppg != null && mpg >= 24) {
    const prodImpact = overallToImpact(production);
    if (prodImpact > targetImpact) {
      const cap = productionLiftCap({ mpg, ppg, apg, impact });
      // Heavier pull when counting is far above DARKO (volume stars).
      const gap = prodImpact - impact;
      const prodWeight = gap >= 4 ? 0.82 : gap >= 2.5 ? 0.75 : 0.65;
      const pulled =
        impact * (1 - prodWeight) +
        Math.min(prodImpact, impact + cap) * prodWeight;
      targetImpact = Math.max(targetImpact, pulled);
    }
  }

  // Clearly negative DRBL on a real sample trims a DARKO-only rating.
  // Smaller pull and tighter cap than the lift, and never against a production lift.
  // Heavy minutes cap the trim: DRBL undersells defense-first starters coaches trust.
  if (
    !thin &&
    targetImpact === impact &&
    typeof drbl === "number" &&
    Number.isFinite(drbl) &&
    drbl <= -0.3
  ) {
    const drblImpact = overallToImpact(clamp(69 + drbl * 6.0, 48, 98));
    const gap = impact - drblImpact;
    if (gap > 1) {
      const confidence = clamp(minutes / (minutes + 900), 0, 0.6);
      const cap = mpg != null && mpg >= 26 ? 0.6 : mpg != null && mpg >= 22 ? 0.9 : 1.2;
      const trim = Math.min(cap, gap * 0.5 * confidence * 2);
      targetImpact = impact - trim;
    }
  }

  const delta = targetImpact - impact;
  if (Math.abs(delta) < 0.02) {
    return {
      impact: round2(clamp(impact, -8, 12)),
      offense: round2(clamp(offense, -8, 14)),
      defense: round2(clamp(defense, -6, 10)),
    };
  }

  const offenseShare = delta > 0 ? 0.62 : 0.45;
  return {
    impact: round2(clamp(targetImpact, -8, 12)),
    offense: round2(clamp(offense + delta * offenseShare, -8, 14)),
    defense: round2(clamp(defense + delta * (1 - offenseShare), -6, 10)),
  };
}
