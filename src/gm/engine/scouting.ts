import type {
  GmLeagueState,
  GmPlayer,
  GmPosition,
  GmRatings,
  ProspectArchetypeId,
  ScoutLetterGrade,
  ScoutProfile,
  ScoutedRatings,
} from "@/gm/types";
import { clamp, createRng, pick, randInt } from "@/gm/engine/rng";
import {
  archetypeLabel,
  assignProspectIdentity,
  codenameDef,
  detectArchetype,
} from "@/gm/seed/prospect-identities";
import type { GmScout } from "@/gm/seed/scouts";
import {
  defaultTeamScout,
  effectiveScoutLevel,
  generateScoutMarket,
  scoutMatchBonus,
} from "@/gm/seed/scouts";

const GRADE_SCALE: ScoutLetterGrade[] = [
  "F",
  "D",
  "C-",
  "C",
  "C+",
  "B-",
  "B",
  "B+",
  "A-",
  "A",
  "A+",
];

/** Letter grades ≈ projected NBA tool vs an average rotation player. */
export const GRADE_LEGEND: { grade: string; meaning: string }[] = [
  { grade: "A+ / A", meaning: "Elite NBA tool - star / All-NBA caliber in that skill" },
  { grade: "A- / B+", meaning: "Plus starter skill - clear strength on a good roster" },
  { grade: "B / B-", meaning: "Solid NBA average - holds up as a rotation piece" },
  { grade: "C+ / C", meaning: "Fringe / below-average - needs scheme or limited role" },
  { grade: "C- / D / F", meaning: "Well below NBA average - major weakness or non-translator" },
];

export function gradeMeaning(g: ScoutLetterGrade | null | undefined): string {
  if (!g) return "Scout hasn’t graded this tool yet (fog).";
  if (g === "A+" || g === "A") return "Elite NBA-level tool";
  if (g === "A-" || g === "B+") return "Plus starter skill";
  if (g === "B" || g === "B-") return "Solid NBA average";
  if (g === "C+" || g === "C") return "Below-average / fringe";
  return "Well below NBA average";
}

function ratingToGrade(value0to100: number, noise: number): ScoutLetterGrade {
  const v = clamp(value0to100 + noise, 0, 100);
  const idx = Math.round((v / 100) * (GRADE_SCALE.length - 1));
  return GRADE_SCALE[clamp(idx, 0, GRADE_SCALE.length - 1)]!;
}

function impactToUpsideGrade(impact: number, potential: number, noise: number): ScoutLetterGrade {
  const score = clamp((impact + 3) * 10 + potential * 6 + noise, 0, 100);
  return ratingToGrade(score, 0);
}

type GradeFocus =
  | "overall"
  | "offense"
  | "defense"
  | "shooting"
  | "creation"
  | "athleticism"
  | "feel";

function focusLevel(
  baseLevel: number,
  scout: GmScout | null | undefined,
  position: GmPosition,
  focus: GradeFocus
): number {
  const bonus = scoutMatchBonus(scout, position, focus);
  return clamp(baseLevel + bonus, 1, 5);
}

function fogGrade(
  grade: ScoutLetterGrade,
  level: number,
  rng: () => number
): ScoutLetterGrade | null {
  if (level <= 1.4 && rng() < 0.45) return null;
  if (level < 2.4 && rng() < 0.25) return null;
  if (level >= 4.2) return grade;
  const idx = GRADE_SCALE.indexOf(grade);
  const drift = randInt(rng, -2, 2) - Math.max(0, 3 - Math.floor(level));
  return GRADE_SCALE[clamp(idx + drift, 0, GRADE_SCALE.length - 1)]!;
}

const MEDICAL_NOTES = [
  "Clean medical so far - trainers like the load profile.",
  "Minor ankle history; nothing that scares most boards.",
  "Conditioning flag after combine shuttle - worth a deeper look.",
  "Knee monitored in college; imaging reportedly clean.",
  "Durability projection is a soft concern for some staffs.",
];

const FOG_SUMMARIES = [
  "Tape is noisy - tools flash, translation still debated.",
  "High-upside skeleton with incomplete offensive polish.",
  "Role clarity is the swing skill; floor looks rotation-ready.",
  "Some teams see a star pathway; others see a specialist.",
  "Measurables check out; feel for the game is the unknown.",
];

function buildSummary(
  defFlavor: string | undefined,
  archetype: ProspectArchetypeId,
  scoutLevel: number,
  rng: () => number
): string {
  if (scoutLevel >= 4 && defFlavor) return defFlavor;
  if (scoutLevel >= 3) {
    return `${archetypeLabel(archetype)} mold. ${pick(rng, FOG_SUMMARIES)}`;
  }
  return pick(rng, FOG_SUMMARIES);
}

