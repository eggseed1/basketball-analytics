/**
 * Franchise progression is continuous: four small regular-season checkpoints
 * followed by an annual recalibration at the offseason progression window.
 * Every outcome is derived from stable player/season keys, never Date.now().
 */
import type { GmDevTrait, GmLeagueState, GmPlayer } from "@/gm/types";
import { clamp, createRng } from "@/gm/engine/rng";
import { developmentSeed, workEthicOf } from "@/gm/engine/development";
import { ensurePlayerSheet, overallFromAttributes, simpleCategoryMeans } from "@/gm/engine/attributes";
import { pathFromTrait } from "@/gm/engine/dev-traits";

export type DevelopmentCheckpoint = "quarter1" | "january" | "quarter3" | "finale" | "summer";
export type ProgressContext = { league: GmLeagueState; checkpoint: DevelopmentCheckpoint; coach?: number; staff?: number; mentor?: number; playoffGames?: number };
export type TraitDecision = { before: GmDevTrait; after: GmDevTrait; reason: string };
const order: GmDevTrait[] = ["bust", "normal", "star", "superstar", "xfactor"];

function regularSample(player: GmPlayer, season: number) {
  const line = player.seasonLine;
  if (!line || line.gp < 12 || ![String(season), String(season - 1) + "-" + String(season).slice(-2)].includes(line.season)) return null;
  return line;
}

/**
 * Compare output to the role expected of that overall; volume alone does not
 * turn every high-usage player into a superstar. Low GP gets little weight.
 */
export function performanceSignal(player: GmPlayer, season: number): number {
  const line = regularSample(player, season);
  if (!line) return 0;
  const mpg = line.min / line.gp;
  const ppg = line.pts / line.gp;
  const apg = line.ast / line.gp;
  const rpg = line.reb / line.gp;
  const ts = line.fga + 0.44 * line.fta > 0 ? line.pts / (2 * (line.fga + 0.44 * line.fta)) : 0.54;
  const opening = player.developmentBaseline?.season === season ? player.developmentBaseline.overall : player.sheet?.overall ?? 75;
  const expected = clamp(8 + (opening - 68) * 0.72, 5, 30);
  const observed = ppg + apg * 0.65 + rpg * 0.33;
  const expectedComposite = expected + Math.max(0, opening - 72) * 0.18 + 2.5;
  const output = clamp((observed - expectedComposite) / 15, -1.2, 1.2);
  const efficiency = clamp((ts - 0.54) * 4.5, -0.5, 0.5);
  const role = clamp((mpg - 22) / 28, -0.45, 0.5);
  const sample = clamp((line.gp - 10) / 50, 0.12, 1);
  return clamp((output * 0.7 + efficiency * 0.2 + role * 0.25) * sample, -1, 1);
}

export function accoladeScore(league: GmLeagueState, playerId: string): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  if (league.awards?.season === league.season) {
    for (const race of league.awards.races) {
      const at = race.candidates.findIndex(row => row.id === playerId);
      if (at < 0) continue;
      if (race.id === "mvp" && at === 0) { score += 5; reasons.push("Most Valuable Player"); }
      if (race.id === "dpoy" && at === 0) { score += 4; reasons.push("Defensive Player of the Year"); }
      if (race.id === "mip" && at === 0) { score += 3; reasons.push("Most Improved Player"); }
      if (race.id === "roy" && at === 0) { score += 2; reasons.push("Rookie of the Year"); }
      if (race.id === "smoy" && at === 0) { score += 1; reasons.push("Sixth Man of the Year"); }
      if (race.id === "all-nba-1") { score += 3; reasons.push("All-NBA First Team"); }
      if (race.id === "all-nba-2") { score += 2; reasons.push("All-NBA Second Team"); }
      if (race.id === "all-nba-3") { score += 1; reasons.push("All-NBA Third Team"); }
      if (race.id === "all-def-1") { score += 1; reasons.push("All-Defense"); }
      if (race.id === "all-rook-1") { score += 1; reasons.push("All-Rookie"); }
    }
  }
  if (league.champion?.season === league.season && league.champion.finalsMvpId === playerId) {
    score += 3;
    reasons.push("Finals MVP");
  }
  return { score, reasons };
}

