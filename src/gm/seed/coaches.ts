import type { GmHeadCoach, GmTeam, GmTrainerDeal } from "@/gm/types";

/**
 * 2026-27 head coaches (Basketball-Reference season list).
 * Pay is the reported 2026-27 number when a figure is public.
 * SalarySwish, Hoops Rumors / Sportico (Dec 2025), and The Athletic.
 * Anything else is marked as an estimate in the hiring range those reports describe:
 * about $2M at the bottom, $8–11M for a settled coach, $15–17.5M at the top.
 */

interface CoachSeed {
  teamId: string;
  id: string;
  name: string;
  salaryM: number;
  yearsLeft: number;
  salaryReported: boolean;
  yearsReported: boolean;
  offense: number;
  defense: number;
  development: number;
  offenseStyle: NonNullable<GmHeadCoach["offenseStyle"]>;
  defenseStyle: NonNullable<GmHeadCoach["defenseStyle"]>;
  tempo: NonNullable<GmHeadCoach["tempo"]>;
  trait: string;
  tradeoff: string;
}

function coach(seed: CoachSeed): GmHeadCoach {
  return {
    id: seed.id,
    name: seed.name,
    salaryM: seed.salaryM,
    yearsLeft: seed.yearsLeft,
    salaryReported: seed.salaryReported,
    yearsReported: seed.yearsReported,
    offenseBonus: seed.offense,
    defenseBonus: seed.defense,
    developmentBonus: seed.development,
    offenseStyle: seed.offenseStyle,
    defenseStyle: seed.defenseStyle,
    tempo: seed.tempo,
    trait: seed.trait,
    tradeoff: seed.tradeoff,
  };
}