export function buildScoutedRatings(
  trueR: GmRatings,
  scoutLevel: number,
  rng: () => number,
  scout?: GmScout | null,
  position: GmPosition = "SF"
): ScoutedRatings {
  const level = focusLevel(scoutLevel, scout, position, "overall");
  const noiseAmp = Math.max(0.12, 2.4 - level * 0.42);
  const noise = (rng() - 0.5) * noiseAmp;
  const known = level >= 2 || rng() > 0.4;
  return {
    impact: known ? Math.round((trueR.impact + noise) * 100) / 100 : null,
    offense: known ? Math.round((trueR.offense + noise * 0.5) * 100) / 100 : null,
    defense: known ? Math.round((trueR.defense + noise * 0.5) * 100) / 100 : null,
    uncertainty: clamp(1.15 - level * 0.2, 0.08, 1),
  };
}

export function buildScoutProfile(
  player: GmPlayer,
  scoutLevel: number,
  boardIndex: number,
  rng: () => number,
  scout?: GmScout | null
): ScoutProfile {
  const position = player.position;
  const archetype =
    (player.scoutProfile?.archetypeId as ProspectArchetypeId | undefined) ??
    detectArchetype(player.ratings, position);
  const def = codenameDef(player.codename);
  const overall = focusLevel(scoutLevel, scout, position, "overall");
  const noise = (rng() - 0.5) * (28 - overall * 4);

  const trueGrades = {
    athleticism: ratingToGrade(
      (player.ratings.finishing + player.ratings.durability) / 2,
      noise
    ),
    shooting: ratingToGrade(player.ratings.shooting, noise),
    creation: ratingToGrade(
      (player.ratings.playmaking + player.ratings.offense * 8) / 2,
      noise
    ),
    defense: ratingToGrade(
      clamp(50 + player.ratings.defense * 8, 0, 100),
      noise
    ),
    feel: ratingToGrade(
      (player.ratings.playmaking + player.ratings.rebounding) / 2,
      noise * 0.8
    ),
    upside: impactToUpsideGrade(
      player.ratings.impact,
      player.ratings.potential,
      noise
    ),
  };

  const comps =
    overall >= 3
      ? (def?.comps ?? ["Board favorite", "Mystery upside"]).slice(0, 2)
      : overall >= 2
        ? (def?.comps ?? ["Mystery upside"]).slice(0, 1)
        : overall >= 1 && def?.comps?.[0]
          ? [`Maybe ${def.comps[0]}?`]
          : ["Unclear - need more tape"];

  const heightNoise = overall >= 4 ? 0 : randInt(rng, -2, 2);
  const weightNoise = overall >= 4 ? 0 : randInt(rng, -12, 12);

  return {
    archetypeLabel: archetypeLabel(def?.archetype ?? archetype),
    archetypeId: def?.archetype ?? archetype,
    comps,
    grades: {
      athleticism: fogGrade(
        trueGrades.athleticism,
        focusLevel(scoutLevel, scout, position, "athleticism"),
        rng
      ),
      shooting: fogGrade(
        trueGrades.shooting,
        focusLevel(scoutLevel, scout, position, "shooting"),
        rng
      ),
      creation: fogGrade(
        trueGrades.creation,
        focusLevel(scoutLevel, scout, position, "creation"),
        rng
      ),
      defense: fogGrade(
        trueGrades.defense,
        focusLevel(scoutLevel, scout, position, "defense"),
        rng
      ),
      feel: fogGrade(
        trueGrades.feel,
        focusLevel(scoutLevel, scout, position, "feel"),
        rng
      ),
      upside: fogGrade(
        trueGrades.upside,
        focusLevel(scoutLevel, scout, position, "overall"),
        rng
      ),
    },
    heightInEstimate:
      overall >= 1 ? clamp(player.heightIn + heightNoise, 68, 90) : null,
    weightLbsEstimate:
      overall >= 2 ? clamp(player.weightLbs + weightNoise, 160, 320) : null,
    medicalNote:
      overall >= 3
        ? pick(rng, MEDICAL_NOTES)
        : overall >= 2 && rng() > 0.6
          ? "Limited medical - waiting on team workouts."
          : null,
    summary: buildSummary(def?.flavor, def?.archetype ?? archetype, overall, rng),
    confidence: clamp(0.2 + overall * 0.16 + (rng() * 0.08 - 0.04), 0.15, 0.95),
    boardRankHint:
      overall >= 2
        ? clamp(boardIndex + 1 + randInt(rng, -3, 4), 1, 60)
        : null,
  };
}

/** Apply sealed identity + fogged dossier to a prospect. */
export function sealProspect(
  player: GmPlayer,
  scoutLevel: number,
  boardIndex: number,
  rng: () => number,
  scout?: GmScout | null
): GmPlayer {
  return {
    ...player,
    identityRevealed: false,
    scouted: buildScoutedRatings(
      player.ratings,
      scoutLevel,
      rng,
      scout,
      player.position
    ),
    scoutProfile: buildScoutProfile(player, scoutLevel, boardIndex, rng, scout),
    contract: null,
  };
}

