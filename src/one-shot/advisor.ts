import { cohortLevel, eliteYouthLabel, performanceLevel } from "./career";
import { canDeclare } from "./draft";
import { position, SKILLS, skillComposite } from "./skills";
import { FOCUS_BY_ID, focusAvailable, FOCUSES } from "./training";
import type { FocusId, LifeState, SkillKey, Workload } from "./types";
import { country, domesticProLeagues } from "./world";

/**
 * "Next move" advisor. Pure function of the state: no streams, no hidden
 * values beyond what the scouting report already reveals.
 */
export interface Advice {
  id: string;
  text: string;
  why: string;
  action?: { primary?: FocusId; secondary?: FocusId | null; workload?: Workload };
}

const FOCUS_FOR_SKILL: Partial<Record<SkillKey, FocusId>> = {
  shooting: "shooting",
  freeThrows: "shooting",
  handle: "playmaking",
  passing: "playmaking",
  finishing: "finishing",
  perimeterD: "defense",
  interiorD: "rebounding-post",
  rebounding: "rebounding-post",
  iq: "film-iq",
  decisions: "film-iq",
  offBall: "film-iq",
};

export function advise(s: LifeState): Advice[] {
  const age = s.ageMonths / 12;
  const out: Advice[] = [];
  const c = country(s.residence.countryId);
  if (s.ended) return out;
  if (age < 3) {
    return [{ id: "grow", text: "Let the years pass.", why: "No focus to set before age 3. Growth and family set the stage." }];
  }
  if (s.condition.injury) {
    out.push({ id: "injury", text: "Rest until the injury heals.", why: `${s.condition.injury.label}: about ${s.condition.injury.monthsLeft} month${s.condition.injury.monthsLeft === 1 ? "" : "s"} left. Training counts for less while you're hurt.`, action: { workload: "low" } });
  } else if (s.condition.energy < 40 && s.plan.workload !== "low") {
    out.push({ id: "energy", text: "Drop your workload to low for a while.", why: `Energy is ${Math.round(s.condition.energy)}. Tired players learn less and get hurt more.`, action: { workload: "low" } });
  } else if (s.condition.energy > 85 && s.plan.workload === "low" && age >= 8) {
    out.push({ id: "more", text: "You have room to train more.", why: `Energy is ${Math.round(s.condition.energy)} on a low workload.`, action: { workload: "balanced" } });
  }
  if (age >= 7) {
    const pos = position(s.body.heightCm, s.skills);
    const ranked = [...SKILLS].sort((a, b) => s.skills[a.key] - s.skills[b.key]);
    const weak = ranked.find((k) => {
      const f = FOCUS_FOR_SKILL[k.key];
      return f && focusAvailable(FOCUS_BY_ID[f], age) && s.plan.primary !== f;
    });
    if (weak) {
      const f = FOCUS_FOR_SKILL[weak.key]!;
      out.push({ id: `focus-${f}`, text: `Make ${FOCUS_BY_ID[f].label} your primary focus.`, why: `${weak.label} is your weakest skill (${Math.round(s.skills[weak.key])}). Your game rates ${Math.round(skillComposite(s.skills, pos))} overall for a ${pos === "G" ? "guard" : pos === "W" ? "wing" : pos === "F" ? "forward" : "center"}.`, action: { primary: f } });
    }
  }
  if (age >= 14 && age < 18 && s.education.amateur && s.education.academics < 50 && s.plan.primary !== "school" && s.plan.secondary !== "school") {
    out.push({ id: "school", text: "Add School as a secondary focus.", why: `Grades are ${Math.round(s.education.academics)}/100. NCAA scholarships in this game need 45.`, action: { secondary: "school" } });
  }
  const pros = domesticProLeagues(c.id);
  if (age >= 13 && age < 23 && s.exposure < 25 && s.plan.secondary !== "showcase" && s.plan.primary !== "showcase") {
    const why = pros.length
      ? `Exposure is ${Math.round(s.exposure)}. ${pros[0]!.name} clubs and foreign scouts need to see you.`
      : `Exposure is ${Math.round(s.exposure)}. The snapshot has no verified pro league in ${c.name}, so showcases and camps are how scouts find you.`;
    out.push({ id: "showcase", text: "Add Showcase events as a secondary focus.", why, action: { secondary: "showcase" } });
  }
  if (age >= 10 && age < 18 && performanceLevel(s) >= cohortLevel(age) * 1.1 && s.placement.node === "local-club" && pros[0]) {
    out.push({ id: "elite", text: `Aim for a spot in the ${eliteYouthLabel(c.id, pros[0].id).replace(/^Elite youth program, .*/, "top youth program")}.`, why: "You are well ahead of kids your age. Youth coaches invite players they have seen at season's end." });
  }
  if (age >= 18 && canDeclare(s, s.identity.birthYear + Math.floor((s.identity.birthMonthOfYear - 1 + s.ageMonths) / 12))) {
    out.push({ id: "draft", text: "Watch your readiness band before April.", why: "Draft decisions come each April. Declaring in draft range or NBA-ready gives you the best shot." });
  }
  if (s.plan.primary === "free-play" && age >= 8) {
    out.push({ id: "structure", text: "Pick a structured focus.", why: "Free play builds coordination, but skill work pays off more from age 8.", action: { primary: "fundamentals" } });
  }
  return dedupe(out).slice(0, 3);
}

function dedupe(a: Advice[]) {
  const seen = new Set<string>();
  return a.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
}

export function availableFocuses(s: LifeState) {
  const age = s.ageMonths / 12;
  return FOCUSES.map((f) => ({ ...f, available: focusAvailable(f, age) }));
}
