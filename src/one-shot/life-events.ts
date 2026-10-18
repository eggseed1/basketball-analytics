import type { EventTemplate } from "./events";
import { charge, canPay } from "./finance";
import { clamp } from "./rng";
import type { AthleticKey, LifeState, SkillKey, TraitKey } from "./types";
import { country } from "./world";

const sk = (s: LifeState, k: SkillKey, d: number) => (s.skills[k] = clamp(s.skills[k] + d, 1, Math.max(s.skills[k], s.potentials[k])));
const tr = (s: LifeState, k: TraitKey, d: number) => (s.traits[k] = clamp(s.traits[k] + d, 0, 100));
const ath = (s: LifeState, k: AthleticKey, d: number) => (s.body[k] = clamp(s.body[k] + d, 1, 99));
const energy = (s: LifeState, d: number) => (s.condition.energy = clamp(s.condition.energy + d, 5, 100));
const health = (s: LifeState, d: number) => (s.condition.health = clamp(s.condition.health + d, 5, 100));
const expo = (s: LifeState, d: number) => (s.exposure = clamp(s.exposure + d, 0, 100));
const onTeam = (s: LifeState) => !["home", "playground", "unattached"].includes(s.placement.node);
const isPro = (s: LifeState) => ["domestic-pro", "foreign-pro", "g-league", "nba"].includes(s.placement.node);
const cost = (s: LifeState, base: number) => Math.round(base * country(s.residence.countryId).model.costIndex);
const afford = (amount: number) => (s: LifeState) => (canPay(s, amount) ? null : "Not enough money right now.");
const scene = (s: LifeState, kind: string) => {
  s.flags.scene = kind;
  s.flags.sceneUntil = s.ageMonths + 1;
};

/**
 * Extra scenes across the whole life. Each one is a specific moment, not a
 * reskin of "practice harder."
 */
