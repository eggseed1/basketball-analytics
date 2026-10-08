import { calendar, cohortLevel, levelOf, performanceLevel, roleFor, schoolLabel, stageOf } from "./career";
import { ADVISOR, ASSET_INFO, canPay, charge, income, invested, LIFESTYLE, mix, netWorth, PRESETS, trailingIndex } from "./finance";
import { nationalTeam, seniorBar } from "./international";
import { clamp, hashString } from "./rng";
import { clubNameFor, salaryFor } from "./routes";
import { currentLevel } from "./skills";
import { inflictInjury } from "./training";
import type { AdvisorStyle, AthleticKey, LifeState, Lifestyle, SkillKey, Stage, TraitKey } from "./types";
import { country, domesticProLeagues, foreignProLeagues, maybeLeague, type LeagueProfile } from "./world";

export interface EventCtx {
  s: LifeState;
  rolls: number[];
  entryId: string;
}

export interface EventChoice {
  id: string;
  label: string;
  preview: string | ((s: LifeState) => string);
  blocked?: (s: LifeState) => string | null;
  apply: (ctx: EventCtx) => string;
  follow?: { id: string; delay: number };
  /** Auto-decision tags: lower risk first, then higher growth. */
  risk?: number;
  growth?: number;
}

export interface EventTemplate {
  id: string;
  ages: [number, number];
  cooldown: number;
  once?: boolean;
  followUpOnly?: boolean;
  weight: (s: LifeState) => number;
  title: string;
  body: string | ((s: LifeState) => string);
  choices?: EventChoice[];
  auto?: (ctx: EventCtx) => string;
  tone?: "good" | "bad" | "neutral";
  /** Playing years (default), the career after playing, or both. */
  phase?: "play" | "after" | "any";
}

/* ------------------------------------------------------------ helpers */

const sk = (s: LifeState, k: SkillKey, d: number) => (s.skills[k] = clamp(s.skills[k] + d, 1, Math.max(s.skills[k], s.potentials[k])));
const tr = (s: LifeState, k: TraitKey, d: number) => (s.traits[k] = clamp(s.traits[k] + d, 0, 100));
const ath = (s: LifeState, k: AthleticKey, d: number) => (s.body[k] = clamp(s.body[k] + d, 1, 99));
const energy = (s: LifeState, d: number) => (s.condition.energy = clamp(s.condition.energy + d, 5, 100));
const health = (s: LifeState, d: number) => (s.condition.health = clamp(s.condition.health + d, 5, 100));
const expo = (s: LifeState, d: number) => (s.exposure = clamp(s.exposure + d, 0, 100));
const acad = (s: LifeState, d: number) => (s.education.academics = clamp(s.education.academics + d, 0, 100));
const spend = (s: LifeState, d: number) => charge(s, d);
/** Drop workload to low for a few months, then restore the previous setting. */
const restLow = (s: LifeState, months: number) => {
  if (s.plan.workload !== "low") s.flags.restoreWorkload = s.plan.workload;
  s.plan.workload = "low";
  s.flags.restoreAt = s.ageMonths + months;
};
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const cost = (s: LifeState, base: number) => Math.round(base * country(s.residence.countryId).model.costIndex);
const afford = (amount: number) => (s: LifeState) => (canPay(s, amount) ? null : "Not enough money right now.");
const age = (s: LifeState) => s.ageMonths / 12;
const isPro = (s: LifeState) => ["domestic-pro", "foreign-pro", "g-league", "nba"].includes(s.placement.node);
const onTeam = (s: LifeState) => !["home", "playground", "unattached"].includes(s.placement.node);
const evidence = (s: LifeState, text: string, weight: number) => s.evidence.push({ month: s.ageMonths, text, weight });
const salary = (s: LifeState) => s.placement.contract?.salary ?? 0;
const pay = (s: LifeState) => income(s);
const cash = (s: LifeState) => s.finance.cash;
const worth = (s: LifeState) => netWorth(s.finance);
const pick = <T,>(s: LifeState, key: string, list: readonly T[]) => list[hashString(`${s.seed}:${key}:${s.ageMonths}`) % list.length]!;
const month = (s: LifeState) => calendar(s).month;
/** Sends the player's own money to the family. */
const giveHome = (s: LifeState, amount: number) => {
  const a = Math.min(amount, Math.max(0, cash(s)));
  s.finance.cash -= a;
  s.family.savings += a;
  return a;
};
const setLifestyle = (s: LifeState, l: Lifestyle) => (s.finance.lifestyle = l);
const setAdvisor = (s: LifeState, a: AdvisorStyle | null) => {
  s.finance.advisor = a;
  if (a) s.finance.target = { ...ADVISOR[a].target };
};
const hold = (s: LifeState, k: keyof LifeState["finance"]["holdings"]) => s.finance.holdings[k];
/** Moves cash (then savings) into one asset, paying its buy cost. */
const putInto = (s: LifeState, k: keyof LifeState["finance"]["holdings"], amount: number) => {
  const f = s.finance;
  const fromCash = Math.min(amount, Math.max(0, f.cash));
  f.cash -= fromCash;
  const fromSav = Math.min(amount - fromCash, f.holdings.savings);
  f.holdings.savings -= fromSav;
  f.holdings[k] += (fromCash + fromSav) * (1 - ASSET_INFO[k].cost);
};
const liquid = (s: LifeState) => Math.max(0, cash(s)) + s.finance.holdings.savings;
const job = (s: LifeState) => s.after;
const stakeOf = (s: LifeState) => Math.round((worth(s) * 0.15) / 1000) * 1000;
const loanOf = (s: LifeState) => Math.round(Math.min(cash(s) * 0.3, 50_000 * country(s.residence.countryId).model.costIndex + cash(s) * 0.05) / 500) * 500;
const housePrice = (s: LifeState) => Math.round((140_000 * country(s.birthplace.countryId).model.costIndex) / 1000) * 1000;
const BRANDS = ["sportswear brand", "energy drink", "phone carrier", "car dealership", "bank", "snack company", "video game studio"] as const;
function endorsementValue(s: LifeState): number {
  const e = (s.exposure / 100) ** 2;
  const base = s.placement.node === "nba" ? 2_500_000 : s.placement.node === "g-league" ? 40_000 : 90_000 * country(s.placement.countryId).model.costIndex;
  return Math.max(1000, Math.round((base * e) / 500) * 500);
}
/** A stronger league that would bid for a starter, chosen without randomness. */
function bidTarget(s: LifeState): LeagueProfile | null {
  const cur = maybeLeague(s.placement.leagueId)?.model?.strength ?? 0;
  const lvl = performanceLevel(s);
  const options = [...domesticProLeagues(s.residence.countryId), ...foreignProLeagues(s.residence.countryId)]
    .filter((l) => l.model!.strength > cur + 3 && lvl >= l.model!.strength * 0.8 - 6 && l.id !== s.placement.leagueId)
    .sort((a, b) => a.model!.strength - b.model!.strength);
  return options.length ? options[hashString(`${s.seed}:bid:${Math.floor(s.ageMonths / 12)}`) % Math.min(3, options.length)]! : null;
}

/* ---------------------------------------------------------- templates */

