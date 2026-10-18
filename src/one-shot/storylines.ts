import { calendar, performanceLevel } from "./career";
import type { EventTemplate } from "./events";
import { clamp, hashString } from "./rng";
import { NBA_TEAMS } from "./routes";
import type { AthleticKey, LifeState, Role, SkillKey, TraitKey } from "./types";
import { country, maybeLeague } from "./world";

const sk = (s: LifeState, k: SkillKey, d: number) => (s.skills[k] = clamp(s.skills[k] + d, 1, Math.max(s.skills[k], s.potentials[k])));
const drop = (s: LifeState, k: SkillKey, d: number) => (s.skills[k] = clamp(s.skills[k] - d, 1, 99));
const tr = (s: LifeState, k: TraitKey, d: number) => (s.traits[k] = clamp(s.traits[k] + d, 0, 100));
const ath = (s: LifeState, k: AthleticKey, d: number) => (s.body[k] = clamp(s.body[k] + d, 1, 99));
const energy = (s: LifeState, d: number) => (s.condition.energy = clamp(s.condition.energy + d, 5, 100));
const expo = (s: LifeState, d: number) => (s.exposure = clamp(s.exposure + d, 0, 100));
const acad = (s: LifeState, d: number) => (s.education.academics = clamp(s.education.academics + d, 0, 100));
const month = (s: LifeState) => calendar(s).month;
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const club = (s: LifeState) => s.placement.node === "domestic-pro" || s.placement.node === "foreign-pro";
const onLoan = (s: LifeState) => (s.placement.teamName ?? "").includes("(on loan)");
const loose = (s: LifeState) => s.placement.node === "unattached" || s.placement.node === "playground";
const season = (s: LifeState) => [10, 11, 12, 1, 2, 3, 4].includes(month(s));
const team = (s: LifeState) => s.placement.teamName ?? "the club";

/** Second leagues that have a verified first division in the same snapshot. */
const UP: Record<string, string> = {
  "lnb-elite2": "lnb-elite",
  proa: "bbl",
  nkl: "lkl",
  nbl1: "nbl-au",
  "pleague-tw": "tpbl-tw",
  "nz-nbl": "nbl-au",
};

const HOSTS = new Set(["ES", "FR", "DE", "IT", "LT", "RS", "TR", "GR"]);

const HOLES: { key: SkillKey; name: string }[] = [
  { key: "finishing", name: "your left hand" },
  { key: "perimeterD", name: "your closeouts" },
  { key: "rebounding", name: "the post" },
  { key: "decisions", name: "the pick-and-roll read" },
];

function hole(s: LifeState) {
  return HOLES.reduce((a, b) => (s.skills[b.key] < s.skills[a.key] ? b : a));
}

function bestSkill(s: LifeState): { key: SkillKey; name: string } {
  const list: { key: SkillKey; name: string }[] = [
    { key: "shooting", name: "your shot" },
    { key: "handle", name: "the ball in your hands" },
    { key: "perimeterD", name: "your defense" },
    { key: "passing", name: "your passing" },
    { key: "finishing", name: "your finishing" },
  ];
  return list.reduce((a, b) => (s.skills[b.key] > s.skills[a.key] ? b : a));
}

function upstairsId(s: LifeState): string | null {
  const id = s.placement.leagueId;
  if (!id || !UP[id] || !club(s)) return null;
  return UP[id];
}

function isRole(v: unknown): v is Role {
  return v === "none" || v === "deep-bench" || v === "bench" || v === "rotation" || v === "starter" || v === "star";
}

function bumpRole(s: LifeState, d: number) {
  const order = ["deep-bench", "bench", "rotation", "starter", "star"] as const;
  const i = order.indexOf(s.placement.role as (typeof order)[number]);
  if (i < 0) return;
  s.placement.role = order[clamp(i + d, 0, order.length - 1)]!;
}

function goUpstairs(s: LifeState): string | null {
  const next = upstairsId(s);
  if (!next) return null;
  const league = maybeLeague(next);
  s.flags.upFrom = s.placement.leagueId ?? "";
  s.flags.upRole = s.placement.role;
  s.flags.upCoach = s.placement.coaching;
  s.placement.leagueId = next;
  s.placement.role = "bench";
  if (league?.model) s.placement.coaching = Math.max(s.placement.coaching, league.model.coaching);
  return league?.name ?? next;
}

function comeDown(s: LifeState): boolean {
  const from = s.flags.upFrom;
  const role = s.flags.upRole;
  const coach = s.flags.upCoach;
  const top = typeof from === "string" ? UP[from] : undefined;
  delete s.flags.upFrom;
  delete s.flags.upRole;
  delete s.flags.upCoach;
  if (typeof from !== "string" || !top || s.placement.leagueId !== top) return false;
  s.placement.leagueId = from;
  if (isRole(role)) s.placement.role = role;
  if (typeof coach === "number") s.placement.coaching = coach;
  return true;
}

function promote(s: LifeState): string | null {
  const next = upstairsId(s);
  if (!next) return null;
  const league = maybeLeague(next);
  s.placement.leagueId = next;
  s.placement.role = "bench";
  if (league?.model) s.placement.coaching = league.model.coaching;
  expo(s, 6);
  return league?.name ?? next;
}

function abroadYouth(s: LifeState) {
  return s.placement.node === "elite-youth" && HOSTS.has(s.residence.countryId) && s.residence.countryId !== s.birthplace.countryId;
}

function sendHome(s: LifeState, film: boolean) {
  const birth = s.birthplace.countryId;
  const c = country(birth);
  s.residence = { countryId: birth, locality: c.capital ?? c.name, localityKind: c.capital ? "capital" : "city" };
  s.placement = { node: "unattached", countryId: birth, leagueId: null, teamName: null, role: "none", coaching: 40, since: s.ageMonths, contract: null, costPerYear: 0 };
  s.flags.reviewSoon = true;
  if (film) {
    expo(s, 8);
    s.flags.overseasHunt = s.ageMonths;
    s.evidence.push({ month: s.ageMonths, text: "Academy film from the year abroad.", weight: 2 });
  } else expo(s, -4);
}

function endLoan(s: LifeState) {
  s.placement.teamName = (s.placement.teamName ?? "the club").replace(" (on loan)", "");
}

function raisePay(s: LifeState, mult: number) {
  if (s.placement.contract) s.placement.contract.salary = Math.round(s.placement.contract.salary * mult);
}

function flightCost(s: LifeState) {
  return Math.max(400, Math.round((800 * country(s.birthplace.countryId).model.costIndex) / 50) * 50);
}

function otherNba(s: LifeState): string {
  const cur = s.placement.teamName ?? "";
  const pool = NBA_TEAMS.filter((t) => t !== cur);
  return pool[hashString(`${s.seed}:thin:${s.ageMonths}`) % pool.length] ?? "a thin roster";
}

function sheetLabel(s: LifeState): string {
  const c = s.draft.combine;
  if (!c) return "wing";
  const extra = c.wingspanCm - c.heightCm;
  if (c.heightCm >= 208) return "center";
  if (c.heightCm >= 203 && extra < 8) return "center";
  if (extra >= 12 && c.heightCm < 198) return "guard";
  if (c.heightCm >= 198) return "forward";
  return "guard";
}

function trainHole(s: LifeState): string {
  const h = hole(s);
  sk(s, h.key, 3);
  if (h.key === "decisions" && s.body.heightCm < 198) s.flags.listedAs = "point guard";
  if (h.key === "shooting" && s.body.heightCm >= 206) s.flags.listedAs = "stretch big";
  if (h.key === "perimeterD") s.flags.listedAs = "defender";
  return h.name;
}

function rivalName(s: LifeState): string {
  return s.peers[0]?.name ?? "a player from your year";
}

function slowReturn(s: LifeState) {
  if (s.plan.workload !== "low") s.flags.restoreWorkload = s.plan.workload;
  s.plan.workload = "low";
  s.flags.restoreAt = s.ageMonths + 2;
}

const college = (s: LifeState) => {
  if (s.placement.node !== "university") return null;
  if (s.placement.coaching >= 85) return "high" as const;
  if (s.placement.coaching >= 68) return "mid" as const;
  return "low" as const;
};

const nbaMore = (s: LifeState) => s.placement.node === "nba" && ["bench", "rotation", "starter", "star"].includes(s.placement.role);