/** Refresh scout fog for roster + available (FA / draft pool). */
export function revealScouting(
  players: GmPlayer[],
  teamId: string,
  scoutLevel: number,
  draftPool: string[] = [],
  scout?: GmScout | null
): GmPlayer[] {
  const rng = createRng(teamId.length * 1000 + scoutLevel * 97 + players.length);
  const draftSet = new Set(draftPool);
  return players.map((p, i) => {
    const onRoster = p.teamId === teamId;
    const available = p.teamId === null;
    if (!onRoster && !available) return p;
    if (draftSet.has(p.id) || (available && p.identityRevealed === false)) {
      return {
        ...p,
        scouted: buildScoutedRatings(p.ratings, scoutLevel, rng, scout, p.position),
        scoutProfile: buildScoutProfile(p, scoutLevel, i % 60, rng, scout),
      };
    }
    const level = focusLevel(scoutLevel, scout, p.position, "overall");
    const noise = (2.2 - level * 0.35) * 0.15;
    const scouted: ScoutedRatings = {
      impact: Math.round((p.ratings.impact + noise) * 100) / 100,
      offense: p.ratings.offense + noise * 0.4,
      defense: p.ratings.defense + noise * 0.4,
      uncertainty: clamp(1.1 - level * 0.18, 0.05, 1),
    };
    return { ...p, scouted };
  });
}

export function gradeSortValue(g: ScoutLetterGrade | null | undefined): number {
  if (!g) return -1;
  return GRADE_SCALE.indexOf(g);
}

/** Sort draft board by scouted upside (not true potential). */
export function sortScoutBoard(players: GmPlayer[]): GmPlayer[] {
  return [...players].sort((a, b) => {
    const ua = gradeSortValue(a.scoutProfile?.grades.upside);
    const ub = gradeSortValue(b.scoutProfile?.grades.upside);
    if (ub !== ua) return ub - ua;
    const ia = a.scouted.impact ?? -99;
    const ib = b.scouted.impact ?? -99;
    if (ib !== ia) return ib - ia;
    return (a.codename ?? a.name).localeCompare(b.codename ?? b.name);
  });
}

export function formatHeight(inches: number | null | undefined): string {
  if (inches == null) return "-";
  const ft = Math.floor(inches / 12);
  const inn = Math.round(inches % 12);
  return `${ft}'${inn}"`;
}

export function staffScoutContext(state: GmLeagueState): {
  scout: GmScout | null;
  level: number;
} {
  const staff = state.teams.find((t) => t.id === state.userTeamId)?.staff;
  const scout = staff?.scout ?? null;
  const level = effectiveScoutLevel(scout, staff?.scoutLevel ?? 1);
  return { scout, level };
}

function knownCodename(codename: string | undefined): boolean {
  return Boolean(codename && codenameDef(codename));
}

/** Lazy migrate older saves: scouts, market, style codenames. */
export function ensureProspectIdentities(state: GmLeagueState): GmLeagueState {
  let next = state;
  let changed = false;

  const teams = next.teams.map((t, i) => {
    if (t.staff.scout) return t;
    changed = true;
    const scout = defaultTeamScout(next.season * 1009 + i * 17 + t.id.charCodeAt(0));
    return {
      ...t,
      staff: {
        ...t.staff,
        scout,
        scoutLevel: scout.eye,
      },
    };
  });
  if (changed) next = { ...next, teams };

  if (!next.scoutMarket?.length) {
    changed = true;
    next = {
      ...next,
      scoutMarket: generateScoutMarket(next.season * 4243 + next.userTeamId.length * 11, 5),
    };
  }

  const used = new Set(
    next.players
      .map((p) => p.codename)
      .filter((c): c is string => Boolean(c))
  );
  const rng = createRng(next.season * 7919 + next.draftPool.length);
  const { scout, level } = staffScoutContext(next);

  const players = next.players.map((p) => {
    if (!next.draftPool.includes(p.id)) return p;
    const hasValidCodename = knownCodename(p.codename);
    if (hasValidCodename && p.identityRevealed === false && p.scoutProfile) {
      return p;
    }
    changed = true;
    let migrated = p;
    if (!hasValidCodename || p.identityRevealed !== false) {
      if (p.codename) used.delete(p.codename);
      migrated = assignProspectIdentity(p, rng, used, {
        eliteEligible:
          p.ratings.impact >= 4.0 && p.ratings.potential >= 7.5,
      });
    }
    const idx = next.draftPool.indexOf(p.id);
    return sealProspect(migrated, level, Math.max(0, idx), rng, scout);
  });

  if (changed) next = { ...next, players };
  return changed ? next : state;
}
