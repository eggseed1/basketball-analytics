import { stepBody } from "./body";
import { charge, wallet } from "./finance";
import { clamp, rngOf } from "./rng";
import type { AthleticKey, FocusId, LifeState, SkillKey, TraitKey, Workload } from "./types";

export interface FocusDef {
  id: FocusId;
  label: string;
  minAge: number;
  maxAge?: number;
  blurb: string;
  skills: Partial<Record<SkillKey, number>>;
  athletic: Partial<Record<AthleticKey, number>>;
  traits?: Partial<Record<TraitKey, number>>;
  academics?: number;
  exposure?: number;
  monthlyCost?: number;
}

export const FOCUSES: FocusDef[] = [
  { id: "free-play", label: "Free play", minAge: 3, maxAge: 11, blurb: "Games with friends. Coordination and love of the game.", skills: { finishing: 0.4, handle: 0.4, offBall: 0.2 }, athletic: { coordination: 1, acceleration: 0.4 }, traits: { motivation: 0.5 } },
  { id: "fundamentals", label: "Fundamentals", minAge: 5, blurb: "Footwork, layups, both hands.", skills: { finishing: 1, handle: 0.8, passing: 0.6, freeThrows: 0.4 }, athletic: { coordination: 0.5 } },
  { id: "shooting", label: "Shooting", minAge: 7, blurb: "Form shooting, then volume and range.", skills: { shooting: 1.3, freeThrows: 1.1, offBall: 0.3 }, athletic: {} },
  { id: "playmaking", label: "Playmaking", minAge: 8, blurb: "Handle, passing reads, pick-and-roll.", skills: { handle: 1.2, passing: 1.1, decisions: 0.6 }, athletic: {} },
  { id: "finishing", label: "Finishing", minAge: 9, blurb: "Touch, angles and contact at the rim.", skills: { finishing: 1.4, freeThrows: 0.3 }, athletic: { strength: 0.2, vertical: 0.2 } },
  { id: "defense", label: "Defense", minAge: 9, blurb: "Stance, closeouts, help rotations.", skills: { perimeterD: 1.2, interiorD: 0.7, iq: 0.3 }, athletic: { lateral: 0.5 } },
  { id: "rebounding-post", label: "Rebounding and post", minAge: 10, blurb: "Boxing out, post moves, rim protection.", skills: { rebounding: 1.3, interiorD: 0.9, finishing: 0.5 }, athletic: { strength: 0.3 } },
  { id: "athleticism", label: "Speed and jumping", minAge: 11, blurb: "Sprint mechanics, agility, plyometrics.", skills: {}, athletic: { acceleration: 1.1, lateral: 1, vertical: 1.1, stamina: 0.4 } },
  { id: "strength", label: "Strength and conditioning", minAge: 13, blurb: "Supervised lifting and conditioning.", skills: {}, athletic: { strength: 1.4, stamina: 0.8, durability: 0.5 } },
  { id: "film-iq", label: "Film and IQ", minAge: 12, blurb: "Watching tape, learning schemes.", skills: { iq: 1.3, decisions: 1.1, offBall: 0.7 }, athletic: {}, traits: { composure: 0.2 } },
  { id: "school", label: "School", minAge: 6, maxAge: 22, blurb: "Grades keep college options open.", skills: {}, athletic: {}, academics: 1.6, traits: { discipline: 0.25 } },
  { id: "showcase", label: "Showcase events", minAge: 13, maxAge: 23, blurb: "Tournaments and camps where scouts watch. Costs money.", skills: { decisions: 0.2 }, athletic: {}, exposure: 1.4, traits: { confidence: 0.2 }, monthlyCost: 120 },
];

export const FOCUS_BY_ID = Object.fromEntries(FOCUSES.map((f) => [f.id, f])) as Record<FocusId, FocusDef>;

export const WORKLOAD_LABEL: Record<Workload, string> = { low: "Low", balanced: "Balanced", high: "High" };

export function focusAvailable(f: FocusDef, ageYears: number) {
  return ageYears >= f.minAge && (f.maxAge === undefined || ageYears <= f.maxAge);
}

/** Weekly hours of individual work by age and workload (model parameters). */
export function weeklyHours(ageYears: number, workload: Workload): number {
  if (ageYears < 3) return 0;
  const band = ageYears < 6 ? [1, 2, 3] : ageYears < 10 ? [3, 5, 8] : ageYears < 14 ? [5, 9, 13] : ageYears < 18 ? [8, 14, 20] : [10, 18, 26];
  return band[workload === "low" ? 0 : workload === "balanced" ? 1 : 2]!;
}