export function annualTraitDecision(league: GmLeagueState, player: GmPlayer): TraitDecision {
  const current: GmDevTrait = player.sheet?.potential.trait ?? "normal";
  if (player.traitHistory?.some(row => row.season === league.season)) {
    return { before: current, after: current, reason: "Already reviewed this offseason" };
  }
  const line = regularSample(player, league.season);
  const performance = performanceSignal(player, league.season);
  const awards = accoladeScore(league, player.id);
  const enough = Boolean(line && line.gp >= 35 && line.min >= 750);
  const rng = createRng(developmentSeed(player.id + ":trait:" + league.season));
  const ovr = player.sheet?.overall ?? 70;
  const youth = player.age <= 28;
  const confidence = (enough ? Math.max(0, performance) * 0.3 : 0) + awards.score * 0.095;
  let promotion = 0;
  let demotion = 0;
  if (youth && enough && performance >= 0.28) {
    promotion = current === "bust" ? 0.4 : current === "normal" ? 0.24 : current === "star" ? 0.09 : 0.01;
    promotion += confidence;
  }
  if (awards.score >= 2 && youth) promotion = Math.max(promotion, 0.17 + awards.score * 0.075);
  if (current === "superstar" && awards.score < 4) promotion *= 0.25;
  if (current === "star" && ovr < 77 && awards.score < 2) promotion *= 0.45;
  if (current === "xfactor") promotion = 0;
  if (enough && performance <= -0.42 && awards.score === 0) demotion = current === "xfactor" ? 0.08 : current === "superstar" ? 0.12 : 0.16;
  if (player.age >= 33 && awards.score === 0 && current !== "normal" && current !== "bust") demotion = Math.max(demotion, 0.13 + (player.age - 33) * 0.045);
  if (!enough && player.age <= 31) demotion = 0; // Never punish low-minute young players for no data.
  const index = order.indexOf(current);
  if (index < order.length - 1 && rng() < Math.min(0.68, promotion)) {
    return { before: current, after: order[index + 1]!, reason: awards.reasons[0] ?? "Breakout production and a stronger season" };
  }
  if (index > 0 && rng() < demotion) {
    return { before: current, after: order[index - 1]!, reason: player.age >= 33 ? "Aging and diminished impact" : "A difficult season reduced confidence" };
  }
  return { before: current, after: current, reason: awards.reasons[0] ?? "Development assessment held steady" };
}

function changeRating(player: GmPlayer, target: number, label: string, checkpoint: DevelopmentCheckpoint): GmPlayer {
  const old = ensurePlayerSheet(player);
  const sheet = old.sheet!;
  const before = sheet.overall;
  const step = target - before;
  const attrs = { ...sheet.attributes };
  const chosen = old.developmentFocus === "shooting" ? ["threePoint", "midrange", "freeThrow"]
    : old.developmentFocus === "creation" ? ["passAccuracy", "ballHandle", "speedWithBall"]
    : old.developmentFocus === "defense" ? ["perimeterDefense", "interiorDefense", "steal", "block"]
    : old.developmentFocus === "rebounding" ? ["offReb", "defReb", "strength"]
    : old.position === "C" || old.position === "PF" ? ["interiorDefense", "defReb", "strength", "closeShot"]
    : ["threePoint", "perimeterDefense", "ballHandle", "midrange"];
  const swing = checkpoint === "summer" ? Math.max(1, Math.min(3, Math.abs(step))) : step === 0 ? 0 : 1;
  for (const name of chosen) {
    const key = name as keyof typeof attrs;
    attrs[key] = clamp(attrs[key] + Math.sign(step) * swing, 25, 99);
  }
  const impactChange = step * 0.31;
  const oldRatings = old.ratings;
  const impact = clamp(Math.round((oldRatings.impact + impactChange) * 100) / 100, -4, 10);
  const attacking = old.developmentFocus === "defense" ? 0.2 : old.developmentFocus === "rebounding" ? 0.4 : 0.65;
  const offense = clamp(Math.round((oldRatings.offense + impactChange * attacking) * 100) / 100, -5, 12);
  const defense = clamp(Math.round((oldRatings.defense + impactChange * (1 - attacking)) * 100) / 100, -5, 10);
  const rating = { ...oldRatings, impact, offense, defense };
  const offset = target - overallFromAttributes(old.position, attrs, { impact, offense, defense });
  return {
    ...old,
    ratings: rating,
    sheet: {
      ...sheet, overall: target, attributes: attrs, overallOffset: offset,
      priorOverall: before, priorSimple: simpleCategoryMeans(sheet.attributes),
      developmentReport: { age: old.age, before, after: target,
        reasons: [label], gains: step ? [`Overall ${step > 0 ? "+" : ""}${step}`] : ["Skill maintenance"] },
    },
  };
}

