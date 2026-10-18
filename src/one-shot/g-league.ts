import { calendar } from "./career";
import type { EventTemplate } from "./events";
import { clamp } from "./rng";
import type { AthleticKey, LifeState, SkillKey, TraitKey } from "./types";

const sk = (s: LifeState, k: SkillKey, d: number) => (s.skills[k] = clamp(s.skills[k] + d, 1, Math.max(s.skills[k], s.potentials[k])));
const tr = (s: LifeState, k: TraitKey, d: number) => (s.traits[k] = clamp(s.traits[k] + d, 0, 100));
const ath = (s: LifeState, k: AthleticKey, d: number) => (s.body[k] = clamp(s.body[k] + d, 1, 99));
const energy = (s: LifeState, d: number) => (s.condition.energy = clamp(s.condition.energy + d, 5, 100));
const expo = (s: LifeState, d: number) => (s.exposure = clamp(s.exposure + d, 0, 100));
const inG = (s: LifeState) => s.placement.node === "g-league";
const seasonMonth = (s: LifeState) => [10, 11, 12, 1, 2, 3].includes(calendar(s).month);
const ups = (s: LifeState) => (typeof s.flags.gCallups === "number" ? s.flags.gCallups : 0);
const parent = (s: LifeState) => (typeof s.flags.gParent === "string" ? s.flags.gParent : "the parent team");

