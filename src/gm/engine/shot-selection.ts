import type { GmPlayer } from "@/gm/types";
import { clamp } from "@/gm/engine/rng";

/** Realistic half-court coordinates in feet: x across the court, y from the rim. */
export type SimShotZone = "rim" | "paint" | "mid" | "corner3" | "arc3";
export type SimShot = {
  zone: SimShotZone;
  label: string;
  subType: string;
  x: number;
  y: number;
  /** Two-point quality is adjusted around the player's *observed* 2PT baseline. */
  twoDelta: number;
};

function twoZoneWeights(player: GmPlayer) {
  const a = player.sheet?.attributes;
  const big = player.position === "C" || player.position === "PF";
  const rim = clamp(
    (big ? 0.58 : 0.49)
      + ((a?.drivingDunk ?? 65) - 65) * 0.002
      + ((a?.closeShot ?? 65) - 65) * 0.001
      - ((a?.midrange ?? 65) - 65) * 0.0024,
    0.34, 0.78
  );
  const paint = clamp((big ? 0.27 : 0.24)
    + ((a?.postControl ?? 65) - 65) * 0.001, 0.15, 0.34);
  // Never claim every two-pointer is a layup.
  return { rim, paint: Math.min(paint, 0.92 - rim), mid: Math.max(0.08, 1 - rim - paint) };
}

function choose<T>(rng: () => number, weighted: ReadonlyArray<[T, number]>): T {
  const total = weighted.reduce((n, [, w]) => n + Math.max(0, w), 0);
  let roll = rng() * total;
  for (const [item, weight] of weighted) {
    roll -= Math.max(0, weight);
    if (roll <= 0) return item;
  }
  return weighted[weighted.length - 1]![0];
}

/**
 * Samples from actual NBA floor geometry, not a uniform radius around the hoop.
 * Players retain their source 2PT rate; zone offsets are centered so making
 * more dunks does not automatically manufacture extra makes from a fixed prior.
 */
export function chooseSimShot(player: GmPlayer, three: boolean, rng: () => number, secondChance = false): SimShot {
  const a = player.sheet?.attributes;
  const big = player.position === "C" || player.position === "PF";
  const hands = (a?.drivingDunk ?? 60) + (a?.standingDunk ?? 60);
  if (three) {
    const cornerChance = clamp((player.position === "C" ? .13 : big ? .19 : .235)
      + ((a?.threePoint ?? 65) - 65) * .0005, .1, .31);
    const corner = rng() < cornerChance;
    const label = corner ? "corner three-pointer"
      : rng() < clamp(((a?.ballHandle ?? 65) - 60) / 120, .08, .42)
        ? "pull-up three-pointer" : "catch-and-shoot three-pointer";
    if (corner) {
      const x = (rng() < .5 ? -1 : 1) * (22.05 + rng() * 1.2);
      return { zone: "corner3", subType: label, label, x, y: .8 + rng() * 6.2, twoDelta: 0 };
    }
    const angle = .35 + rng() * (Math.PI - .7);
    const radius = 24.0 + Math.pow(rng(), 2) * 3.8;
    return { zone: "arc3", subType: label, label, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, twoDelta: 0 };
  }
  const shares = twoZoneWeights(player);
  const zone = choose(rng, [["rim", shares.rim], ["paint", shares.paint], ["mid", shares.mid]] as const);
  // The weighted offsets sum to zero at this player's own zone frequencies.
  const offsets = { rim: .105, paint: -.100, mid: -.215 };
  const center = shares.rim * offsets.rim + shares.paint * offsets.paint + shares.mid * offsets.mid;
  const twoDelta = offsets[zone] - center;
  if (zone === "rim") {
    const dunkChance = clamp((hands - 120) / 260 + (big ? .17 : .045), .025, .49);
    const label = secondChance && rng() < .18 ? "putback layup"
      : rng() < dunkChance ? (big ? "dunk" : "driving dunk")
        : rng() < .22 ? "running layup" : "driving layup";
    const radius = .25 + rng() * 3.35;
    const angle = rng() * Math.PI;
    return { zone, label, subType: label, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, twoDelta };
  }
  if (zone === "paint") {
    const label = choose(rng, [
      ["floater", big ? .13 : .44],
      ["hook shot", big ? .42 : .08],
      ["turnaround jumper", big ? .26 : .20],
      ["short jump shot", big ? .19 : .28],
    ] as const);
    return { zone, label, subType: label, x: (rng() - .5) * 12.2, y: 5 + rng() * 7.7, twoDelta };
  }
  const label = choose(rng, [
    ["pull-up jump shot", big ? .20 : .4],
    ["fadeaway jumper", big ? .32 : .24],
    ["mid-range jump shot", big ? .48 : .36],
  ] as const);
  const x = (rng() < .5 ? -1 : 1) * (2 + rng() * 15.5);
  const y = 13.7 + rng() * 6.5;
  return { zone, label, subType: label, x, y, twoDelta };
}