const ALF: [number, number][] = [[3, 0.45], [6, 0.85], [10, 1.15], [14, 1.3], [18, 1.25], [21, 1], [24, 0.75], [27, 0.5], [32, 0.3]];
export function ageLearningFactor(ageYears: number): number {
  if (ageYears <= ALF[0]![0]) return ALF[0]![1];
  for (let i = 1; i < ALF.length; i++) {
    const [x1, y1] = ALF[i]!;
    const [x0, y0] = ALF[i - 1]!;
    if (ageYears <= x1) return y0 + ((y1 - y0) * (ageYears - x0)) / (x1 - x0);
  }
  return ALF[ALF.length - 1]![1];
}

/** 1 - e^(-hours/12): diminishing returns on volume. */
export function effectivePractice(hours: number): number {
  return 1 - Math.exp(-hours / 12);
}

export function headroom(cur: number, pot: number): number {
  if (pot <= 0) return 0;
  return clamp((pot - cur) / pot, 0, 1) ** 1.25;
}

const BASE_GAIN = 3.6;

export interface MonthlyDevelopment {
  skillGains: Partial<Record<SkillKey, number>>;
  athleticGains: Partial<Record<AthleticKey, number>>;
  hours: number;
  cost: number;
}

/**
 * developmentGain = ageLearningFactor x coaching x effectivePractice x
 * motivation x recovery x headroom, per skill, for one month. Primary focus
 * carries 65% of the focused share, secondary 35%; team practice adds a
 * general share.
 */
export function monthlyDevelopment(state: LifeState): MonthlyDevelopment {
  const age = state.ageMonths / 12;
  const out: MonthlyDevelopment = { skillGains: {}, athleticGains: {}, hours: 0, cost: 0 };
  if (age < 3) return out;
  const injured = state.condition.injury;
  const teamHours = state.placement.node === "home" ? 0 : state.placement.node === "playground" ? 2 : clamp(age - 4, 2, 14);
  const ownHours = injured ? weeklyHours(age, "low") * 0.3 : weeklyHours(age, state.plan.workload);
  out.hours = ownHours + teamHours;
  const coaching = 0.45 + clamp(state.placement.coaching, 0, 100) / 100;
  const motivation = clamp(state.traits.motivation / 70, 0.55, 1.3);
  const recovery = clamp(0.35 + 0.65 * (state.condition.energy / 100) * (state.condition.health / 100), 0.3, 1);
  const alf = ageLearningFactor(age);
  const ownEff = effectivePractice(ownHours);
  const teamEff = effectivePractice(teamHours) * 0.8;
  const primary = FOCUS_BY_ID[state.plan.primary];
  const secondary = state.plan.secondary ? FOCUS_BY_ID[state.plan.secondary] : null;
  const share = (k: SkillKey) => {
    const p = focusAvailable(primary, age) ? (primary.skills[k] ?? 0) : 0;
    const s = secondary && focusAvailable(secondary, age) ? (secondary.skills[k] ?? 0) : 0;
    return 0.65 * p + 0.35 * s;
  };
  for (const k of Object.keys(state.skills) as SkillKey[]) {
    const room = headroom(state.skills[k], state.potentials[k]);
    const gain = BASE_GAIN * alf * coaching * motivation * recovery * room * (ownEff * share(k) + teamEff * 0.55);
    if (gain > 0) out.skillGains[k] = gain;
  }
  const athShare = (k: AthleticKey) => {
    const p = focusAvailable(primary, age) ? (primary.athletic[k] ?? 0) : 0;
    const s = secondary && focusAvailable(secondary, age) ? (secondary.athletic[k] ?? 0) : 0;
    return 0.65 * p + 0.35 * s;
  };
  for (const k of ["strength", "acceleration", "lateral", "vertical", "stamina", "coordination", "durability"] as AthleticKey[]) {
    const g = 0.55 * alf * coaching * recovery * ownEff * athShare(k);
    if (g > 0) out.athleticGains[k] = g;
  }
  for (const f of [primary, secondary]) {
    if (f && focusAvailable(f, age) && f.monthlyCost) out.cost += f.monthlyCost * (f === primary ? 1 : 0.5);
  }
  return out;
}