const SEEDS: CoachSeed[] = [
  { teamId: "atl", id: "quin-snyder", name: "Quin Snyder", salaryM: 8, yearsLeft: 2, salaryReported: true, yearsReported: false, offense: 1.1, defense: 0.4, development: 0.6, offenseStyle: "motion", defenseStyle: "drop", tempo: "fast", trait: "Pace and ball movement.", tradeoff: "The defense gives up easy ones." },
  { teamId: "bos", id: "joe-mazzulla", name: "Joe Mazzulla", salaryM: 11, yearsLeft: 3, salaryReported: true, yearsReported: false, offense: 1.3, defense: 0.9, development: 0.6, offenseStyle: "pace_space", defenseStyle: "switch", tempo: "fast", trait: "Spacing and threes.", tradeoff: "Half-court creation is thinner." },
  { teamId: "bkn", id: "jordi-fernandez", name: "Jordi Fernandez", salaryM: 4.5, yearsLeft: 2, salaryReported: false, yearsReported: false, offense: 0.4, defense: 0.5, development: 1.1, offenseStyle: "motion", defenseStyle: "switch", tempo: "fast", trait: "Teaches young players.", tradeoff: "The wins have not come with it." },
  { teamId: "cha", id: "charles-lee", name: "Charles Lee", salaryM: 5, yearsLeft: 2, salaryReported: false, yearsReported: false, offense: 0.5, defense: 0.6, development: 0.9, offenseStyle: "motion", defenseStyle: "switch", tempo: "normal", trait: "A development staff.", tradeoff: "The results are still thin." },
  { teamId: "chi", id: "tiago-splitter", name: "Tiago Splitter", salaryM: 4, yearsLeft: 3, salaryReported: false, yearsReported: false, offense: 0.3, defense: 0.8, development: 0.9, offenseStyle: "balanced", defenseStyle: "drop", tempo: "normal", trait: "Big-man defense.", tradeoff: "First year as a head coach." },
  { teamId: "cle", id: "kenny-atkinson", name: "Kenny Atkinson", salaryM: 7, yearsLeft: 3, salaryReported: false, yearsReported: false, offense: 0.9, defense: 0.6, development: 1.3, offenseStyle: "motion", defenseStyle: "switch", tempo: "fast", trait: "Player development.", tradeoff: "Not a shutdown defense." },
  { teamId: "dal", id: "dusty-may", name: "Dusty May", salaryM: 4.5, yearsLeft: 4, salaryReported: false, yearsReported: false, offense: 0.8, defense: 0.5, development: 1.0, offenseStyle: "motion", defenseStyle: "switch", tempo: "fast", trait: "Spacing from his college teams.", tradeoff: "There is no NBA sample yet." },
  { teamId: "den", id: "david-adelman", name: "David Adelman", salaryM: 5, yearsLeft: 3, salaryReported: false, yearsReported: false, offense: 1.0, defense: 0.4, development: 0.6, offenseStyle: "pick_roll", defenseStyle: "drop", tempo: "normal", trait: "Keeps the offense organized.", tradeoff: "Defense is left to the roster." },
  { teamId: "det", id: "jb-bickerstaff", name: "J.B. Bickerstaff", salaryM: 6, yearsLeft: 3, salaryReported: false, yearsReported: false, offense: 0.4, defense: 0.9, development: 0.8, offenseStyle: "balanced", defenseStyle: "no_middle", tempo: "slow", trait: "Defense and a steady pace.", tradeoff: "The offense is slow." },
  { teamId: "gsw", id: "steve-kerr", name: "Steve Kerr", salaryM: 17.5, yearsLeft: 2, salaryReported: true, yearsReported: true, offense: 1.5, defense: 0.4, development: 1.0, offenseStyle: "motion", defenseStyle: "switch", tempo: "fast", trait: "Motion and extra passes.", tradeoff: "The highest salary in the league, and the defense is ordinary." },
  { teamId: "hou", id: "ime-udoka", name: "Ime Udoka", salaryM: 7.5, yearsLeft: 2, salaryReported: true, yearsReported: false, offense: 0.5, defense: 1.4, development: 0.8, offenseStyle: "balanced", defenseStyle: "pressure", tempo: "normal", trait: "Point-of-attack defense.", tradeoff: "Half-court offense can stall." },
  { teamId: "ind", id: "rick-carlisle", name: "Rick Carlisle", salaryM: 11, yearsLeft: 2, salaryReported: true, yearsReported: false, offense: 1.3, defense: 0.5, development: 0.5, offenseStyle: "pick_roll", defenseStyle: "drop", tempo: "normal", trait: "Sets and the pick and roll.", tradeoff: "Drop coverage gives up threes." },
  { teamId: "lac", id: "tyronn-lue", name: "Tyronn Lue", salaryM: 14, yearsLeft: 2, salaryReported: true, yearsReported: true, offense: 1.1, defense: 0.8, development: 0.5, offenseStyle: "pick_roll", defenseStyle: "switch", tempo: "normal", trait: "Late-game sets.", tradeoff: "Young players develop slower." },
  { teamId: "lal", id: "jj-redick", name: "JJ Redick", salaryM: 8, yearsLeft: 2, salaryReported: true, yearsReported: true, offense: 1.2, defense: 0.3, development: 0.7, offenseStyle: "pace_space", defenseStyle: "drop", tempo: "fast", trait: "Spacing.", tradeoff: "Rim protection has to come from the roster." },
  { teamId: "mem", id: "tuomas-iisalo", name: "Tuomas Iisalo", salaryM: 4.5, yearsLeft: 3, salaryReported: false, yearsReported: false, offense: 1.0, defense: 0.2, development: 0.7, offenseStyle: "pace_space", defenseStyle: "drop", tempo: "fast", trait: "Spacing.", tradeoff: "The defense gives up size." },
  { teamId: "mia", id: "erik-spoelstra", name: "Erik Spoelstra", salaryM: 15, yearsLeft: 7, salaryReported: true, yearsReported: true, offense: 1.2, defense: 1.4, development: 1.2, offenseStyle: "motion", defenseStyle: "switch", tempo: "normal", trait: "A scheme on both ends.", tradeoff: "The deal runs for years." },
  { teamId: "mil", id: "taylor-jenkins", name: "Taylor Jenkins", salaryM: 11, yearsLeft: 4, salaryReported: false, yearsReported: false, offense: 1.0, defense: 0.5, development: 1.1, offenseStyle: "pace_space", defenseStyle: "switch", tempo: "fast", trait: "Growth for a young roster.", tradeoff: "Reported above $10M a year. The defense leaks." },
  { teamId: "min", id: "chris-finch", name: "Chris Finch", salaryM: 6, yearsLeft: 2, salaryReported: false, yearsReported: false, offense: 1.1, defense: 0.5, development: 0.7, offenseStyle: "pick_roll", defenseStyle: "drop", tempo: "normal", trait: "Offense.", tradeoff: "Drop coverage gives up the arc." },
  { teamId: "nop", id: "jamahl-mosley", name: "Jamahl Mosley", salaryM: 6, yearsLeft: 3, salaryReported: false, yearsReported: false, offense: 0.6, defense: 0.9, development: 1.0, offenseStyle: "balanced", defenseStyle: "no_middle", tempo: "normal", trait: "Defense and teaching.", tradeoff: "The offense can bog down." },
  { teamId: "nyk", id: "mike-brown", name: "Mike Brown", salaryM: 10, yearsLeft: 3, salaryReported: true, yearsReported: true, offense: 0.6, defense: 1.3, development: 0.7, offenseStyle: "balanced", defenseStyle: "no_middle", tempo: "normal", trait: "Half-court defense.", tradeoff: "The offense stays plain." },
  { teamId: "okc", id: "mark-daigneault", name: "Mark Daigneault", salaryM: 9, yearsLeft: 4, salaryReported: false, yearsReported: false, offense: 1.0, defense: 1.2, development: 1.5, offenseStyle: "motion", defenseStyle: "switch", tempo: "fast", trait: "Development and a connected defense.", tradeoff: "The salary is an estimate. A title coach is not a discount." },
  { teamId: "orl", id: "sean-sweeney", name: "Sean Sweeney", salaryM: 4, yearsLeft: 3, salaryReported: false, yearsReported: false, offense: 0.2, defense: 1.0, development: 0.7, offenseStyle: "balanced", defenseStyle: "no_middle", tempo: "normal", trait: "Defense.", tradeoff: "The offense is unproven." },
  { teamId: "phi", id: "nick-nurse", name: "Nick Nurse", salaryM: 9, yearsLeft: 3, salaryReported: false, yearsReported: false, offense: 0.7, defense: 1.1, development: 0.4, offenseStyle: "balanced", defenseStyle: "pressure", tempo: "normal", trait: "Pressure defense.", tradeoff: "Turnovers go both ways." },
  { teamId: "phx", id: "jordan-ott", name: "Jordan Ott", salaryM: 4.5, yearsLeft: 3, salaryReported: false, yearsReported: false, offense: 0.7, defense: 0.6, development: 0.8, offenseStyle: "pace_space", defenseStyle: "switch", tempo: "normal", trait: "A balanced first staff.", tradeoff: "The resume is short." },
  { teamId: "por", id: "micah-nori", name: "Micah Nori", salaryM: 4, yearsLeft: 2, salaryReported: false, yearsReported: false, offense: 0.4, defense: 0.4, development: 0.8, offenseStyle: "pick_roll", defenseStyle: "drop", tempo: "normal", trait: "Keeps the offense simple.", tradeoff: "No head-coaching record." },
  { teamId: "sac", id: "doug-christie", name: "Doug Christie", salaryM: 2, yearsLeft: 2, salaryReported: true, yearsReported: false, offense: -0.2, defense: 0.2, development: 0.4, offenseStyle: "balanced", defenseStyle: "pressure", tempo: "normal", trait: "The cheapest head coach in the league.", tradeoff: "The team plays like the price." },
  { teamId: "sas", id: "mitch-johnson", name: "Mitch Johnson", salaryM: 5, yearsLeft: 3, salaryReported: false, yearsReported: false, offense: 0.8, defense: 0.7, development: 1.2, offenseStyle: "motion", defenseStyle: "switch", tempo: "normal", trait: "Growth for a young core.", tradeoff: "The track record is short." },
  { teamId: "tor", id: "darko-rajakovic", name: "Darko Rajakovic", salaryM: 5, yearsLeft: 1, salaryReported: false, yearsReported: true, offense: 0.6, defense: 0.3, development: 1.0, offenseStyle: "motion", defenseStyle: "switch", tempo: "fast", trait: "Development.", tradeoff: "The deal is down to its last year, and the wins have lagged." },
  { teamId: "uta", id: "will-hardy", name: "Will Hardy", salaryM: 5, yearsLeft: 5, salaryReported: false, yearsReported: true, offense: 0.5, defense: 0.6, development: 1.2, offenseStyle: "pace_space", defenseStyle: "switch", tempo: "fast", trait: "Teaching.", tradeoff: "Five years left, and the present defense is thin." },
  { teamId: "was", id: "brian-keefe", name: "Brian Keefe", salaryM: 4, yearsLeft: 2, salaryReported: false, yearsReported: false, offense: 0.1, defense: 0.3, development: 0.8, offenseStyle: "balanced", defenseStyle: "drop", tempo: "normal", trait: "Continuity on a cheap deal.", tradeoff: "Both ends leak." },
];