/** Centralized update for both regular-season checkpoints and the offseason. */
export function advanceDynamicProgression(player: GmPlayer, context: ProgressContext): GmPlayer {
  if (!player.teamId || context.league.draftPool.includes(player.id)) return player;
  const withSheet = ensurePlayerSheet(player);
  const sheet = withSheet.sheet!;
  const isSummer = context.checkpoint === "summer";
  const baseline = sheet.overall;
  const trait = sheet.potential.trait ?? "normal";
  const signal = performanceSignal(withSheet, context.league.season);
  const accolade = isSummer ? accoladeScore(context.league, player.id).score : 0;
  const headroom = Math.max(0, sheet.potential.ceiling - baseline);
  const rng = createRng(developmentSeed(player.id + ":" + context.league.season + ":" + context.checkpoint));
  const peak = sheet.potential.peakStart || (player.position === "C" ? 29 : 27);
  const age = isSummer ? player.age + 1 : player.age;
  const ageDelta = age <= 21 ? 2.4 : age <= 23 ? 2.05 : age <= 25 ? 1.5
    : age <= 27 ? 0.95 : age <= peak + 1 ? 0.3
    : age <= 31 ? -0.35 : age <= 33 ? -1.05 : age <= 35 ? -1.7 : -2.35;
  const bonus = trait === "xfactor" ? 1.24 : trait === "superstar" ? 1.18 : trait === "star" ? 1.1 : trait === "bust" ? 0.55 : 1;
  const path = sheet.potential.path === "boom" ? 1.13 : sheet.potential.path === "bust" ? 0.72 : 1;
  const play = withSheet.seasonLine;
  const availability = play && play.gp >= 12 ? clamp(play.gp / 65, 0.35, 1) : 0.86;
  const activity = play && play.gp >= 12 ? clamp(play.min / play.gp / 25, 0.65, 1.12) : 0.85;
  const professionalism = 0.9 + workEthicOf(withSheet) / 1000;
  const staff = clamp(1 + (context.coach ?? 0) * 0.07 + (context.staff ?? 1 - 1) * 0.12 + (context.mentor ?? 0), 0.85, 1.4);
  const positive = ageDelta > 0 ? ageDelta * bonus * path * activity * availability * professionalism * staff : ageDelta;
  const performance = signal * (isSummer ? 1.1 : 0.52);
  const awardsBonus = isSummer ? Math.min(1.15, accolade * 0.12) : 0;
  const playoff = isSummer && age < 30 ? Math.min(0.4, (context.playoffGames ?? 0) * 0.02) : 0;
  let yearly = positive + performance + awardsBonus + playoff + (rng() - 0.5) * (isSummer ? 1.4 : 0.2);
  if (yearly > 0) yearly = Math.min(yearly, headroom, age <= 25 ? 5 : 3);
  if (yearly < 0 && age < 30 && signal > 0.2) yearly *= 0.4;
  const speed = clamp(context.league.settings.developmentSpeed ?? 1, 0.5, 2);
  const fraction = isSummer ? 0.72 : 0.07;
  const total = yearly * fraction * speed + (sheet.progressionCarry ?? 0);
  let steps = isSummer ? Math.round(total) : Math.trunc(total);
  steps = clamp(steps, -4, Math.min(headroom, isSummer ? 5 : 1));
  const carry = clamp(total - steps, -0.99, 0.99);
  if (steps === 0) return { ...withSheet, sheet: { ...sheet, progressionCarry: carry } };
  const next = changeRating(withSheet, clamp(baseline + steps, 30, 99), isSummer ? "Offseason development: potential, performance, staff and accolades" : "In-season development checkpoint", context.checkpoint);
  return { ...next, sheet: { ...next.sheet!, progressionCarry: carry } };
}

export function reviewDevelopmentTrait(league: GmLeagueState, player: GmPlayer): GmPlayer {
  if (!player.teamId || league.draftPool.includes(player.id) || player.traitHistory?.some(row => row.season === league.season)) return player;
  const assessed = annualTraitDecision(league, player);
  const sheet = ensurePlayerSheet(player).sheet!;
  const changed = assessed.before !== assessed.after;
  return { ...player,
    sheet: { ...sheet, potential: changed ? { ...sheet.potential, trait: assessed.after, path: pathFromTrait(assessed.after) } : sheet.potential },
    traitHistory: [...(player.traitHistory ?? []), { season: league.season, ...assessed }].slice(-12),
  };
}