/** Apply one month of training, energy, injuries and focus side effects. */
export function stepTraining(state: LifeState) {
  const age = state.ageMonths / 12;
  const dev = monthlyDevelopment(state);
  for (const [k, g] of Object.entries(dev.skillGains) as [SkillKey, number][]) {
    state.skills[k] = Math.min(99, state.skills[k] + g);
  }
  stepBody(state, dev.athleticGains);
  const primary = FOCUS_BY_ID[state.plan.primary];
  const secondary = state.plan.secondary ? FOCUS_BY_ID[state.plan.secondary] : null;
  for (const [f, w] of [[primary, 1], [secondary, 0.5]] as const) {
    if (!f || !focusAvailable(f, age)) continue;
    if (f.academics) state.education.academics = clamp(state.education.academics + f.academics * w * 0.6, 0, 100);
    if (f.exposure) state.exposure = clamp(state.exposure + f.exposure * w * 0.5, 0, 100);
    for (const [t, v] of Object.entries(f.traits ?? {}) as [TraitKey, number][]) state.traits[t] = clamp(state.traits[t] + v * w * 0.3, 0, 100);
  }
  // Academics drift down without attention once school matters.
  if (age >= 6 && state.education.level !== "done") {
    const attending = state.plan.primary === "school" || state.plan.secondary === "school";
    if (!attending) state.education.academics = clamp(state.education.academics - 0.15, 0, 100);
  }
  // Energy: recovery minus load.
  const load = dev.hours;
  const recover = state.plan.workload === "low" ? 14 : state.plan.workload === "balanced" ? 10 : 7;
  const drain = load * 0.55 + (state.season ? 3 : 0);
  state.condition.energy = clamp(state.condition.energy + recover - drain, 5, 100);
  state.condition.health = clamp(state.condition.health + (state.condition.injury ? 2 : 1.2), 0, 100);
  if (dev.cost > 0) chargeFamily(state, dev.cost);
  stepInjury(state, load);
}

/** Injury risk per month (model): grows with load squared and fatigue. */
export function injuryRisk(state: LifeState, hours: number): number {
  const age = state.ageMonths / 12;
  if (age < 6 || state.condition.injury) return 0;
  const fatigue = 1 + (100 - state.condition.energy) / 45;
  const durable = 1 - state.body.durability / 220;
  return clamp(0.004 + 0.012 * (hours / 18) ** 2 * fatigue * durable * (age >= 14 ? 1.3 : 0.6), 0, 0.2);
}

const INJURIES: { id: string; label: string; months: [number, number]; severity: 1 | 2 | 3; weight: number }[] = [
  { id: "ankle-sprain", label: "Sprained ankle", months: [1, 1], severity: 1, weight: 30 },
  { id: "jammed-finger", label: "Jammed finger", months: [1, 1], severity: 1, weight: 14 },
  { id: "hamstring", label: "Hamstring strain", months: [1, 2], severity: 1, weight: 16 },
  { id: "knee-tendinitis", label: "Patellar tendinitis", months: [2, 3], severity: 2, weight: 12 },
  { id: "back-spasms", label: "Back spasms", months: [1, 2], severity: 1, weight: 8 },
  { id: "stress-fracture", label: "Stress fracture in the foot", months: [3, 5], severity: 2, weight: 6 },
  { id: "broken-wrist", label: "Broken wrist", months: [2, 3], severity: 2, weight: 5 },
  { id: "meniscus", label: "Torn meniscus", months: [4, 6], severity: 3, weight: 3 },
  { id: "acl", label: "Torn ACL", months: [9, 12], severity: 3, weight: 1.2 },
];

export function stepInjury(state: LifeState, hours: number) {
  const inj = state.condition.injury;
  if (inj) {
    inj.monthsLeft -= 1;
    if (inj.monthsLeft <= 0) {
      state.condition.injury = null;
      state.condition.health = clamp(state.condition.health, 55, 100);
    }
    return;
  }
  const rng = rngOf(state.rng, "injury");
  const roll = rng.next();
  const pick = rng.next();
  const len = rng.next();
  if (roll >= injuryRisk(state, hours)) return;
  const total = INJURIES.reduce((s, i) => s + i.weight, 0);
  let r = pick * total;
  let chosen = INJURIES[0]!;
  for (const i of INJURIES) {
    r -= i.weight;
    if (r < 0) {
      chosen = i;
      break;
    }
  }
  const months = chosen.months[0] + Math.floor(len * (chosen.months[1] - chosen.months[0] + 1));
  inflictInjury(state, chosen.id, chosen.label, months, chosen.severity, null);
}

export function inflictInjury(state: LifeState, id: string, label: string, months: number, severity: 1 | 2 | 3, causeEntryId: string | null) {
  state.condition.injury = { id, label, monthsLeft: months, severity, causeEntryId };
  state.condition.injuryHistory += 1;
  state.condition.health = clamp(state.condition.health - severity * 18, 5, 100);
  if (severity === 3) {
    state.body.acceleration = Math.max(1, state.body.acceleration - 3);
    state.body.vertical = Math.max(1, state.body.vertical - 3);
  }
  const entry = {
    id: `h${++state.counters.entry}`,
    month: state.ageMonths,
    kind: "injury" as const,
    text: `${label}. Out about ${months} month${months === 1 ? "" : "s"}.`,
    causeId: causeEntryId,
    tone: "bad" as const,
  };
  state.history.push(entry);
}

/** The family pays for children; adults with their own money pay first. */
export function chargeFamily(state: LifeState, amount: number) {
  charge(state, amount);
}

export function canAfford(state: LifeState, perYear: number): boolean {
  const income = state.family.monthlyBudget * 12 + (state.placement.contract?.salary ?? 0) * 0.3;
  return perYear <= income + wallet(state) * 0.5;
}
