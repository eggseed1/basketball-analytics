/**
 * Franchise player-development DNA.
 *
 * Potential is no longer a predetermined final OVR for generated prospects.
 * A stable hidden profile determines how different skills respond to a career
 * of practice, game reps and mentoring. Success remains probabilistic and
 * growth becomes progressively harder at elite ratings.
 *
 * This is intentionally not shown to GMs or scouting. Observed development
 * is evidence; the hidden profile is not a promised outcome.
 */
import type { GmAttributes, GmDevelopmentProfile, GmLeagueState, GmPlayer } from "@/gm/types";
import { clamp, createRng } from "@/gm/engine/rng";

export type DevelopmentSkill = keyof GmDevelopmentProfile["aptitudes"];
const SKILLS: DevelopmentSkill[] = ["shooting", "creation", "defense", "rebounding", "finishing"];

function stableHash(value: string): number {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}
function mean(...nums: number[]) {
  return nums.reduce((sum, n) => sum + n, 0) / Math.max(1, nums.length);
}
function initialSkill(player: GmPlayer, focus: DevelopmentSkill): number {
  const a = player.sheet?.attributes;
  if (!a) return 65;
  switch (focus) {
    case "shooting": return mean(a.threePoint, a.midrange, a.freeThrow);
    case "creation": return mean(a.ballHandle, a.passAccuracy, a.speedWithBall);
    case "finishing": return mean(a.closeShot, a.drivingLayup, a.standingDunk, a.drivingDunk);
    case "defense": return mean(a.perimeterDefense, a.interiorDefense, a.steal, a.block);
    case "rebounding": return mean(a.offReb, a.defReb, a.strength);
  }
}

/** Deterministic for a legacy save until a profile is first persisted. */
export function developmentProfileOf(player: GmPlayer): GmDevelopmentProfile {
  if (player.developmentProfile?.version === 1) return player.developmentProfile;
  const rng = createRng(stableHash("development:v1:" + player.id));
  const initialPotential = clamp(player.ratings.potential ?? 5, 0, 10);
  // Scout-grade upside makes high learning slightly more likely, but does not
  // dictate the outcome. Unheralded prospects can get exceptional rolls.
  const talentNudge = (initialPotential - 5) * 0.013;
  const rareLearner = rng() < 0.045 ? 0.15 : 0;
  const learning = clamp(0.76 + rng() * 0.43 + talentNudge + rareLearner, 0.72, 1.4);
  const adaptability = clamp(0.77 + rng() * 0.46, 0.7, 1.3);
  const aptitudes = {} as GmDevelopmentProfile["aptitudes"];
  for (const skill of SKILLS) {
    const tools = initialSkill(player, skill);
    aptitudes[skill] = Math.round(clamp(
      0.79 + rng() * 0.41 + (tools - 68) * 0.0025,
      0.67, 1.32
    ) * 1000) / 1000;
  }
  // Some unheralded prospects genuinely learn at an exceptional rate.
  // This is independent of draft rank, not an assigned final overall.
  // Extra rolls are appended after existing aptitudes to keep prior saves
  // and previously generated identities deterministic.
  const learningSurge = rng() < 0.012 ? 2.45 : 1;
  return {
    version: 1,
    learningSurge,
    learning: Math.round(learning * 1000) / 1000,
    adaptability: Math.round(adaptability * 1000) / 1000,
    aptitudes,
    discovery: 0,
  };
}

/**
 * CPU clubs coach toward a plausible role AND the needs of their current
 * rotation. This reads only visible skills and roster depth, never hidden DNA.
 * The shortlist prevents small guards becoming rebounders or bigs learning
 * point-guard handles just because the club has a positional hole.
 *
 * Re-evaluated at progression checkpoints, so trades and roster construction
 * matter without storing a new preference or mutating human GM selections.
 */
export function cpuDevelopmentFocus(player: GmPlayer, league: GmLeagueState): DevelopmentSkill {
  const candidates: Record<GmPlayer["position"], DevelopmentSkill[]> = {
    PG: ["creation", "shooting", "finishing", "defense"],
    SG: ["shooting", "creation", "finishing", "defense"],
    SF: ["shooting", "defense", "creation", "finishing"],
    PF: ["defense", "rebounding", "finishing", "shooting"],
    C: ["defense", "rebounding", "finishing", "shooting"],
  };
  const choices = candidates[player.position];
  const teammates = league.players
    .filter(other => other.teamId === player.teamId && other.id !== player.id && other.sheet?.attributes)
    .sort((a, b) => (b.sheet?.overall ?? 0) - (a.sheet?.overall ?? 0))
    .slice(0, 8);
  const skills = player.sheet?.attributes;
  if (!skills) return choices[0]!;
  let best = choices[0]!;
  let bestScore = -Infinity;
  for (const [index, focus] of choices.entries()) {
    const keys = developmentSkillKeys(player.position, focus);
    const strength = mean(...keys.map(key => skills[key]));
    const peers = teammates.length
      ? mean(...teammates.map(other => mean(...keys.map(key => other.sheet!.attributes[key]))))
      : 70;
    // Grow real strengths rather than mechanically fixing every weakness.
    // A weak rotation in this skill makes a promising specialist more valuable.
    const role = [4, 3, 1.5, 0.5][index]!;
    const score = role + clamp((strength - 67) * 0.2, -3.5, 5) +
      clamp((70 - peers) * 0.29, -5.5, 6) +
      (stableHash(`cpu-focus:${player.id}:${league.season}:${focus}`) % 100) / 500;
    if (score > bestScore) { best = focus; bestScore = score; }
  }
  return best;
}

