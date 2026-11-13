/**
 * Franchise progression is continuous: four small regular-season checkpoints
 * followed by an annual recalibration at the offseason progression window.
 * Every outcome is derived from stable player/season keys, never Date.now().
 */
import type { GmDevTrait, GmLeagueState, GmPlayer } from "@/gm/types";
import { clamp, createRng } from "@/gm/engine/rng";
import { developmentSeed, workEthicOf } from "@/gm/engine/development";
import { ATTRIBUTE_LABEL, ensurePlayerSheet, overallFromAttributes, simpleCategoryMeans } from "@/gm/engine/attributes";
import { playerMentality } from "@/gm/engine/mentality";
import { gLeagueGames } from "@/gm/engine/g-league";
import { evolveTendencies } from "@/gm/engine/tendency-development";
import {
  developmentProfileOf, developmentFocusSkill, developmentSkillKeys,
  softGrowthFactor,
} from "@/gm/engine/development-profile";

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
  const productivePrime = player.age <= 32;
  const confidence = (enough ? Math.max(0, performance) * 0.3 : 0) + awards.score * 0.095;
  let promotion = 0;
  let demotion = 0;
  if (productivePrime && enough && performance >= 0.24) {
    promotion = current === "bust" ? 0.45 : current === "normal" ? 0.28 : current === "star" ? 0.12 : 0.015;
    promotion = (promotion + confidence) * (youth ? 1 : 0.56);
  }
  // True late bloomers can still upgrade a trait, but there is an age
  // discount and elite-tier promotions need extraordinary evidence.
  if (awards.score >= 2 && player.age <= 34) {
    promotion = Math.max(promotion, (0.16 + awards.score * 0.075) * (youth ? 1 : 0.62));
  }
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
  const openPath = old.draftModel === 2;
  const focus = developmentFocusSkill(old);
  const chosen = openPath
    ? developmentSkillKeys(old.position, focus)
    : old.developmentFocus === "shooting" ? ["threePoint", "midrange", "freeThrow"]
    : old.developmentFocus === "creation" ? ["passAccuracy", "ballHandle", "speedWithBall"]
    : old.developmentFocus === "finishing" ? developmentSkillKeys(old.position, "finishing")
    : old.developmentFocus === "defense" ? ["perimeterDefense", "interiorDefense", "steal", "block"]
    : old.developmentFocus === "rebounding" ? ["offReb", "defReb", "strength"]
    : old.position === "C" || old.position === "PF" ? ["interiorDefense", "defReb", "strength", "closeShot"]
    : ["threePoint", "perimeterDefense", "ballHandle", "midrange"];
  const swing = checkpoint === "summer" ? Math.max(1, Math.min(3, Math.abs(step))) : step === 0 ? 0 : 1;
  const aptitude = developmentProfileOf(old).aptitudes;
  const affinity = openPath ? aptitude[focus] ?? ((aptitude.shooting + aptitude.creation) / 2) : 1;
  const attributeSteps = step === 0 ? 0 : Math.max(1, Math.round(swing * affinity));
  for (const name of chosen) {
    const key = name as keyof typeof attrs;
    attrs[key] = clamp(attrs[key] + Math.sign(step) * attributeSteps, 25, 99);
  }
  const impactChange = step * 0.31;
  const oldRatings = old.ratings;
  const impact = clamp(Math.round((oldRatings.impact + impactChange) * 100) / 100, -4, 10);
  const attacking = old.developmentFocus === "defense" ? 0.2
    : old.developmentFocus === "rebounding" ? 0.4
    : openPath && (focus === "shooting" || focus === "creation" || focus === "finishing") ? 0.86
    : 0.65;
  const offense = clamp(Math.round((oldRatings.offense + impactChange * attacking) * 100) / 100, -5, 12);
  const defense = clamp(Math.round((oldRatings.defense + impactChange * (1 - attacking)) * 100) / 100, -5, 10);
  const rating = { ...oldRatings, impact, offense, defense };
  const offset = target - overallFromAttributes(old.position, attrs, { impact, offense, defense });
  const skillGains = openPath && step > 0 ? chosen
    .filter(key => attrs[key as keyof typeof attrs] > sheet.attributes[key as keyof typeof attrs])
    .slice(0, 3)
    .map(key => {
      const ratingKey = key as keyof typeof attrs;
      return `${ATTRIBUTE_LABEL[ratingKey]} +${attrs[ratingKey] - sheet.attributes[ratingKey]}`;
    }) : [];
  return {
    ...old,
    ratings: rating,
    sheet: {
      ...sheet, ...evolveTendencies(sheet, attrs, checkpoint === "summer" ? "summer" : "season", old.simProfile?.source === "nba"), overall: target, attributes: attrs, overallOffset: offset,
      priorOverall: before, priorSimple: simpleCategoryMeans(sheet.attributes),
      developmentReport: { age: old.age, before, after: target,
        reasons: [label], gains: step ? [`Overall ${step > 0 ? "+" : ""}${step}`, ...skillGains] : ["Skill maintenance"] },
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
  const mentality = playerMentality(withSheet).rank;
  const gGames = gLeagueGames(withSheet, context.league.season);
  const signal = performanceSignal(withSheet, context.league.season);
  const accolade = isSummer ? accoladeScore(context.league, player.id).score : 0;
  // Generated players have no preordained final OVR. Each skill has a
  // learning aptitude; elite ratings instead encounter steep soft friction.
  // Existing NBA players and pre-v2 generated saves retain their legacy
  // ceiling data, but drafted model-2 rookies use the new open path.
  const openPath = withSheet.draftModel === 2;
  const profile = openPath ? developmentProfileOf(withSheet) : undefined;
  const headroom = Math.max(0, (openPath ? 99 : sheet.potential.ceiling) - baseline);
  const rng = createRng(developmentSeed(player.id + ":" + context.league.season + ":" + context.checkpoint));
  const peak = sheet.potential.peakStart || (player.position === "C" ? 29 : 27);
  const age = player.age; // Callers of summer progression already apply the birthday once.
  const ageDelta = age <= 21 ? 2.4 : age <= 23 ? 2.05 : age <= 25 ? 1.5
    : age <= 27 ? 0.95 : age <= peak + 1 ? 0.3
    : age <= 31 ? -0.30 : age <= 33 ? -0.82 : age <= 35 ? -1.36 : -1.90;
  // Mentality—not a hidden Star/X-Factor/Bust designation—determines how
  // consistently training converts to real skill. NBA performance still matters.
  const bonus = [0, 0.79, 0.9, 1, 1.12, 1.26][mentality]!;
  const path = 1;
  const play = withSheet.seasonLine;
  const nbaGames = play?.gp ?? 0;
  // G League is a genuine reps pathway but competition discounts the benefit.
  // G League games do not enter the seasonLine used for NBA production or awards.
  const gLeagueShare = clamp(gGames / 45, 0, 1);
  const availability = nbaGames >= 12 ? clamp(nbaGames / 65, 0.35, 1)
    : gGames >= 8 ? 0.68 + 0.24 * gLeagueShare : 0.73;
  let activity = nbaGames >= 12 ? clamp(play!.min / play!.gp / 25, 0.65, 1.12) : 0.68;
  if (withSheet.developmentPlan === "practice") activity = Math.max(activity, 0.82);
  if (withSheet.developmentPlan === "rotation" && nbaGames >= 12) activity *= play!.min / play!.gp >= 18 ? 1.07 : 0.75;
  if (gGames >= 8) activity = Math.max(activity, (0.76 + 0.20 * gLeagueShare) * 0.87);
  if (withSheet.injury) activity *= 0.78;
  const professionalism = 0.9 + workEthicOf(withSheet) / 1000;
  const staff = clamp(1 + (context.coach ?? 0) * 0.07 + ((context.staff ?? 1) - 1) * 0.12 + (context.mentor ?? 0), 0.85, 1.4);
  // Across 10+ draft classes an unconditional bonus slowly inflates the
  // league's average. Preserve rare exceptional learning, but temper the
  // ordinary path; no prospect receives a fixed future OVR.
  const growthFriction = openPath
    ? softGrowthFactor(withSheet, baseline) *
      ((profile?.learningSurge ?? 1) > 1 ? 1 : 0.9)
    : 1;
  const positive = ageDelta > 0 ? ageDelta * bonus * path * activity *
    availability * professionalism * staff * growthFriction : ageDelta;
  const performance = signal * (isSummer ? 1.1 : 0.52);
  const awardsBonus = isSummer ? Math.min(1.15, accolade * 0.12) : 0;
  const playoff = isSummer && age < 30 ? Math.min(0.4, (context.playoffGames ?? 0) * 0.02) : 0;
  let yearly = positive + performance + awardsBonus + playoff + (rng() - 0.5) * (isSummer ? 1.4 : 0.2);
  if (yearly > 0) yearly = Math.min(yearly, headroom, age <= 25 ? 5 : 3);
  if (yearly < 0 && age < 30 && signal > 0.2) yearly *= 0.4;
  const speed = clamp(context.league.settings.developmentSpeed ?? 1, 0.5, 2);
  const fraction = isSummer ? 1.0 : 0.14;
  const total = yearly * fraction * speed + (sheet.progressionCarry ?? 0);
  let steps = isSummer ? Math.round(total) : Math.trunc(total);
  steps = clamp(steps, -4, Math.min(headroom, isSummer ? 5 : 1));
  const carry = clamp(total - steps, -0.99, 0.99);
  if (steps === 0) return {
    ...withSheet,
    ...(profile ? { developmentProfile: profile } : {}),
    sheet: { ...sheet, progressionCarry: carry },
  };
  const next = changeRating(
    withSheet, clamp(baseline + steps, 30, 99),
    isSummer
      ? openPath ? "Offseason skill development: focus, learning, performance and environment"
        : "Offseason development: potential, performance, staff and accolades"
      : "In-season development checkpoint",
    context.checkpoint
  );
  return {
    ...next,
    ...(profile ? { developmentProfile: profile } : {}),
    sheet: { ...next.sheet!, progressionCarry: carry },
  };
}

/** Annual mentality review: repeated reps and sustained growth can improve the
 * underlying learning habits. The old trait ledger remains read-only for saves. */
export function reviewMentality(league: GmLeagueState, player: GmPlayer): GmPlayer {
  if (!player.teamId || league.draftPool.includes(player.id) ||
      player.mentalityGrowth?.reviewedSeason === league.season) return player;
  const before = playerMentality(player).rank;
  const nba = regularSample(player, league.season);
  const nbaGames = nba?.gp ?? 0;
  const gGames = gLeagueGames(player, league.season);
  const reps = nbaGames + Math.round(gGames * 0.78);
  const growth = player.developmentBaseline?.season === league.season
    ? (player.sheet?.overall ?? 0) - player.developmentBaseline.overall : 0;
  const previous = player.mentalityGrowth;
  const idle = reps < 10 ? (previous?.idleSeasons ?? 0) + 1 : 0;
  const rng = createRng(developmentSeed(player.id + ":mentality:" + league.season));
  const ageEligible = player.age <= 29;
  // One tier at most per year. A credible workload plus tangible improvement
  // matters more than draft position or raw overall. Rare high-workload
  // prospects can also learn stronger habits without a visible OVR spike.
  const meaningful = reps >= 35 && (growth >= 1 || reps >= 65);
  const chance = ageEligible && meaningful && before < 5
    ? clamp(0.035 + Math.max(0, growth) * 0.032 +
      Math.min(0.10, (reps - 35) / 450), 0, 0.24) : 0;
  const promoted = chance > 0 && rng() < chance;
  // Missing minutes for two full seasons can erode self-developed habits,
  // but G League reps protect them. Inherited veteran mentality persists.
  const eroded = !promoted && idle >= 2 && before > 1 &&
    player.age <= 29 && rng() < 0.13;
  const currentEarned = previous?.rank ?? before;
  const rank = promoted ? Math.min(5, before + 1) : eroded ? Math.max(1, currentEarned - 1) : currentEarned;
  const profile = developmentProfileOf(player);
  const boosted = promoted ? { ...profile,
    learning: clamp(profile.learning + 0.028, 0.72, 1.4),
    adaptability: clamp(profile.adaptability + 0.012, 0.7, 1.3) } : profile;
  return { ...player, developmentProfile: boosted,
    mentalityGrowth: { rank: rank as 1 | 2 | 3 | 4 | 5,
      reviewedSeason: league.season, idleSeasons: idle,
      ...(promoted ? { reason: "Earned a stronger mentality through sustained competitive reps and practice." } :
        eroded ? { reason: "Long inactivity weakened his self-developed training habits." } : {}) },
  };
}

/** Compatibility wrapper: no longer changes superstar/bust/X-factor traits. */
export function reviewDevelopmentTrait(league: GmLeagueState, player: GmPlayer): GmPlayer {
  return reviewMentality(league, player);
}