export const EVENTS: EventTemplate[] = [
  // Infancy 0-5
  {
    id: "first-ball", ages: [1, 2.5], cooldown: 0, once: true, weight: () => 3, title: "A soft ball", tone: "good",
    body: "A relative brings a soft rubber ball. You carry it everywhere.",
    auto: ({ s }) => (ath(s, "coordination", 2), tr(s, "motivation", 2), "Coordination +2."),
  },
  {
    id: "toy-hoop", ages: [2, 4.5], cooldown: 0, once: true, weight: () => 3, title: "A toy hoop",
    body: (s) => `A toy hoop costs about ${usd(cost(s, 30))} at the market.`,
    choices: [
      { id: "buy", label: "Put it up in the hallway", preview: (s) => `Coordination and motivation up. Costs ${usd(cost(s, 30))}.`, blocked: (s) => afford(cost(s, 30))(s), growth: 2, apply: ({ s }) => (spend(s, cost(s, 30)), ath(s, "coordination", 3), tr(s, "motivation", 4), "You dunk on the hallway hoop a hundred times a day.") },
      { id: "save", label: "Save the money", preview: "No cost. No change.", growth: 0, apply: () => "The ball goes in a laundry basket instead." },
    ],
  },
  {
    id: "parent-pickup", ages: [3, 5.9], cooldown: 18, weight: (s) => (s.family.support === "low" ? 0 : 2), title: "Pickup games",
    body: "A parent plays pickup on weekends and asks if you want to come watch.",
    choices: [
      { id: "every", label: "Go every weekend", preview: "Motivation up. A little tired.", growth: 2, apply: ({ s }) => (tr(s, "motivation", 5), energy(s, -6), "You learn the rhythm of the game from the sideline.") },
      { id: "some", label: "Only sometimes", preview: "Small motivation gain.", growth: 1, apply: ({ s }) => (tr(s, "motivation", 2), "You go when the weather is nice.") },
    ],
  },
  {
    id: "swim-or-ball", ages: [4, 5.9], cooldown: 0, once: true, weight: () => 2, title: "Swimming or ball games",
    body: "There is room for one activity after school.",
    choices: [
      { id: "swim", label: "Swimming lessons", preview: "Stamina and durability up.", growth: 1, apply: ({ s }) => (ath(s, "stamina", 3), ath(s, "durability", 2), "You become a strong swimmer.") },
      { id: "ball", label: "Ball games", preview: "Coordination and handle up.", growth: 2, apply: ({ s }) => (ath(s, "coordination", 3), sk(s, "handle", 2), "You chase balls of every size.") },
    ],
  },
  {
    id: "new-sibling", ages: [1, 9], cooldown: 30, weight: (s) => (s.family.siblings >= 3 ? 0 : 1.2), title: "A new sibling", tone: "neutral",
    body: "A baby joins the family.",
    auto: ({ s }) => {
      s.family.siblings += 1;
      s.family.monthlyBudget = Math.round(s.family.monthlyBudget * 0.9);
      return "Less money and less sleep at home. Basketball budget down 10%.";
    },
  },
  {
    id: "winter-illness", ages: [0.5, 5.9], cooldown: 24, weight: () => 1, title: "A long illness", tone: "bad",
    body: "A bad flu keeps you in bed for weeks.",
    auto: ({ s }) => (health(s, -15), energy(s, -15), "Health and energy dip for a while."),
  },
  {
    id: "move-near-court", ages: [2, 7], cooldown: 0, once: true, weight: (s) => (s.family.courtAccess === "excellent" ? 0 : 1.5), title: "A new apartment",
    body: "Your parents find a place next to a public court. Rent is higher.",
    choices: [
      { id: "move", label: "Move", preview: (s) => `Better court access. Costs ${usd(cost(s, 400))} in moving costs.`, blocked: (s) => afford(cost(s, 400))(s), growth: 2, apply: ({ s }) => (spend(s, cost(s, 400)), upgradeCourt(s), "You can see the hoop from your window.") },
      { id: "stay", label: "Stay put", preview: "No cost.", growth: 0, apply: () => "You stay in the old neighborhood." },
    ],
  },
  {
    id: "climber", ages: [2, 4.5], cooldown: 0, once: true, weight: () => 1, title: "Climbs everything", tone: "good",
    body: "Tables, fences, trees. Nothing is safe.",
    auto: ({ s }) => (ath(s, "durability", 2), ath(s, "vertical", 1), "Durability +2."),
  },
  {
    id: "big-game-tv", ages: [4, 7], cooldown: 0, once: true, weight: () => 1.5, title: "A big game on TV", tone: "good",
    body: "The whole family watches a championship game. You don't blink.",
    auto: ({ s }) => (tr(s, "motivation", 6), "Motivation +6. You want to play."),
  },

  // Childhood 6-11
  {
    id: "mini-basket", ages: [6, 8.5], cooldown: 0, once: true, weight: (s) => (s.placement.node === "home" || s.placement.node === "playground" ? 3 : 0), title: "Mini-basketball sign-ups",
    body: "The school runs a mini-basketball group on lower hoops.",
    choices: [
      { id: "join", label: "Sign up", preview: "Joins a school team. Free.", growth: 2, apply: ({ s }) => (setYouthPlacement(s, "school-team", "School mini-basketball", 0), "You get a jersey two sizes too big.") },
      { id: "free", label: "Keep playing outside", preview: "No team yet. More free play.", growth: 1, apply: ({ s }) => (ath(s, "coordination", 2), "The neighborhood court stays your classroom.") },
    ],
  },
  {
    id: "other-sport", ages: [7, 12], cooldown: 30, weight: () => 1.5, title: "Another coach comes calling",
    body: "The football coach says you could be good at his sport too.",
    choices: [
      { id: "both", label: "Play both", preview: "Athleticism up. Less energy for basketball.", growth: 2, risk: 1, apply: ({ s }) => (ath(s, "acceleration", 3), ath(s, "lateral", 2), energy(s, -10), "Two sports, one tired kid. Your feet get quicker.") },
      { id: "hoops", label: "Basketball only", preview: "Motivation up.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "motivation", 4), "You tell him thanks, but no.") },
    ],
  },
  {
    id: "hoop-at-home", ages: [6, 11], cooldown: 0, once: true, weight: (s) => (s.family.means >= 2 ? 2 : 0.5), title: "A hoop in the yard",
    body: (s) => `A used hoop is for sale for about ${usd(cost(s, 150))}.`,
    choices: [
      { id: "buy", label: "Buy it", preview: (s) => `Shooting and handle up over time. Costs ${usd(cost(s, 150))}.`, blocked: (s) => afford(cost(s, 150))(s), growth: 2, apply: ({ s }) => (spend(s, cost(s, 150)), sk(s, "shooting", 3), sk(s, "handle", 2), (s.flags.homeHoop = true), "You shoot until the streetlights come on.") },
      { id: "skip", label: "Pass", preview: "No cost.", growth: 0, apply: () => "You keep walking to the public court." },
    ],
  },
  {
    id: "summer-camp", ages: [8, 12], cooldown: 12, weight: () => 1.6, title: "Summer camp",
    body: (s) => `A local basketball camp costs about ${usd(cost(s, 120))} for a week.`,
    choices: [
      { id: "camp", label: "Go to camp", preview: (s) => `Fundamentals up. Costs ${usd(cost(s, 120))}.`, blocked: (s) => afford(cost(s, 120))(s), growth: 2, apply: ({ s }) => (spend(s, cost(s, 120)), sk(s, "finishing", 2), sk(s, "handle", 2), sk(s, "passing", 1), "A week of drills and a camp T-shirt.") },
      { id: "trip", label: "Family trip instead", preview: "Energy and motivation up.", growth: 0, apply: ({ s }) => (energy(s, 15), tr(s, "motivation", 2), "You come back rested.") },
    ],
  },
  {
    id: "teased", ages: [8, 12], cooldown: 30, weight: () => 1.2, title: "Teased at school",
    body: (s) => `Kids make fun of you for being ${s.body.heightCm / Math.max(1, s.ageMonths / 12) > 13.5 ? "so tall" : "small"}.`,
    choices: [
      { id: "talk", label: "Talk to your coach", preview: "Composure up.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "composure", 5), "Your coach tells you about his own school days.") },
      { id: "angry", label: "Take it out on the court", preview: "Confidence up, discipline down.", growth: 1, risk: 1, apply: ({ s }) => (tr(s, "confidence", 5), tr(s, "discipline", -3), "You play with a chip on your shoulder.") },
      { id: "quit", label: "Stop going for a while", preview: "Motivation down.", growth: 0, risk: 0, apply: ({ s }) => (tr(s, "motivation", -6), energy(s, 8), "You skip practice for a month.") },
    ],
  },
  {
    id: "harsh-coach", ages: [8, 13], cooldown: 30, weight: (s) => (onTeam(s) ? 1.3 : 0), title: "A harsh coach",
    body: "Your coach yells at every mistake.",
    choices: [
      { id: "stay", label: "Stick it out", preview: "Discipline up, confidence down.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "discipline", 5), tr(s, "confidence", -4), "You learn to keep your head up.") },
      { id: "leave", label: "Find another team", preview: "Better coaching, small cost.", growth: 1, risk: 1, blocked: (s) => afford(cost(s, 100))(s), apply: ({ s }) => (spend(s, cost(s, 100)), (s.placement.coaching = clamp(s.placement.coaching + 6, 0, 95)), "The new coach explains things.") },
    ],
  },
  {
    id: "grades-slip", ages: [8, 17], cooldown: 24, weight: (s) => (s.education.academics < 55 ? 2 : 0.3), title: "Grades are slipping",
    body: (s) => `Your report card is weak (school ${Math.round(s.education.academics)}/100). Your parents want a plan.`,
    choices: [
      { id: "study", label: "Cut basketball time", preview: "School up. Workload drops to low for four months.", growth: 0, risk: 0, apply: ({ s }) => (acad(s, 10), restLow(s, 4), "Homework before the court. Workload set to low for four months.") },
      { id: "ignore", label: "Promise to do better", preview: "School down. Family support may slip.", growth: 1, risk: 2, apply: ({ s, rolls }) => (acad(s, -4), rolls[0]! < 0.5 && s.family.support !== "low" ? ((s.family.support = s.family.support === "high" ? "medium" : "low"), "Your parents are unhappy. Family support drops.") : "Nobody checks. This time.") },
    ],
  },
  {
    id: "bike-fall", ages: [6, 12], cooldown: 0, once: true, weight: () => 0.8, title: "Bike crash", tone: "bad",
    body: "You fall off your bike and hurt your wrist.",
    choices: [
      { id: "rest", label: "Rest it fully", preview: "Out about 2 months. Heals clean.", growth: 0, risk: 0, apply: ({ s, entryId }) => (inflictInjury(s, "wrist", "Broken wrist", 2, 2, entryId), "Cast on, ball away.") },
      { id: "lefty", label: "Dribble with the other hand", preview: "Out about 2 months. Off hand gets better.", growth: 2, risk: 1, apply: ({ s, entryId }) => (inflictInjury(s, "wrist", "Broken wrist", 2, 2, entryId), sk(s, "handle", 4), "You come back with two good hands.") },
    ],
  },
  {
    id: "court-closes", ages: [7, 14], cooldown: 0, once: true, weight: (s) => (s.family.courtAccess === "poor" ? 0 : 0.8), title: "The court closes",
    body: "The city fences off your neighborhood court for repairs.",
    choices: [
      { id: "travel", label: "Take the bus to another court", preview: "Energy down. Keep your reps.", growth: 1, risk: 0, apply: ({ s }) => (energy(s, -8), tr(s, "discipline", 3), "Forty minutes each way.") },
      { id: "wait", label: "Wait it out", preview: "Lose some momentum.", growth: 0, risk: 0, apply: ({ s }) => (tr(s, "motivation", -3), "You play video games for a month.") },
    ],
  },
  {
    id: "older-kids", ages: [9, 13], cooldown: 18, weight: () => 1.5, title: "The older kids' game",
    body: "The teenagers at the court need a fifth.",
    choices: [
      { id: "play", label: "Play every day", preview: "Toughness and IQ up. Small injury risk.", growth: 2, risk: 2, apply: ({ s, rolls, entryId }) => {
        sk(s, "iq", 2); sk(s, "decisions", 2); tr(s, "confidence", 3);
        if (rolls[0]! < 0.15) {
          inflictInjury(s, "ankle-sprain", "Sprained ankle", 1, 1, entryId);
          return "You hold your own, then land on someone's foot.";
        }
        return "You get knocked down and get back up.";
      } },
      { id: "own", label: "Stick with your age group", preview: "Safer, slower.", growth: 1, risk: 0, apply: ({ s }) => (sk(s, "finishing", 1), "You dominate kids your age.") },
    ],
  },
  {
    id: "favorite-style", ages: [6, 10], cooldown: 0, once: true, weight: () => 1.5, title: "A favorite player",
    body: "You pick a player to copy in the driveway.",
    choices: [
      { id: "shooter", label: "The shooter", preview: "Shooting up.", growth: 1, apply: ({ s }) => (sk(s, "shooting", 3), "You copy his release.") },
      { id: "passer", label: "The passer", preview: "Passing up.", growth: 1, apply: ({ s }) => (sk(s, "passing", 3), "No-look passes into the bushes.") },
      { id: "big", label: "The big man", preview: "Rebounding up.", growth: 1, apply: ({ s }) => (sk(s, "rebounding", 3), "You box out your little cousin.") },
    ],
  },
  {
    id: "money-tight", ages: [6, 17], cooldown: 30, weight: (s) => (s.family.means <= 2 ? 2 : 0.2), title: "Money is tight",
    body: "A parent's hours get cut. The family looks at every expense.",
    choices: [
      { id: "skip", label: "Skip club fees this year", preview: "Saves money. Less coaching.", growth: 0, risk: 0, apply: ({ s }) => ((s.placement.coaching = clamp(s.placement.coaching - 8, 10, 95)), (s.family.savings += cost(s, 200)), "You train alone more often.") },
      { id: "work", label: "Help at a part-time job", preview: "Energy down, discipline up, money in.", growth: 0, risk: 1, blocked: (s) => (age(s) < 12 ? "Too young to work." : null), apply: ({ s }) => (energy(s, -10), tr(s, "discipline", 4), (s.family.savings += cost(s, 300)), "Weekends at the shop.") },
      { id: "shifts", label: "Parent picks up extra shifts", preview: "Money holds. Family support may dip.", growth: 1, risk: 1, apply: ({ s, rolls }) => ((s.family.savings += cost(s, 150)), rolls[0]! < 0.3 && s.family.support === "high" ? ((s.family.support = "medium"), "Your parent is exhausted. Support drops a notch.") : "Your parent works nights so you can keep playing.") },
    ],
  },
  {
    id: "first-tournament", ages: [8, 12], cooldown: 0, once: true, weight: (s) => (onTeam(s) ? 2 : 0), title: "First tournament",
    body: "Your team reaches the final. Tie game, last possession, ball in your hands.",
    choices: [
      { id: "shoot", label: "Take the shot", preview: "Confidence swings either way.", growth: 2, risk: 1, apply: ({ s, rolls }) => (rolls[0]! < 0.45 ? (tr(s, "confidence", 8), (s.flags.clutch = true), "It drops. Your teammates pile on you.") : (tr(s, "confidence", -4), tr(s, "composure", 3), "It rims out. You learn something about pressure.")) },
      { id: "pass", label: "Find the open teammate", preview: "Passing and IQ up.", growth: 1, risk: 0, apply: ({ s, rolls }) => (sk(s, "passing", 2), sk(s, "iq", 1), rolls[0]! < 0.4 ? "Your teammate scores. Coach notices the pass." : "He misses. Coach still likes the pass.") },
    ],
  },
  {
    id: "glasses", ages: [7, 12], cooldown: 0, once: true, weight: () => 0.6, title: "Eye exam", tone: "good",
    body: "The school nurse says you need glasses.",
    auto: ({ s }) => (sk(s, "shooting", 3), "The rim looks a lot sharper now. Shooting +3."),
  },
  {
    id: "parent-job", ages: [6, 15], cooldown: 0, once: true, weight: (s) => (s.residence.localityKind === "capital" ? 0 : 1), title: "A job in the capital",
    body: (s) => `A parent is offered a better job in ${country(s.residence.countryId).capital ?? "the capital"}.`,
    choices: [
      { id: "move", label: "Move to the city", preview: "Better courts and coaching. You leave your friends.", growth: 2, risk: 1, apply: ({ s }) => {
        const c = country(s.residence.countryId);
        s.residence = { countryId: c.id, locality: c.capital ?? "the capital", localityKind: "capital" };
        upgradeCourt(s);
        s.placement.coaching = clamp(s.placement.coaching + 5, 0, 95);
        s.family.monthlyBudget = Math.round(s.family.monthlyBudget * 1.15);
        return "New city, new courts, more coaches.";
      } },
      { id: "stay", label: "Stay home", preview: "Family support up.", growth: 0, risk: 0, apply: ({ s }) => ((s.family.support = s.family.support === "low" ? "medium" : "high"), "Your parent turns it down. The family stays close.") },
    ],
  },

  // Youth 12-17
  {
    id: "federation-camp", ages: [13, 16.5], cooldown: 12, weight: (s) => (country(s.residence.countryId).federation && performanceLevel(s) >= cohortLevel(age(s)) * 1.05 ? 1.8 : 0), title: "National youth camp",
    body: (s) => `${country(s.residence.countryId).federation!.name} invites you to an under-16 selection camp.`,
    choices: [
      { id: "go", label: "Go", preview: (s) => `Exposure up. Costs about ${usd(cost(s, 150))}.`, blocked: (s) => afford(cost(s, 150))(s), growth: 2, risk: 1, apply: ({ s, rolls }) => {
        spend(s, cost(s, 150));
        expo(s, 6);
        if (rolls[0]! < 0.5 + (performanceLevel(s) - cohortLevel(age(s))) / 40) {
          s.flags.youthNational = s.ageMonths;
          evidence(s, `Made the ${country(s.residence.countryId).name} youth national team at ${Math.floor(age(s))}`, 8);
          return "You make the final roster.";
        }
        return "You get cut on the last day, but coaches know your name now.";
      } },
      { id: "skip", label: "Skip it", preview: "Rest instead.", growth: 0, risk: 0, apply: ({ s }) => (energy(s, 10), "You spend the week resting.") },
    ],
  },
  {
    id: "bwb-invite", ages: [14.5, 17.9], cooldown: 0, once: true,
    weight: (s) => (s.residence.countryId !== "US" && s.exposure >= 28 && performanceLevel(s) >= cohortLevel(age(s)) * 1.1 ? 2.5 : 0),
    title: "Basketball Without Borders",
    body: "You are invited to a Basketball Without Borders camp. The NBA, FIBA and federations pick campers by invitation.",
    choices: [
      { id: "go", label: "Accept the invitation", preview: "Big exposure gain. Counts as a camp invite.", growth: 3, risk: 0, apply: ({ s }) => {
        expo(s, 14);
        s.achievements.campInvite = s.ageMonths;
        evidence(s, `Basketball Without Borders camper at ${Math.floor(age(s))}`, 12);
        return "NBA coaches run your drills for three days.";
      } },
      { id: "decline", label: "Decline", preview: "No change.", growth: 0, risk: 0, apply: () => "You stay home with your team." },
    ],
  },
  {
    id: "growth-spurt", ages: [11.5, 15.5], cooldown: 0, once: true, weight: () => 2, title: "Growth spurt",
    body: (s) => `You grew fast this year. You are ${Math.round(s.body.heightCm)} cm now and your knees ache.`,
    choices: [
      { id: "ease", label: "Ease off for a few months", preview: "Workload drops to low for three months. Fewer injuries.", growth: 0, risk: 0, apply: ({ s }) => (restLow(s, 3), health(s, 8), "Workload set to low for three months while your body catches up.") },
      { id: "push", label: "Keep pushing", preview: "Skills keep coming. Injury risk rises.", growth: 2, risk: 2, follow: { id: "knee-ache", delay: 3 }, apply: ({ s }) => (sk(s, "finishing", 2), energy(s, -8), "You play through the soreness.") },
    ],
  },
  {
    id: "knee-ache", ages: [11, 18], cooldown: 0, followUpOnly: true, weight: () => 1, title: "Knee pain", tone: "bad",
    body: "The soreness from your growth spurt did not go away.",
    auto: ({ s, rolls, entryId }) => (rolls[0]! < 0.55 ? (inflictInjury(s, "osgood", "Knee tendon irritation", 2, 1, entryId), "A doctor tells you to rest.") : "It fades on its own."),
  },
  {
    id: "clumsy-phase", ages: [12, 15], cooldown: 0, once: true, weight: (s) => (s.growth.pubertyOffsetMonths < 6 ? 1.2 : 0.4), title: "Clumsy phase", tone: "bad",
    body: "Your arms and legs are longer than you are used to.",
    auto: ({ s }) => (ath(s, "coordination", -3), "Coordination -3 for now. It usually comes back."),
  },
  {
    id: "travel-circuit", ages: [13, 17.5], cooldown: 12, weight: (s) => (s.residence.countryId === "US" ? 2.2 : s.exposure >= 20 ? 0.8 : 0), title: "Summer travel circuit",
    body: (s) => `A travel team invites you for the summer circuit. Travel costs about ${usd(cost(s, 1500))}.`,
    choices: [
      { id: "join", label: "Join", preview: (s) => `Exposure up a lot. Costs ${usd(cost(s, 1500))}. Tiring.`, blocked: (s) => afford(cost(s, 1500))(s), growth: 2, risk: 1, apply: ({ s }) => (spend(s, cost(s, 1500)), expo(s, 9), energy(s, -12), evidence(s, `Summer travel circuit at ${Math.floor(age(s))}`, 4), "Gyms full of college coaches.") },
      { id: "skip", label: "Train at home", preview: "Rest and skills.", growth: 1, risk: 0, apply: ({ s }) => (sk(s, "shooting", 1), energy(s, 8), "You get shots up at home.") },
    ],
  },
  {
    id: "private-trainer", ages: [13, 22], cooldown: 24, weight: (s) => (s.family.means >= 3 || s.earnings > 0 ? 1.5 : 0.5), title: "A private trainer",
    body: (s) => `A skills trainer offers twice-weekly sessions for about ${usd(cost(s, 900))} a year.`,
    choices: [
      { id: "hire", label: "Hire him", preview: (s) => `Coaching quality up this year. Costs ${usd(cost(s, 900))}.`, blocked: (s) => afford(cost(s, 900))(s), growth: 2, risk: 0, follow: { id: "trainer-results", delay: 6 }, apply: ({ s }) => (spend(s, cost(s, 900)), (s.placement.coaching = clamp(s.placement.coaching + 8, 0, 95)), "Footwork drills at 6 a.m.") },
      { id: "self", label: "Train yourself", preview: "No cost.", growth: 0, risk: 0, apply: ({ s }) => (tr(s, "discipline", 2), "YouTube drills it is.") },
    ],
  },
  {
    id: "trainer-results", ages: [13, 23], cooldown: 0, followUpOnly: true, weight: () => 1, title: "Trainer check-in", tone: "good",
    body: "Six months with the trainer.",
    auto: ({ s }) => (sk(s, "handle", 2), sk(s, "shooting", 2), "Your handle and shot are tighter. Handle +2, shooting +2."),
  },
  {
    id: "highlight-clip", ages: [14, 19], cooldown: 24, weight: (s) => (onTeam(s) ? 1.3 : 0), title: "Your clip gets shared",
    body: "A dunk from last week is all over the group chats.",
    choices: [
      { id: "lean", label: "Post more highlights", preview: "Exposure up. Composure may suffer.", growth: 1, risk: 1, follow: { id: "online-backlash", delay: 3 }, apply: ({ s }) => (expo(s, 6), tr(s, "confidence", 4), "Your followers triple.") },
      { id: "quiet", label: "Keep your head down", preview: "Discipline up.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "discipline", 3), "You let it fade.") },
    ],
  },
  {
    id: "online-backlash", ages: [14, 30], cooldown: 0, followUpOnly: true, weight: () => 1, title: "The comments turn",
    body: "After a bad game, the comments under your highlights get ugly.",
    auto: ({ s, rolls }) => (rolls[0]! < 0.5 ? (tr(s, "composure", -4), tr(s, "confidence", -3), "It gets to you. Composure -4.") : (tr(s, "composure", 3), "You mute it and move on. Composure +3.")),
  },
  {
    id: "party", ages: [15, 19], cooldown: 18, weight: () => 1.2, title: "A party before a big game",
    body: "Friends are going out the night before a tournament.",
    choices: [
      { id: "go", label: "Go for an hour", preview: "Confidence up, energy down. Some risk.", growth: 0, risk: 2, apply: ({ s, rolls }) => (energy(s, -12), tr(s, "confidence", 3), rolls[0]! < 0.25 ? (tr(s, "discipline", -4), "An hour turns into four. You play badly.") : "You leave early. Nobody notices.") },
      { id: "home", label: "Stay home", preview: "Discipline up.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "discipline", 3), "Early night.") },
    ],
  },
  {
    id: "position-change", ages: [14, 20], cooldown: 30, weight: (s) => (onTeam(s) ? 1.2 : 0), title: "A new position",
    body: "Your coach wants to move you to a new spot on the floor.",
    choices: [
      { id: "accept", label: "Learn the new role", preview: "IQ and decisions up. Coachability up.", growth: 2, risk: 0, apply: ({ s }) => (sk(s, "iq", 2), sk(s, "decisions", 2), tr(s, "coachability", 3), "Your coach trusts you more.") },
      { id: "push", label: "Push back", preview: "Confidence up, coachability down.", growth: 0, risk: 1, apply: ({ s }) => (tr(s, "confidence", 3), tr(s, "coachability", -5), "You stay where you are. Your coach remembers.") },
    ],
  },
  {
    id: "play-through-pain", ages: [13, 30], cooldown: 30, weight: (s) => (onTeam(s) && !s.condition.injury ? 0.9 : 0), title: "Pain before a big game",
    body: "Your ankle has been sore all week. Tonight matters.",
    choices: [
      { id: "play", label: "Play through it", preview: "Exposure up. Injury risk.", growth: 1, risk: 3, follow: { id: "pain-aftermath", delay: 1 }, apply: ({ s }) => (expo(s, 4), tr(s, "confidence", 3), "You tape it tight and play 30 minutes.") },
      { id: "sit", label: "Sit out", preview: "Safe. Coach may be unhappy.", growth: 0, risk: 0, apply: ({ s }) => (health(s, 6), "You watch from the bench in street clothes.") },
    ],
  },
  {
    id: "pain-aftermath", ages: [13, 31], cooldown: 0, followUpOnly: true, weight: () => 1, title: "The ankle", tone: "bad",
    body: "The ankle you played on last month.",
    auto: ({ s, rolls, entryId }) => (rolls[0]! < 0.45 ? (inflictInjury(s, "ankle-sprain", "Badly sprained ankle", 2, 2, entryId), "It gives out in practice.") : "It holds up."),
  },
  {
    id: "exams", ages: [14, 18], cooldown: 12, weight: (s) => (s.education.level !== "done" ? 1.3 : 0), title: "Exams or a tournament",
    body: "Final exams fall on the same weekend as a showcase tournament.",
    choices: [
      { id: "study", label: "Take the exams", preview: "School up.", growth: 0, risk: 0, apply: ({ s }) => (acad(s, 8), "You pass everything.") },
      { id: "play", label: "Play the tournament", preview: "Exposure up. School down.", growth: 1, risk: 1, apply: ({ s }) => (expo(s, 5), acad(s, -6), "Scouts see you; your teachers don't.") },
    ],
  },
  {
    id: "poach", ages: [13, 17], cooldown: 24, weight: (s) => (s.placement.node === "local-club" && performanceLevel(s) > cohortLevel(age(s)) ? 1.5 : 0), title: "A rival club calls",
    body: "A stronger club in the region wants you next season.",
    choices: [
      { id: "move", label: "Switch clubs", preview: "Better coaching. Harder minutes.", growth: 2, risk: 1, apply: ({ s }) => ((s.placement.coaching = clamp(s.placement.coaching + 7, 0, 95)), "New colors, tougher practices.") },
      { id: "stay", label: "Stay loyal", preview: "Confidence and role stay.", growth: 0, risk: 0, apply: ({ s }) => (tr(s, "confidence", 3), "Your coach makes you captain.") },
    ],
  },
  {
    id: "weight-room", ages: [13.5, 16.5], cooldown: 0, once: true, weight: () => 1.6, title: "First time in the weight room",
    body: "Your team gets access to a weight room.",
    choices: [
      { id: "learn", label: "Learn proper form", preview: "Strength and durability up.", growth: 1, risk: 0, apply: ({ s }) => (ath(s, "strength", 3), ath(s, "durability", 2), "A coach fixes your squat.") },
      { id: "max", label: "Max out with friends", preview: "More strength. Injury risk.", growth: 2, risk: 3, apply: ({ s, rolls, entryId }) => (ath(s, "strength", 5), rolls[0]! < 0.3 ? (inflictInjury(s, "back-spasms", "Back strain", 1, 1, entryId), "Your back seizes up.") : "Nobody gets hurt. This time.") },
    ],
  },
  {
    id: "family-abroad", ages: [12, 16], cooldown: 0, once: true, weight: (s) => (s.family.means >= 3 ? 0.5 : 0.1), title: "A job abroad",
    body: (s) => `A parent's company offers a transfer to ${country(familyMoveTarget(s)).name}.`,
    choices: [
      { id: "move", label: "Move with the family", preview: (s) => `You grow up in ${country(familyMoveTarget(s)).name}. New leagues, new language.`, growth: 2, risk: 2, apply: ({ s }) => {
        const to = country(familyMoveTarget(s));
        s.residence = { countryId: to.id, locality: to.capital ?? to.name, localityKind: "capital" };
        s.placement = { ...s.placement, node: s.placement.node === "home" ? "home" : "local-club", countryId: to.id, leagueId: null, teamName: `${to.capital ?? to.name} club`, coaching: to.model.coachingAccess * 0.85, costPerYear: Math.round(400 * to.model.costIndex) };
        tr(s, "composure", 3);
        return `You move to ${to.name}. Your birthplace stays ${country(s.birthplace.countryId).name}.`;
      } },
      { id: "stay", label: "Stay behind", preview: "Nothing changes.", growth: 0, risk: 0, apply: () => "The family turns it down." },
    ],
  },
  {
    id: "scout-in-stands", ages: [15, 19], cooldown: 12, weight: (s) => (onTeam(s) && s.exposure >= 10 ? 1.4 : 0), title: "A scout in the stands",
    body: "Your coach says a scout is here tonight.",
    choices: [
      { id: "normal", label: "Play your game", preview: "Steady. Small exposure gain.", growth: 1, risk: 0, apply: ({ s }) => (expo(s, 3), "You play like any other night.") },
      { id: "force", label: "Try to impress", preview: "Bigger gain or a bad night.", growth: 2, risk: 2, apply: ({ s, rolls }) => (rolls[0]! < 0.4 + (s.traits.composure - 50) / 200 ? (expo(s, 7), tr(s, "confidence", 3), "Thirty points. The scout stays after.") : (tr(s, "confidence", -3), "Six turnovers. The scout leaves at halftime.")) },
    ],
  },
  {
    id: "burnout", ages: [13, 30], cooldown: 36, weight: (s) => (s.condition.energy < 25 ? 1.5 : s.condition.energy < 50 && s.plan.workload === "high" ? 0.6 : 0), title: "Burned out",
    body: "You dread practice. Everything feels heavy.",
    choices: [
      { id: "rest", label: "Take a month off", preview: "Energy and motivation recover. Skills pause.", growth: 0, risk: 0, apply: ({ s }) => (energy(s, 35), tr(s, "motivation", 4), restLow(s, 2), "You sleep and see friends. Workload set to low for two months.") },
      { id: "push", label: "Push through", preview: "Motivation drops.", growth: 1, risk: 2, apply: ({ s }) => (tr(s, "motivation", -6), "You go through the motions.") },
    ],
  },
  {
    id: "mentor", ages: [13, 18], cooldown: 0, once: true, weight: () => 1, title: "A mentor",
    body: "A retired pro who lives nearby offers to work with you.",
    choices: [
      { id: "yes", label: "Accept", preview: "IQ and composure up.", growth: 2, risk: 0, apply: ({ s }) => (sk(s, "iq", 3), tr(s, "composure", 4), "He teaches you how to read a defense.") },
      { id: "no", label: "Politely decline", preview: "No change.", growth: 0, risk: 0, apply: () => "You thank him and keep doing your thing." },
    ],
  },
  {
    id: "apparel-deal", ages: [16, 21], cooldown: 0, once: true, weight: (s) => (s.exposure >= 45 ? 1.5 : 0), title: "An apparel deal",
    body: "A small apparel brand offers a name-and-likeness deal.",
    choices: [
      { id: "take", label: "Sign it", preview: (s) => `About ${usd(cost(s, 3000))} to your family.`, growth: 0, risk: 1, apply: ({ s }) => ((s.family.savings += cost(s, 3000)), tr(s, "confidence", 2), "New shoes and money in the bank.") },
      { id: "pass", label: "Turn it down", preview: "Focus stays on the court.", growth: 0, risk: 0, apply: ({ s }) => (tr(s, "discipline", 2), "Not yet.") },
    ],
  },
  {
    id: "nutrition", ages: [14, 24], cooldown: 30, weight: () => 1, title: "What you eat",
    body: (s) => `A nutritionist offers a plan for about ${usd(cost(s, 300))}.`,
    choices: [
      { id: "plan", label: "Follow a plan", preview: (s) => `Strength and stamina up. Costs ${usd(cost(s, 300))}.`, blocked: (s) => afford(cost(s, 300))(s), growth: 2, risk: 0, apply: ({ s }) => (spend(s, cost(s, 300)), ath(s, "strength", 2), ath(s, "stamina", 2), "Less fried food, more sleep.") },
      { id: "whatever", label: "Eat whatever", preview: "No cost.", growth: 0, risk: 0, apply: () => "You eat what everyone else eats." },
    ],
  },
  {
    id: "honor-roll", ages: [12, 18], cooldown: 24, weight: (s) => (s.education.academics >= 72 ? 1.2 : 0), title: "Honor roll", tone: "good",
    body: "Your grades put you on the honor roll.",
    auto: ({ s }) => (acad(s, 3), expo(s, 1), "College coaches like that. School +3."),
  },
  {
    id: "school-dropout-risk", ages: [15, 17.9], cooldown: 0, once: true, weight: (s) => (s.education.academics < 30 && s.family.means <= 2 ? 1.5 : 0), title: "Leave school?",
    body: "You could leave school to work and play club ball on the side.",
    choices: [
      { id: "stay", label: "Stay in school", preview: "Keeps college options open.", growth: 0, risk: 0, apply: ({ s }) => (acad(s, 5), "You stay. It is hard.") },
      { id: "leave", label: "Leave school", preview: "Money now. NCAA route closes.", growth: 0, risk: 2, apply: ({ s }) => ((s.education.level = "done"), (s.education.ncaaEligible = false), (s.family.savings += cost(s, 600)), "You start working. College is off the table.") },
    ],
  },

  // Emerging 18-24
  {
    id: "agent-call", ages: [17.5, 30], cooldown: 0, followUpOnly: true, weight: () => 1, title: "Your agent checks in", tone: "good",
    body: "Your agent has been busy.",
    auto: ({ s }) => (expo(s, 6), "Teams abroad are asking about you. Exposure +6."),
  },
  {
    id: "late-salary", ages: [18, 32], cooldown: 30, weight: (s) => (isPro(s) && s.placement.node !== "nba" && s.placement.node !== "g-league" && country(s.placement.countryId).income.level !== "HIC" ? 1.4 : isPro(s) ? 0.3 : 0), title: "Paychecks are late",
    body: "Your club is two months behind on salary.",
    choices: [
      { id: "wait", label: "Wait it out", preview: "Keep your spot. Money may not come.", growth: 0, risk: 1, apply: ({ s, rolls }) => (rolls[0]! < 0.6 ? "The money arrives eventually." : ((s.earnings -= salary(s) / 6), (s.finance.cash = Math.max(0, cash(s) - salary(s) / 8)), "Some of it never comes.")) },
      { id: "leave", label: "Ask for your release", preview: "You become a free agent.", growth: 0, risk: 2, apply: ({ s }) => ((s.placement = { ...s.placement, node: "unattached", leagueId: null, teamName: null, role: "none", contract: null, costPerYear: 0 }), (s.flags.reviewSoon = true), "You pack your bags. Offers will come at the next window.") },
    ],
  },
  {
    id: "homesick", ages: [14, 30], cooldown: 24, weight: (s) => (s.residence.countryId !== s.birthplace.countryId ? 2 : 0), title: "Homesick",
    body: (s) => `You miss ${country(s.birthplace.countryId).name}. The food, the language, your family.`,
    choices: [
      { id: "fly", label: "Fly home for a week", preview: (s) => `Motivation up. Costs ${usd(cost(s, 800))}.`, blocked: (s) => afford(800)(s), growth: 0, risk: 0, apply: ({ s }) => (spend(s, 800), tr(s, "motivation", 6), energy(s, 10), "Your mother cooks for three days straight.") },
      { id: "push", label: "Push through", preview: "Discipline up, motivation down.", growth: 1, risk: 1, apply: ({ s }) => (tr(s, "discipline", 3), tr(s, "motivation", -4), "Long video calls at odd hours.") },
    ],
  },
  {
    id: "language", ages: [14, 32], cooldown: 0, once: true, weight: (s) => (s.residence.countryId !== s.birthplace.countryId ? 1.5 : 0), title: "Language classes",
    body: "Your team offers language lessons twice a week.",
    choices: [
      { id: "learn", label: "Take them seriously", preview: "IQ and coachability up. Tiring.", growth: 2, risk: 0, apply: ({ s }) => (sk(s, "iq", 2), tr(s, "coachability", 4), energy(s, -5), "You start understanding timeouts.") },
      { id: "skip", label: "Get by with gestures", preview: "No change.", growth: 0, risk: 0, apply: () => "Point, nod, run." },
    ],
  },
  {
    id: "new-coach", ages: [17, 32], cooldown: 24, weight: (s) => (["university", "domestic-pro", "foreign-pro", "g-league"].includes(s.placement.node) ? 1.2 : 0), title: "A new head coach",
    body: "The team fires its coach. The new one does not know you.",
    choices: [
      { id: "earn", label: "Earn it in practice", preview: "Discipline up. Role may grow.", growth: 1, risk: 0, apply: ({ s, rolls }) => (tr(s, "discipline", 3), rolls[0]! < 0.5 ? (bumpRole(s, 1), "He moves you up the rotation.") : "He takes his time deciding.") },
      { id: "ask", label: "Ask about your minutes", preview: "Could go either way.", growth: 0, risk: 2, apply: ({ s, rolls }) => (rolls[0]! < 0.4 ? (bumpRole(s, 1), "He likes the directness. More minutes.") : (bumpRole(s, -1), "He does not like the question.")) },
    ],
  },
  {
    id: "national-team", ages: [18, 34], cooldown: 10, weight: (s) => { const nat = nationalTeam(s); return nat && [11, 2].includes(month(s)) && performanceLevel(s) >= seniorBar(s, nat) - 3 ? 2 : 0; }, title: "Qualifying window",
    body: (s) => `${country(nationalTeam(s)!).federation!.name} calls you up for two World Cup qualifiers. ${s.placement.node === "nba" ? "NBA teams rarely release players mid-season." : "Your club has to release you for the window."}`,
    choices: [
      { id: "play", label: "Play for your country", preview: "Two caps and exposure. Tiring travel. Small injury risk.", blocked: (s) => (s.placement.node === "nba" ? "Your NBA team won't release you during the season." : s.condition.injury ? "You're injured." : null), growth: 2, risk: 2, apply: ({ s, rolls, entryId }) => {
        const nat = nationalTeam(s)!;
        expo(s, 4); energy(s, -10);
        s.international.countryId ??= nat;
        s.international.caps += 2;
        evidence(s, `Played World Cup qualifiers for ${country(nat).name} at ${Math.floor(age(s))}`, 6);
        if (rolls[0]! < 0.08) inflictInjury(s, "hamstring", "Hamstring strain", 1, 1, entryId);
        return rolls[1]! < 0.5 ? "Two games, two wins. You hear your anthem before tip-off." : "A split. You start the second game.";
      } },
      { id: "rest", label: "Stay with your club", preview: "Energy up. The federation notices.", growth: 0, risk: 0, apply: ({ s }) => (energy(s, 10), (s.international.declined += 1), "You stay and rest.") },
    ],
  },
  {
    id: "draft-workouts", ages: [18.5, 23], cooldown: 0, once: true, weight: (s) => (s.draft.declaredYear !== null ? 3 : 0), title: "Pre-draft workouts",
    body: "Teams want you in for workouts before the draft.",
    choices: [
      { id: "all", label: "Do every workout", preview: "Exposure up. Exhausting.", growth: 2, risk: 1, apply: ({ s }) => (expo(s, 8), energy(s, -15), "Twelve cities in three weeks.") },
      { id: "few", label: "Pick a few teams", preview: "Smaller gain. Stay fresh.", growth: 1, risk: 0, apply: ({ s }) => (expo(s, 3), "You visit teams that need your position.") },
    ],
  },
  {
    id: "bad-game-viral", ages: [17, 32], cooldown: 24, weight: (s) => (isPro(s) || s.placement.node === "university" ? 1 : 0), title: "A bad game goes viral",
    body: "Your airball is everywhere.",
    choices: [
      { id: "reply", label: "Reply online", preview: "Composure down.", growth: 0, risk: 2, apply: ({ s }) => (tr(s, "composure", -4), "It makes things worse.") },
      { id: "silent", label: "Let your play talk", preview: "Composure up.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "composure", 4), "You go 6 for 8 the next night.") },
    ],
  },
  {
    id: "rehab-plan", ages: [10, 34], cooldown: 12, weight: (s) => (s.condition.injury && s.condition.injury.severity >= 2 ? 3 : 0), title: "Rehab plan",
    body: (s) => `Doctors give you two options for the ${s.condition.injury?.label.toLowerCase() ?? "injury"}.`,
    choices: [
      { id: "slow", label: "Conservative rehab", preview: "One extra month out. Safe.", growth: 0, risk: 0, apply: ({ s }) => (s.condition.injury && (s.condition.injury.monthsLeft += 1), ath(s, "durability", 2), "You take your time.") },
      { id: "fast", label: "Aggressive return", preview: "Back a month sooner. Re-injury risk.", growth: 1, risk: 3, follow: { id: "reinjury", delay: 2 }, apply: ({ s }) => (s.condition.injury && (s.condition.injury.monthsLeft = Math.max(1, s.condition.injury.monthsLeft - 1)), "You push the timeline.") },
    ],
  },
  {
    id: "reinjury", ages: [10, 35], cooldown: 0, followUpOnly: true, weight: () => 1, title: "Back too soon?", tone: "bad",
    body: "The rushed return.",
    auto: ({ s, rolls, entryId }) => (rolls[0]! < 0.35 && !s.condition.injury ? (inflictInjury(s, "setback", "Setback in rehab", 2, 2, entryId), "It flares up again.") : "You hold up fine."),
  },
  {
    id: "family-help", ages: [18, 34], cooldown: 24, weight: (s) => (s.earnings > 0 && s.family.means <= 2 ? 2 : 0), title: "Family asks for help",
    body: "Your family needs money for repairs and school fees.",
    choices: [
      { id: "send", label: "Send money home", preview: (s) => `About ${usd(Math.min(cash(s), cost(s, 2000)))} from your account. Family support up.`, blocked: (s) => (cash(s) < 200 ? "You have nothing to send right now." : null), growth: 0, risk: 0, apply: ({ s }) => (giveHome(s, cost(s, 2000)), (s.family.support = "high"), tr(s, "motivation", 3), "They are proud of you.") },
      { id: "save", label: "Save it", preview: "Keep your savings.", growth: 0, risk: 1, apply: () => "You explain you need a cushion." },
    ],
  },
  {
    id: "night-out", ages: [18, 30], cooldown: 18, weight: (s) => (isPro(s) || s.placement.node === "university" ? 1 : 0), title: "Teammates go out",
    body: "The team is going out after a win.",
    choices: [
      { id: "join", label: "Join them", preview: "Chemistry and confidence up. Energy down.", growth: 0, risk: 1, apply: ({ s }) => (tr(s, "confidence", 3), energy(s, -8), "You bond with the veterans.") },
      { id: "home", label: "Go home", preview: "Discipline up.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "discipline", 2), "Ice bath and bed.") },
    ],
  },
  {
    id: "transfer", ages: [18.5, 22.5], cooldown: 0, once: true, weight: (s) => (s.placement.node === "university" && ["bench", "deep-bench"].includes(s.placement.role) ? 2.5 : 0), title: "Transfer portal",
    body: "You barely play. Other programs would give you minutes.",
    choices: [
      { id: "go", label: "Transfer", preview: "Bigger role, less exposure.", growth: 1, risk: 1, apply: ({ s }) => ((s.placement.teamName = `${s.placement.teamName?.split(" ")[0] ?? "Valley"} Tech`), bumpRole(s, 2), (s.placement.coaching = clamp(s.placement.coaching - 6, 0, 95)), expo(s, -3), "New school, real minutes.") },
      { id: "stay", label: "Stay and fight", preview: "Discipline up.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "discipline", 4), "You outwork everyone in practice.") },
    ],
  },
  {
    id: "buyout", ages: [19, 27], cooldown: 0, once: true, weight: (s) => (s.placement.node === "foreign-pro" || s.placement.node === "domestic-pro" ? (["star", "starter"].includes(s.placement.role) && currentLevel(s) >= 64 ? 2 : 0) : 0), title: "NBA teams are calling",
    body: "Your club has a buyout clause. NBA scouts have been at your games.",
    choices: [
      { id: "buy", label: "Negotiate the buyout", preview: (s) => `Opens NBA camp offers. You pay about ${usd(Math.max(5000, salary(s) * 0.25))} of it.`, growth: 2, risk: 1, apply: ({ s }) => (spend(s, Math.max(5000, salary(s) * 0.25)), expo(s, 10), (s.flags.buyout = true), "You are free to sign with an NBA team this summer.") },
      { id: "stay", label: "Stay one more year", preview: "Keep your role and salary.", growth: 0, risk: 0, apply: ({ s }) => (tr(s, "confidence", 2), "You run it back.") },
    ],
  },
  {
    id: "veteran-advice", ages: [18, 26], cooldown: 0, once: true, weight: (s) => (isPro(s) ? 1.3 : 0), title: "A veteran's routine",
    body: "A 34-year-old teammate shows you his recovery routine.",
    choices: [
      { id: "adopt", label: "Copy it", preview: "Durability and health up. Less free time.", growth: 1, risk: 0, apply: ({ s }) => (ath(s, "durability", 4), health(s, 6), "Cold tub, stretching, sleep.") },
      { id: "ignore", label: "You're young, you'll be fine", preview: "No change.", growth: 0, risk: 1, apply: () => "You go get food instead." },
    ],
  },
  {
    id: "knee-scan", ages: [18, 34], cooldown: 54, weight: (s) => (s.condition.injuryHistory >= 3 ? 0.7 : 0), title: "A worrying scan",
    body: "An MRI shows wear in your knee.",
    choices: [
      { id: "manage", label: "Manage the load", preview: "Workload set to low for three months. Healthier knee.", growth: 0, risk: 0, apply: ({ s }) => (restLow(s, 3), ath(s, "durability", 3), "Fewer reps, smarter reps for three months.") },
      { id: "ignore", label: "Ignore it", preview: "Keep your workload. Injury risk.", growth: 1, risk: 3, follow: { id: "reinjury", delay: 4 }, apply: () => "You keep going." },
    ],
  },
  {
    id: "naturalize", ages: [20, 30], cooldown: 0, once: true,
    weight: (s) => (s.placement.node === "foreign-pro" && !s.citizenships.includes(s.placement.countryId) && s.ageMonths - s.placement.since >= 24 ? 1 : 0),
    title: "A passport offer",
    body: (s) => `${country(s.placement.countryId).name} could naturalize you for its national team.`,
    choices: [
      { id: "accept", label: "Accept", preview: (s) => `Adds a citizenship. You stop counting as an import there (game rule).${s.international.caps === 0 ? " You would play for its national team." : " You already have caps, so you stay with your first team (game rule)."}`, growth: 1, risk: 1, apply: ({ s }) => {
        s.citizenships.push(s.placement.countryId);
        if (s.international.caps === 0) s.international.countryId = s.placement.countryId;
        return "You take the oath. Your birthplace does not change.";
      } },
      { id: "decline", label: "Decline", preview: "Stay eligible for your birth country.", growth: 0, risk: 0, apply: () => "You keep one passport." },
    ],
  },
  {
    id: "free-agent-camp", ages: [21, 29], cooldown: 12, weight: (s) => (s.achievements.nbaDebut === null && currentLevel(s) >= 62 && s.exposure >= 30 ? 1.2 : 0), title: "A free-agent camp",
    body: "A US free-agent camp invites you. Some players get G League and NBA camp looks.",
    choices: [
      { id: "go", label: "Go", preview: () => `Exposure up. Costs ${usd(600)}.`, blocked: afford(600), growth: 2, risk: 0, apply: ({ s }) => (spend(s, 600), expo(s, 8), (s.achievements.campInvite ??= s.ageMonths), "You play well in front of front-office scouts.") },
      { id: "skip", label: "Skip it", preview: "Rest.", growth: 0, risk: 0, apply: ({ s }) => (energy(s, 10), "You rest for next season.") },
    ],
  },
  {
    id: "growing-family", ages: [24, 34], phase: "any", cooldown: 0, once: true, weight: () => 0.6, title: "A family of your own", tone: "good",
    body: "You and your partner have a baby.",
    auto: ({ s }) => (tr(s, "motivation", 6), energy(s, -10), "Less sleep, more reason. Motivation +6."),
  },
  {
    id: "ncaa-grades", ages: [16, 19], cooldown: 12, weight: (s) => (typeof s.flags.ncaaGradesBlocked === "number" && s.education.academics < 45 ? 3 : 0), title: "College coaches ask about grades",
    body: (s) => `Coaches want you, but your grades (${Math.round(s.education.academics)}/100) are below what the model treats as eligible (45).`,
    choices: [
      { id: "tutor", label: "Get a tutor", preview: (s) => `School up a lot. Costs ${usd(cost(s, 500))}.`, blocked: (s) => afford(cost(s, 500))(s), growth: 1, risk: 0, apply: ({ s }) => (spend(s, cost(s, 500)), acad(s, 14), "Evening sessions three times a week.") },
      { id: "school-focus", label: "Make school your secondary focus", preview: "Secondary focus set to School.", growth: 0, risk: 0, apply: ({ s }) => ((s.plan.secondary = "school"), "Secondary focus set to School.") },
      { id: "skip", label: "Forget college", preview: "Go pro or play locally instead.", growth: 0, risk: 1, apply: ({ s }) => ((s.education.ncaaEligible = false), "You stop thinking about college.") },
    ],
  },
  {
    id: "rest-day-summer", ages: [10, 24], cooldown: 24, weight: (s) => (s.condition.energy > 85 && s.plan.workload === "low" ? 1 : 0), title: "Long summer days",
    body: "You have more energy than you know what to do with.",
    choices: [
      { id: "more", label: "Raise your workload", preview: "Workload set to balanced.", growth: 2, risk: 1, apply: ({ s }) => ((s.plan.workload = "balanced"), "Workload set to balanced.") },
      { id: "enjoy", label: "Enjoy it", preview: "Motivation up.", growth: 0, risk: 0, apply: ({ s }) => (tr(s, "motivation", 3), "Beach, friends, pickup at night.") },
    ],
  },
  {
    id: "rival-peer", ages: [12, 18], cooldown: 0, once: true, weight: (s) => (s.peers.some((p) => p.rating > performanceLevel(s)) ? 1 : 0.3), title: "A rival your age",
    body: (s) => `You read about ${s.peers[0]?.name ?? "a kid your age"}. People say he is ahead of you.`,
    choices: [
      { id: "fuel", label: "Use it as fuel", preview: "Motivation up.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "motivation", 5), "You print his stats and tape them up.") },
      { id: "ignore", label: "Run your own race", preview: "Composure up.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "composure", 4), "Your path is your path.") },
    ],
  },
  {
    id: "coach-believes", ages: [10, 17], cooldown: 0, once: true, weight: (s) => (onTeam(s) ? 1 : 0), title: "A coach who believes", tone: "good",
    body: "Your coach stays late to rebound for you.",
    auto: ({ s }) => (tr(s, "confidence", 5), tr(s, "coachability", 3), "Confidence +5."),
  },
  {
    id: "growth-plate-check", ages: [13, 17], cooldown: 0, once: true, weight: (s) => (s.family.means >= 3 ? 0.8 : 0.2), title: "A growth plate X-ray", tone: "neutral",
    body: "A sports doctor X-rays your hand to estimate how much more you will grow.",
    auto: ({ s }) => {
      s.body.measuredAtMonths = s.ageMonths;
      const left = Math.max(0, s.growth.adultHeightCm - s.body.heightCm);
      return left > 8 ? "He thinks you have a lot of growing left." : left > 3 ? "He thinks you have a few centimeters left." : "He thinks you are close to done growing.";
    },
  },
  {
    id: "summer-league-look", ages: [19, 27], cooldown: 12, weight: (s) => (s.achievements.nbaDebut === null && s.placement.node !== "nba" && currentLevel(s) >= 64 && s.exposure >= 50 ? 1.5 : 0), title: "Summer league invite",
    body: "An NBA team invites you to its summer league roster.",
    choices: [
      { id: "go", label: "Play summer league", preview: "Exposure up a lot. Camp chance.", growth: 2, risk: 1, apply: ({ s, rolls }) => (expo(s, 10), rolls[0]! < 0.35 ? ((s.flags.campOffer = true), "You play well enough to earn a training camp invite.") : "Solid week. They keep your number.") },
      { id: "skip", label: "Stay with your club", preview: "Rest.", growth: 0, risk: 0, apply: ({ s }) => (energy(s, 8), "You skip it.") },
    ],
  },
  {
    id: "academy-closed", ages: [12, 17], cooldown: 0, once: true, weight: (s) => (s.residence.countryId === "SN" ? 0.6 : 0), title: "An academy rumor", tone: "neutral",
    body: "Older players talk about an NBA academy in Senegal.",
    auto: () => "This snapshot could not verify the academy's current program, so the game does not offer it as a route.",
  },

  // School and game moments
  {
    id: "school-tryouts", ages: [11, 12.9], cooldown: 0, once: true, weight: () => 2.5, title: "School team tryouts",
    body: (s) => `${schoolLabel(s.residence.countryId, 12) === "Middle school team" ? "Middle school" : "Under-14 school team"} tryouts are this week. Forty kids for twelve spots.`,
    choices: [
      { id: "try", label: "Try out", preview: "Make it and you play school games. Get cut and it stings.", growth: 2, risk: 1, apply: ({ s, rolls }) => {
        const made = rolls[0]! < 0.45 + (performanceLevel(s) - cohortLevel(age(s))) / 25;
        if (!made) return (tr(s, "confidence", -3), tr(s, "motivation", 4), "Your name is not on the list. You go home and shoot until dark.");
        if (["home", "playground", "school-team"].includes(s.placement.node)) {
          setYouthPlacement(s, "school-team", schoolLabel(s.residence.countryId, age(s)), 0);
          return "You make the team. Practice starts Monday.";
        }
        expo(s, 2); energy(s, -6); sk(s, "iq", 1);
        return "You make it and play for school and club. Busy weeks.";
      } },
      { id: "skip", label: "Skip it", preview: "Nothing changes.", growth: 0, risk: 0, apply: () => "You stick with what you have." },
    ],
  },
  {
    id: "rivalry-game", ages: [11, 34], cooldown: 24, weight: (s) => (onTeam(s) && !s.condition.injury ? 0.9 : 0), title: "Rivalry game",
    body: "The gym is packed for the rivalry game. Down four with three minutes left.",
    choices: [
      { id: "take", label: "Take over", preview: "Big moment or a bad one.", growth: 2, risk: 2, apply: ({ s, rolls }) => {
        const need = levelOf(s)?.need ?? cohortLevel(age(s));
        if (rolls[0]! < 0.38 + (performanceLevel(s) - need) / 40) return (expo(s, 4), tr(s, "confidence", 4), (s.flags.clutch = true), "Nine straight points. They chant your name.");
        return (tr(s, "confidence", -3), tr(s, "composure", 2), "You force three shots. All miss. You lose by seven.");
      } },
      { id: "share", label: "Run the offense", preview: "IQ and decisions up.", growth: 1, risk: 0, apply: ({ s, rolls }) => (sk(s, "iq", 1), sk(s, "decisions", 1), rolls[0]! < 0.5 ? "Two hockey assists and a stop. You win by two." : "Good looks, cold shooting. A narrow loss.") },
    ],
  },
  {
    id: "bench-stuck", ages: [12, 32], cooldown: 18, weight: (s) => (onTeam(s) && ["bench", "deep-bench"].includes(s.placement.role) ? 1.5 : 0), title: "Stuck on the bench",
    body: "You've played garbage time for a month.",
    choices: [
      { id: "work", label: "Stay after practice every day", preview: "Discipline up. A shot at more minutes.", growth: 2, risk: 0, apply: ({ s, rolls }) => (tr(s, "discipline", 3), energy(s, -6), rolls[0]! < 0.45 ? (bumpRole(s, 1), "The coach notices. You're in the rotation.") : "Nothing changes yet. You keep working.") },
      { id: "talk", label: "Ask the coach what's missing", preview: "Coachability up. He'll tell you.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "coachability", 3), sk(s, "decisions", 1), "Fewer turnovers, he says. You write it down.") },
      { id: "leave", label: "Look for a new team", preview: "You'll hear offers at the next window.", growth: 1, risk: 1, apply: ({ s }) => ((s.flags.reviewSoon = true), tr(s, "coachability", -2), "You tell your coach you want out.") },
    ],
  },
  {
    id: "captain", ages: [14, 34], cooldown: 36, weight: (s) => (["starter", "star"].includes(s.placement.role) ? 1 : 0), title: "Captain's armband",
    body: "The coach asks you to be captain this season.",
    choices: [
      { id: "yes", label: "Accept", preview: "Composure and coachability up. More pressure.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "composure", 3), tr(s, "coachability", 2), energy(s, -3), evidence(s, `Team captain at ${Math.floor(age(s))}`, 2), "You speak first in the huddle now.") },
      { id: "no", label: "Let a veteran do it", preview: "No change.", growth: 0, risk: 0, apply: () => "You lead by example instead." },
    ],
  },
  {
    id: "bad-call", ages: [12, 34], cooldown: 36, weight: (s) => (onTeam(s) ? 0.6 : 0), title: "A terrible call",
    body: "The referee calls a foul you never committed. Your fourth.",
    choices: [
      { id: "calm", label: "Walk away", preview: "Composure up.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "composure", 3), "You clap twice and get back on defense.") },
      { id: "argue", label: "Tell him what you think", preview: "Confidence up. A technical is likely.", growth: 0, risk: 1, apply: ({ s, rolls }) => (rolls[0]! < 0.6 ? (tr(s, "composure", -2), tr(s, "coachability", -1), "Technical. Then your fifth foul.") : (tr(s, "confidence", 2), "He lets you vent. Nothing called.")) },
    ],
  },
  {
    id: "showcase-invite", ages: [15, 18], cooldown: 12, weight: (s) => (s.exposure >= 14 && onTeam(s) ? 1.4 : 0), title: "Showcase invite",
    body: (s) => `A national showcase in ${country(s.residence.countryId).capital ?? "the capital"} wants you. Travel costs about ${usd(cost(s, 250))}.`,
    choices: [
      { id: "go", label: "Go", preview: (s) => `Exposure up. Costs ${usd(cost(s, 250))}.`, blocked: (s) => afford(cost(s, 250))(s), growth: 2, risk: 1, apply: ({ s, rolls }) => (spend(s, cost(s, 250)), expo(s, rolls[0]! < 0.5 ? 7 : 4), evidence(s, `Showcase standout at ${Math.floor(age(s))}`, 3), rolls[0]! < 0.5 ? "You make the all-showcase team." : "You hold your own against the best in the country.") },
      { id: "skip", label: "Stay home", preview: "Rest.", growth: 0, risk: 0, apply: ({ s }) => (energy(s, 6), "You rest up.") },
    ],
  },

  // Money once the paychecks start
  {
    id: "lifestyle", ages: [17, 66], cooldown: 0, once: true, phase: "any", weight: (s) => (pay(s) >= 12_000 ? 6 : 0), title: "Your first real paycheck",
    body: (s) => `About ${usd(pay(s) / 12)} a month before tax and fees. How do you want to live?`,
    choices: (["frugal", "standard", "lavish"] as const).map((l) => ({
      id: l,
      label: { frugal: "Live cheap and save", standard: "Live comfortably", lavish: "Live like a pro" }[l],
      preview: (s: LifeState) => `${LIFESTYLE[l].detail} About ${usd(LIFESTYLE[l].base * country(s.residence.countryId).model.costIndex)} a month plus ${Math.round(LIFESTYLE[l].share * 100)}% of take-home pay.`,
      growth: l === "frugal" ? 1 : 0,
      risk: l === "lavish" ? 2 : 0,
      apply: ({ s }: EventCtx) => {
        setLifestyle(s, l);
        if (l === "frugal") tr(s, "discipline", 3);
        if (l === "lavish") {
          tr(s, "confidence", 3);
          tr(s, "discipline", -3);
        }
        return { frugal: "A roommate, a bus pass and a growing savings account.", standard: "Your own place. It feels like making it.", lavish: "A downtown place and a car you can't really afford yet." }[l];
      },
    })),
  },
  {
    id: "send-home", ages: [18, 66], cooldown: 0, once: true, phase: "any", weight: (s) => (pay(s) >= 12_000 && s.family.means <= 3 ? 3 : 0), title: "Money for home",
    body: "Your parents never asked. How much of each paycheck goes home?",
    choices: [
      { id: "little", label: "5%", preview: "More for you.", growth: 0, risk: 1, apply: ({ s }) => ((s.finance.sendHomeShare = 0.05), "A little each month.") },
      { id: "some", label: "15%", preview: "Family support up.", growth: 0, risk: 0, apply: ({ s }) => ((s.finance.sendHomeShare = 0.15), (s.family.support = s.family.support === "low" ? "medium" : "high"), "Your mother calls to say thank you.") },
      { id: "lots", label: "30%", preview: "Family support and motivation up. Less for you.", growth: 0, risk: 0, apply: ({ s }) => ((s.finance.sendHomeShare = 0.3), (s.family.support = "high"), tr(s, "motivation", 4), "Your siblings stay in school because of you.") },
    ],
  },
  {
    id: "advisor", ages: [18, 66], cooldown: 0, once: true, phase: "any", weight: (s) => (cash(s) >= 25_000 ? 4 : 0), title: "Who manages your money?",
    body: (s) => `You have ${usd(cash(s))} sitting in a checking account.`,
    choices: [
      ...(["index", "balanced", "aggressive"] as const).map((a) => ({
        id: a,
        label: ADVISOR[a].label,
        preview: `${ADVISOR[a].detail}${ADVISOR[a].fee >= 0.005 ? ` Fee ${ADVISOR[a].fee * 100}% a year.` : ""} Spare cash gets invested every month.`,
        growth: 0,
        risk: a === "aggressive" ? 3 : a === "index" ? 1 : 0,
        apply: ({ s }: EventCtx) => (setAdvisor(s, a), { index: "You set up automatic deposits into index funds.", balanced: "A wealth manager builds you a portfolio.", aggressive: "Your friend promises 30% a year." }[a]),
      })),
      { id: "self", label: "Manage it yourself", preview: "No fees. You pick the mix in the Money panel. It starts balanced.", growth: 0, risk: 1, apply: ({ s }) => (setAdvisor(s, null), (s.finance.target = { ...PRESETS[1]!.target }), (s.finance.autoInvest = true), "You open a brokerage account and read everything you can.") },
      { id: "bank", label: "Leave it in the bank", preview: "No risk and almost no growth. The game does not model inflation.", growth: 0, risk: 1, apply: ({ s }) => (setAdvisor(s, null), (s.finance.autoInvest = false), "It stays in checking.") },
    ],
  },
  {
    id: "investment-pitch", ages: [19, 66], phase: "any", cooldown: 24, weight: (s) => (worth(s) >= 60_000 ? 1.3 : 0), title: "An investment pitch",
    body: (s) => `A teammate's cousin is opening a ${pick(s, "biz", ["restaurant", "sneaker shop", "gym", "car wash", "coffee chain"])} and wants ${usd(stakeOf(s))} from you.`,
    choices: [
      { id: "invest", label: "Invest", preview: "Could pay off. Most small businesses don't.", growth: 0, risk: 3, follow: { id: "investment-result", delay: 12 }, apply: ({ s }) => {
        const amt = stakeOf(s);
        spend(s, amt);
        s.flags.stake = amt;
        return "You wire the money.";
      } },
      { id: "pass", label: "Pass", preview: "Keep your money.", growth: 0, risk: 0, apply: () => "You wish him luck." },
    ],
  },
  {
    id: "investment-result", ages: [19, 66], phase: "any", cooldown: 0, followUpOnly: true, weight: () => 1, title: "The investment",
    body: "A year later.",
    auto: ({ s, rolls }) => {
      const amt = typeof s.flags.stake === "number" ? s.flags.stake : 0;
      delete s.flags.stake;
      if (rolls[0]! < 0.25) return ((s.finance.cash += amt * 2.2), `It's packed every weekend. You get back ${usd(amt * 2.2)}.`);
      if (rolls[0]! < 0.5) return ((s.finance.cash += amt * 0.6), `It limps along. You sell your share for ${usd(amt * 0.6)}.`);
      return "It closes after eight months. The money is gone.";
    },
  },
  {
    id: "house-parents", ages: [19, 66], phase: "any", cooldown: 0, once: true, weight: (s) => (worth(s) >= housePrice(s) * 1.6 ? 2 : 0), title: "A house for your parents",
    body: (s) => `A house near where you grew up costs about ${usd(housePrice(s))}.`,
    choices: [
      { id: "buy", label: "Buy it outright", preview: (s) => `Costs ${usd(housePrice(s))}. Family support and motivation up.`, growth: 0, risk: 0, apply: ({ s }) => {
        spend(s, housePrice(s));
        s.family.support = "high";
        s.family.means = Math.min(5, s.family.means + 1) as LifeState["family"]["means"];
        tr(s, "motivation", 6);
        return "Your mother cries when you hand her the keys.";
      } },
      { id: "rent", label: "Help with rent instead", preview: "Send 10% more of each paycheck home.", growth: 0, risk: 0, apply: ({ s }) => ((s.finance.sendHomeShare = Math.min(0.5, s.finance.sendHomeShare + 0.1)), "They move somewhere bigger.") },
      { id: "later", label: "Not yet", preview: "Keep your money.", growth: 0, risk: 1, apply: () => "Maybe next year." },
    ],
  },
  {
    id: "endorsement", ages: [17, 36], cooldown: 18, weight: (s) => (isPro(s) && s.exposure >= 40 ? (s.exposure >= 65 ? 2.5 : 1.4) : 0), title: "Endorsement offer",
    body: (s) => `A ${pick(s, "brand", BRANDS)} wants you in its ads: ${usd(endorsementValue(s))} a year for three years.`,
    choices: [
      { id: "sign", label: "Sign", preview: (s) => `${usd(endorsementValue(s))} a year.${s.finance.agent ? " Your agent takes 15%." : ""}`, growth: 0, risk: 0, apply: ({ s }) => (s.finance.endorsements.push({ brand: pick(s, "brand", BRANDS), perYear: endorsementValue(s), yearsLeft: 3 }), expo(s, 2), "A photo shoot on your day off.") },
      { id: "hold", label: "Hold out for more", preview: "They might come back higher. Or walk.", growth: 0, risk: 2, apply: ({ s, rolls }) => (rolls[0]! < 0.4 + (s.finance.agent?.reach === "global" ? 0.15 : 0) ? (s.finance.endorsements.push({ brand: pick(s, "brand", BRANDS), perYear: Math.round(endorsementValue(s) * 1.5), yearsLeft: 3 }), `They come back at ${usd(endorsementValue(s) * 1.5)} a year. Signed.`) : "They sign someone else.") },
      { id: "pass", label: "Turn it down", preview: "Keep your image clean.", growth: 0, risk: 0, apply: ({ s }) => (tr(s, "discipline", 1), "Not the right fit.") },
    ],
  },
  {
    id: "extension", ages: [19, 36], cooldown: 12, weight: (s) => (isPro(s) && s.placement.node !== "g-league" && s.placement.contract?.yearsLeft === 1 && ["starter", "star"].includes(s.placement.role) ? 2.2 : 0), title: "Extension offer",
    body: (s) => `${s.placement.teamName} offer ${usd(salary(s) * 1.25)} a year for three more seasons.`,
    choices: [
      { id: "sign", label: "Sign the extension", preview: "Security. No free agency for a while.", growth: 0, risk: 0, apply: ({ s }) => {
        const c = s.placement.contract!;
        c.salary = Math.round(c.salary * 1.25);
        c.yearsLeft += 3;
        c.guaranteed = true;
        return "Three more years. You call your parents first.";
      } },
      { id: "bet", label: "Bet on yourself", preview: "Play out the deal. A big year means a bigger contract.", growth: 1, risk: 2, apply: ({ s }) => ((s.flags.betOnSelf = true), tr(s, "confidence", 3), "You tell your agent to wait.") },
    ],
  },
  {
    id: "contract-terms", ages: [16, 40], cooldown: 0, followUpOnly: true, weight: () => 1, title: "Contract talks",
    body: (s) => `${s.placement.teamName} sent the paperwork: ${usd(salary(s))} a year. ${s.finance.agent ? "Your agent" : "Your family"} thinks there's room.`,
    choices: [
      { id: "sign", label: "Sign as written", preview: "Done today.", growth: 0, risk: 0, apply: () => "You sign it on the hood of your car." },
      { id: "money", label: "Push for more money", preview: "Maybe 10-15% more. They could take a year off.", growth: 0, risk: 2, blocked: (s) => (salary(s) > 0 ? null : "There's no salary to negotiate."), apply: ({ s, rolls }) => {
        const c = s.placement.contract;
        if (!c) return "There's nothing to sign.";
        const bonus = { global: 0.2, regional: 0.12, local: 0.05 }[s.finance.agent?.reach ?? "local"] ?? 0;
        if (rolls[0]! < 0.4 + bonus) return ((c.salary = Math.round(c.salary * 1.12)), `They move to ${usd(c.salary)}.`);
        if (rolls[0]! < 0.85) return "They hold firm. You sign as written.";
        return ((c.yearsLeft = Math.max(1, c.yearsLeft - 1)), "They take a year off the deal.");
      } },
      { id: "years", label: "Ask for another guaranteed year", preview: "More security. They may say no.", growth: 0, risk: 1, blocked: (s) => (s.placement.contract ? null : "There's no contract."), apply: ({ s, rolls }) => (rolls[0]! < 0.45 && s.placement.contract ? ((s.placement.contract.yearsLeft += 1), (s.placement.contract.guaranteed = true), "They add a guaranteed year.") : "They say no. You sign anyway.") },
    ],
  },
  {
    id: "foundation", ages: [22, 66], phase: "any", cooldown: 0, once: true, weight: (s) => (worth(s) >= 750_000 ? 1.5 : 0), title: "Start a foundation",
    body: (s) => `You could fund courts and camps back in ${s.birthplace.locality}.`,
    choices: [
      { id: "fund", label: "Fund it", preview: (s) => `About ${usd(worth(s) * 0.05)}. Exposure and motivation up.`, growth: 0, risk: 0, apply: ({ s }) => (spend(s, worth(s) * 0.05), expo(s, 5), tr(s, "motivation", 5), evidence(s, `Started a youth foundation in ${country(s.birthplace.countryId).name}`, 2), "Two courts open the next summer. Kids wear your number.") },
      { id: "later", label: "Later", preview: "Keep your money.", growth: 0, risk: 0, apply: () => "You put it on the list." },
    ],
  },
  {
    id: "loan-request", ages: [19, 66], phase: "any", cooldown: 30, weight: (s) => (cash(s) >= 15_000 ? 1.1 : 0), title: "A friend needs a loan",
    body: (s) => `A childhood friend asks to borrow ${usd(loanOf(s))} for a business.`,
    choices: [
      { id: "lend", label: "Lend it", preview: "He swears he'll pay it back.", growth: 0, risk: 2, follow: { id: "loan-repaid", delay: 12 }, apply: ({ s }) => {
        const amt = loanOf(s);
        spend(s, amt);
        s.flags.loanAmt = amt;
        return "You transfer it that night.";
      } },
      { id: "no", label: "Say no", preview: "Keep your money. Things get awkward.", growth: 0, risk: 0, apply: ({ s }) => (tr(s, "composure", 1), "He stops calling for a while.") },
    ],
  },
  {
    id: "loan-repaid", ages: [19, 66], phase: "any", cooldown: 0, followUpOnly: true, weight: () => 1, title: "The loan",
    body: "A year later.",
    auto: ({ s, rolls }) => {
      const amt = typeof s.flags.loanAmt === "number" ? s.flags.loanAmt : 0;
      delete s.flags.loanAmt;
      return rolls[0]! < 0.4 ? ((s.finance.cash += amt), "He pays you back in full.") : "The money doesn't come back. Neither does he.";
    },
  },
  {
    id: "money-trouble", ages: [18, 66], phase: "any", cooldown: 12, weight: (s) => (typeof s.flags.broke === "number" && s.ageMonths - s.flags.broke <= 3 ? 6 : 0), title: "Money trouble", tone: "bad",
    body: "Your account is empty and rent is due.",
    choices: [
      { id: "cut", label: "Move somewhere cheaper", preview: "Lifestyle set to frugal.", growth: 0, risk: 0, apply: ({ s }) => (setLifestyle(s, "frugal"), tr(s, "discipline", 2), "You sell the car and get a roommate.") },
      { id: "family", label: "Ask your family", preview: "They'll help. Support may drop.", growth: 0, risk: 1, apply: ({ s, rolls }) => {
        const amt = Math.min(s.family.savings, cost(s, 1500));
        s.family.savings -= amt;
        s.finance.cash += amt;
        if (rolls[0]! < 0.4 && s.family.support !== "low") s.family.support = s.family.support === "high" ? "medium" : "low";
        return `They send ${usd(amt)}. It's a hard phone call.`;
      } },
    ],
  },
  {
    id: "spending-spree", ages: [18, 66], phase: "any", cooldown: 18, weight: (s) => (s.finance.lifestyle === "lavish" && cash(s) > 20_000 ? 1 : 0), title: "A spending spree", tone: "bad",
    body: "A watch, a second car and a trip with ten friends.",
    auto: ({ s }) => {
      const amt = Math.round(cash(s) * 0.12);
      spend(s, amt);
      return `${usd(amt)} gone in a month.`;
    },
  },

  // Markets and investing
  {
    id: "market-crash", ages: [18, 66], cooldown: 18, phase: "any", weight: (s) => (trailingIndex(s.finance) <= -0.18 && invested(s.finance) >= 20_000 ? 8 : 0), title: "Markets are falling", tone: "bad",
    body: (s) => `Stocks are down ${Math.round(-trailingIndex(s.finance) * 100)}% over the past year. Your investments are worth ${usd(invested(s.finance))}.`,
    choices: [
      { id: "hold", label: "Hold and wait", preview: "In this market model, prices drift up over the long run. A recovery can take years.", growth: 1, risk: 1, apply: ({ s }) => (tr(s, "composure", 2), "You stop checking the app.") },
      { id: "sell", label: "Sell and move to savings", preview: "No more losses. You miss the rebound if there is one.", growth: 0, risk: 0, apply: ({ s }) => {
        const f = s.finance;
        let moved = 0;
        for (const k of ["index", "stocks", "crypto"] as const) {
          moved += f.holdings[k] * (1 - ASSET_INFO[k].cost);
          f.holdings[k] = 0;
        }
        f.holdings.savings += moved;
        f.target = mix({ savings: 60, bonds: 40 });
        f.advisor = null;
        return `You sell ${usd(moved)} of stocks and crypto. Safe now, and the mix is set to savings and bonds.`;
      } },
      { id: "buy", label: "Buy more while it's cheap", preview: (s) => `Put ${usd(liquid(s) * 0.5)} of cash and savings into the index.`, blocked: (s) => (liquid(s) >= 2000 ? null : "No spare cash."), growth: 2, risk: 2, apply: ({ s }) => {
        const amt = liquid(s) * 0.5;
        putInto(s, "index", amt);
        return `You buy ${usd(amt)} of the index at a discount.`;
      } },
    ],
  },
  {
    id: "stock-tip", ages: [19, 66], cooldown: 30, phase: "any", weight: (s) => (liquid(s) >= 30_000 ? 1 : 0), title: "A hot stock tip",
    body: (s) => `${s.after ? "A former teammate" : "A teammate"} swears a ${pick(s, "sector", ["chip maker", "sports betting app", "electric truck company", "biotech", "streaming service"])} is about to take off.`,
    choices: [
      { id: "buy", label: "Buy some", preview: (s) => `Put ${usd(liquid(s) * 0.2)} into individual stocks.`, growth: 0, risk: 2, apply: ({ s }) => {
        const amt = liquid(s) * 0.2;
        putInto(s, "stocks", amt);
        return `You buy ${usd(amt)} of it. It now moves with your other stocks.`;
      } },
      { id: "pass", label: "Stick to your plan", preview: "Discipline up.", growth: 0, risk: 0, apply: ({ s }) => (tr(s, "discipline", 2), "You tell him you'll think about it. You don't.") },
    ],
  },
  {
    id: "crypto-pitch", ages: [18, 50], cooldown: 36, phase: "any", weight: (s) => (liquid(s) >= 15_000 && hold(s, "crypto") < netWorth(s.finance) * 0.2 ? 0.9 : 0), title: "Everyone's talking about crypto",
    body: "Half the locker room has a coin they love. One of them doubled last month.",
    choices: [
      { id: "small", label: "Put in a little", preview: (s) => `${usd(liquid(s) * 0.05)} into crypto.`, growth: 0, risk: 1, apply: ({ s }) => (putInto(s, "crypto", liquid(s) * 0.05), "A small bet. You check the price at halftime.") },
      { id: "big", label: "Go big", preview: (s) => `${usd(liquid(s) * 0.3)} into crypto. Could double or halve in a year.`, growth: 0, risk: 3, apply: ({ s }) => (putInto(s, "crypto", liquid(s) * 0.3), "A third of your money now rides on crypto.") },
      { id: "pass", label: "Pass", preview: "Keep your money where it is.", growth: 0, risk: 0, apply: () => "Not for you." },
    ],
  },
  {
    id: "rental-property", ages: [21, 66], cooldown: 36, phase: "any", weight: (s) => (liquid(s) >= housePrice(s) * 0.6 ? 1.1 : 0), title: "A rental property",
    body: (s) => `A two-unit building in ${s.residence.locality} is for sale for about ${usd(housePrice(s))}.`,
    choices: [
      { id: "buy", label: "Buy it", preview: (s) => `${usd(housePrice(s))} into real estate. Rent plus slow growth. Selling later costs about 3%.`, blocked: (s) => (liquid(s) >= housePrice(s) ? null : "You'd need the full price in cash and savings."), growth: 0, risk: 1, apply: ({ s }) => (putInto(s, "property", housePrice(s)), "You own a building. A tenant moves in the next month.") },
      { id: "pass", label: "Pass", preview: "Being a landlord is work.", growth: 0, risk: 0, apply: () => "You keep renting your own place." },
    ],
  },
  {
    id: "advisor-scandal", ages: [20, 66], cooldown: 0, once: true, phase: "any", weight: (s) => (s.finance.advisor === "aggressive" && invested(s.finance) >= 50_000 ? 0.8 : 0), title: "Your friend's fund", tone: "bad",
    body: "The fund stops answering calls. A newspaper is asking questions.",
    choices: [
      { id: "pull", label: "Pull your money out", preview: "You get most of it back, maybe.", growth: 0, risk: 0, apply: ({ s, rolls }) => {
        const f = s.finance;
        const keep = rolls[0]! < 0.6 ? 0.85 : 0.5;
        const total = f.holdings.stocks + f.holdings.crypto;
        f.holdings.stocks = 0;
        f.holdings.crypto = 0;
        f.holdings.savings += total * keep;
        f.advisor = null;
        f.target = { ...PRESETS[0]!.target };
        return `You get back ${usd(total * keep)} of ${usd(total)}.`;
      } },
      { id: "trust", label: "Trust him", preview: "He's been a friend since school.", growth: 0, risk: 3, apply: ({ s, rolls }) => {
        if (rolls[0]! < 0.5) return "It was a rumor. The fund keeps going.";
        const f = s.finance;
        const lost = (f.holdings.stocks + f.holdings.crypto) * 0.7;
        f.holdings.stocks *= 0.3;
        f.holdings.crypto *= 0.3;
        f.advisor = null;
        return `The fund collapses. You lose about ${usd(lost)}.`;
      } },
    ],
  },

  // The career after playing
  {
    id: "coach-star", ages: [30, 66], cooldown: 24, phase: "after", weight: (s) => (job(s)?.track === "coach" && job(s)!.step >= 1 ? 1.6 : 0), title: "Your best player",
    body: "Your best player skipped practice again. The others are watching what you do.",
    choices: [
      { id: "bench", label: "Bench him for a game", preview: "Standards matter. You might lose the game, or him.", growth: 1, risk: 1, apply: ({ s, rolls }) => {
        const a = job(s)!;
        a.rep = clamp(a.rep + (rolls[0]! < 0.6 ? 3 : -3), 0, 100);
        return rolls[0]! < 0.6 ? "The team rallies around the decision." : "You lose by twenty and he sulks for a month.";
      } },
      { id: "talk", label: "Talk to him privately", preview: "Keep it in-house.", growth: 0, risk: 0, apply: ({ s }) => (tr(s, "composure", 1), "He shows up on time for a while.") },
    ],
  },
  {
    id: "coach-system", ages: [30, 66], cooldown: 36, phase: "after", weight: (s) => (job(s)?.track === "coach" ? 1 : 0), title: "A new system",
    body: "Your assistants want to switch to a faster, three-heavy offense.",
    choices: [
      { id: "switch", label: "Switch", preview: "Could modernize the team. Could confuse it.", growth: 1, risk: 2, apply: ({ s, rolls }) => {
        const a = job(s)!;
        a.rep = clamp(a.rep + (rolls[0]! < 0.55 ? 4 : -3), 0, 100);
        return rolls[0]! < 0.55 ? "The offense clicks by midseason." : "Too many turnovers. You go back to basics in January.";
      } },
      { id: "keep", label: "Stay with what works", preview: "No risk.", growth: 0, risk: 0, apply: () => "You keep your playbook." },
    ],
  },
  {
    id: "scout-sleeper", ages: [30, 66], cooldown: 24, phase: "after", weight: (s) => (job(s)?.track === "scout" ? 1.6 : 0), title: "A sleeper prospect",
    body: (s) => `You found a raw teenager in ${country(pick(s, "sleeper", ["NG", "SN", "LT", "RS", "AR", "BR", "AU", "FR", "CM", "TR"])).name} nobody else has seen.`,
    choices: [
      { id: "push", label: "Bang the table for him", preview: "Your name goes on the pick.", growth: 1, risk: 2, apply: ({ s, rolls }) => {
        const a = job(s)!;
        const hit = rolls[0]! < 0.35 + s.skills.iq / 300;
        a.rep = clamp(a.rep + (hit ? 6 : -3), 0, 100);
        return hit ? "Two years later he's a rotation player. People remember who found him." : "He never makes it past the G League.";
      } },
      { id: "quiet", label: "Write a careful report", preview: "Safe.", growth: 0, risk: 0, apply: () => "Your report sits in a database." },
    ],
  },
  {
    id: "media-take", ages: [30, 66], cooldown: 18, phase: "after", weight: (s) => (job(s)?.track === "media" ? 1.6 : 0), title: "Producers want a hot take",
    body: "The segment needs energy. They want you to say something people will argue about.",
    choices: [
      { id: "spicy", label: "Give them one", preview: "More attention. Some of it bad.", growth: 1, risk: 2, apply: ({ s, rolls }) => {
        const a = job(s)!;
        a.rep = clamp(a.rep + (rolls[0]! < 0.6 ? 4 : -4), 0, 100);
        expo(s, 3);
        return rolls[0]! < 0.6 ? "The clip has two million views by morning." : "A player you criticized responds. It gets ugly.";
      } },
      { id: "measured", label: "Stay measured", preview: "Fewer clicks. Players and coaches keep trusting you.", growth: 0, risk: 0, apply: ({ s }) => (tr(s, "composure", 1), "Your producer sighs. Your old coach texts to say good job.") },
    ],
  },
  {
    id: "podcast", ages: [30, 66], cooldown: 0, once: true, phase: "after", weight: (s) => (s.exposure >= 25 || s.nbaGames > 0 ? 0.8 : 0), title: "Start a podcast?",
    body: "A production company wants you to host a weekly show.",
    choices: [
      { id: "yes", label: "Start it", preview: "Extra income if people listen.", growth: 0, risk: 1, apply: ({ s, rolls }) => {
        const amt = Math.round((5000 + s.exposure * (rolls[0]! < 0.3 ? 2500 : 600)) / 500) * 500;
        s.finance.endorsements.push({ brand: "podcast", perYear: amt, yearsLeft: 5 });
        return `It finds an audience. About ${usd(amt)} a year in ad money.`;
      } },
      { id: "no", label: "Not for you", preview: "Keep your evenings.", growth: 0, risk: 0, apply: () => "You pass." },
    ],
  },
  {
    id: "trainer-client", ages: [30, 66], cooldown: 18, phase: "after", weight: (s) => (job(s)?.track === "trainer" ? 1.6 : 0), title: "A pro wants summer workouts",
    body: "A pro player wants six weeks of private sessions.",
    choices: [
      { id: "take", label: "Take him on", preview: (s) => `About ${usd(15_000 * country(s.residence.countryId).model.costIndex)}. Reputation if he improves.`, growth: 1, risk: 0, apply: ({ s, rolls }) => {
        const a = job(s)!;
        s.finance.cash += Math.round(15_000 * country(s.residence.countryId).model.costIndex);
        a.rep = clamp(a.rep + (rolls[0]! < 0.5 ? 4 : 1), 0, 100);
        return rolls[0]! < 0.5 ? "He shoots 40% from three the next season and thanks you in an interview." : "Solid work. He pays on time.";
      } },
      { id: "pass", label: "Too busy", preview: "Rest.", growth: 0, risk: 0, apply: () => "You recommend a friend." },
    ],
  },
  {
    id: "jersey-retired", ages: [32, 66], cooldown: 0, once: true, phase: "after", weight: (s) => (s.seasons.some((x) => (x.awards?.length ?? 0) >= 2) ? 0.8 : 0), title: "Your number goes up", tone: "good",
    body: "An old club wants to retire your jersey.",
    auto: ({ s }) => {
      const a = job(s);
      if (a) a.rep = clamp(a.rep + 3, 0, 100);
      return "Your family flies in. The crowd chants your name.";
    },
  },

  // Agents, trades and transfers
  {
    id: "agent-upgrade", ages: [19, 34], cooldown: 24, weight: (s) => (s.finance.agent && s.finance.agent.reach !== "global" && s.exposure >= 50 ? 2 : 0), title: "A bigger agency calls",
    body: (s) => `An international agency wants to take you from ${s.finance.agent?.name ?? "your agent"}.`,
    choices: [
      { id: "switch", label: "Switch agencies", preview: "Global reach. 4% of salary.", growth: 1, risk: 1, apply: ({ s }) => {
        const old = s.finance.agent?.name ?? "your agent";
        s.finance.agent = { name: pick(s, "agent", ["Dana Whitfield", "Marco Ruiz", "Elena Petrova", "Sam Okafor", "Lena Fischer"]), firm: pick(s, "firm", ["Meridian Athlete Group", "Northline Sports", "Crestview Management"]), fee: 0.04, reach: "global", since: s.ageMonths };
        expo(s, 4);
        return `You thank ${old} and sign with ${s.finance.agent.name}.`;
      } },
      { id: "stay", label: "Stay loyal", preview: "Motivation up.", growth: 0, risk: 0, apply: ({ s }) => (tr(s, "motivation", 2), "You stay with the person who believed in you first.") },
    ],
  },
  {
    id: "trade-rumor", ages: [19, 36], cooldown: 12, weight: (s) => (s.placement.node === "nba" && [12, 1].includes(month(s)) ? 3 : 0), title: "Trade rumors",
    body: (s) => `Reports say the ${s.placement.teamName} are shopping you before the February deadline.`,
    choices: [
      { id: "request", label: "Ask for a trade", preview: "More likely to move. The front office won't love it.", growth: 1, risk: 2, apply: ({ s }) => ((s.flags.tradeRequest = s.ageMonths), tr(s, "coachability", -3), "Your agent makes the call.") },
      { id: "stay", label: "Tell them you want to stay", preview: "Less likely to move.", growth: 0, risk: 0, apply: ({ s }) => ((s.flags.tradeShield = s.ageMonths), tr(s, "coachability", 2), "The coach says he wants you here.") },
      { id: "ignore", label: "Tune it out", preview: "Composure up.", growth: 0, risk: 0, apply: ({ s }) => (tr(s, "composure", 2), "You turn off your phone.") },
    ],
  },
  {
    id: "transfer-bid", ages: [19, 34], cooldown: 12, weight: (s) => ((s.placement.node === "domestic-pro" || s.placement.node === "foreign-pro") && ["rotation", "starter", "star"].includes(s.placement.role) && bidTarget(s) ? 1.6 : 0), title: "A bigger club bids",
    body: (s) => { const l = bidTarget(s); return l ? `A ${l.name} club wants to buy you out of your contract.` : "A bigger club calls."; },
    choices: [
      { id: "move", label: "Push for the move", preview: (s) => { const l = bidTarget(s); return l ? `Stronger league, better scouts. About ${usd(salaryFor(l, roleFor(performanceLevel(s), l.model!.strength * 0.8)))} a year.` : "A step up."; }, growth: 2, risk: 1, apply: ({ s }) => {
        const l = bidTarget(s);
        if (!l) return "The bid falls through.";
        const host = l.countries[0]!;
        const role = roleFor(performanceLevel(s), l.model!.strength * 0.8);
        const team = clubNameFor(s, host);
        s.placement = { ...s.placement, node: s.citizenships.some((c) => l.countries.includes(c)) && host === s.residence.countryId ? "domestic-pro" : "foreign-pro", countryId: host, leagueId: l.id, teamName: team, role, coaching: l.model!.coaching, since: s.ageMonths, contract: { salary: salaryFor(l, role), yearsLeft: 2, guaranteed: true }, costPerYear: 0 };
        if (host !== s.residence.countryId) s.residence = { countryId: host, locality: country(host).capital ?? country(host).name, localityKind: "capital" };
        if (s.season && s.season.gp + s.season.wins + s.season.losses > 0) s.seasons.push(s.season);
        s.season = null;
        expo(s, 4);
        return `The clubs agree a fee. You join ${team} in ${l.name}.`;
      } },
      { id: "raise", label: "Stay and ask for a raise", preview: "Leverage. Could annoy the club.", growth: 0, risk: 1, apply: ({ s, rolls }) => (rolls[0]! < 0.55 && s.placement.contract ? ((s.placement.contract.salary = Math.round(s.placement.contract.salary * 1.15)), "They match part of it. 15% raise.") : (tr(s, "coachability", -2), "They say no. Things are tense for a while.")) },
      { id: "stay", label: "Stay put", preview: "Loyalty. Role stays.", growth: 0, risk: 0, apply: ({ s }) => (tr(s, "confidence", 2), "You tell your club you're happy.") },
    ],
  },
  {
    id: "loan-move", ages: [18, 26], cooldown: 18, weight: (s) => ((s.placement.node === "domestic-pro" || s.placement.node === "foreign-pro") && ["deep-bench", "bench"].includes(s.placement.role) ? 1.5 : 0), title: "A loan offer",
    body: "Your club wants to loan you to a smaller team so you can play.",
    choices: [
      { id: "go", label: "Go on loan", preview: "Real minutes. Weaker coaching and fewer scouts.", growth: 2, risk: 0, apply: ({ s }) => (bumpRole(s, 2), (s.placement.coaching = clamp(s.placement.coaching - 6, 0, 95)), expo(s, -2), (s.placement.teamName = `${s.placement.teamName} (on loan)`.replace(" (on loan) (on loan)", " (on loan)")), "You start your first game a week later.") },
      { id: "stay", label: "Stay and fight", preview: "Discipline up.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "discipline", 3), "You stay and outwork the veterans.") },
    ],
  },
  {
    id: "g-league-assign", ages: [19, 25], cooldown: 12, weight: (s) => (s.placement.node === "nba" && s.placement.role === "deep-bench" ? 1.6 : 0), title: "G League assignment",
    body: (s) => `The ${s.placement.teamName} want to send you down for a few weeks of minutes.`,
    choices: [
      { id: "go", label: "Go play", preview: "Confidence and IQ up.", growth: 2, risk: 0, apply: ({ s }) => (sk(s, "iq", 2), sk(s, "decisions", 1), tr(s, "confidence", 3), "Thirty minutes a night. You come back sharper.") },
      { id: "stay", label: "Ask to stay up", preview: "Practice with the team. Coachability down.", growth: 0, risk: 0, apply: ({ s }) => (tr(s, "coachability", -2), sk(s, "iq", 1), "You watch from the end of the bench.") },
    ],
  },
];

/* ---------------------------------------------------- shared helpers */

function upgradeCourt(s: LifeState) {
  const order = ["poor", "fair", "good", "excellent"] as const;
  const i = order.indexOf(s.family.courtAccess);
  s.family.courtAccess = order[Math.min(order.length - 1, i + 1)]!;
}

function setYouthPlacement(s: LifeState, node: "school-team", teamName: string, cost: number) {
  s.placement = { ...s.placement, node, teamName, leagueId: null, role: "rotation", coaching: country(s.residence.countryId).model.coachingAccess * 0.6, since: s.ageMonths, contract: null, costPerYear: cost };
}

function bumpRole(s: LifeState, d: number) {
  const order = ["deep-bench", "bench", "rotation", "starter", "star"] as const;
  const i = order.indexOf(s.placement.role as (typeof order)[number]);
  if (i < 0) return;
  s.placement.role = order[clamp(i + d, 0, order.length - 1)]!;
  s.flags.roleBump = s.ageMonths;
}

const FAMILY_TARGETS = ["US", "GB", "DE", "FR", "ES", "AU", "CA", "AE", "CN", "JP"];
export function familyMoveTarget(s: LifeState): string {
  const opts = FAMILY_TARGETS.filter((id) => id !== s.residence.countryId);
  return opts[s.seed % opts.length]!;
}

export const EVENT_BY_ID = Object.fromEntries(EVENTS.map((e) => [e.id, e])) as Record<string, EventTemplate>;

export function eligibleEvents(s: LifeState): EventTemplate[] {
  const a = age(s);
  return EVENTS.filter((e) => {
    if (e.followUpOnly) return false;
    const phase = e.phase ?? "play";
    if (phase !== "any" && phase !== (s.after ? "after" : "play")) return false;
    if (a < e.ages[0] || a >= e.ages[1]) return false;
    if (e.once && s.flags[`ev:${e.id}`]) return false;
    const last = s.cooldowns[e.id];
    if (last !== undefined && s.ageMonths - last < Math.max(e.cooldown, 1)) return false;
    return e.weight(s) > 0;
  });
}

/** Monthly event chance by stage (model), scaled by pacing. */
export function eventRate(s: LifeState): number {
  const stage: Stage = stageOf(s.ageMonths);
  const base = { infancy: 0.06, childhood: 0.13, youth: 0.19, emerging: 0.21, adult: 0.19 }[stage];
  const pace = s.pacing === "short" ? 0.7 : s.pacing === "extended" ? 1.35 : 1;
  return s.ageMonths < 6 ? 0 : base * pace;
}