/** Scenes that only happen on a G League roster. */
export const G_LEAGUE_EVENTS: EventTemplate[] = [
  {
    id: "g-showcase",
    ages: [18, 28],
    cooldown: 18,
    once: true,
    weight: (s) => (inG(s) && seasonMonth(s) ? 1.8 : 0),
    tone: "good",
    title: "Showcase weekend",
    body: "One gym, two days, and a row of suits who do not cheer. Your parent team sent a staffer. So did three other clubs.",
    choices: [
      { id: "game", label: "Play your role", preview: "Defense and a look from the parent team.", growth: 2, risk: 0, apply: ({ s }) => (sk(s, "perimeterD", 1), sk(s, "offBall", 1), expo(s, 4), (s.flags.gScouted = s.ageMonths), `You set two screens the staffer writes down. The ${parent(s)} ask for the full film.`) },
      { id: "hunt", label: "Hunt your own shots", preview: "Shooting and exposure. The coach is annoyed.", growth: 2, risk: 1, apply: ({ s }) => (sk(s, "shooting", 1), expo(s, 6), tr(s, "coachability", -2), (s.flags.gScouted = s.ageMonths), "You make four in a row. Your coach does not speak to you on the bus.") },
    ],
  },
  {
    id: "g-bus",
    ages: [18, 32],
    cooldown: 8,
    weight: (s) => (inG(s) && seasonMonth(s) ? 1.5 : 0),
    title: "The overnight bus",
    body: "Tip was at 7. The next game is tomorrow at 1, three hours down the highway. The bus smells like tape and coffee.",
    choices: [
      { id: "sleep", label: "Sleep in the back", preview: "Energy for tomorrow.", growth: 0, risk: 0, apply: ({ s }) => (energy(s, 8), "You wake up stiff and ready. The morning shootaround is short.") },
      { id: "film", label: "Watch film with the coach", preview: "IQ. You arrive tired.", growth: 2, risk: 1, apply: ({ s }) => (sk(s, "iq", 1), energy(s, -6), "He pauses on one rotation you missed. You see it the second time.") },
    ],
  },
  {
    id: "g-parent-row",
    ages: [18, 30],
    cooldown: 10,
    weight: (s) => (inG(s) && seasonMonth(s) ? 1.4 : 0),
    title: "A suit in the third row",
    body: (s) => `An assistant from the ${parent(s)} sits alone. He does not clap. After a miss he writes something down.`,
    choices: [
      { id: "for-him", label: "Play the next six minutes for him", preview: "Defense and a mark in their book.", growth: 2, risk: 1, apply: ({ s }) => (sk(s, "perimeterD", 1), tr(s, "composure", 2), expo(s, 3), (s.flags.gScouted = s.ageMonths), "You take a charge. He stays through the fourth.") },
      { id: "system", label: "Run the affiliate's sets", preview: "Passing. The visit stays quiet.", growth: 1, risk: 0, apply: ({ s }) => (sk(s, "passing", 1), "You make the extra pass. He leaves at the under-8 timeout.") },
    ],
  },
  {
    id: "g-roommate",
    ages: [18, 28],
    cooldown: 20,
    once: true,
    weight: (s) => (inG(s) && ups(s) === 0 ? 1.6 : 0),
    title: "Your roommate's phone",
    body: "It rings in the locker room. The parent team wants him tonight. Your phone stays face down on the bench.",
    choices: [
      { id: "work", label: "Stay and get shots up", preview: "Shooting and discipline.", growth: 2, risk: 0, apply: ({ s }) => (sk(s, "shooting", 1), tr(s, "discipline", 2), "The gym is yours. You do not check the box score until you are home.") },
      { id: "watch", label: "Watch his debut on the bus TV", preview: "Motivation. The night runs long.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "motivation", 3), energy(s, -4), "He plays four minutes. You memorize the way he checks in.") },
    ],
  },
  {
    id: "g-wire",
    ages: [18, 30],
    cooldown: 8,
    weight: (s) => (inG(s) && seasonMonth(s) && ups(s) < 2 ? 1.3 : 0),
    title: "The transaction wire",
    body: "Someone pulls it up on the bus. Two names from other affiliates got 10-days today. Yours is not there.",
    choices: [
      { id: "ready", label: "Pack a bag anyway", preview: "The parent team hears you are ready.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "discipline", 1), (s.flags.gScouted = s.ageMonths), "You leave cleats by the door. The call does not come this week.") },
      { id: "ask", label: "Ask the coach where you stand", preview: "Composure. He might be blunt.", growth: 1, risk: 1, apply: ({ s, rolls }) => (tr(s, "composure", 2), rolls[0]! < 0.5 ? "He says your defense travels and your shot does not." : "He says they like you. Liking you is not a roster spot.") },
    ],
  },
  {
    id: "g-tuesday",
    ages: [18, 32],
    cooldown: 7,
    weight: (s) => (inG(s) ? 1.2 : 0),
    title: "Tuesday in a high school gym",
    body: "The crowd is the other team's parents and one guy filming on a phone. The floor has a logo from a school you have never heard of.",
    choices: [
      { id: "defend", label: "Guard their best player", preview: "Defense and durability.", growth: 2, risk: 1, apply: ({ s }) => (sk(s, "perimeterD", 1), ath(s, "durability", 1), energy(s, -4), "He scores 11. You make him work for all of it.") },
      { id: "shoot", label: "Hunt the open ones", preview: "Shooting.", growth: 2, risk: 0, apply: ({ s }) => (sk(s, "shooting", 1), sk(s, "offBall", 1), "You make three before their parents start yelling at the ref.") },
    ],
  },
  {
    id: "g-split",
    ages: [19, 28],
    cooldown: 6,
    weight: (s) => (inG(s) && s.placement.contract?.twoWay ? 2 : 0),
    title: "Two buildings in one day",
    body: (s) => `You practiced with the ${parent(s)} this morning. Tonight you play 32 minutes two hours away, still in the same warmups you wore upstairs.`,
    choices: [
      { id: "play", label: "Take the minutes", preview: "Finishing and confidence.", growth: 2, risk: 1, apply: ({ s }) => (sk(s, "finishing", 1), tr(s, "confidence", 2), energy(s, -6), "You are gassed by the fourth. You still close the game.") },
      { id: "save", label: "Ask for a lighter night", preview: "Health. The affiliate coach shrugs.", growth: 0, risk: 1, apply: ({ s }) => (energy(s, 4), tr(s, "coachability", -1), "You play 18. He puts you back in when it gets close.") },
    ],
  },
  {
    id: "g-paycheck",
    ages: [18, 30],
    cooldown: 14,
    once: true,
    weight: (s) => (inG(s) && !s.placement.contract?.twoWay ? 1.5 : 0),
    title: "$40,500",
    body: "The deposit hits. It covers the apartment you share and the groceries. It does not cover a flight home for the holidays.",
    choices: [
      { id: "stay", label: "Stay in town and train", preview: "Strength and discipline.", growth: 2, risk: 0, apply: ({ s }) => (ath(s, "strength", 1), tr(s, "discipline", 2), "The gym is open on Christmas morning. You are the only one there.") },
      { id: "home", label: "Drive home overnight", preview: "Energy later. You miss a practice.", growth: 0, risk: 1, apply: ({ s }) => (energy(s, 6), tr(s, "coachability", -1), "You make it for dinner. The coach texts once and does not follow up.") },
    ],
  },
  {
    id: "g-other-club",
    ages: [19, 30],
    cooldown: 16,
    once: true,
    weight: (s) => (inG(s) && typeof s.flags.gScouted === "number" ? 1.7 : 0),
    title: "A workout that is not your team",
    body: "An NBA club that does not own your rights wants you on an off day. Your affiliate coach says the choice is yours.",
    choices: [
      { id: "go", label: "Make the workout", preview: "Exposure. You show up tired the next night.", growth: 2, risk: 1, apply: ({ s }) => (expo(s, 5), energy(s, -5), (s.flags.gScouted = s.ageMonths), "They time your lane agility and do not promise anything.") },
      { id: "rest", label: "Rest for the affiliate", preview: "Health and coachability.", growth: 1, risk: 0, apply: ({ s }) => (energy(s, 5), tr(s, "coachability", 2), "You sleep. The affiliate wins by six and you play the fourth.") },
    ],
  },
  {
    id: "g-cut-line",
    ages: [18, 32],
    cooldown: 12,
    weight: (s) => (inG(s) && ["deep-bench", "bench"].includes(s.placement.role) ? 1.4 : 0),
    title: "The active list",
    body: "The roster has to shrink. Your name is near the bottom of the sheet taped to the wall.",
    choices: [
      { id: "fight", label: "Ask for the matchup nobody wants", preview: "Defense. You might stay.", growth: 2, risk: 1, apply: ({ s }) => (sk(s, "interiorD", 1), tr(s, "motivation", 2), "You guard their big and foul him twice. The coach leaves your name on the list.") },
      { id: "trade", label: "Ask for a move to another affiliate", preview: "A fresh parent team. You start over.", growth: 1, risk: 1, apply: ({ s }) => (expo(s, 2), (s.placement.teamName = "G League affiliate (another NBA team)"), delete s.flags.gParent, "A different club takes the rights. The climb starts again.") },
    ],
  },
  {
    id: "g-exhibit",
    ages: [19, 27],
    cooldown: 24,
    once: true,
    weight: (s) => (inG(s) && (ups(s) >= 1 || s.placement.role === "starter") ? 1.6 : 0),
    tone: "good",
    title: "An Exhibit 10 for next camp",
    body: (s) => `The ${parent(s)} offer a camp invite for October. It is not a roster spot. It is a month to make them keep you.`,
    choices: [
      { id: "take", label: "Take the camp deal", preview: "You report in October.", growth: 2, risk: 0, apply: ({ s }) => ((s.flags.campDeal = true), (s.flags.campTeam = parent(s)), "You sign the paper. October is the only month that matters now.") },
      { id: "stay", label: "Stay with the affiliate", preview: "Minutes now. Camp can wait.", growth: 1, risk: 0, apply: ({ s }) => (sk(s, "iq", 1), "You tell them you want to play. They say the invite will still be there.") },
    ],
  },
];