/** Branch scenes. Each one belongs to a path that already existed and then went quiet. */
export const STORY_EVENTS: EventTemplate[] = [
  {
    id: "senior-outdoor",
    ages: [17, 34],
    cooldown: 12,
    weight: (s) => (s.placement.node === "local-senior" && (month(s) === 7 || month(s) === 8) ? 1.8 : 0),
    title: "The outdoor tournament",
    body: "Once a year the city puts a court in the square. The senior club enters. The winner leaves with a cup and a crowd.",
    choices: [
      { id: "play", label: "Play the weekend", preview: "Confidence if you win the weekend. Exposure either way.", growth: 2, risk: 1, apply: ({ s, rolls }) => (rolls[0]! < 0.5 ? (tr(s, "confidence", 3), expo(s, 5), "You win the last game in the square. People stay to watch you untie your shoes.") : (expo(s, 2), "You lose in the semi. A few of them still know your name on Monday.")) },
      { id: "skip", label: "Rest the knee", preview: "Energy back. The crowd sees someone else.", growth: 0, risk: 0, apply: ({ s }) => (energy(s, 8), "You sit the weekend. The cup goes to another club.") },
    ],
  },
  {
    id: "senior-film",
    ages: [18, 34],
    cooldown: 14,
    weight: (s) => (s.placement.node === "local-senior" ? 1.4 : 0),
    title: "The federation official",
    body: "He has one contact at a real league and a desk full of film he has not sent. Yours is in the pile.",
    choices: [
      { id: "push", label: "Ask him to send it", preview: "He might send the film. He might leave it on the desk.", growth: 1, risk: 1, apply: ({ s, rolls }) => (rolls[0]! < 0.55 ? (expo(s, 8), (s.flags.reviewSoon = true), (s.flags.overseasHunt = s.ageMonths), s.evidence.push({ month: s.ageMonths, text: "Federation film sent to one league.", weight: 2 }), "He sends it to one league. He will not say which.") : (tr(s, "motivation", -1), "He says next month. The file stays on the desk.")) },
      { id: "leave", label: "Leave it", preview: "You stay the local star. No film goes out.", growth: 0, risk: 0, apply: ({ s }) => (tr(s, "confidence", 1), "You let it sit. Saturday's game is still yours.") },
    ],
  },
  {
    id: "senior-final",
    ages: [18, 34],
    cooldown: 0,
    once: true,
    weight: (s) => (s.placement.node === "local-senior" && (month(s) === 8 || month(s) === 9) ? 1.6 : 0),
    title: "The final in the capital",
    body: (s) => `The cup final is in ${country(s.residence.countryId).capital ?? country(s.residence.countryId).name}. One bus, one game, and a hall that fits more people than your home court.`,
    choices: [
      { id: "start", label: "Start the final", preview: "A big night at home. Exposure either way.", growth: 2, risk: 1, apply: ({ s, rolls }) => (rolls[0]! < 0.5 ? (expo(s, 7), tr(s, "confidence", 3), "You win it. The hall stays full until you leave the floor.") : (expo(s, 3), "You lose by four. The bus ride home is quiet, and your name was in the program.")) },
      { id: "minutes", label: "Take what the coach gives you", preview: "Discipline. A smaller night.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "discipline", 2), expo(s, 1), "You play the minutes he writes. The cup goes the other way.") },
    ],
  },
  {
    id: "senior-flight",
    ages: [18, 30],
    cooldown: 0,
    once: true,
    weight: (s) => (s.placement.node === "local-senior" ? 1.2 : 0),
    title: "A tryout and a fare",
    body: "A club abroad will look at you if you get there. The fare comes out of the family's savings. The senior team will not hold the spot.",
    choices: [
      {
        id: "fly",
        label: "Buy the ticket",
        preview: (s) => `Spends ${usd(flightCost(s))} of family savings. You give up the senior club. You may come home with no offer.`,
        blocked: (s) => (s.family.savings >= flightCost(s) ? null : "Your family does not have the fare."),
        growth: 2,
        risk: 2,
        apply: ({ s, rolls }) => {
          s.family.savings -= flightCost(s);
          s.placement = { ...s.placement, node: "unattached", teamName: null, leagueId: null, role: "none", since: s.ageMonths, contract: null };
          s.flags.overseasHunt = s.ageMonths;
          s.flags.reviewSoon = true;
          if (rolls[0]! < 0.45) {
            expo(s, 8);
            return "The tryout goes well enough that they keep your film. No contract today.";
          }
          expo(s, 2);
          return "You miss the flight's worth of shots. They thank you and keep the next player on the floor.";
        },
      },
      { id: "stay", label: "Stay the local star", preview: "The savings stay. So does the club.", growth: 0, risk: 0, apply: ({ s }) => (tr(s, "confidence", 2), "You stay. Saturday is still your gym.") },
    ],
  },
  {
    id: "second-week",
    ages: [18, 32],
    cooldown: 10,
    weight: (s) => (upstairsId(s) && season(s) ? 1.7 : 0),
    title: "A month upstairs",
    body: (s) => `The first team needs a body. One month in ${maybeLeague(upstairsId(s))?.name ?? "the top league"}, then back, unless they decide they like you.`,
    choices: [
      { id: "go", label: "Go upstairs", preview: "A month on the first-team bench. Then you come back down.", growth: 2, risk: 1, follow: { id: "second-week-back", delay: 1 }, apply: ({ s }) => { const name = goUpstairs(s); expo(s, 4); return `You dress for ${name ?? "the first team"}. The minutes are short and the building is full.`; } },
      { id: "title", label: "Stay and chase this league", preview: "You give up the month upstairs. You keep a real role here.", growth: 1, risk: 0, apply: ({ s }) => (bumpRole(s, 1), tr(s, "confidence", 2), "You stay and play. The first team finds someone else for the month.") },
    ],
  },
  {
    id: "second-week-back",
    ages: [18, 34],
    cooldown: 0,
    followUpOnly: true,
    weight: () => 1,
    title: "The month ends",
    body: "The first-team month is over. The coach tells you where you dress next.",
    choices: [
      {
        id: "hear",
        label: "Hear it",
        preview: "Most months you go back down. Some months they keep you.",
        growth: 1,
        risk: 1,
        apply: ({ s, rolls }) => {
          const from = s.flags.upFrom;
          const stillUp = typeof from === "string" && UP[from] === s.placement.leagueId;
          if (rolls[0]! < 0.22 && stillUp) {
            delete s.flags.upFrom;
            delete s.flags.upRole;
            delete s.flags.upCoach;
            s.placement.role = "bench";
            expo(s, 4);
            return "They keep you. The bench upstairs is yours for the rest of the year.";
          }
          const back = comeDown(s);
          return back ? "You go back to the second team. The film from upstairs is on your phone." : "You are already somewhere else. The month upstairs is just a line in the log.";
        },
      },
    ],
  },
  {
    id: "second-promotion",
    ages: [18, 34],
    cooldown: 0,
    once: true,
    weight: (s) => (upstairsId(s) && (s.placement.role === "starter" || s.placement.role === "star") && performanceLevel(s) >= 58 ? 1.8 : 0),
    title: "The club goes up",
    body: (s) => `${team(s)} finishes in the promotion places. Next year the club plays in ${maybeLeague(upstairsId(s))?.name ?? "the top league"}. You can go with them or leave for a rival that is staying down.`,
    choices: [
      { id: "go", label: "Go up with the club", preview: "The club moves to the top league. Your role drops to the bench.", growth: 2, risk: 1, apply: ({ s }) => { const name = promote(s); return `The club moves into ${name ?? "the top league"}. You come with them and sit.`; } },
      { id: "stay", label: "Leave for a rival and keep starting", preview: "You give up the promotion. You stay in this league as a starter.", growth: 1, risk: 0, apply: ({ s }) => (s.placement.coaching = clamp(s.placement.coaching - 4, 30, 95), s.placement.role = "starter", expo(s, 2), "A rival in the same league takes you. You keep the ball and lose the bigger building.") },
    ],
  },
  {
    id: "youth-host",
    ages: [14, 19],
    cooldown: 10,
    weight: (s) => (abroadYouth(s) ? 1.5 : 0),
    title: "The host family",
    body: "The club put you in a house with a family that speaks the language of the league. Dinner is at seven. Practice runs past it.",
    choices: [
      { id: "dinner", label: "Eat with them", preview: "Energy and a little of the language. You miss extra shots.", growth: 1, risk: 0, apply: ({ s }) => (energy(s, 6), tr(s, "motivation", 2), acad(s, 2), "You eat with them. The mother corrects a word and does not make a thing of it.") },
      { id: "gym", label: "Stay in the gym", preview: "One skill. You come home after they have eaten.", growth: 1, risk: 0, apply: ({ s }) => (sk(s, "offBall", 1), energy(s, -4), "You shoot until the lights drop. Your plate is in the oven.") },
    ],
  },
  {
    id: "youth-school",
    ages: [14, 19],
    cooldown: 12,
    weight: (s) => (abroadYouth(s) ? 1.4 : 0),
    title: "School in another language",
    body: "The academy said school was part of the move. The class is fast, and the homework is in a language you read slowly.",
    choices: [
      { id: "class", label: "Go to class", preview: "Grades up. Less time on the court.", growth: 1, risk: 0, apply: ({ s }) => (acad(s, 6), energy(s, -4), "You sit in the front. Half the lesson lands.") },
      { id: "skip", label: "Skip it for practice", preview: "Handle up. Grades drop.", growth: 1, risk: 1, apply: ({ s }) => (sk(s, "handle", 1), acad(s, -3), "You get a captain's practice. The school calls the club.") },
    ],
  },
  {
    id: "youth-minutes",
    ages: [14, 19],
    cooldown: 8,
    weight: (s) => (abroadYouth(s) ? 1.6 : 0),
    title: "The local kids play",
    body: "The coach who promised you minutes starts the players from this city. Your name is on the bench in pencil.",
    choices: [
      { id: "fight", label: "Ask him about the promise", preview: "You might get a quarter. You might watch.", growth: 1, risk: 1, apply: ({ s, rolls }) => (rolls[0]! < 0.42 ? (bumpRole(s, 1), "He gives you a quarter. He does not apologize.") : (tr(s, "coachability", -2), "He plays the local kids. You watch from the second chair.")) },
      { id: "wait", label: "Wait your turn", preview: "Discipline. The minutes stay theirs tonight.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "discipline", 2), "You warm them up and sit. He nods at you once.") },
    ],
  },
  {
    id: "youth-release",
    ages: [15, 19],
    cooldown: 0,
    once: true,
    weight: (s) => (abroadYouth(s) && month(s) === 3 ? 1.8 : 0),
    title: "Released in March",
    body: "The academy is cutting the imports. You can go home with the film, go home without it, or stay in the country and not play.",
    choices: [
      { id: "film", label: "Go home with the film", preview: "You leave the academy and the country. The film is what you take.", growth: 1, risk: 1, apply: ({ s }) => (sendHome(s, true), "You fly home with the film. The roster spot is gone.") },
      { id: "empty", label: "Go home with nothing", preview: "You leave the academy. No film goes with you.", growth: 0, risk: 2, apply: ({ s }) => (sendHome(s, false), "You fly home. The camera footage stays on their computer.") },
      { id: "sit", label: "Stay and sit", preview: "You keep the country. You lose the minutes.", growth: 0, risk: 1, apply: ({ s }) => (s.placement.role = "deep-bench", expo(s, -3), "You stay. Practice is optional and the games go on without you.") },
    ],
  },
  {
    id: "hs-weekend",
    ages: [15, 19],
    cooldown: 8,
    weight: (s) => (s.placement.node === "us-high-school" && season(s) ? 1.5 : 0),
    title: "Two coaches, one Saturday",
    body: "The school coach has a game. The travel coach has a showcase the same day, and both of them think you already said yes.",
    choices: [
      { id: "school", label: "Play for the school", preview: "The school coach keeps you. The showcase goes on without you.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "coachability", 2), sk(s, "offBall", 1), "You play the school game. The travel coach texts you the score from the other gym.") },
      { id: "travel", label: "Play the showcase", preview: "Exposure. The school coach loses you for his game.", growth: 2, risk: 1, apply: ({ s }) => (expo(s, 6), tr(s, "coachability", -2), "You play in front of the college coaches. Monday's practice is cold.") },
    ],
  },
  {
    id: "hs-district",
    ages: [15, 19],
    cooldown: 0,
    once: true,
    weight: (s) => (s.placement.node === "us-high-school" && (month(s) === 2 || month(s) === 3) ? 1.7 : 0),
    title: "The district final",
    body: "One game for the district. The gym is the same one you practice in, with the bleachers pulled out.",
    choices: [
      { id: "play", label: "Play it", preview: "A win moves your name. A loss still puts you on film.", growth: 2, risk: 1, apply: ({ s, rolls }) => (rolls[0]! < 0.5 ? (expo(s, 8), tr(s, "confidence", 3), "You win it in the last minute. A coach in a polo stays after.") : (expo(s, 3), "You lose in the fourth. Two coaches still write the number on your jersey.")) },
      { id: "ok", label: "Play your role", preview: "Discipline. A quieter night.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "discipline", 2), "You run what the coach calls. The other team gets the trophy.") },
    ],
  },
  {
    id: "hs-reclass",
    ages: [16, 18],
    cooldown: 0,
    once: true,
    weight: (s) => (s.placement.node === "us-high-school" ? 1.1 : 0),
    title: "Reclass",
    body: "A handler wants you to repeat the year. You stay in high school. Graduation, and the draft year after it, move back.",
    choices: [
      { id: "do", label: "Reclass", preview: "You give up this year's graduation. The draft year that follows it moves back. Exposure drops now.", growth: 1, risk: 1, apply: ({ s }) => (s.flags.reclass = true, expo(s, -6), acad(s, 2), "You tell the school you are staying. The handler says the extra summer is the point.") },
      { id: "no", label: "Graduate on time", preview: "You keep this year's path.", growth: 0, risk: 0, apply: ({ s }) => (tr(s, "confidence", 1), "You stay with your class.") },
    ],
  },
  {
    id: "hs-showcase",
    ages: [16, 19],
    cooldown: 0,
    once: true,
    weight: (s) => (s.placement.node === "us-high-school" && (month(s) === 4 || month(s) === 7) ? 1.4 : 0),
    title: "All-star game or a dunk contest",
    body: "Saturday is an all-star game with college coaches in the second row. Sunday is a dunk contest in a gym that rented the hoops by the hour.",
    choices: [
      { id: "star", label: "Play the all-star game", preview: "Puts you on the list colleges already have. You skip the dunk contest.", growth: 2, risk: 0, apply: ({ s }) => (expo(s, 8), (s.flags.reviewSoon = true), "You play with the prospects. A coach asks your coach for the transcript.") },
      { id: "dunk", label: "Enter the dunk contest", preview: "A louder gym. Nobody with a roster is in it.", growth: 1, risk: 0, apply: ({ s }) => (ath(s, "vertical", 1), expo(s, 1), "You win a gift card. The coaches were at the other gym.") },
    ],
  },
  {
    id: "ncaa-redshirt",
    ages: [18, 21],
    cooldown: 0,
    once: true,
    weight: (s) => (college(s) === "high" && month(s) === 10 ? 1.8 : 0),
    title: "The redshirt",
    body: "The staff wants to hold you out. You practice, you dress some nights, and the season does not count as yours.",
    choices: [
      { id: "sit", label: "Redshirt", preview: "You give up this season's minutes. The scholarship stays. You come back a year older in the same program.", growth: 1, risk: 0, apply: ({ s }) => (s.placement.role = "deep-bench", s.flags.redshirt = true, expo(s, -6), ath(s, "durability", 2), "You sit the year. The older players take the shots you thought were yours.") },
      { id: "play", label: "Ask to play", preview: "You keep a freshman's minutes. The redshirt year is gone.", growth: 1, risk: 1, apply: ({ s }) => (energy(s, -4), bumpRole(s, 1), "They play you. Some nights that is four minutes.") },
    ],
  },
  {
    id: "ncaa-conf",
    ages: [18, 23],
    cooldown: 12,
    weight: (s) => (college(s) === "mid" && month(s) === 3 ? 2 : 0),
    title: "The conference tournament",
    body: "One weekend, one city, a bracket. A run here moves your name on draft boards before Monday.",
    choices: [
      { id: "play", label: "Play the weekend", preview: "A run moves your stock. A first-round loss still leaves film.", growth: 2, risk: 1, apply: ({ s, rolls }) => (rolls[0]! < 0.4 ? (expo(s, 14), tr(s, "confidence", 3), "You win two games. A scout who had you in the second round stays for the third.") : (expo(s, 3), "You lose in the first round. One scout stays for the second half anyway.")) },
      { id: "rest", label: "Save the ankle", preview: "Health. The weekend goes on without you.", growth: 0, risk: 0, apply: ({ s }) => (energy(s, 8), expo(s, -2), "You watch from the bench in a boot. The team loses on Saturday.") },
    ],
  },
  {
    id: "ncaa-job",
    ages: [18, 23],
    cooldown: 10,
    weight: (s) => (college(s) === "low" ? 1.5 : 0),
    title: "The coach will not call",
    body: "Your coach says he does not have a number for an NBA team. The campus job board has a shift that fits around practice.",
    choices: [
      { id: "job", label: "Take the campus job", preview: "A little pay. Grades up. You are tired at practice.", growth: 1, risk: 0, apply: ({ s }) => (s.finance.cash += 600, energy(s, -6), acad(s, 3), "You work the desk three nights a week. The paycheck is small and on time.") },
      { id: "ask", label: "Ask him to call anyway", preview: "He might know someone. He might not.", growth: 1, risk: 1, apply: ({ s, rolls }) => (rolls[0]! < 0.22 ? (expo(s, 8), (s.flags.reviewSoon = true), "He finds one person who used to scout this conference. The person asks for film.") : (acad(s, 1), "He does not have the number. He tells you to finish the paper that is due Thursday.")) },
    ],
  },
  {
    id: "ncaa-roommate",
    ages: [19, 23],
    cooldown: 0,
    once: true,
    weight: (s) => (s.placement.node === "university" && month(s) === 6 ? 1.6 : 0),
    title: "Your roommate hears his name",
    body: (s) => {
      const mate = s.peers.find((p) => p.drafted)?.name ?? "Your roommate";
      return `${mate} gets drafted. You have a class at nine the next morning.`;
    },
    choices: [
      { id: "class", label: "Go to class", preview: "Grades. The draft is already over.", growth: 0, risk: 0, apply: ({ s }) => (acad(s, 4), "You go to class. He texts you a photo of the hat.") },
      { id: "gym", label: "Stay in the gym", preview: "Extra work. You miss the morning class.", growth: 1, risk: 0, apply: ({ s }) => (expo(s, 3), energy(s, -6), sk(s, "shooting", 1), "You shoot until the building closes. His name is already in the transaction wire.") },
    ],
  },
  {
    id: "draft-sheet",
    ages: [19, 25],
    cooldown: 0,
    once: true,
    weight: (s) => (s.draft.combine && s.draft.combine.year === calendar(s).year && month(s) === 8 ? 2.2 : 0),
    title: "The combine sheet",
    body: (s) => {
      const c = s.draft.combine;
      if (!c) return "The measurements come back.";
      return `They measured you without shoes. ${c.heightCm} cm, wingspan ${c.wingspanCm} cm. The sheet lists you as a ${sheetLabel(s)}.`;
    },
    choices: [
      { id: "own", label: "Own the label", preview: "Teams keep the position on the sheet. Exposure up.", growth: 1, risk: 0, apply: ({ s }) => (s.flags.listedAs = sheetLabel(s), expo(s, 4), `You let them call you a ${sheetLabel(s)}. The workouts that follow are for that spot.`) },
      { id: "fight", label: "Tell them they're wrong", preview: "You push back on the label. A few rooms get colder.", growth: 1, risk: 1, apply: ({ s }) => (tr(s, "confidence", 2), delete s.flags.listedAs, "You tell the next workout you can play the spot you grew up in. One staffer crosses a line out.") },
    ],
  },
  {
    id: "draft-promise-broke",
    ages: [19, 25],
    cooldown: 0,
    once: true,
    weight: (s) => (s.draft.promise && s.draft.result && s.draft.result.year === calendar(s).year && s.draft.result.team !== s.draft.promise.team && month(s) === 9 ? 2.4 : 0),
    title: "They promised",
    body: (s) => `The ${s.draft.promise?.team ?? "team"} said they would take you at ${s.draft.promise?.pick ?? "their pick"}. Draft night, they took someone else.`,
    choices: [
      { id: "drop", label: "Stop waiting on them", preview: "You end it. The promise is already broken.", growth: 0, risk: 0, apply: ({ s }) => (tr(s, "motivation", 3), tr(s, "composure", -1), "You stop returning the texts. The pick they made is not your problem anymore.") },
      { id: "keep", label: "Keep the relationship", preview: "You stay polite. They still might call in the summer. They might not.", growth: 1, risk: 1, apply: ({ s }) => (tr(s, "coachability", 2), expo(s, 2), "You congratulate the player they took. A scout says they will call if a camp spot opens. He does not give a date.") },
    ],
  },
  {
    id: "draft-room",
    ages: [19, 25],
    cooldown: 0,
    once: true,
    weight: (s) => (s.draft.result && s.draft.result.year === calendar(s).year && s.draft.result.pick !== null && month(s) === 7 ? 2.2 : 0),
    title: "The green room",
    body: (s) => `You sit where they can see you. They call your name at ${s.draft.result?.pick}. The room does the thing rooms do.`,
    choices: [
      { id: "call", label: "Call home", preview: "You leave the room for a minute. The night is already decided.", growth: 0, risk: 0, apply: ({ s }) => (tr(s, "motivation", 2), "You call home from the hallway. They already saw it.") },
      { id: "sit", label: "Stay in the chair", preview: "Composure. You shake the hand they point you to.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "composure", 2), "You stay until they tell you where to stand.") },
    ],
  },
  {
    id: "draft-lot",
    ages: [19, 25],
    cooldown: 0,
    once: true,
    weight: (s) => (s.draft.result && s.draft.result.year === calendar(s).year && s.draft.result.pick === null && s.placement.node !== "nba" && month(s) === 7 ? 2.4 : 0),
    title: "The parking lot",
    body: "The draft ends. Your name did not come. In the parking lot a staffer asks for your number and says the word camp.",
    choices: [
      { id: "number", label: "Give him the number", preview: "He might call. Camp is not a roster spot.", growth: 1, risk: 1, apply: ({ s }) => (s.flags.reviewSoon = true, expo(s, 4), "You give him the number. He says camp. He does not say which week.") },
      { id: "home", label: "Go home", preview: "You leave the building. The phone can stay quiet.", growth: 0, risk: 0, apply: ({ s }) => (energy(s, 6), "You fly home. Nobody from that hallway calls this month.") },
    ],
  },
  {
    id: "nba-closer",
    ages: [20, 36],
    cooldown: 12,
    weight: (s) => (s.placement.node === "nba" && (s.placement.role === "starter" || s.placement.role === "star") && month(s) === 4 ? 1.6 : 0),
    title: "The last five minutes",
    body: "April. The game is close and the coach looks down the bench, then back at you. The last five minutes are the closer's minutes.",
    choices: [
      { id: "take", label: "Take them", preview: "You might make the shots. You might come out.", growth: 2, risk: 2, apply: ({ s, rolls }) => (rolls[0]! < 0.55 ? (sk(s, "decisions", 1), tr(s, "composure", 2), "You make the shots they ran for you. He leaves you in.") : (tr(s, "composure", -2), "You miss two. He takes you out with a minute left.")) },
      { id: "defer", label: "Give them to the veteran", preview: "The coach trusts you to know whose night it is.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "coachability", 2), "You point at the veteran. The coach nods and you check out.") },
    ],
  },
  {
    id: "nba-veteran",
    ages: [20, 34],
    cooldown: 14,
    weight: (s) => (nbaMore(s) ? 1.3 : 0),
    title: "He takes your spot",
    body: "A veteran is back from the injury list. Your minutes move to his row on the sheet. He can walk you through the report, or he can freeze you out of the drill.",
    choices: [
      { id: "learn", label: "Ask him to teach you", preview: "IQ up. Your minutes stay his for now.", growth: 2, risk: 0, apply: ({ s }) => (sk(s, "iq", 2), tr(s, "coachability", 2), "He stays after and shows you where the help comes from. The starting job stays his.") },
      { id: "fight", label: "Fight him for the spot", preview: "You might win the minutes back. You might lose the room.", growth: 1, risk: 2, apply: ({ s, rolls }) => (rolls[0]! < 0.38 ? (bumpRole(s, 1), "You outplay him for a week. The coach puts your name back on the first group.") : (bumpRole(s, -1), tr(s, "coachability", -3), "He wins the drill and stops passing you the ball in it.")) },
    ],
  },
  {
    id: "nba-sixth",
    ages: [20, 34],
    cooldown: 0,
    once: true,
    weight: (s) => (s.placement.node === "nba" && (s.placement.role === "bench" || s.placement.role === "rotation") ? 1.4 : 0),
    title: "Sixth man",
    body: "The coach wants you first off the bench, every night, with your own minutes. He says the job has a name.",
    choices: [
      { id: "take", label: "Take the job", preview: "You become the sixth man. The start is no longer what you are asking for.", growth: 2, risk: 0, apply: ({ s }) => (s.flags.sixthMan = true, sk(s, "shooting", 1), tr(s, "confidence", 2), "You take it. First sub, your own stretch, every night.") },
      { id: "start", label: "Tell him you should start", preview: "He might agree. He might tell you the job is the bench.", growth: 1, risk: 2, apply: ({ s, rolls }) => (rolls[0]! < 0.35 ? (bumpRole(s, 1), "He tries you with the starters for a week.") : (tr(s, "coachability", -3), "He tells you the job is the bench. The conversation is over.")) },
    ],
  },
  {
    id: "nba-hotel",
    ages: [20, 36],
    cooldown: 12,
    weight: (s) => (s.placement.node === "nba" && ["deep-bench", "bench", "rotation"].includes(s.placement.role) && month(s) === 4 ? 1.5 : 0),
    title: "The series rotation",
    body: "The playoff rotation is posted in the hallway. Your name is not on it. The team hotel is ten minutes from the arena.",
    choices: [
      { id: "stay", label: "Stay in the hotel", preview: "You stay with the team and do not play.", growth: 1, risk: 0, apply: ({ s }) => (sk(s, "iq", 1), energy(s, -4), "You sit in the hotel and watch the film with the staff. You dress and do not check in.") },
      { id: "home", label: "Fly home for the series", preview: "You leave the series. The coach will notice.", growth: 0, risk: 1, apply: ({ s }) => (energy(s, 8), tr(s, "coachability", -2), "You fly home. They win a game without you in the building.") },
    ],
  },
  {
    id: "nba-system",
    ages: [20, 36],
    cooldown: 16,
    weight: (s) => (nbaMore(s) ? 1.2 : 0),
    title: "His offense",
    body: (s) => `The coach's sets do not use ${bestSkill(s).name}. He installed them in September. You have spent years on the other thing.`,
    choices: [
      { id: "yours", label: "Keep playing your game", preview: "Confidence. The coach trusts you less.", growth: 1, risk: 1, apply: ({ s }) => (tr(s, "confidence", 2), tr(s, "coachability", -3), "You hunt the action you know. He takes a call away from you the next night.") },
      { id: "his", label: "Learn his action", preview: "You get better at the thing he runs. June is shorter.", growth: 2, risk: 0, apply: ({ s }) => (sk(s, hole(s).key, 2), energy(s, -8), "You stay late and run his action until you can call it. The skill you came in with waits.") },
    ],
  },
  {
    id: "nba-snub",
    ages: [21, 36],
    cooldown: 0,
    once: true,
    weight: (s) => (s.placement.node === "nba" && (s.placement.role === "starter" || s.placement.role === "star") && s.exposure >= 40 && month(s) === 2 ? 1.7 : 0),
    title: "The reserves come out",
    body: "The All-Star reserves are announced. Your name is not on the list. The numbers from this season are still on the sheet in the locker room.",
    choices: [
      { id: "use", label: "Play angry for a month", preview: "Motivation. The snub stays a snub.", growth: 2, risk: 0, apply: ({ s }) => (tr(s, "motivation", 4), sk(s, bestSkill(s).key, 1), "You play the next month like the ballot is still open. It is not.") },
      { id: "drop", label: "Let it go", preview: "You sleep. The edge comes off.", growth: 0, risk: 0, apply: ({ s }) => (energy(s, 6), tr(s, "motivation", -2), "You watch the announcement once and leave the building.") },
    ],
  },
  {
    id: "nba-max",
    ages: [23, 35],
    cooldown: 0,
    once: true,
    weight: (s) => (s.placement.node === "nba" && (s.placement.role === "starter" || s.placement.role === "star") && s.placement.contract ? 1.3 : 0),
    title: "A bigger number",
    body: (s) => `${otherNba(s)} offers a much bigger number. The roster around that number is thin. ${team(s)} will pay less if you stay.`,
    choices: [
      {
        id: "leave",
        label: "Take the money",
        preview: "You leave this team. The new roster is thin and the number is bigger.",
        growth: 1,
        risk: 1,
        apply: ({ s }) => {
          const next = otherNba(s);
          s.placement.teamName = next;
          s.placement.role = "starter";
          s.placement.coaching = 62;
          if (s.placement.contract) s.placement.contract.salary = Math.max(8_000_000, Math.round(s.placement.contract.salary * 2.2));
          return `You sign with the ${next}. The number is the one they said. The locker room is not full.`;
        },
      },
      { id: "stay", label: "Stay for less", preview: "You turn down the bigger number. You keep this coach and this city.", growth: 1, risk: 0, apply: ({ s }) => (raisePay(s, 1.35), tr(s, "confidence", 2), `You stay with the ${team(s)}. The raise is real and smaller than the other offer.`) },
    ],
  },
  {
    id: "nat-fine",
    ages: [18, 34],
    cooldown: 12,
    weight: (s) => (club(s) && s.international.caps > 0 && month(s) === 11 ? 1.6 : 0),
    title: "The club fines the window",
    body: "November. The national team wants you for a window. The club says the fine comes out of your month if you go.",
    choices: [
      { id: "go", label: "Get on the plane", preview: "You go. The club takes a cut of the month.", growth: 1, risk: 1, apply: ({ s }) => (raisePay(s, 0.9), expo(s, 4), "You go. The club takes the cut and does not wish you luck.") },
      { id: "stay", label: "Stay with the club", preview: "You keep the money. The federation writes it down.", growth: 0, risk: 1, apply: ({ s }) => (s.international.declined += 1, "You stay. The federation notes the absence.") },
    ],
  },
  {
    id: "nat-cut",
    ages: [18, 34],
    cooldown: 0,
    once: true,
    weight: (s) => (s.international.countryId && month(s) === 7 ? 1.5 : 0),
    title: "The week of the roster",
    body: "The last camp posts a roster. Your name is off it. Making the earlier camps did not decide this list.",
    choices: [
      { id: "stay", label: "Stay and train anyway", preview: "Discipline. You are not on the roster.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "discipline", 3), "You book a court in the same city and train. The team photo happens without you.") },
      { id: "home", label: "Fly home", preview: "Rest. The cut stands.", growth: 0, risk: 0, apply: ({ s }) => (energy(s, 6), tr(s, "motivation", -2), "You fly home the same day. The federation sends a short note.") },
    ],
  },
  {
    id: "nat-guard",
    ages: [18, 34],
    cooldown: 12,
    weight: (s) => (s.international.countryId && (month(s) === 2 || month(s) === 8) ? 1.3 : 0),
    title: "You draw your teammate",
    body: (s) => {
      const mate = s.peers.find((p) => p.countryId === s.international.countryId)?.name ?? "your club teammate";
      return `${mate} is in the same camp. The coach puts him on you and leaves the matchup there.`;
    },
    choices: [
      { id: "guard", label: "Guard him", preview: "Defense up. The scrimmage gets personal.", growth: 2, risk: 1, apply: ({ s }) => (sk(s, "perimeterD", 1), tr(s, "motivation", 1), "You guard him for twenty minutes. Neither of you talks at lunch.") },
      { id: "switch", label: "Ask to switch off", preview: "You keep the friendship. The coach remembers the ask.", growth: 0, risk: 0, apply: ({ s }) => (tr(s, "composure", 1), "You ask off it. He switches you. He remembers.") },
    ],
  },
  {
    id: "nat-captain",
    ages: [22, 34],
    cooldown: 0,
    once: true,
    weight: (s) => {
      if (!s.international.countryId) return 0;
      const rank = country(s.international.countryId).fibaRank?.rank ?? 80;
      return rank > 40 ? 1.4 : 0;
    },
    title: "Captain of a team that is out",
    body: (s) => `${country(s.international.countryId ?? s.birthplace.countryId).name} is not in the qualification places. They still want a captain for the window.`,
    choices: [
      { id: "wear", label: "Wear it", preview: "You captain a team that will not qualify this cycle.", growth: 1, risk: 0, apply: ({ s }) => (s.flags.captain = true, tr(s, "motivation", 4), expo(s, 3), "You take the armband. The window ends where the standings said it would.") },
      { id: "no", label: "Tell them to give it to someone else", preview: "You decline the armband.", growth: 0, risk: 0, apply: ({ s }) => (tr(s, "composure", 1), "You tell them to give it to a player who will still be in the program in four years.") },
    ],
  },
  {
    id: "nat-letter",
    ages: [20, 34],
    cooldown: 0,
    once: true,
    weight: (s) => (s.citizenships.length > 1 && s.international.countryId && s.international.countryId !== s.birthplace.countryId ? 1.5 : 0),
    title: "The federation writes",
    body: (s) => `A letter from ${country(s.birthplace.countryId).name}. They watched you take the other oath. They kept the file.`,
    choices: [
      { id: "write", label: "Write back", preview: "You answer the federation you left.", growth: 0, risk: 0, apply: ({ s }) => (tr(s, "motivation", 2), "You write back. You do not ask to return. They do not offer it.") },
      { id: "drawer", label: "Leave it in the drawer", preview: "You do not answer.", growth: 0, risk: 0, apply: () => "You leave the letter in the drawer. The file stays open on their side." },
    ],
  },
  {
    id: "loan-forgotten",
    ages: [18, 30],
    cooldown: 10,
    weight: (s) => (onLoan(s) ? 1.5 : 0),
    title: "The parent club goes quiet",
    body: "You have been on loan long enough to learn the city. The parent club has not called.",
    choices: [
      { id: "call", label: "Call them", preview: "They might recall you to the bench. They might not pick up.", growth: 1, risk: 1, apply: ({ s, rolls }) => (rolls[0]! < 0.4 ? (endLoan(s), s.placement.role = "bench", (s.placement.coaching = clamp(s.placement.coaching + 6, 0, 95)), "They recall you. The minutes are shorter than the ones you had on loan.") : "Nobody answers. You play another month where you are.") },
      { id: "settle", label: "Stop calling", preview: "You settle into the loan. Fewer scouts.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "confidence", 2), expo(s, -2), "You stop calling. The loan team starts you without asking upstairs.") },
    ],
  },
  {
    id: "loan-star",
    ages: [18, 30],
    cooldown: 0,
    once: true,
    weight: (s) => (onLoan(s) && (s.placement.role === "starter" || s.placement.role === "star") ? 1.6 : 0),
    title: "They will not recall you",
    body: "You are the best player on the loan team. The parent club knows, and they still will not bring you back.",
    choices: [
      { id: "force", label: "Force the return", preview: "You go back. You come off the bench.", growth: 1, risk: 1, apply: ({ s }) => (endLoan(s), bumpRole(s, -1), (s.placement.coaching = clamp(s.placement.coaching + 5, 0, 95)), "You force the return. You dress and wait behind the players they kept.") },
      { id: "wait", label: "Stay and get paid here", preview: "You stay the best player on the smaller club. A raise, and no recall.", growth: 2, risk: 0, apply: ({ s }) => (raisePay(s, 1.2), tr(s, "confidence", 2), "You stay. They pay you like the best player in their building.") },
    ],
  },
  {
    id: "loan-buy",
    ages: [18, 30],
    cooldown: 0,
    once: true,
    weight: (s) => (onLoan(s) ? 1.4 : 0),
    title: "The smaller club wants to buy you",
    body: "The loan team has a number for your contract. The parent club can take the fee or keep you on the books.",
    choices: [
      { id: "force", label: "Push the sale", preview: "You become their player. The parent club takes the fee and moves on.", growth: 2, risk: 1, apply: ({ s }) => (endLoan(s), s.placement.role = "starter", raisePay(s, 1.25), "They buy you. You stay in this building under your own contract.") },
      { id: "wait", label: "Let the parent club decide", preview: "They can say no. This month, they do.", growth: 0, risk: 0, apply: () => "You wait. The parent club says no. The loan runs another month." },
    ],
  },
  {
    id: "none-street",
    ages: [16, 32],
    cooldown: 10,
    weight: (s) => (loose(s) && (month(s) === 6 || month(s) === 7 || month(s) === 8) ? 1.4 : 0),
    title: "A cash game in the park",
    body: "Someone puts a pot on an outdoor court. Winner stays. The money is real and small.",
    choices: [
      { id: "play", label: "Enter", preview: "You might take the pot. You might get paid for one game and lose.", growth: 1, risk: 1, apply: ({ s, rolls }) => (energy(s, -6), rolls[0]! < 0.45 ? (s.finance.cash += 500, sk(s, "finishing", 1), "You take the pot. It is five hundred dollars and a sore knee.") : (s.finance.cash += 100, "You lose in the second game. They pay the early round anyway.")) },
      { id: "walk", label: "Walk past it", preview: "Rest.", growth: 0, risk: 0, apply: ({ s }) => (energy(s, 4), "You walk past. The pot goes to a kid you do not know.") },
    ],
  },
  {
    id: "none-rec",
    ages: [17, 34],
    cooldown: 14,
    weight: (s) => (loose(s) ? 1.2 : 0),
    title: "Tuesday rec league",
    body: "A rec league needs a fifth on Tuesdays. The gym is a school that rents the floor after dark.",
    choices: [
      { id: "play", label: "Take the spot", preview: "A weekly game. A little exposure, and no contract.", growth: 1, risk: 0, apply: ({ s }) => (sk(s, "passing", 1), expo(s, 2), (s.flags.rec = true), "You play Tuesdays. Nobody scouts it on purpose.") },
      { id: "no", label: "Leave the spot open", preview: "You keep the nights.", growth: 0, risk: 0, apply: ({ s }) => (energy(s, 4), "You leave it. They find a teacher who used to play.") },
    ],
  },
  {
    id: "none-scout",
    ages: [17, 24],
    cooldown: 0,
    once: true,
    weight: (s) => ((loose(s) || s.flags.rec === true) && s.placement.node !== "nba" ? 1.3 : 0),
    title: "A coach here for his nephew",
    body: "One man in the stands is a college coach. He came to watch his nephew. He stays for your game by accident.",
    choices: [
      { id: "talk", label: "Talk to him after", preview: "He might want film. He might have no scholarship left.", growth: 1, risk: 1, apply: ({ s, rolls }) => (rolls[0]! < 0.4 ? (expo(s, 8), (s.flags.reviewSoon = true), "He asks for your film. He says he will watch it on the plane.") : "He coaches a school with no scholarship left. He wishes you luck and leaves with his nephew.") },
      { id: "let", label: "Let him leave", preview: "The accident stays an accident.", growth: 0, risk: 0, apply: () => "You let him walk out. He was here for his nephew." },
    ],
  },
  {
    id: "summer-hole",
    ages: [15, 34],
    cooldown: 11,
    weight: (s) => ((month(s) === 6 || month(s) === 7) && s.placement.node !== "home" ? 1.5 : 0),
    title: "One hole, one June",
    body: (s) => `The hole from last season is ${hole(s).name}. June is long enough to change what they let you do next year.`,
    choices: [
      {
        id: "work",
        label: "Spend June on it",
        preview: "That skill jumps. You are tired in July. Your height does not change. The sheet might.",
        growth: 2,
        risk: 0,
        apply: ({ s }) => {
          const name = trainHole(s);
          energy(s, -10);
          const listed = typeof s.flags.listedAs === "string" ? ` The sheet can list you as a ${s.flags.listedAs} now.` : "";
          return `You spend June on ${name}.${listed}`;
        },
      },
      { id: "rest", label: "Rest the month", preview: "Energy. The hole is still there in October.", growth: 0, risk: 0, apply: ({ s }) => (energy(s, 10), "You rest. October arrives with the same hole.") },
    ],
  },
  {
    id: "style-commit",
    ages: [16, 28],
    cooldown: 0,
    once: true,
    weight: (s) => (s.placement.node !== "home" && s.placement.node !== "playground" && !s.flags.style ? 1.2 : 0),
    title: "Pick what they call you",
    body: "A coach asks what you are. Scorer, connector, or defender. The other two slow down, and leagues start asking for the one you name.",
    choices: [
      { id: "scorer", label: "Scorer", preview: "Shooting up. Passing and defense drop. Switching later costs a year of trust.", growth: 2, risk: 1, apply: ({ s }) => (s.flags.style = "scorer", (s.flags.styleAt = s.ageMonths), sk(s, "shooting", 2), drop(s, "passing", 1), drop(s, "perimeterD", 1), "You tell him scorer. The next offer asks for buckets.") },
      { id: "connector", label: "Connector", preview: "Passing and handle up. Scoring drops. Switching later costs a year of trust.", growth: 2, risk: 1, apply: ({ s }) => (s.flags.style = "connector", (s.flags.styleAt = s.ageMonths), sk(s, "passing", 2), sk(s, "handle", 1), drop(s, "shooting", 1), drop(s, "finishing", 1), "You tell him connector. They put the ball in your hands to move it.") },
      { id: "defender", label: "Defender", preview: "Defense up. Shot creation drops. Switching later costs a year of trust.", growth: 2, risk: 1, apply: ({ s }) => (s.flags.style = "defender", (s.flags.styleAt = s.ageMonths), sk(s, "perimeterD", 2), sk(s, "interiorD", 1), drop(s, "shooting", 1), drop(s, "handle", 1), "You tell him defender. They put you on the other team's best player.") },
    ],
  },
  {
    id: "style-switch",
    ages: [18, 34],
    cooldown: 0,
    once: true,
    weight: (s) => ((s.flags.style === "scorer" || s.flags.style === "connector" || s.flags.style === "defender") && typeof s.flags.styleAt === "number" && s.ageMonths - s.flags.styleAt >= 8 ? 1.1 : 0),
    title: "They want the other thing",
    body: (s) => `A new coach does not need a ${s.flags.style}. He needs the work you let slow down.`,
    choices: [
      { id: "stay", label: "Stay what you picked", preview: "You keep the label. This coach may play you less.", growth: 0, risk: 1, apply: ({ s }) => (tr(s, "confidence", 2), "You stay with it. He shortens the minutes until he needs that one thing.") },
      {
        id: "switch",
        label: "Switch",
        preview: "You change the label. He will not trust it until next season.",
        growth: 1,
        risk: 1,
        apply: ({ s }) => {
          const order = ["scorer", "connector", "defender"] as const;
          const i = order.indexOf(s.flags.style as (typeof order)[number]);
          const next = order[(i + 1) % order.length] ?? "connector";
          s.flags.style = next;
          tr(s, "coachability", -6);
          if (next === "scorer") sk(s, "shooting", 1);
          if (next === "connector") sk(s, "passing", 1);
          if (next === "defender") sk(s, "perimeterD", 1);
          return `You switch to ${next}. He says he will see it next season, and he means it.`;
        },
      },
    ],
  },
  {
    id: "body-project",
    ages: [17, 32],
    cooldown: 0,
    once: true,
    weight: (s) => (s.placement.node !== "home" ? 1.1 : 0),
    title: "A body project",
    body: "A trainer will add strength or cut weight. Your height does not change. The roles you can play do.",
    choices: [
      { id: "strong", label: "Add strength", preview: "You hold the post. You lose a step in the open floor. Height stays.", growth: 1, risk: 1, apply: ({ s }) => (ath(s, "strength", 4), ath(s, "acceleration", -2), ath(s, "lateral", -1), "You get heavier in the right places. The open floor is slower.") },
      { id: "cut", label: "Cut weight", preview: "You get out in the break. Post meetings get harder. Height stays.", growth: 1, risk: 1, apply: ({ s }) => (ath(s, "strength", -3), ath(s, "acceleration", 2), ath(s, "stamina", 1), "You drop weight. You beat people down the floor and get moved on the block.") },
    ],
  },
  {
    id: "film-night",
    ages: [16, 34],
    cooldown: 8,
    weight: (s) => (season(s) && !["home", "playground", "unattached"].includes(s.placement.node) ? 1.2 : 0),
    title: "Tomorrow's action",
    body: "The next opponent runs one action every trip. You can stay up with the film or sleep.",
    choices: [
      { id: "study", label: "Stay up with the film", preview: "You arrive tired and you know the action.", growth: 2, risk: 0, apply: ({ s }) => (energy(s, -12), sk(s, "iq", 2), sk(s, "decisions", 1), (s.flags.film = s.ageMonths), "You find the action. You are late to the morning shootaround and early on the help.") },
      { id: "sleep", label: "Sleep", preview: "You arrive fresh. They can run the same action at you twice.", growth: 0, risk: 1, follow: { id: "film-hunted", delay: 1 }, apply: ({ s }) => (energy(s, 8), "You sleep. The scouting report stays on the tablet.") },
    ],
  },
  {
    id: "film-hunted",
    ages: [16, 36],
    cooldown: 0,
    followUpOnly: true,
    weight: () => 1,
    title: "The same action",
    body: "They run it again. You saw it once, in the game, the night you slept.",
    choices: [
      { id: "switch", label: "Switch onto it", preview: "You find it late. Defense up, legs heavy.", growth: 1, risk: 0, apply: ({ s }) => (sk(s, "perimeterD", 1), energy(s, -4), "You switch onto it the second time. The first time already scored.") },
      { id: "live", label: "Live with it", preview: "They score it twice.", growth: 0, risk: 1, apply: ({ s }) => (tr(s, "composure", -1), "They score it twice. The coach shows you the clip with the sound off.") },
    ],
  },
  {
    id: "film-early",
    ages: [17, 34],
    cooldown: 0,
    once: true,
    weight: (s) => (typeof s.flags.film === "number" && s.ageMonths - s.flags.film <= 8 && s.traits.coachability >= 55 ? 1.3 : 0),
    title: "The report on Monday",
    body: "The coach starts handing you the scouting report on Monday. The rest of the team gets it on Friday.",
    choices: [
      { id: "read", label: "Read it early", preview: "You show up knowing the week. You lose a night.", growth: 1, risk: 0, apply: ({ s }) => (sk(s, "iq", 1), energy(s, -4), "You read it Monday. By Friday you are the one explaining the action.") },
      { id: "wait", label: "Read it with the team", preview: "You stay on the same schedule as everyone else.", growth: 0, risk: 0, apply: () => "You wait until Friday. He stops handing it over early." },
    ],
  },
  {
    id: "mentor-cut",
    ages: [18, 32],
    cooldown: 0,
    once: true,
    weight: (s) => (["domestic-pro", "foreign-pro", "g-league", "nba"].includes(s.placement.node) ? 1.2 : 0),
    title: "He will teach you one thing",
    body: (s) => {
      const who = s.peers.find((p) => !p.done)?.name ?? "A veteran";
      return `${who} will teach you one skill. He wants a cut of the next check, and silence if the club fires him.`;
    },
    choices: [
      { id: "learn", label: "Learn it", preview: "One skill up. He takes a cut if you are under contract.", growth: 2, risk: 1, apply: ({ s }) => { const name = hole(s).name; sk(s, hole(s).key, 2); s.flags.mentorCut = true; const paid = Boolean(s.placement.contract); raisePay(s, paid ? 0.95 : 1); return `He teaches you ${name}. ${paid ? "The next check is lighter." : "You owe him the next time you get paid."}`; } },
      { id: "no", label: "Keep your money", preview: "No lesson. No cut.", growth: 0, risk: 0, apply: () => "You thank him and keep the check the way it is." },
    ],
  },
  {
    id: "rehab-fork",
    ages: [18, 34],
    cooldown: 18,
    weight: (s) => (s.condition.injuryHistory >= 2 && !s.condition.injury ? 1.3 : 0),
    title: "The knee is quiet",
    body: "You can come back slower and smarter, or you can keep the bounce and hope the knee holds through March.",
    choices: [
      { id: "slow", label: "Come back slower", preview: "Durability and feel up. You lose a step. Workload drops for two months.", growth: 1, risk: 0, apply: ({ s }) => (ath(s, "durability", 4), ath(s, "acceleration", -2), sk(s, "iq", 1), slowReturn(s), "You come back on a low load. The first step is late and the read is early.") },
      { id: "rush", label: "Keep the bounce", preview: "You keep the athleticism. The knee can go again.", growth: 1, risk: 3, follow: { id: "reinjury", delay: 4 }, apply: ({ s }) => (ath(s, "acceleration", 1), "You rush back. March is a long way off, and the knee knows the date.") },
    ],
  },
  {
    id: "language-calls",
    ages: [16, 32],
    cooldown: 10,
    weight: (s) => (s.residence.countryId !== s.birthplace.countryId && ["foreign-pro", "domestic-pro", "elite-youth"].includes(s.placement.node) ? 1.3 : 0),
    title: "The play call",
    body: "You hear the call a second late. The month you understand it is the month the coach can trust you with the ball.",
    choices: [
      { id: "stay", label: "Stay after practice", preview: "The calls start to land. You are tired.", growth: 2, risk: 0, apply: ({ s }) => (energy(s, -8), sk(s, "iq", 2), sk(s, "passing", 1), (s.flags.calls = true), "You stay until the calls land. He looks at you before he looks at the point guard.") },
      { id: "home", label: "Go home with the team", preview: "Rest. The call still arrives late.", growth: 0, risk: 0, apply: ({ s }) => (energy(s, 4), "You leave with the team. The call is still a word you translate after it matters.") },
    ],
  },
  {
    id: "language-ball",
    ages: [16, 32],
    cooldown: 0,
    once: true,
    weight: (s) => (s.flags.calls === true && club(s) ? 1.6 : 0),
    title: "He leaves you the ball",
    body: "You hear the call in time. The coach leaves the ball in your hands on the next trip.",
    choices: [
      { id: "take", label: "Take the trip", preview: "A bigger role. The read is yours.", growth: 2, risk: 1, apply: ({ s }) => (bumpRole(s, 1), sk(s, "decisions", 1), "You take the trip. He does it again the next night.") },
      { id: "back", label: "Give it back", preview: "You stay in the role you had. He trusts you to know that.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "coachability", 2), "You give it back. He nods, and the point guard brings it up.") },
    ],
  },
  {
    id: "rival-again",
    ages: [18, 34],
    cooldown: 0,
    once: true,
    weight: (s) => (s.peers.length > 0 && s.placement.node !== "home" ? 1.2 : 0),
    title: "The same gym again",
    body: (s) => `${rivalName(s)} is here. Same draft, same national team, or the other side of a trade. The gym is not big enough for both of you to pretend otherwise.`,
    choices: [
      { id: "guard", label: "Guard him", preview: "You pick up the rivalry again.", growth: 2, risk: 1, apply: ({ s }) => (sk(s, "perimeterD", 1), tr(s, "motivation", 2), `You guard ${rivalName(s)}. He knows the matchup as well as you do.`) },
      { id: "talk", label: "Talk to him", preview: "You catch up. The game is still tomorrow.", growth: 0, risk: 0, apply: ({ s }) => (tr(s, "composure", 1), `You talk to ${rivalName(s)} after the shootaround. Tomorrow you still line up.`) },
    ],
  },
  {
    id: "coach-promise",
    ages: [16, 32],
    cooldown: 0,
    once: true,
    weight: (s) => ((month(s) === 9 || month(s) === 10) && ["bench", "deep-bench", "rotation"].includes(s.placement.role) && !["home", "playground", "unattached"].includes(s.placement.node) ? 1.4 : 0),
    title: "He says you will start",
    body: "The coach says you will start in three months. He says it in the office, with the door half open.",
    choices: [
      { id: "wait", label: "Hold him to the date", preview: "In three months he starts you, or he does not.", growth: 1, risk: 1, follow: { id: "promise-due", delay: 3 }, apply: () => "You write the month down. He does not." },
      { id: "now", label: "Keep the minutes you have", preview: "You do not wait on the promise.", growth: 0, risk: 0, apply: ({ s }) => (tr(s, "discipline", 2), "You keep the role you have and stop counting the months.") },
    ],
  },
  {
    id: "promise-due",
    ages: [16, 36],
    cooldown: 0,
    followUpOnly: true,
    weight: () => 1,
    title: "The month he named",
    body: "The month arrives. The starting five is on the board.",
    choices: [
      { id: "look", label: "Look at the board", preview: "He keeps it about half the time.", growth: 1, risk: 1, apply: ({ s, rolls }) => (rolls[0]! < 0.5 ? (bumpRole(s, 1), "Your name is with the starters. He said it would be.") : (tr(s, "coachability", -2), "Someone else starts. He does not explain. The door stays half open.")) },
    ],
  },
  {
    id: "season-goal",
    ages: [16, 34],
    cooldown: 8,
    weight: (s) => ((month(s) === 10 || month(s) === 11) && !s.flags.seasonGoal && !["home", "playground", "unattached"].includes(s.placement.node) ? 1.6 : 0),
    title: "Name the season",
    body: "October. Pick the thing this season is for. April judges that one thing.",
    choices: [
      { id: "title", label: "Win the league", preview: "April checks whether you got better in this league.", growth: 1, risk: 0, apply: ({ s }) => (s.flags.seasonGoal = "title", (s.flags.goalMark = performanceLevel(s)), "You say the league. April looks at how you played.") },
      { id: "nba", label: "Get to the NBA", preview: "April checks whether you are on an NBA roster, or have been called up.", growth: 1, risk: 0, apply: ({ s }) => ((s.flags.seasonGoal = "nba"), "You say the NBA. April checks the roster.") },
      { id: "country", label: "Make the national team", preview: "April checks whether you added a cap this season.", growth: 1, risk: 0, apply: ({ s }) => (s.flags.seasonGoal = "country", (s.flags.goalCaps = s.international.caps), "You say the national team. April counts new caps.") },
      { id: "grades", label: "Get the grades up", preview: "April checks the transcript.", growth: 0, risk: 0, apply: ({ s }) => (s.flags.seasonGoal = "grades", (s.flags.goalGrades = s.education.academics), "You say the grades. April reads the number.") },
    ],
  },
  {
    id: "season-judge",
    ages: [16, 35],
    cooldown: 8,
    weight: (s) => (month(s) === 4 && typeof s.flags.seasonGoal === "string" ? 3 : 0),
    title: "April",
    body: (s) => `You said this season was for ${s.flags.seasonGoal === "title" ? "the league" : s.flags.seasonGoal === "nba" ? "the NBA" : s.flags.seasonGoal === "country" ? "the national team" : "the grades"}. The month is here.`,
    choices: [
      {
        id: "hear",
        label: "Hear the verdict",
        preview: "The goal stands or it does not. You do not get to move the line.",
        growth: 1,
        risk: 1,
        apply: ({ s }) => {
          const goal = s.flags.seasonGoal;
          const mark = typeof s.flags.goalMark === "number" ? s.flags.goalMark : 50;
          const caps = typeof s.flags.goalCaps === "number" ? s.flags.goalCaps : 0;
          const grades = typeof s.flags.goalGrades === "number" ? s.flags.goalGrades : 50;
          const ups = typeof s.flags.gCallups === "number" ? s.flags.gCallups : 0;
          delete s.flags.seasonGoal;
          delete s.flags.goalMark;
          delete s.flags.goalCaps;
          delete s.flags.goalGrades;
          const ok =
            goal === "title" ? performanceLevel(s) >= mark + 2 :
            goal === "nba" ? s.placement.node === "nba" || ups > 0 :
            goal === "country" ? s.international.caps > caps :
            s.education.academics >= grades + 4;
          if (ok) {
            tr(s, "confidence", 3);
            return "You did the thing you named. The rest of the year is still the rest of the year.";
          }
          tr(s, "motivation", -2);
          return "You missed the thing you named. April does not offer a second wording.";
        },
      },
    ],
  },
  {
    id: "headline-night",
    ages: [17, 36],
    cooldown: 16,
    weight: (s) => (season(s) && (s.placement.role === "starter" || s.placement.role === "star") ? 1.3 : 0),
    title: "The paper leads with you",
    body: "One night is big enough for the front of the sports page. The next offer you get will mention it.",
    choices: [
      { id: "talk", label: "Talk to them", preview: "Exposure. The headline follows you for a few months.", growth: 1, risk: 0, apply: ({ s }) => (s.flags.headline = s.ageMonths, expo(s, 5), s.evidence.push({ month: s.ageMonths, text: "A night the paper led with.", weight: 2 }), "You talk. The quote is fine. The number is what they remember.") },
      { id: "duck", label: "Duck the camera", preview: "The headline still runs. You do not add a quote.", growth: 0, risk: 0, apply: ({ s }) => (s.flags.headline = s.ageMonths, "You leave through the side door. The story runs without a quote from you.") },
    ],
  },
];
