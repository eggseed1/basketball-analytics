import { cohortLevel, performanceLevel, stageOf } from "./career";
import { clamp } from "./rng";
import { currentLevel } from "./skills";
import { inflictInjury } from "./training";
import type { AthleticKey, LifeState, SkillKey, Stage, TraitKey } from "./types";
import { country } from "./world";

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
}

/* ------------------------------------------------------------ helpers */

const sk = (s: LifeState, k: SkillKey, d: number) => (s.skills[k] = clamp(s.skills[k] + d, 1, Math.max(s.skills[k], s.potentials[k])));
const tr = (s: LifeState, k: TraitKey, d: number) => (s.traits[k] = clamp(s.traits[k] + d, 0, 100));
const ath = (s: LifeState, k: AthleticKey, d: number) => (s.body[k] = clamp(s.body[k] + d, 1, 99));
const energy = (s: LifeState, d: number) => (s.condition.energy = clamp(s.condition.energy + d, 5, 100));
const health = (s: LifeState, d: number) => (s.condition.health = clamp(s.condition.health + d, 5, 100));
const expo = (s: LifeState, d: number) => (s.exposure = clamp(s.exposure + d, 0, 100));
const acad = (s: LifeState, d: number) => (s.education.academics = clamp(s.education.academics + d, 0, 100));
const spend = (s: LifeState, d: number) => (s.family.savings = Math.max(0, s.family.savings - d));
/** Drop workload to low for a few months, then restore the previous setting. */
const restLow = (s: LifeState, months: number) => {
  if (s.plan.workload !== "low") s.flags.restoreWorkload = s.plan.workload;
  s.plan.workload = "low";
  s.flags.restoreAt = s.ageMonths + months;
};
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const cost = (s: LifeState, base: number) => Math.round(base * country(s.residence.countryId).model.costIndex);
const afford = (amount: number) => (s: LifeState) => (s.family.savings + s.family.monthlyBudget * 3 >= amount ? null : "Not enough money right now.");
const age = (s: LifeState) => s.ageMonths / 12;
const isPro = (s: LifeState) => ["domestic-pro", "foreign-pro", "g-league", "nba"].includes(s.placement.node);
const onTeam = (s: LifeState) => !["home", "playground", "unattached"].includes(s.placement.node);
const evidence = (s: LifeState, text: string, weight: number) => s.evidence.push({ month: s.ageMonths, text, weight });

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
    id: "play-through-pain", ages: [13, 30], cooldown: 24, weight: (s) => (onTeam(s) && !s.condition.injury ? 1.2 : 0), title: "Pain before a big game",
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
    id: "burnout", ages: [13, 30], cooldown: 24, weight: (s) => (s.condition.energy < 35 ? 3 : 0), title: "Burned out",
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
    id: "agent", ages: [17.5, 26], cooldown: 0, once: true, weight: (s) => (s.exposure >= 22 ? 2 : 0), title: "An agent calls",
    body: "An agent wants to represent you. He takes a cut of every contract.",
    choices: [
      { id: "sign", label: "Sign with him", preview: "More offers abroad. He takes 5% of salary.", growth: 2, risk: 1, follow: { id: "agent-call", delay: 4 }, apply: ({ s }) => ((s.flags.agent = true), expo(s, 5), "He starts sending your film around.") },
      { id: "alone", label: "Handle it yourself", preview: "Keep your money. Fewer calls.", growth: 0, risk: 0, apply: () => "You keep answering your own phone." },
    ],
  },
  {
    id: "agent-call", ages: [17.5, 30], cooldown: 0, followUpOnly: true, weight: () => 1, title: "Your agent checks in", tone: "good",
    body: "Your agent has been busy.",
    auto: ({ s }) => (expo(s, 6), "Teams abroad are asking about you. Exposure +6."),
  },
  {
    id: "late-salary", ages: [18, 32], cooldown: 30, weight: (s) => (isPro(s) && s.placement.node !== "nba" && s.placement.node !== "g-league" && country(s.placement.countryId).income.level !== "HIC" ? 1.4 : isPro(s) ? 0.3 : 0), title: "Paychecks are late",
    body: "Your club is two months behind on salary.",
    choices: [
      { id: "wait", label: "Wait it out", preview: "Keep your spot. Money may not come.", growth: 0, risk: 1, apply: ({ s, rolls }) => (rolls[0]! < 0.6 ? "The money arrives eventually." : ((s.earnings -= (s.placement.contract?.salary ?? 0) / 6), "Some of it never comes.")) },
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
    id: "national-team", ages: [18, 30], cooldown: 12, weight: (s) => (country(s.citizenships[0]!).federation && currentLevel(s) >= 55 && isPro(s) ? 1.3 : 0), title: "National team call-up",
    body: (s) => `${country(s.citizenships[0]!).federation!.name} calls you up for the summer window.`,
    choices: [
      { id: "play", label: "Play for your country", preview: "Exposure up. Less summer rest. Small injury risk.", growth: 2, risk: 2, apply: ({ s, rolls, entryId }) => {
        expo(s, 8); energy(s, -12);
        evidence(s, `Played for ${country(s.citizenships[0]!).name} at ${Math.floor(age(s))}`, 9);
        if (rolls[0]! < 0.1) inflictInjury(s, "hamstring", "Hamstring strain", 2, 1, entryId);
        return "You hear your anthem before tip-off.";
      } },
      { id: "rest", label: "Rest this summer", preview: "Energy up.", growth: 0, risk: 0, apply: ({ s }) => (energy(s, 15), "You stay home and recover.") },
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
      { id: "send", label: "Send money home", preview: "Family support up. Savings down.", growth: 0, risk: 0, apply: ({ s }) => ((s.family.savings = Math.max(0, s.family.savings - 2000)), (s.family.support = "high"), tr(s, "motivation", 3), "They are proud of you.") },
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
      { id: "buy", label: "Negotiate the buyout", preview: "Opens NBA camp offers. Costs savings.", growth: 2, risk: 1, apply: ({ s }) => ((s.family.savings = Math.max(0, s.family.savings - 5000)), expo(s, 10), (s.flags.buyout = true), "You are free to sign with an NBA team this summer.") },
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
    id: "knee-scan", ages: [18, 34], cooldown: 30, weight: (s) => (s.condition.injuryHistory >= 2 ? 1.2 : 0), title: "A worrying scan",
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
      { id: "accept", label: "Accept", preview: "Adds a citizenship. You stop counting as an import there (game rule).", growth: 1, risk: 1, apply: ({ s }) => (s.citizenships.push(s.placement.countryId), "You take the oath. Your birthplace does not change.") },
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
    id: "retire-question", ages: [25, 35], cooldown: 12, weight: (s) => (s.achievements.nbaDebut === null && !isPro(s) ? 2 : 0), title: "Keep chasing it?",
    body: "No team this season. Friends from school have careers.",
    choices: [
      { id: "chase", label: "Keep chasing", preview: "Stay in the game.", growth: 1, risk: 1, apply: ({ s }) => (tr(s, "motivation", 4), "You book another gym.") },
      { id: "retire", label: "Hang it up", preview: "Ends this life.", growth: 0, risk: 3, apply: ({ s }) => ((s.ended = { month: s.ageMonths, reason: "retired" }), "You retire from playing.") },
    ],
  },
  {
    id: "growing-family", ages: [24, 34], cooldown: 0, once: true, weight: () => 0.6, title: "A family of your own", tone: "good",
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
  const base = { infancy: 0.055, childhood: 0.1, youth: 0.13, emerging: 0.11, adult: 0.08 }[stage];
  const pace = s.pacing === "short" ? 0.7 : s.pacing === "extended" ? 1.35 : 1;
  return s.ageMonths < 6 ? 0 : base * pace;
}