export function developmentFocusSkill(player: GmPlayer, league?: GmLeagueState): DevelopmentSkill {
  if (player.developmentFocus && player.developmentFocus !== "balanced") {
    return player.developmentFocus;
  }
  if (league && player.draftModel === 2 && player.teamId && player.teamId !== league.userTeamId) {
    return cpuDevelopmentFocus(player, league);
  }
  // Balanced human plans and legacy saves retain their familiar defaults.
  if (player.position === "C" || player.position === "PF") return "defense";
  if (player.position === "PG") return "creation";
  return "shooting";
}

export function developmentSkillKeys(
  position: GmPlayer["position"],
  focus: DevelopmentSkill
): Array<keyof GmAttributes> {
  switch (focus) {
    case "shooting": return ["threePoint", "midrange", "freeThrow"];
    case "creation": return ["ballHandle", "passAccuracy", "speedWithBall"];
    case "finishing": return position === "C" || position === "PF"
      ? ["closeShot", "standingDunk", "postControl"]
      : ["drivingLayup", "closeShot", "drivingDunk"];
    case "defense": return position === "C" || position === "PF"
      ? ["interiorDefense", "block", "defReb"]
      : ["perimeterDefense", "steal", "agility"];
    case "rebounding": return ["offReb", "defReb", "strength"];
  }
}

export function softGrowthFactor(player: GmPlayer, overall: number, league?: GmLeagueState): number {
  const profile = developmentProfileOf(player);
  const focus = developmentFocusSkill(player, league);
  const selected = developmentSkillKeys(player.position, focus);
  const attrs = player.sheet?.attributes;
  const skill = attrs ? mean(...selected.map(key => attrs[key])) : 70;
  // Elite skills and OVR have progressively diminishing returns. These are
  // soft friction, never a hard OVR destiny tied to the draft lottery.
  const ovrDrag = overall < 77 ? 1 : overall < 82 ? 0.89
    : overall < 86 ? 0.72 : overall < 90 ? 0.67
    : overall < 94 ? 0.29 : 0.12;
  const skillDrag = skill < 82 ? 1 : skill < 89 ? 0.88
    : skill < 94 ? 0.68 : 0.44;
  const newSkillTax = skill < 57 ? (0.82 + (profile.adaptability - 0.7) * 0.17) : 1;
  const disposition = profile.learning *
    (0.74 + (profile.aptitudes[focus] ?? mean(profile.aptitudes.creation, profile.aptitudes.shooting)) * 0.26) *
    (0.82 + profile.adaptability * 0.18);
  return clamp(
    disposition * (profile.learningSurge ?? 1) * (1 + profile.discovery) * ovrDrag * skillDrag * newSkillTax,
    0.035, profile.learningSurge && profile.learningSurge > 1 ? 3.3 : 1.65
  );
}

/** A meaningful breakout strengthens the learning outlook, not a fixed cap. */
export function discoverDevelopment(
  player: GmPlayer,
  gain: number
): GmDevelopmentProfile {
  const profile = developmentProfileOf(player);
  const increase = clamp(gain, 0, 3) * 0.042 * (1 - profile.discovery / 0.55);
  return {
    ...profile,
    discovery: Math.round(clamp(profile.discovery + increase, 0, 0.55) * 1000) / 1000,
  };
}

/** Evidence shown to the player; never exposes secret aptitude or a ceiling. */
export function developmentOutlook(player: GmPlayer, season: number) {
  const overall = player.sheet?.overall ?? 70;
  const baseline = player.developmentBaseline?.season === season
    ? player.developmentBaseline.overall : player.sheet?.priorOverall ?? overall;
  const progress = overall - baseline;
  const line = player.seasonLine;
  const hasEvidence = line && line.gp >= 20 && line.min >= 300 &&
    (line.season === String(season) || line.season.startsWith(String(season - 1) + "-"));
  const mpg = hasEvidence ? line.min / line.gp : 0;
  const ppg = hasEvidence ? line.pts / line.gp : 0;
  const ts = hasEvidence && (line.fga + 0.44 * line.fta) > 0
    ? line.pts / (2 * (line.fga + 0.44 * line.fta)) : 0;
  if (progress >= 3) return {
    label: "Rising", detail: "He's made a meaningful skills jump. Keep building on what works.",
  };
  if (player.age >= 31) return {
    label: "Veteran", detail: "Experience can protect technical skills, but physical decline becomes harder to reverse.",
  };
  if (hasEvidence && mpg >= 18 && ppg >= 13 && ts >= 0.58) return {
    label: "Promising", detail: "Strong, efficient production is opening up new development possibilities.",
  };
  if (hasEvidence && mpg < 12 && player.age <= 25) return {
    label: "Needs reps", detail: "He can improve in practice, but a sustainable role offers better evidence.",
  };
  return {
    label: player.age <= 25 ? "Developing" : "Steady",
    detail: player.age <= 25
      ? "Growth depends on skill focus, coaching, opportunity and how he responds."
      : "Further growth is possible, though improvement usually slows near his prime.",
  };
}