const BY_TEAM = new Map(SEEDS.map((seed) => [seed.teamId, coach(seed)]));

export function coachForTeam(teamId: string): GmHeadCoach {
  return { ...(BY_TEAM.get(teamId) ?? coach(SEEDS[0]!)) };
}

/** Coaches between jobs for 2026-27. Asking prices are estimates under their last reported deals. */
export function openCoachMarket(): GmHeadCoach[] {
  return [
    coach({ teamId: "", id: "doc-rivers", name: "Doc Rivers", salaryM: 8, yearsLeft: 3, salaryReported: false, yearsReported: false, offense: 0.6, defense: 0.7, development: 0.3, offenseStyle: "balanced", defenseStyle: "drop", tempo: "slow", trait: "Playoff experience.", tradeoff: "The offense is dated, and the ask is still high." }),
    coach({ teamId: "", id: "billy-donovan", name: "Billy Donovan", salaryM: 6, yearsLeft: 3, salaryReported: false, yearsReported: false, offense: 0.7, defense: 0.8, development: 0.9, offenseStyle: "motion", defenseStyle: "switch", tempo: "normal", trait: "Teaching and a steady scheme.", tradeoff: "Neither end is a weapon." }),
    coach({ teamId: "", id: "tom-thibodeau", name: "Tom Thibodeau", salaryM: 7, yearsLeft: 2, salaryReported: false, yearsReported: false, offense: 0.2, defense: 1.5, development: 0.3, offenseStyle: "balanced", defenseStyle: "no_middle", tempo: "slow", trait: "The stingiest defense you can hire.", tradeoff: "Minutes pile up and the offense stalls." }),
    coach({ teamId: "", id: "michael-malone", name: "Michael Malone", salaryM: 6, yearsLeft: 3, salaryReported: false, yearsReported: false, offense: 1.0, defense: 0.5, development: 0.6, offenseStyle: "pick_roll", defenseStyle: "drop", tempo: "normal", trait: "Star offense.", tradeoff: "Drop coverage and a short leash with the locker room." }),
    coach({ teamId: "", id: "mike-budenholzer", name: "Mike Budenholzer", salaryM: 7, yearsLeft: 3, salaryReported: false, yearsReported: false, offense: 0.9, defense: 1.0, development: 0.4, offenseStyle: "pace_space", defenseStyle: "drop", tempo: "normal", trait: "A five-out defense that still drops.", tradeoff: "The drop gives up threes when the shot is falling." }),
    coach({ teamId: "", id: "jason-kidd", name: "Jason Kidd", salaryM: 6, yearsLeft: 3, salaryReported: false, yearsReported: false, offense: 0.5, defense: 0.8, development: 0.5, offenseStyle: "pick_roll", defenseStyle: "switch", tempo: "normal", trait: "Defense around a lead guard.", tradeoff: "The offense is the star's, not the scheme." }),
    coach({ teamId: "", id: "willie-green", name: "Willie Green", salaryM: 4, yearsLeft: 2, salaryReported: false, yearsReported: false, offense: 0.3, defense: 0.6, development: 0.7, offenseStyle: "balanced", defenseStyle: "switch", tempo: "normal", trait: "A cheaper veteran voice.", tradeoff: "The ceiling is modest." }),
    coach({ teamId: "", id: "darvin-ham", name: "Darvin Ham", salaryM: 4, yearsLeft: 2, salaryReported: false, yearsReported: false, offense: 0.2, defense: 0.7, development: 0.4, offenseStyle: "balanced", defenseStyle: "pressure", tempo: "normal", trait: "Physical defense.", tradeoff: "The half-court offense wanders." }),
  ];
}

