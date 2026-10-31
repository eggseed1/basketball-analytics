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
  const ambition = typeof s.flags.ambition === "string" ? s.flags.ambition : null;
  if (ambition === "nba" && age >= 15 && age < 24 && s.achievements.nbaDebut === null) {
    out.push({ id: "ambition-nba", text: "Keep getting seen by scouts.", why: "You said the NBA out loud. Exposure and draft readiness matter more than comfort.", action: age < 19 ? { secondary: "showcase" } : undefined });
  } else if (ambition === "nation" && age >= 16 && s.international.caps < 5) {
    out.push({ id: "ambition-nation", text: "Stay available for national team windows.", why: "You pointed at the federation crest. Caps and summer form count for that shirt." });
  } else if (ambition === "money" && age >= 18 && s.finance.lifestyle !== "frugal" && (s.placement.contract?.salary ?? 0) > 0) {
    out.push({ id: "ambition-money", text: "Protect what you earn.", why: "You said the family comes first. A frugal stretch builds the pile faster when the paycheck is real." });
  } else if (ambition === "longevity" && age >= 22 && s.plan.workload === "high") {
    out.push({ id: "ambition-long", text: "Ease the workload before the body asks.", why: "You talked about lasting. High workloads stack injuries over long seasons.", action: { workload: "balanced" } });
  }
  if (age >= 7) {
    const pos = position(s.body.heightCm, s.skills);
    const ranked = [...SKILLS].sort((a, b) => s.skills[a.key] - s.skills[b.key]);
    const weak = ranked.find((k) => {
      const f = FOCUS_FOR_SKILL[k.key];
      return f && focusAvailable(FOCUS_BY_ID[f], age, s) && s.plan.primary !== f;
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
  if (s.flags.betOnSelf === true && s.placement.contract) {
    out.push({
      id: "prove-it",
      text: "Treat this as a prove-it year.",
      why: "You turned down security. Front offices will grade the tape. The plot card is already tracking it.",
      action: s.placement.node === "nba" ? { primary: "nba-pro-habits", workload: "balanced" } : { primary: "film-iq" },
    });
  }
  if (s.placement.node === "nba" && age < 27 && ["deep-bench", "bench", "rotation"].includes(s.placement.role)) {
    const nbaFocus = FOCUS_BY_ID["nba-pro-habits"];
    if (nbaFocus && focusAvailable(nbaFocus, age, s) && s.plan.primary !== "nba-pro-habits" && s.plan.primary !== "nba-on-ball" && s.plan.primary !== "nba-three") {
      out.push({
        id: "nba-dev",
        text: "Use an NBA development focus while minutes are scarce.",
        why: "Low picks grow when they close the gap to their ceiling. Habits, threes, and on-ball work are built for this roster.",
        action: { primary: "nba-pro-habits" },
      });
    }
  }
  return dedupe(out).slice(0, 3);
}

function dedupe(a: Advice[]) {
  const seen = new Set<string>();
  return a.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
}

export function availableFocuses(s: LifeState) {
  const age = s.ageMonths / 12;
  return FOCUSES.map((f) => ({ ...f, available: focusAvailable(f, age, s) }));
}
