import type { GmAttributes, GmPlayer, GmSimProfile } from "@/gm/types";
import { clamp } from "@/gm/engine/rng";

/** NBA rates are an entry prior. Attribute changes then move the probabilities. */
export function createSimProfile(player: GmPlayer): GmSimProfile {
  const a = player.sheet?.attributes;
  const line = player.nbaSeason;
  const big = player.position === "C" || player.position === "PF";
  const real = Boolean(line && line.min >= 40 && line.gp >= 3 && line.fga > 0);
  const min = Math.max(1, line?.min ?? 1);
  const prior = (made: number, attempts: number, mean: number, strength: number) =>
    (made + mean * strength) / (attempts + strength);
  const attr = (key: keyof GmAttributes, fallback = 65) => a?.[key] ?? fallback;
  const twoA = Math.max(0, (line?.fga ?? 0) - (line?.tpa ?? 0));
  const twoM = Math.max(0, (line?.fgm ?? 0) - (line?.tpm ?? 0));
  const orb = line?.orb ?? (line?.reb ?? 0) * (big ? 0.28 : 0.15);
  const use = clamp(0.15 + player.ratings.offense * 0.012 + (attr("ballHandle") - 65) * 0.001, 0.1, 0.36);
  return {
    version: 1,
    season: line?.season,
    confidence: real ? clamp(min / (min + 800), 0.1, 0.96) : 0.15,
    source: real ? "nba" : "estimated",
    baseline: { ...a },
    impact: player.ratings.impact,
    offense: player.ratings.offense,
    rates: real && line ? {
      fga: line.fga / min,
      threeShare: line.tpa / Math.max(1, line.fga),
      twoPct: prior(twoM, twoA, big ? 0.56 : 0.51, 80),
      threePct: prior(line.tpm, line.tpa, 0.35, 100),
      ftPct: prior(line.ftm, line.fta, big ? 0.73 : 0.8, 35),
      ftPerFga: line.fta / Math.max(1, line.fga),
      ast: line.ast / min,
      orb: orb / min,
      drb: Math.max(0, line.reb - orb) / min,
      stl: line.stl / min,
      blk: line.blk / min,
      tov: line.tov / min,
    } : {
      fga: 1.9 * use,
      threeShare: clamp((player.sheet?.tendencies.shootThree ?? (big ? 15 : 40)) / 100, 0, 0.8),
      twoPct: clamp(0.4 + (attr("closeShot") + attr("drivingLayup")) / 1100, 0.4, 0.74),
      threePct: clamp(0.2 + attr("threePoint") * 0.002, 0.22, 0.46),
      ftPct: clamp(0.35 + attr("freeThrow") * 0.006, 0.45, 0.95),
      ftPerFga: 0.15 + attr("drivingLayup") / 450,
      ast: 0.025 + attr("passAccuracy") / 480,
      orb: 0.006 + attr("offReb") / 850,
      drb: 0.04 + attr("defReb") / 380,
      stl: 0.006 + attr("steal") / 2400,
      blk: 0.002 + Math.pow(attr("block") / 100, 3) * 0.08,
      tov: 0.025 + use * 0.16,
    },
  };
}

export function ensureSimProfile(player: GmPlayer): GmPlayer {
  return player.simProfile?.version === 1 ? player : { ...player, simProfile: createSimProfile(player) };
}

export function simulationRates(player: GmPlayer): GmSimProfile["rates"] {
  const profile = player.simProfile ?? createSimProfile(player);
  const rates = { ...profile.rates };
  const attrs = player.sheet?.attributes;
  const delta = (key: keyof GmAttributes) => (attrs?.[key] ?? 65) - (profile.baseline[key] ?? attrs?.[key] ?? 65);
  rates.twoPct = clamp(rates.twoPct + (delta("closeShot") + delta("drivingLayup") + delta("midrange")) * 0.0015 + (delta("vertical") + delta("speedWithBall") + delta("drivingDunk")) * 0.0005, 0.3, 0.84);
  rates.threePct = clamp(rates.threePct + delta("threePoint") * 0.003, 0.12, 0.54);
  rates.ftPct = clamp(rates.ftPct + delta("freeThrow") * 0.004, 0.35, 0.98);
  rates.fga *= clamp(1 + (player.ratings.impact - profile.impact) * 0.025 + delta("ballHandle") * 0.002, 0.65, 1.4);
  rates.ast *= clamp(1 + delta("passAccuracy") * 0.018, 0.4, 1.7);
  rates.orb *= clamp(1 + delta("offReb") * 0.018 + delta("strength") * 0.003, 0.4, 1.7);
  rates.drb *= clamp(1 + delta("defReb") * 0.015 + delta("strength") * 0.003, 0.4, 1.7);
  rates.stl *= clamp(1 + delta("steal") * 0.015, 0.4, 1.7);
  rates.blk *= clamp(1 + delta("block") * 0.018, 0.4, 1.7);
  rates.tov *= clamp(1 - delta("ballHandle") * 0.008, 0.6, 1.6);
  return rates;
}

export function playerRoles(player: GmPlayer) {
  const a = player.sheet?.attributes;
  const r = simulationRates(player);
  return {
    creation: clamp((a?.passAccuracy ?? player.ratings.playmaking) / 100 * 0.5 + r.ast * 1.6 + r.fga * 0.3, 0, 1),
    spacing: clamp(r.threeShare * Math.max(0, r.threePct - 0.24) * 12, 0, 1),
    interior: clamp((player.heightIn - 75) / 14 * 0.5 + (a?.interiorDefense ?? 60) / 200 + r.blk * 2, 0, 1),
    perimeter: clamp((a?.perimeterDefense ?? 60) / 100, 0, 1),
    rebounding: clamp((r.orb + r.drb) * 2, 0, 1),
  };
}