export const LIFE_EVENTS: EventTemplate[] = [
  { id: "first-dribble", ages: [2, 5], cooldown: 48, once: true, weight: () => 2, tone: "good", title: "The ball comes home", body: "Someone leaves a worn ball in the hallway. It is heavier than your head.", choices: [
    { id: "push", label: "Push it around the apartment", preview: "Handle and joy.", growth: 2, risk: 0, apply: ({ s }) => (sk(s, "handle", 1), tr(s, "motivation", 2), "You chase it until someone takes it away.") },
    { id: "watch", label: "Watch other kids", preview: "You stay quiet.", growth: 0, risk: 0, apply: () => "You watch from the doorway." },
  ]},
  { id: "doorway-mark", ages: [3, 8], cooldown: 36, once: true, weight: () => 1.4, title: "A mark on the doorframe", body: "Your parent pencils your height on the kitchen frame and whistles.", choices: [
    { id: "proud", label: "Stand up straight", preview: "Confidence.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "confidence", 3), "You ask them to measure you again.") },
    { id: "shy", label: "Hide behind a chair", preview: "Nothing changes.", growth: 0, risk: 0, apply: () => "The pencil mark stays. You do not." },
  ]},
  { id: "rain-week", ages: [4, 10], cooldown: 30, weight: (s) => (s.family.courtAccess === "poor" ? 1.6 : 0.6), title: "A week of rain", body: "The outdoor court is a pond. The week is long.", choices: [
    { id: "indoors", label: "Dribble in the kitchen", preview: "Handle. The downstairs neighbor complains.", growth: 2, risk: 1, apply: ({ s }) => (sk(s, "handle", 1), tr(s, "discipline", 1), "The ceiling shakes. You get better anyway.") },
    { id: "wait", label: "Wait it out", preview: "You rest.", growth: 0, risk: 0, apply: ({ s }) => (energy(s, 6), "You watch games on a small screen.") },
  ]},
  { id: "cousin-game", ages: [5, 11], cooldown: 24, weight: () => 1.2, tone: "neutral", title: "Cousins take the court", body: "A family visit turns into a game. The older cousins do not pass.", choices: [
    { id: "fight", label: "Keep calling for it", preview: "Confidence. They still might not pass.", growth: 2, risk: 1, apply: ({ s }) => (tr(s, "confidence", 2), sk(s, "offBall", 1), "You score once on a putback and do not stop talking about it.") },
    { id: "ref", label: "Keep score and learn the rules", preview: "Basketball IQ.", growth: 1, risk: 0, apply: ({ s }) => (sk(s, "iq", 1), "You notice who boxes out and who just jumps.") },
  ]},
  { id: "broken-rim", ages: [7, 14], cooldown: 40, once: true, weight: () => 1, title: "The rim is bent", body: "Someone hung on it. Shots that were good now rattle out.", choices: [
    { id: "fix", label: "Help bend it back", preview: "Strength. It might not hold.", growth: 1, risk: 1, apply: ({ s }) => (ath(s, "strength", 1), "You and two older kids pull until it looks almost straight.") },
    { id: "adjust", label: "Learn the new bounce", preview: "Touch.", growth: 2, risk: 0, apply: ({ s }) => (sk(s, "shooting", 1), "You start aiming for the side that still has a net.") },
  ]},
  { id: "new-shoes", ages: [8, 16], cooldown: 36, weight: (s) => (s.family.means <= 2 ? 1.8 : 0.7), title: "Shoes with a hole", body: "Your sole flaps when you cut. A shop down the street has last year's pair.", choices: [
    { id: "buy", label: "Ask the family to buy them", preview: "Feet stay healthy. It costs money.", growth: 1, risk: 0, blocked: (s) => afford(cost(s, 80))(s), apply: ({ s }) => (charge(s, cost(s, 80)), health(s, 3), "The first cut in them feels like a different sport.") },
    { id: "tape", label: "Tape the sole", preview: "Free. The tape fails in the rain.", growth: 0, risk: 1, apply: ({ s }) => (tr(s, "discipline", 2), "You play. The tape lasts two weeks.") },
  ]},
  { id: "playground-captain", ages: [9, 15], cooldown: 28, weight: () => 1.3, tone: "good", title: "Picked first", body: "The oldest kid on the playground looks at the line and points at you.", choices: [
    { id: "run", label: "Pick the rest of the team", preview: "Passing and confidence.", growth: 2, risk: 0, apply: ({ s }) => (sk(s, "passing", 1), tr(s, "confidence", 2), "You pick the kid nobody wanted. He grabs six rebounds.") },
    { id: "quiet", label: "Just play", preview: "A small bump to finishing.", growth: 1, risk: 0, apply: ({ s }) => (sk(s, "finishing", 1), "You score on the first trip and give the ball right back.") },
  ]},
  { id: "teacher-note", ages: [8, 15], cooldown: 30, weight: () => 1.1, title: "A note from school", body: "Your teacher writes that you stare out the window whenever the court is in sight.", choices: [
    { id: "deal", label: "Homework before the gym", preview: "Academics and discipline.", growth: 1, risk: 0, apply: ({ s }) => (s.education.academics = clamp(s.education.academics + 4, 0, 100), tr(s, "discipline", 2), "The deal holds for a month. Your grades move.") },
    { id: "gym", label: "The gym wins", preview: "Skill. School slips.", growth: 2, risk: 2, apply: ({ s }) => (sk(s, "shooting", 1), (s.education.academics = clamp(s.education.academics - 3, 0, 100)), "You stay late. The next quiz is ugly.") },
  ]},
  { id: "growth-ache", ages: [12, 17], cooldown: 24, weight: (s) => (s.body.heightCm >= 190 ? 1.6 : 0.8), title: "Your knees ache", body: "You grew again. The bones are ahead of the muscles.", choices: [
    { id: "rest", label: "Two easy weeks", preview: "Health. You miss some reps.", growth: 0, risk: 0, apply: ({ s }) => (health(s, 4), energy(s, 8), ath(s, "durability", 1), "The ache fades. You come back moving better.") },
    { id: "play", label: "Play through it", preview: "Toughness. The ache can linger.", growth: 1, risk: 2, apply: ({ s }) => (tr(s, "motivation", 2), health(s, -3), "You do not miss a practice. The stairs still hurt.") },
  ]},
  { id: "phone-clip", ages: [13, 20], cooldown: 30, once: true, weight: (s) => (onTeam(s) ? 1.4 : 0.4), tone: "good", title: "Someone films you", body: "A phone catches a move in a noisy gym. By morning a lot of people at school have seen it.", choices: [
    { id: "post", label: "Let it spread", preview: "Exposure. More eyes, more noise.", growth: 2, risk: 1, apply: ({ s }) => (expo(s, 6), tr(s, "confidence", 2), "A coach from another town sends a message.") },
    { id: "down", label: "Ask them to take it down", preview: "Quiet. You keep your routine.", growth: 0, risk: 0, apply: ({ s }) => (tr(s, "discipline", 2), "The clip dies. You shoot the same move the next day with nobody watching.") },
  ]},
  { id: "position-talk", ages: [14, 19], cooldown: 40, once: true, weight: (s) => (onTeam(s) ? 1.5 : 0), title: "The coach wants a new position", body: (s) => `The coach thinks your size fits a different spot than the one you grew up playing. The ${s.placement.teamName ?? "team"} needs it.`, choices: [
    { id: "switch", label: "Learn the new spot", preview: "Defense and IQ. Your old moves get less time.", growth: 2, risk: 1, apply: ({ s }) => (sk(s, "iq", 1), sk(s, "perimeterD", 1), sk(s, "interiorD", 1), "The first month you are late on rotations. Then it clicks.") },
    { id: "stay", label: "Stay where you are", preview: "You keep your role. The coach is cooler.", growth: 0, risk: 1, apply: ({ s }) => (tr(s, "confidence", 1), expo(s, -2), "You stay. Minutes get tighter.") },
  ]},
  { id: "captain-vote", ages: [15, 22], cooldown: 36, once: true, weight: (s) => (onTeam(s) && ["rotation", "starter", "star"].includes(s.placement.role) ? 1.6 : 0), tone: "good", title: "Captain's vote", body: "The team votes. Your name is one of two on the board.", choices: [
    { id: "take", label: "Accept it", preview: "Composure and passing. More is asked of you.", growth: 2, risk: 1, apply: ({ s }) => (tr(s, "composure", 3), sk(s, "passing", 1), expo(s, 2), "You talk less than they expected and it works.") },
    { id: "pass", label: "Give it to the senior", preview: "Coachability.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "coachability", 3), "He nods at you in the huddle. That is enough.") },
  ]},
  { id: "weekend-choice", ages: [15, 18], cooldown: 20, weight: () => 1, title: "Saturday is spoken for", body: "Friends have a plan that runs through the evening. The coach added a shootaround.", choices: [
    { id: "shoot", label: "Go to the gym", preview: "Shooting and discipline.", growth: 2, risk: 0, apply: ({ s }) => (sk(s, "shooting", 1), tr(s, "discipline", 2), energy(s, -4), "The gym is almost empty. You stay until the lights flicker.") },
    { id: "go", label: "Go with your friends", preview: "Energy. The coach notices.", growth: 0, risk: 1, apply: ({ s }) => (energy(s, 6), tr(s, "discipline", -1), "You have a good night. Monday's sprints feel longer.") },
  ]},
  { id: "language-class", ages: [17, 28], cooldown: 40, once: true, weight: (s) => (s.residence.countryId !== s.birthplace.countryId ? 2 : 0), title: "The locker room speaks another language", body: "You catch your name and not much else. A teammate offers to stay after practice.", choices: [
    { id: "study", label: "Study with him", preview: "IQ and composure abroad.", growth: 2, risk: 0, apply: ({ s }) => (sk(s, "iq", 1), tr(s, "composure", 2), "A month later you understand the play call before the translation.") },
    { id: "nod", label: "Nod and run", preview: "You get by. Sets stay muddy.", growth: 0, risk: 1, apply: ({ s }) => (tr(s, "confidence", -1), "You score. You also cut to the wrong side twice a game.") },
  ]},
  { id: "first-check", ages: [18, 26], cooldown: 48, once: true, weight: (s) => (isPro(s) && (s.placement.contract?.salary ?? 0) > 0 ? 2 : 0), tone: "good", title: "The first paycheck", body: "The money hits. It is more than your parents made in a month, and less than the posts online made it sound.", choices: [
    { id: "send", label: "Send half home", preview: "The family account grows. You live simply.", growth: 1, risk: 0, apply: ({ s }) => { const n = Math.round((s.placement.contract?.salary ?? 0) / 24); const a = Math.min(n, Math.max(0, s.finance.cash)); s.finance.cash -= a; s.family.savings += a; return `You send $${a.toLocaleString("en-US")} home.`; } },
    { id: "keep", label: "Keep it and plan", preview: "Cash stays with you.", growth: 1, risk: 1, apply: ({ s }) => (tr(s, "discipline", 1), "You write a budget you mostly follow.") },
  ]},
  { id: "benching", ages: [18, 32], cooldown: 18, weight: (s) => (isPro(s) && s.placement.role !== "star" && s.condition.energy < 55 ? 1.5 : 0.4), tone: "bad", title: "You start on the bench", body: "The coach does not explain it beyond a sentence. The lineup card has another name.", choices: [
    { id: "work", label: "Be the first one in", preview: "Coachability. Energy drops.", growth: 2, risk: 1, apply: ({ s }) => (tr(s, "coachability", 3), energy(s, -6), sk(s, "decisions", 1), "He notices. Minutes come back in pieces.") },
    { id: "ask", label: "Ask why, in his office", preview: "Composure. It can go badly.", growth: 1, risk: 2, apply: ({ s }) => (tr(s, "composure", 2), tr(s, "confidence", -1), "He tells you the truth. It is about defense, not the headline.") },
  ]},
  { id: "road-meal", ages: [19, 34], cooldown: 16, weight: (s) => (isPro(s) ? 1 : 0), title: "The road meal", body: "The hotel kitchen is closed. A few teammates want the place across the street that is still open.", choices: [
    { id: "room", label: "Eat what you packed", preview: "Health and discipline.", growth: 1, risk: 0, apply: ({ s }) => (health(s, 2), tr(s, "discipline", 1), "You sleep. The morning shootaround is clean.") },
    { id: "out", label: "Go with them", preview: "The group likes you. You feel it the next day.", growth: 0, risk: 1, apply: ({ s }) => (tr(s, "composure", 1), energy(s, -5), "The stories are good. Your legs are heavy.") },
  ]},
  { id: "rookie-chore", ages: [19, 24], cooldown: 40, once: true, weight: (s) => (s.placement.node === "nba" || s.placement.node === "g-league" ? 1.8 : 0), title: "Rookie chore", body: "The veterans leave the bags and the coffee order to you.", choices: [
    { id: "carry", label: "Carry everything", preview: "Coachability. You are tired.", growth: 1, risk: 1, apply: ({ s }) => (tr(s, "coachability", 3), energy(s, -5), "Nobody thanks you. They pass you the ball in a drill, which is the thanks.") },
    { id: "split", label: "Split it with the other rookies", preview: "Composure.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "composure", 2), "You make a list. It gets done before shootaround.") },
  ]},
  { id: "anthem", ages: [18, 35], cooldown: 36, once: true, weight: (s) => (s.international.caps > 0 ? 1.6 : 0), tone: "good", title: "The anthem", body: (s) => `They play the anthem of ${country(s.international.countryId ?? s.birthplace.countryId).name}. Your hands shake on the sideline.`, choices: [
    { id: "look", label: "Look at the flag", preview: "Composure.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "composure", 3), expo(s, 1), "The shake is gone by the opening tip.") },
    { id: "routine", label: "Stay in your routine", preview: "Focus. You miss the moment a little.", growth: 1, risk: 0, apply: ({ s }) => (sk(s, "decisions", 1), "You review the scout sheet in your head until the whistle.") },
  ]},
  { id: "name-in-a-rumor", ages: [22, 34], cooldown: 20, weight: (s) => (isPro(s) && ["starter", "star", "rotation"].includes(s.placement.role) ? 1.2 : 0), title: "Your name is in a rumor", body: (s) => `A reporter links you to another club. Nobody in the ${s.placement.teamName ?? "front office"} has said a word.`, choices: [
    { id: "ignore", label: "Play", preview: "Composure.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "composure", 2), "You have a normal week. The rumor dies.") },
    { id: "ask", label: "Ask your agent", preview: "You might not like the answer.", growth: 1, risk: 1, apply: ({ s }) => (expo(s, 1), tr(s, "confidence", -1), s.finance.agent ? "Your agent says it is smoke. You sleep badly anyway." : "You do not have an agent. A teammate tells you to stop reading.") },
  ]},
  { id: "empty-gym", ages: [16, 36], cooldown: 22, weight: (s) => (onTeam(s) ? 0.9 : 0.4), title: "The gym is empty", body: "Practice ended an hour ago. The lights are still on. Nobody told you to leave.", choices: [
    { id: "stay", label: "Stay and shoot", preview: "Shooting. You spend energy.", growth: 2, risk: 1, apply: ({ s }) => (sk(s, "shooting", 1), sk(s, "freeThrows", 1), energy(s, -6), "You make the last ten in a row and tell nobody.") },
    { id: "lift", label: "Lift instead", preview: "Strength.", growth: 2, risk: 1, apply: ({ s }) => (ath(s, "strength", 1), energy(s, -5), "The weight room is yours. You leave when the cleaner arrives.") },
    { id: "home", label: "Go home", preview: "You recover.", growth: 0, risk: 0, apply: ({ s }) => (energy(s, 5), "You ice and sleep.") },
  ]},
  { id: "young-teammate", ages: [28, 38], cooldown: 30, once: true, weight: (s) => (isPro(s) && s.ageMonths >= 28 * 12 ? 1.7 : 0), title: "The kid is better than you were", body: "A younger teammate does something in practice you needed years to learn.", choices: [
    { id: "teach", label: "Show him the rest", preview: "Passing and coachability. Your role shrinks a little.", growth: 1, risk: 1, apply: ({ s }) => (sk(s, "passing", 1), tr(s, "coachability", 2), expo(s, -1), "He starts next to you. The offense gets easier.") },
    { id: "compete", label: "Compete for every rep", preview: "Motivation. The room gets tense.", growth: 2, risk: 2, apply: ({ s }) => (tr(s, "motivation", 3), tr(s, "composure", -1), "You win some days. He wins more of them.") },
  ]},
  { id: "load-talk", ages: [26, 36], cooldown: 24, weight: (s) => (s.placement.node === "nba" && ["starter", "star"].includes(s.placement.role) ? 1.5 : 0), title: "The coach wants you to sit one", body: "Back-to-back tomorrow. He says the second game can live without you.", choices: [
    { id: "sit", label: "Sit", preview: "Health. The building boos a little.", growth: 0, risk: 0, apply: ({ s }) => (health(s, 3), energy(s, 8), "You watch. Your legs thank you on Tuesday.") },
    { id: "play", label: "Tell him you are playing", preview: "The crowd loves it. Your body keeps the receipt.", growth: 1, risk: 2, apply: ({ s }) => (tr(s, "motivation", 2), health(s, -2), energy(s, -6), "You play both. The box score is fine. The morning is not.") },
  ]},
  { id: "charity-game", ages: [24, 40], cooldown: 36, once: true, weight: (s) => (s.exposure >= 40 ? 1.4 : 0.3), tone: "good", title: "A charity game back home", body: (s) => `They want you for an exhibition in ${country(s.birthplace.countryId).name}. The money goes to a youth gym.`, choices: [
    { id: "go", label: "Go and play", preview: "Exposure. A long trip.", growth: 1, risk: 1, apply: ({ s }) => (expo(s, 3), energy(s, -8), tr(s, "composure", 1), "The gym is full of kids in homemade shirts with your number.") },
    { id: "send", label: "Send money, stay home", preview: "The gym still gets help. You rest.", growth: 0, risk: 0, blocked: (s) => afford(cost(s, 2000))(s), apply: ({ s }) => (charge(s, cost(s, 2000)), "You write a check and sleep in your own bed.") },
  ]},
  { id: "farewell-hint", ages: [32, 40], cooldown: 40, once: true, weight: (s) => (isPro(s) ? 1.3 : 0), title: "Someone asks if this is the last year", body: "A reporter asks it like a kindness. It does not feel like one.", choices: [
    { id: "year", label: "Say you are playing this year", preview: "Composure.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "composure", 2), "You talk about the next game and nothing else.") },
    { id: "think", label: "Say you have thought about it", preview: "Honest. The story runs.", growth: 0, risk: 1, apply: ({ s }) => (expo(s, 2), tr(s, "confidence", -1), "The headline is bigger than the sentence you actually said.") },
  ]},
  { id: "old-gym", ages: [36, 70], cooldown: 30, phase: "after", weight: () => 1.4, title: "The old gym", body: "You walk into the gym you grew up in. The paint is new. The echo is the same.", choices: [
    { id: "shoot", label: "Shoot around with the kids", preview: "A good hour.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "motivation", 2), energy(s, -3), "One of them has your same release. You do not tell him.") },
    { id: "sit", label: "Sit in the bleachers", preview: "You watch.", growth: 0, risk: 0, apply: () => "You stay for a whole practice and leave before anyone asks for a photo." },
  ]},
  { id: "advice-line", ages: [34, 70], cooldown: 24, phase: "any", weight: (s) => (s.ageMonths >= 34 * 12 && (s.after || s.exposure >= 50) ? 1.2 : 0), title: "A kid asks how you made it", body: "He wants a secret. You remember a lot of ordinary weeks.", choices: [
    { id: "weeks", label: "Tell him about the ordinary weeks", preview: "The true version.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "composure", 1), "He looks disappointed, then he writes it down.") },
    { id: "story", label: "Tell the best story you have", preview: "He leaves happy. It is only half the job.", growth: 0, risk: 0, apply: () => "He tells his friends. The ordinary weeks stay yours." },
  ]},
  { id: "reunion", ages: [40, 70], cooldown: 48, once: true, phase: "after", weight: () => 1.5, tone: "good", title: "A reunion game", body: "Old teammates rent a gym. Nobody can jump. Everybody still talks.", choices: [
    { id: "play", label: "Play a half", preview: "Your knees file a complaint.", growth: 0, risk: 1, apply: ({ s }) => (health(s, -2), energy(s, -6), tr(s, "confidence", 2), "You hit one jumper and hear the old bench laugh.") },
    { id: "coach", label: "Coach the shirts-and-skins", preview: "You see the game faster than you can run it.", growth: 1, risk: 0, apply: ({ s }) => (sk(s, "iq", 1), "They actually run the play. That feels better than the jumper would have.") },
  ]},
  { id: "broadcast-flub", ages: [32, 65], cooldown: 28, phase: "after", weight: (s) => (s.after?.track === "media" || s.after?.track === "podcast" ? 1.6 : 0), title: "You blank on a live mic", body: "They throw to you. The name you want is gone.", choices: [
    { id: "honest", label: "Admit it and laugh", preview: "People like you more.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "composure", 2), s.exposure = clamp(s.exposure + 1, 0, 100), "The clip is kind. You learn the roster by heart that night.") },
    { id: "push", label: "Push through with the wrong name", preview: "A messy hour.", growth: 0, risk: 2, apply: ({ s }) => (tr(s, "confidence", -2), "The producer mentions it once. You do not miss the next one.") },
  ]},
  { id: "date-or-gym", ages: [15, 28], cooldown: 30, weight: () => 1.1, title: "Friday night is taken", body: "Someone you like asked you out. The coach added a late practice the same night.", choices: [
    { id: "date", label: "Go on the date", preview: "You leave practice early. The coach will notice.", growth: 0, risk: 1, apply: ({ s }) => (scene(s, "date"), tr(s, "confidence", 3), energy(s, 4), tr(s, "discipline", -1), "You go. The gym lights are still on when you walk past.") },
    { id: "gym", label: "Stay and shoot", preview: "Shooting and discipline. You cancel.", growth: 2, risk: 0, apply: ({ s }) => (sk(s, "shooting", 1), tr(s, "discipline", 2), energy(s, -5), "You text that you can't. The gym is empty and you stay until close.") },
  ]},
  { id: "stands-fight", ages: [18, 36], cooldown: 48, once: true, weight: (s) => (isPro(s) || s.placement.node === "university" ? 1.2 : 0), tone: "bad", title: "A fan comes out of the stands", body: "Late in a chippy game a fan leans over the tunnel and grabs at you. The building is already loud. Your teammates are watching your hands.", choices: [
    { id: "go", label: "Go into the seats", preview: "A suspension and a fine. The clip never dies.", growth: 0, risk: 3, apply: ({ s }) => { scene(s, "brawl"); s.flags.suspended = 1; charge(s, cost(s, 25000)); expo(s, 8); tr(s, "composure", -4); health(s, -4); return "Security gets there late. You sit the next stretch of games and pay a fine."; } },
    { id: "shove", label: "Shove him back and walk", preview: "A technical. You stay in the game.", growth: 1, risk: 2, apply: ({ s }) => (scene(s, "brawl"), tr(s, "composure", 1), expo(s, 3), "He goes back to his seat. You take the free throws and keep playing.") },
    { id: "walk", label: "Let security take it", preview: "Composure. The building boos you for not swinging.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "composure", 4), tr(s, "discipline", 2), "You point at the ref and get back on defense.") },
  ]},
  { id: "hotel-pizza", ages: [19, 36], cooldown: 60, once: true, weight: (s) => (isPro(s) ? 1.3 : 0), title: "Pizza at the other team's hotel", body: "Room service for the floor was meant for the home team. A box is outside your door the night before a big game. It smells fine.", choices: [
    { id: "eat", label: "Eat it", preview: "You might wake up sick. Sick nights have produced famous games.", growth: 2, risk: 2, apply: ({ s }) => { scene(s, "hotel"); s.flags.fluLeft = 1; health(s, -14); energy(s, -8); return "You eat half the box. By morning you are sweating and the bus is already downstairs."; } },
    { id: "leave", label: "Leave the box", preview: "You sleep. Nothing happens.", growth: 0, risk: 0, apply: ({ s }) => (tr(s, "discipline", 2), "You set it in the hall. Breakfast is the usual eggs.") },
  ]},
  { id: "parents-in-the-building", ages: [18, 34], cooldown: 48, once: true, weight: (s) => (isPro(s) ? 1 : 0), tone: "good", title: "Your parents made the trip", body: (s) => `They flew in without telling you. You see them in the tunnel an hour before tip, in ${country(s.residence.countryId).name} for the first time.`, choices: [
    { id: "tickets", label: "Get them real seats", preview: "Composure. It costs a bit.", growth: 1, risk: 0, blocked: (s) => afford(cost(s, 400))(s), apply: ({ s }) => (charge(s, cost(s, 400)), tr(s, "composure", 2), tr(s, "motivation", 2), "They are on the baseline. You play like someone is watching, because someone is.") },
    { id: "tunnel", label: "Leave them in the family room", preview: "Less fuss.", growth: 0, risk: 0, apply: () => "You hug them and go tape your ankles." },
  ]},
  { id: "clip-of-you", ages: [17, 32], cooldown: 36, once: true, weight: (s) => (onTeam(s) ? 1 : 0), title: "You get posterized", body: "The dunk is clean. By the time you shower, the clip has a caption and your name in it.", choices: [
    { id: "watch", label: "Watch it once and move on", preview: "Composure.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "composure", 2), sk(s, "perimeterD", 1), "You see the angle. The next time that player drives, you are lower.") },
    { id: "chase", label: "Spend the night answering it", preview: "Motivation. You lose sleep.", growth: 1, risk: 1, apply: ({ s }) => (tr(s, "motivation", 2), energy(s, -8), expo(s, 2), "You quote-tweet nothing and still check the count until 2 a.m.") },
  ]},
  { id: "local-shoe", ages: [18, 30], cooldown: 48, once: true, weight: (s) => (s.exposure >= 30 ? 1.1 : 0), title: "A hometown brand wants your feet", body: "A small company from where you grew up offers a shoe deal. A bigger brand has also called, and they want exclusivity later.", choices: [
    { id: "home", label: "Sign with the hometown brand", preview: "Less money. People at home notice.", growth: 1, risk: 0, apply: ({ s }) => { const n = Math.round(8000 * country(s.birthplace.countryId).model.costIndex); s.finance.endorsements.push({ brand: "hometown shoes", perYear: n, yearsLeft: 2 }); tr(s, "motivation", 2); return `About $${n.toLocaleString("en-US")} a year. The shop on the corner puts your name in the window.`; } },
    { id: "wait", label: "Wait for the bigger brand", preview: "Maybe more money. Maybe nothing.", growth: 1, risk: 1, apply: ({ s, rolls }) => { if (rolls[0]! < 0.45) { const n = Math.round(40000 * (0.6 + s.exposure / 200)); s.finance.endorsements.push({ brand: "a global shoe company", perYear: n, yearsLeft: 3 }); expo(s, 3); return `They call back. About $${n.toLocaleString("en-US")} a year.`; } return "The bigger brand goes quiet. You played the year in the same shoes."; } },
  ]},
  { id: "plane-cards", ages: [19, 36], cooldown: 28, weight: (s) => (isPro(s) ? 0.7 : 0), title: "Cards on the charter", body: "The back of the plane has a game going. The stakes are cash, and a veteran is dealing.", choices: [
    { id: "sit", label: "Sit in", preview: "You might lose a chunk of the per diem. The veterans remember who plays.", growth: 0, risk: 2, apply: ({ s, rolls }) => { const n = cost(s, rolls[0]! < 0.5 ? 600 : -400); if (n > 0) charge(s, n); else s.finance.cash += -n; tr(s, "composure", 1); return n > 0 ? "You lose the hand you should have folded." : "You win enough for dinner and know when to stand up."; } },
    { id: "film", label: "Watch film with your headphones in", preview: "IQ. You sit alone.", growth: 1, risk: 0, apply: ({ s }) => (sk(s, "iq", 1), "You mark two sets you keep missing. Nobody deals you in.") },
  ]},
  { id: "home-ref", ages: [16, 30], cooldown: 40, once: true, weight: (s) => (onTeam(s) ? 0.8 : 0), title: "The referee is from your town", body: "You recognize him from the youth league. He recognizes you. The other coach is already complaining about the whistle.", choices: [
    { id: "nothing", label: "Play it straight", preview: "Composure. No favors.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "composure", 2), "You nod once and never speak to him again that night.") },
    { id: "chat", label: "Say hello at the table", preview: "It looks like something. It might be nothing.", growth: 0, risk: 2, apply: ({ s, rolls }) => (expo(s, rolls[0]! < 0.4 ? -2 : 0), tr(s, "discipline", -1), rolls[0]! < 0.4 ? "A photo of the two of you talking ends up in a group chat." : "He keeps it short. The game is called the same as any other.") },
  ]},
];