export const TRAINER_TIERS: GmTrainerDeal[] = [
  { level: 2, salaryM: 0.4, yearsLeft: 1 },
  { level: 3, salaryM: 0.9, yearsLeft: 2 },
  { level: 5, salaryM: 1.5, yearsLeft: 2 },
];

export function trainerForLevel(level: number): GmTrainerDeal {
  if (level >= 5) return { ...TRAINER_TIERS[2]! };
  if (level >= 3) return { ...TRAINER_TIERS[1]! };
  return { ...TRAINER_TIERS[0]! };
}

export function trainerLabel(level: number): string {
  if (level >= 5) return "Performance lab";
  if (level >= 3) return "Sports medicine";
  return "Clinic";
}

/** Owner's pocket for coaches and the rest of the staff. Not a cap charge. Tax teams have less room. */
export function staffBudgetM(team: GmTeam, overTax: boolean): number {
  const goal = team.ownerGoal === "contend" ? 5 : team.ownerGoal === "tank" ? -3 : 1;
  const patience = Math.round((team.ownerPatience - 60) / 25);
  const tax = overTax ? -4 : 2;
  return Math.round(Math.min(26, Math.max(12, 16 + goal + patience + tax)) * 10) / 10;
}

export function payLabel(coach: { salaryM?: number; salaryReported?: boolean }): string {
  if (coach.salaryM == null) return "Pay not on file";
  const n = `$${coach.salaryM.toFixed(1)}M`;
  return coach.salaryReported === false ? `About ${n}` : n;
}

export function yearsLabel(coach: { yearsLeft?: number; yearsReported?: boolean; walkYear?: boolean }): string {
  if (coach.walkYear) return "Walk year";
  if (coach.yearsLeft == null) return "Years not on file";
  const n = coach.yearsLeft === 1 ? "1 year left" : `${coach.yearsLeft} years left`;
  return coach.yearsReported === false ? `About ${n.replace(" left", "")} left` : n;
}

export function installStaff(team: GmTeam): GmTeam {
  const current = team.staff.headCoach;
  const named = current?.name && current.name !== "Head Coach" && current.salaryM != null;
  const headCoach = named ? current : coachForTeam(team.id);
  return {
    ...team,
    staff: {
      ...team.staff,
      headCoach,
      trainer: team.staff.trainer ?? trainerForLevel(team.staff.trainerLevel),
      trainerLevel: (team.staff.trainer ?? trainerForLevel(team.staff.trainerLevel)).level,
      dead: team.staff.dead ?? [],
    },
  };
}
