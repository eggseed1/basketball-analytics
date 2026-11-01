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
const cost = (s: LifeState, base: number) => Math.round(base * country(s.residence.countryId).model.costIndex);
const afford = (amount: number) => (s: LifeState) => (canPay(s, amount) ? null : "Not enough money right now.");
const scene = (s: LifeState, kind: string) => {
  s.flags.scene = kind;
  s.flags.sceneUntil = s.ageMonths + 1;
};

/**
 * Everyday youth moments that are not height boosters. Dilutes the milk / sleep /
 * hang-from-rim cluster so growing up is not a height shopping trip.
 */
export const YOUTH_LIFE_EVENTS: EventTemplate[] = [
  { id: "youth-ball-street", ages: [2, 6], cooldown: 40, once: true, weight: () => 1.12, title: "The ball rolls toward the street", body: "A bounce gets away from you. A car is coming slowly.", choices: [
    { id: "stop", label: "Freeze and yell", preview: "Someone grabs it. You stay put.", growth: 0, risk: 0, apply: ({ s }) => (tr(s, "discipline", 2), "An adult kicks it back. Your hands are still shaking.") },
    { id: "chase", label: "Chase it", preview: "You get the ball. You might get yelled at.", growth: 1, risk: 2, apply: ({ s }) => (tr(s, "confidence", 2), health(s, -2), "You get it. Someone pulls you onto the curb by the shirt.") },
  ]},
  { id: "youth-highlights-tape", ages: [3, 7], cooldown: 36, once: true, weight: () => 1.05, title: "Highlights or bed", body: "Someone put a game on. Your eyes are already closing.", choices: [
    { id: "watch", label: "Stay for one more quarter", preview: "Motivation. You are wrecked tomorrow.", growth: 1, risk: 1, apply: ({ s }) => (tr(s, "motivation", 2), energy(s, -6), "You fall asleep on the couch with the score still tied.") },
    { id: "bed", label: "Go to bed", preview: "Energy.", growth: 0, risk: 0, apply: ({ s }) => (energy(s, 8), "You hear the crowd through the wall and dream about it anyway.") },
  ]},
  { id: "youth-share-hoop", ages: [3, 8], cooldown: 28, weight: () => 0.98, title: "Another kid wants the hoop", body: "There is one plastic hoop and two of you. He stands in the paint and will not move.", choices: [
    { id: "share", label: "Take turns", preview: "Passing starts here.", growth: 1, risk: 0, apply: ({ s }) => (sk(s, "passing", 1), tr(s, "composure", 1), "You count to ten out loud. He actually passes it back.") },
    { id: "keep", label: "Keep shooting", preview: "Finishing. He leaves mad.", growth: 1, risk: 1, apply: ({ s }) => (sk(s, "finishing", 1), tr(s, "discipline", -1), "He walks off. You make five in a row alone.") },
  ]},
  { id: "youth-scrape-knee", ages: [4, 9], cooldown: 24, weight: () => 0.9, tone: "bad", title: "Blood on the concrete", body: "You fall hard on a scrap of court. The knee is open and sand is in it.", choices: [
    { id: "clean", label: "Sit out and clean it", preview: "Health. You miss the game.", growth: 0, risk: 0, apply: ({ s }) => (health(s, 3), energy(s, 4), "Someone pours water on it. You watch from the fence.") },
    { id: "play", label: "Wipe it and keep going", preview: "Toughness. It can swell.", growth: 1, risk: 2, apply: ({ s }) => (tr(s, "motivation", 2), health(s, -3), "The bandage lasts one possession.") },
  ]},
  { id: "youth-grandma", ages: [4, 10], cooldown: 48, once: true, weight: () => 0.98, tone: "good", title: "Grandma is visiting", body: "She brought food and wants to hear about school. Practice starts in an hour.", choices: [
    { id: "stay", label: "Stay through dinner", preview: "Composure. You are late.", growth: 0, risk: 1, apply: ({ s }) => (tr(s, "composure", 2), energy(s, 4), "She packs leftovers for the ride. The coach raises an eyebrow.") },
    { id: "gym", label: "Hug her and go", preview: "Discipline. She looks a little hurt.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "discipline", 2), "You are on time. She leaves a plate in the fridge.") },
  ]},
  { id: "youth-library", ages: [5, 11], cooldown: 30, weight: () => 0.83, title: "Library day", body: "The class walks to the library. A sports magazine is on the rack next to a math workbook.", choices: [
    { id: "mag", label: "Read the magazine", preview: "Motivation. Academics stall.", growth: 1, risk: 1, apply: ({ s }) => (tr(s, "motivation", 2), (s.education.academics = clamp(s.education.academics - 2, 0, 100)), "You memorize a move from a photo caption.") },
    { id: "book", label: "Take the workbook home", preview: "Academics.", growth: 1, risk: 0, apply: ({ s }) => (s.education.academics = clamp(s.education.academics + 3, 0, 100), tr(s, "discipline", 1), "You finish two pages before dinner.") },
  ]},
  { id: "youth-recess-rain", ages: [5, 10], cooldown: 22, weight: () => 0.9, title: "Recess is indoors", body: "Rain canceled the outdoor court. Kids claim the hallway for a soft ball.", choices: [
    { id: "hall", label: "Play the hallway game", preview: "Handle in tight space.", growth: 2, risk: 1, apply: ({ s }) => (sk(s, "handle", 1), energy(s, -3), "A teacher yells once. You keep the ball low.") },
    { id: "draw", label: "Draw plays on paper", preview: "IQ.", growth: 1, risk: 0, apply: ({ s }) => (sk(s, "iq", 1), "You invent a cut nobody can run yet.") },
  ]},
  { id: "youth-sibling-ball", ages: [5, 12], cooldown: 26, weight: (s) => (s.family.siblings >= 1 ? 1.05 : 0.0), title: "A sibling takes the ball", body: "You left it by the door. It is gone, and so is your sibling.", choices: [
    { id: "chase", label: "Chase them down", preview: "Energy spent. You get it back.", growth: 0, risk: 1, apply: ({ s }) => (energy(s, -4), tr(s, "confidence", 1), "You get the ball. Nobody apologizes.") },
    { id: "wait", label: "Wait them out", preview: "Composure.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "composure", 2), "It shows up before dinner, a little dirtier.") },
  ]},
  { id: "youth-first-jersey", ages: [6, 11], cooldown: 0, once: true, weight: (s) => (onTeam(s) ? 1.35 : 0.3), tone: "good", title: "Your first real jersey", body: "It smells like the bag it came in. Your number is crooked on one side.", choices: [
    { id: "wear", label: "Wear it to school the next day", preview: "Confidence. Kids talk.", growth: 1, risk: 1, apply: ({ s }) => (tr(s, "confidence", 3), expo(s, 1), "Someone asks if you start. You say yes even if it is not true yet.") },
    { id: "bag", label: "Keep it in the bag until game day", preview: "Discipline.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "discipline", 2), "You check the number three times that week.") },
  ]},
  { id: "youth-birthday-clash", ages: [6, 12], cooldown: 36, once: true, weight: () => 0.98, title: "Birthday and a game", body: "The party is Saturday at noon. Tip is at one.", choices: [
    { id: "game", label: "Play the game", preview: "Coach notices. Cake waits.", growth: 2, risk: 0, apply: ({ s }) => (tr(s, "discipline", 2), sk(s, "finishing", 1), "They save you a slice. You eat it in the car.") },
    { id: "party", label: "Stay for the party", preview: "Energy. Minutes may slip.", growth: 0, risk: 1, apply: ({ s }) => (energy(s, 6), tr(s, "motivation", -1), "You open presents. Someone else starts.") },
  ]},

  { id: "youth-lunch-table", ages: [7, 13], cooldown: 28, weight: () => 0.9, title: "The lunch table moves", body: "Your usual seat is taken by kids from another grade. They look at you and keep talking.", choices: [
    { id: "ask", label: "Ask to sit", preview: "Confidence. It can go nowhere.", growth: 1, risk: 1, apply: ({ s }) => (tr(s, "confidence", 2), "They shrug. You eat. The talk turns to last night's game.") },
    { id: "alone", label: "Eat alone", preview: "You stay quiet.", growth: 0, risk: 0, apply: ({ s }) => (tr(s, "composure", 1), "You finish fast and walk the hallway until the bell.") },
  ]},
  { id: "youth-detention", ages: [8, 14], cooldown: 30, weight: () => 0.83, tone: "bad", title: "Detention after school", body: "You talked in class. Detention ends when practice starts.", choices: [
    { id: "serve", label: "Serve it and go late", preview: "Academics hold. Coach is cold.", growth: 0, risk: 1, apply: ({ s }) => (s.education.academics = clamp(s.education.academics + 1, 0, 100), tr(s, "coachability", -1), "You run extra. Nobody asks why.") },
    { id: "skip-d", label: "Skip detention for practice", preview: "Skill. School gets worse.", growth: 2, risk: 2, apply: ({ s }) => (sk(s, "shooting", 1), (s.education.academics = clamp(s.education.academics - 4, 0, 100)), "A second note goes home.") },
  ]},
  { id: "youth-bus-late", ages: [8, 15], cooldown: 24, weight: () => 0.9, title: "The bus is late", body: "You stand in the dark for twenty minutes. Practice tip is close.", choices: [
    { id: "run", label: "Run the last stretch", preview: "Energy down. You make tip.", growth: 1, risk: 1, apply: ({ s }) => (energy(s, -5), tr(s, "discipline", 2), ath(s, "acceleration", 1), "You arrive sweaty and on time.") },
    { id: "wait", label: "Wait and walk in late", preview: "You save the legs. Coach clocks it.", growth: 0, risk: 1, apply: ({ s }) => (energy(s, 3), tr(s, "coachability", -1), "He points at the clock without looking up.") },
  ]},
  { id: "youth-friend-quits", ages: [8, 14], cooldown: 0, once: true, weight: () => 1.05, title: "Your friend quits", body: "He says basketball is done for him. He still wants to hang out after school.", choices: [
    { id: "gym", label: "Keep going to the gym", preview: "Discipline. The friendship thins.", growth: 2, risk: 1, apply: ({ s }) => (tr(s, "discipline", 3), sk(s, "shooting", 1), "You see him less. The rim still hears you.") },
    { id: "hang", label: "Hang out more", preview: "Energy. Your edge softens.", growth: 0, risk: 1, apply: ({ s }) => (energy(s, 5), tr(s, "motivation", -2), "You laugh a lot. You miss a few optional sessions.") },
  ]},
  { id: "youth-tryout-nerves", ages: [9, 15], cooldown: 36, once: true, weight: (s) => (onTeam(s) || s.placement.node === "playground" ? 1.12 : 0.45), title: "Tryout morning", body: "Your stomach is empty on purpose and still wrong. The gym doors are open.", choices: [
    { id: "breathe", label: "Breathe and shoot free throws", preview: "Composure.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "composure", 3), sk(s, "freeThrows", 1), "The first drill feels normal.") },
    { id: "hype", label: "Hype yourself up", preview: "Confidence. You might force shots.", growth: 1, risk: 1, apply: ({ s }) => (tr(s, "confidence", 3), sk(s, "finishing", 1), "You attack everything. Two misses are loud.") },
  ]},
  { id: "youth-wrong-uniform", ages: [9, 14], cooldown: 40, once: true, weight: (s) => (onTeam(s) ? 0.98 : 0.0), tone: "bad", title: "Wrong size jersey", body: "They handed you a jersey that hangs past your shorts. Warmups start in five minutes.", choices: [
    { id: "wear", label: "Wear it anyway", preview: "Composure. You look younger.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "composure", 2), "You pin the side with tape. Nobody mentions it twice.") },
    { id: "swap", label: "Hunt for a swap", preview: "You might start late.", growth: 0, risk: 1, apply: ({ s }) => (energy(s, -3), tr(s, "confidence", 1), "You find one that fits. You miss the first drill.") },
  ]},
  { id: "youth-sideline-yell", ages: [9, 16], cooldown: 32, weight: () => 0.9, title: "A parent yells from the stands", body: "It is not even your parent. The whole bench can hear the play call they want.", choices: [
    { id: "tune", label: "Tune it out", preview: "Composure.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "composure", 3), "You watch the coach's hands instead.") },
    { id: "glance", label: "Look up once", preview: "It rattles you a little.", growth: 0, risk: 1, apply: ({ s }) => (tr(s, "confidence", -1), energy(s, -2), "You miss the next rotation.") },
  ]},
  { id: "youth-ft-contest", ages: [9, 13], cooldown: 28, weight: (s) => (onTeam(s) || s.placement.node === "school-team" ? 1.05 : 0.38), title: "School free-throw contest", body: "A PE teacher puts a clipboard by the line. Winner gets bragging rights until Monday.", choices: [
    { id: "enter", label: "Enter", preview: "Free throws. Pressure.", growth: 2, risk: 1, apply: ({ s, rolls }) => (sk(s, "freeThrows", 1), rolls[0]! < 0.45 ? (tr(s, "confidence", 3), "You win by one. Someone asks for your form.") : (tr(s, "composure", 1), "You finish mid-pack. You stay after and shoot twenty more.")) },
    { id: "skip", label: "Skip it", preview: "Nothing happens.", growth: 0, risk: 0, apply: () => "You watch from the bleachers and clap once." },
  ]},
  { id: "youth-dirt-court", ages: [8, 14], cooldown: 34, weight: (s) => (s.family.courtAccess === "poor" || s.family.courtAccess === "fair" ? 1.12 : 0.38), title: "Only dirt left", body: "The paved court is locked. Someone drew a keyhole in the dirt with a stick.", choices: [
    { id: "dirt", label: "Play on dirt", preview: "Handle and toughness. Ankles take a hit.", growth: 2, risk: 1, apply: ({ s }) => (sk(s, "handle", 1), ath(s, "durability", 1), health(s, -2), "Your shoes are brown for a week.") },
    { id: "home", label: "Go home and dribble", preview: "Safer reps.", growth: 1, risk: 0, apply: ({ s }) => (sk(s, "handle", 1), energy(s, 2), "The hallway becomes a lane.") },
  ]},
  { id: "youth-game-curfew", ages: [9, 15], cooldown: 26, weight: () => 0.98, title: "Game night or bed", body: "Friends want another match online. Your household has a bedtime before a morning practice.", choices: [
    { id: "sleep", label: "Log off", preview: "Energy and discipline.", growth: 1, risk: 0, apply: ({ s }) => (energy(s, 7), tr(s, "discipline", 2), "They play without you. You wake up ready.") },
    { id: "one", label: "One more game", preview: "You are foggy in the morning.", growth: 0, risk: 1, apply: ({ s }) => (energy(s, -7), tr(s, "discipline", -1), "You win the lobby and lose the first sprint.") },
  ]},

  { id: "youth-science-fair", ages: [10, 15], cooldown: 40, once: true, weight: () => 0.9, title: "Science fair night", body: "Your board is due. The team has an optional shootaround the same evening.", choices: [
    { id: "fair", label: "Finish the board", preview: "Academics.", growth: 1, risk: 0, apply: ({ s }) => (s.education.academics = clamp(s.education.academics + 5, 0, 100), tr(s, "discipline", 2), "You get a decent grade. The gym waits.") },
    { id: "shoot", label: "Go shoot", preview: "Shooting. The board is rushed.", growth: 2, risk: 1, apply: ({ s }) => (sk(s, "shooting", 1), (s.education.academics = clamp(s.education.academics - 3, 0, 100)), "Glue is still wet in the morning.") },
  ]},
  { id: "youth-jammed-finger", ages: [10, 16], cooldown: 30, weight: () => 0.83, tone: "bad", title: "Jammed finger in pickup", body: "A pass hits the tip. It swells before you get home.", choices: [
    { id: "tape", label: "Tape it and finish the week", preview: "You keep playing. Touch suffers.", growth: 1, risk: 2, apply: ({ s }) => (sk(s, "passing", 1), health(s, -3), "You catch with the palm more. It hurts for days.") },
    { id: "rest", label: "Sit two practices", preview: "Health.", growth: 0, risk: 0, apply: ({ s }) => (health(s, 4), energy(s, 4), "The swelling goes down. You rebound with two hands again.") },
  ]},
  { id: "youth-summer-chores", ages: [11, 16], cooldown: 28, weight: (s) => (s.family.means <= 3 ? 1.05 : 0.52), title: "Chores all morning", body: "The house needs work before anyone drives you to the gym.", choices: [
    { id: "help", label: "Finish the list first", preview: "Strength and discipline. Late to the gym.", growth: 1, risk: 0, apply: ({ s }) => (ath(s, "strength", 1), tr(s, "discipline", 2), energy(s, -4), "You make the second half of open gym.") },
    { id: "sneak", label: "Slip out early", preview: "More shots. Someone notices.", growth: 2, risk: 1, apply: ({ s }) => (sk(s, "shooting", 1), tr(s, "discipline", -2), "You get an hour alone. Dinner is quiet.") },
  ]},
  { id: "youth-new-school", ages: [10, 16], cooldown: 0, once: true, weight: () => 0.68, title: "New school, first week", body: "Nobody knows if you can play. The PE teacher asks if you want to try out for the team.", choices: [
    { id: "try", label: "Try out immediately", preview: "Exposure and nerves.", growth: 2, risk: 1, apply: ({ s }) => (expo(s, 3), tr(s, "confidence", 2), energy(s, -4), scene(s, "tryout"), "You make a cut and somebody writes your name down.") },
    { id: "wait", label: "Watch a week first", preview: "Composure. You start behind.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "composure", 2), sk(s, "iq", 1), "You learn the sets from the bleachers.") },
  ]},
  { id: "youth-home-language", ages: [8, 16], cooldown: 36, once: true, weight: (s) => (s.residence.countryId !== s.birthplace.countryId ? 1.2 : 0.22), title: "Home language at practice", body: "A teammate jokes about how your parents talk. A few kids laugh.", choices: [
    { id: "own", label: "Own it out loud", preview: "Confidence.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "confidence", 3), tr(s, "composure", 1), "The joke dies. You keep speaking both ways.") },
    { id: "quiet", label: "Let it pass", preview: "You stay focused. It stings.", growth: 0, risk: 0, apply: ({ s }) => (tr(s, "composure", 2), tr(s, "confidence", -1), "You lace up tighter and say nothing.") },
  ]},
  { id: "youth-sunday-split", ages: [9, 16], cooldown: 24, weight: () => 0.9, title: "Sunday morning", body: "Family wants you at a service. Open gym starts at the same time.", choices: [
    { id: "family", label: "Go with family", preview: "Composure. Fewer shots.", growth: 0, risk: 0, apply: ({ s }) => (tr(s, "composure", 2), energy(s, 3), "You sit through it. Afternoon ball still happens.") },
    { id: "gym", label: "Go to open gym", preview: "Skill. Someone at home notices.", growth: 2, risk: 1, apply: ({ s }) => (sk(s, "shooting", 1), tr(s, "discipline", -1), "You get good work. Dinner is shorter.") },
  ]},
  { id: "youth-first-tape", ages: [11, 16], cooldown: 0, once: true, weight: (s) => (onTeam(s) ? 1.05 : 0.22), title: "First time taping an ankle", body: "The trainer shows you once. The roll looks simple until it is in your hands.", choices: [
    { id: "learn", label: "Learn to do it yourself", preview: "Durability habits.", growth: 1, risk: 0, apply: ({ s }) => (ath(s, "durability", 1), tr(s, "discipline", 2), "You wrap it tight enough. It holds through practice.") },
    { id: "ask", label: "Keep asking the trainer", preview: "Fine for now.", growth: 0, risk: 0, apply: ({ s }) => (tr(s, "coachability", 1), "They tape you every time. You still do not know the last turn.") },
  ]},
  { id: "youth-stolen-lunch", ages: [8, 13], cooldown: 40, once: true, weight: () => 0.83, tone: "bad", title: "Lunch is gone", body: "Your bag is open. The food is missing. Practice is after the last period.", choices: [
    { id: "tell", label: "Tell a teacher", preview: "You eat something later. Energy dips.", growth: 0, risk: 0, apply: ({ s }) => (energy(s, -4), tr(s, "composure", 1), "Someone finds a snack. You practice hungry.") },
    { id: "borrow", label: "Borrow from a teammate", preview: "You eat. You owe a favor.", growth: 0, risk: 0, apply: ({ s }) => (energy(s, 2), "They share a sandwich. You rebound for them all week.") },
  ]},
  { id: "youth-team-cake", ages: [10, 15], cooldown: 36, once: true, weight: (s) => (onTeam(s) ? 0.98 : 0.0), tone: "good", title: "Someone brought cake", body: "It is a birthday for a teammate. Frosting is already on three jerseys.", choices: [
    { id: "slice", label: "Have a slice", preview: "The room likes you. Legs feel slow.", growth: 0, risk: 0, apply: ({ s }) => (tr(s, "composure", 1), energy(s, -2), "You sing off-key and mean it.") },
    { id: "water", label: "Stick to water", preview: "Discipline. You look stiff.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "discipline", 2), "They tease you once. You still high-five the birthday kid.") },
  ]},
  { id: "youth-sleepover", ages: [10, 14], cooldown: 32, once: true, weight: () => 0.9, title: "Sleepover the night before", body: "A friend invites everyone over. Tip is at nine in the morning.", choices: [
    { id: "home", label: "Sleep at home", preview: "Energy.", growth: 1, risk: 0, apply: ({ s }) => (energy(s, 8), tr(s, "discipline", 1), "You are sharp. They look wrecked on the bench.") },
    { id: "go", label: "Go anyway", preview: "Fun. You drag in the first half.", growth: 0, risk: 1, apply: ({ s }) => (energy(s, -8), tr(s, "confidence", 1), "You laugh until late. The coach sits you early.") },
  ]},

  { id: "youth-group-project", ages: [12, 17], cooldown: 28, weight: () => 0.9, title: "Group project deadline", body: "Three classmates want to meet after school. You have film with the team.", choices: [
    { id: "project", label: "Do the project", preview: "Academics. You miss film.", growth: 1, risk: 1, apply: ({ s }) => (s.education.academics = clamp(s.education.academics + 4, 0, 100), tr(s, "coachability", -1), "The slides get done. Monday's scout is fuzzy.") },
    { id: "film", label: "Go to film", preview: "IQ. The group is mad.", growth: 2, risk: 1, apply: ({ s }) => (sk(s, "iq", 1), (s.education.academics = clamp(s.education.academics - 2, 0, 100)), "You know the sets. Someone else finishes your slide.") },
  ]},
  { id: "youth-part-time", ages: [14, 18], cooldown: 0, once: true, weight: (s) => (s.family.means <= 2 ? 1.27 : 0.45), title: "A part-time job offer", body: (s) => `A shop near home offers evenings for about ${cost(s, 40)} a week. Practice ends late three nights.`, choices: [
    { id: "take", label: "Take the job", preview: "Cash. Energy and gym time drop.", growth: 0, risk: 1, apply: ({ s }) => { const n = cost(s, 40) * 8; s.finance.cash += n; energy(s, -6); tr(s, "discipline", 1); return `You work. About $${n.toLocaleString("en-US")} lands over two months.`; } },
    { id: "ball", label: "Stay with basketball", preview: "Skill. No extra cash.", growth: 2, risk: 0, apply: ({ s }) => (sk(s, "shooting", 1), tr(s, "motivation", 2), "You thank them and keep your nights free.") },
  ]},
  { id: "youth-license", ages: [16, 18], cooldown: 0, once: true, weight: (s) => (s.residence.countryId === "US" || s.family.means >= 2 ? 0.98 : 0.3), title: "Driving lessons vs gym", body: "Someone will teach you to drive this month. The only free slots cut into evening workouts.", choices: [
    { id: "drive", label: "Learn to drive", preview: "Independence. Fewer gym hours.", growth: 0, risk: 0, apply: ({ s }) => (tr(s, "confidence", 2), energy(s, 2), "You pass. Getting to the gym gets easier later.") },
    { id: "gym", label: "Keep the gym slots", preview: "Skill. You stay on the bus.", growth: 2, risk: 0, apply: ({ s }) => (sk(s, "shooting", 1), ath(s, "lateral", 1), "You still ride with someone. Your handle is cleaner.") },
  ]},
  { id: "youth-clip-repost", ages: [13, 18], cooldown: 30, weight: (s) => (onTeam(s) ? 0.98 : 0.3), title: "A bad clip of you", body: "Someone posts a miss and a fall. Comments are already under it.", choices: [
    { id: "mute", label: "Mute it and work", preview: "Composure.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "composure", 3), sk(s, "perimeterD", 1), "You delete the app for a weekend.") },
    { id: "reply", label: "Reply once", preview: "Exposure. It can get worse.", growth: 0, risk: 2, apply: ({ s }) => (expo(s, 2), tr(s, "confidence", -1), "Your reply becomes the new screenshot.") },
  ]},
  { id: "youth-brochure", ages: [15, 18], cooldown: 0, once: true, weight: (s) => (s.education.level !== "done" ? 1.05 : 0.0), title: "A college brochure", body: "It shows a gym you have never seen. Your name is not in it. The letter asks if you want a visit weekend.", choices: [
    { id: "visit", label: "Ask to visit", preview: "Exposure. Travel cost.", growth: 2, risk: 0, blocked: (s) => afford(cost(s, 200))(s), apply: ({ s }) => (charge(s, cost(s, 200)), expo(s, 4), tr(s, "motivation", 2), "You walk the floor. A coach remembers your handshake.") },
    { id: "later", label: "Stay focused at home", preview: "You keep the routine.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "discipline", 2), sk(s, "iq", 1), "The brochure stays on the fridge.") },
  ]},
  { id: "youth-sibling-homework", ages: [12, 17], cooldown: 28, weight: (s) => (s.family.siblings >= 1 ? 0.98 : 0.0), title: "A sibling needs help", body: "Math is due tomorrow. They ask you, and practice starts soon.", choices: [
    { id: "help", label: "Help for half an hour", preview: "Composure. You warm up late.", growth: 0, risk: 0, apply: ({ s }) => (tr(s, "composure", 2), energy(s, -3), "They finish. You miss the first drill.") },
    { id: "go", label: "Tell them to ask later", preview: "You are on time. The house is tense.", growth: 1, risk: 1, apply: ({ s }) => (tr(s, "discipline", 1), sk(s, "shooting", 1), "You leave. Someone else helps.") },
  ]},
  { id: "youth-bus-break", ages: [13, 18], cooldown: 40, once: true, weight: (s) => (onTeam(s) ? 0.9 : 0.0), title: "The team bus breaks down", body: "You sit on the shoulder for an hour. Tip time is sliding.", choices: [
    { id: "stretch", label: "Stretch in the aisle", preview: "You stay ready.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "discipline", 2), energy(s, -2), "You tip late and still have legs.") },
    { id: "phone", label: "Scroll until help comes", preview: "You stiffen up.", growth: 0, risk: 1, apply: ({ s }) => (energy(s, -4), tr(s, "composure", -1), "The first quarter is slow for everyone.") },
  ]},
  { id: "youth-grades-meeting", ages: [13, 18], cooldown: 24, weight: (s) => (onTeam(s) && s.education.academics < 60 ? 1.2 : 0.3), title: "Coach asks about grades", body: "He pulls you aside after practice. Eligibility is the word he uses.", choices: [
    { id: "plan", label: "Make a study plan", preview: "Academics and coachability.", growth: 1, risk: 0, apply: ({ s }) => (s.education.academics = clamp(s.education.academics + 5, 0, 100), tr(s, "coachability", 3), energy(s, -3), "You lose two optional gym nights. The report card moves.") },
    { id: "promise", label: "Promise and keep training", preview: "Skill now. Risk later.", growth: 2, risk: 2, apply: ({ s }) => (sk(s, "finishing", 1), (s.education.academics = clamp(s.education.academics - 2, 0, 100)), "He watches. The next check-in is colder.") },
  ]},
  { id: "youth-locker-rumor", ages: [13, 17], cooldown: 0, once: true, weight: (s) => (onTeam(s) ? 0.83 : 0.0), tone: "bad", title: "Something missing from a locker", body: "A phone is gone. People look at the quiet kids first.", choices: [
    { id: "speak", label: "Say you saw nothing", preview: "Composure. It may not clear you.", growth: 0, risk: 1, apply: ({ s }) => (tr(s, "composure", 2), "The phone turns up in a bag. Nobody apologizes.") },
    { id: "help", label: "Help look for it", preview: "Coachability.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "coachability", 2), tr(s, "confidence", 1), "You find it under a towel. The room exhales.") },
  ]},
  { id: "youth-construction", ages: [15, 18], cooldown: 0, once: true, weight: (s) => (s.family.means <= 2 ? 1.12 : 0.22), title: "Summer construction work", body: "An uncle can get you on a crew. Dawn starts. Afternoons would still have gym time if you can stand.", choices: [
    { id: "work", label: "Take the summer work", preview: "Cash and strength. Legs are heavy.", growth: 1, risk: 1, apply: ({ s }) => { const n = cost(s, 1200); s.finance.cash += n; ath(s, "strength", 2); energy(s, -8); return `Hard weeks. About $${n.toLocaleString("en-US")} saved.`; } },
    { id: "train", label: "Train the summer instead", preview: "Skill. No paycheck.", growth: 2, risk: 0, apply: ({ s }) => (sk(s, "shooting", 1), sk(s, "handle", 1), ath(s, "lateral", 1), "You live in the gym. August feels sharp.") },
  ]},

  { id: "youth-band-or-ball", ages: [11, 15], cooldown: 0, once: true, weight: () => 0.83, title: "Band wants you too", body: "The music teacher heard you can keep time. Rehearsal conflicts with two practices a week.", choices: [
    { id: "ball", label: "Stick to basketball", preview: "Skill focus.", growth: 2, risk: 0, apply: ({ s }) => (sk(s, "shooting", 1), tr(s, "discipline", 1), "You return the loaner instrument.") },
    { id: "both", label: "Try both for a month", preview: "Coordination. You are tired.", growth: 1, risk: 1, apply: ({ s }) => (ath(s, "coordination", 1), energy(s, -6), "One of them will win later. For now you do both.") },
  ]},
  { id: "youth-camp-helper", ages: [14, 18], cooldown: 36, once: true, weight: (s) => (onTeam(s) ? 0.98 : 0.38), tone: "good", title: "Help at a kids' camp", body: "They need someone who can rebound and not yell. It pays a little and eats a weekend.", choices: [
    { id: "help", label: "Help all weekend", preview: "Passing and composure. Cash.", growth: 1, risk: 0, apply: ({ s }) => { const n = cost(s, 80); s.finance.cash += n; sk(s, "passing", 1); tr(s, "composure", 2); return `You rebound for six-year-olds. $${n.toLocaleString("en-US")} in cash.`; } },
    { id: "own", label: "Use the weekend for your own work", preview: "Your game.", growth: 2, risk: 0, apply: ({ s }) => (sk(s, "shooting", 1), sk(s, "freeThrows", 1), "You get quiet hours in an empty gym.") },
  ]},
  { id: "youth-study-hall", ages: [14, 18], cooldown: 22, weight: (s) => (onTeam(s) ? 0.9 : 0.0), title: "Mandatory study hall", body: "The team room has laptops and a rule: grades before shooting.", choices: [
    { id: "study", label: "Actually study", preview: "Academics.", growth: 1, risk: 0, apply: ({ s }) => (s.education.academics = clamp(s.education.academics + 3, 0, 100), tr(s, "discipline", 1), "You finish a paper. The gym opens late.") },
    { id: "whisper", label: "Whisper about the next opponent", preview: "IQ. A teacher notices.", growth: 1, risk: 1, apply: ({ s }) => (sk(s, "iq", 1), tr(s, "discipline", -1), "You learn a set. You also get a look.") },
  ]},
  { id: "youth-pro-pickup", ages: [15, 18], cooldown: 0, once: true, weight: (s) => (s.exposure >= 10 || onTeam(s) ? 0.9 : 0.22), title: "A rumor of pros at the park", body: "Someone says two guys from a pro team are playing until dark. It might be false.", choices: [
    { id: "go", label: "Go check", preview: "Exposure if real. You might waste a night.", growth: 1, risk: 1, apply: ({ s, rolls }) => (rolls[0]! < 0.4 ? (expo(s, 5), tr(s, "confidence", 2), energy(s, -5), "They are there. You get one run and a nod.") : (energy(s, -4), "It is just older high school kids. You still play.")) },
    { id: "stay", label: "Stick to your plan", preview: "Discipline.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "discipline", 2), sk(s, "shooting", 1), "You get your usual work. The rumor dies by morning.") },
  ]},
  { id: "youth-picture-day", ages: [12, 17], cooldown: 0, once: true, weight: (s) => (onTeam(s) ? 0.9 : 0.0), title: "Team picture day", body: "Hair is a mess and the photographer is early. Teammates are already lined up.", choices: [
    { id: "fix", label: "Fix it fast", preview: "Confidence in the photo.", growth: 0, risk: 0, apply: ({ s }) => (tr(s, "confidence", 1), "You look fine. Nobody remembers the photo in a year.") },
    { id: "line", label: "Get in line as you are", preview: "You are on time.", growth: 0, risk: 0, apply: ({ s }) => (tr(s, "composure", 1), "The picture is honest. You keep the print anyway.") },
  ]},
  { id: "youth-mouthguard", ages: [12, 17], cooldown: 40, once: true, weight: (s) => (onTeam(s) ? 0.83 : 0.0), title: "Mouthguard fight", body: "The trainer says every contact drill needs one. Yours tastes like plastic and you hate it.", choices: [
    { id: "wear", label: "Wear it", preview: "Health habit.", growth: 1, risk: 0, apply: ({ s }) => (health(s, 2), tr(s, "discipline", 2), "You stop noticing it by the third practice.") },
    { id: "hide", label: "Hide it in your sock", preview: "Comfort. Risk if you catch a elbow.", growth: 0, risk: 2, apply: ({ s }) => (tr(s, "discipline", -1), health(s, -1), "You talk clearer. An elbow still finds you once.") },
  ]},
  { id: "youth-weak-hand", ages: [11, 16], cooldown: 20, weight: () => 1.05, title: "Weak-hand week", body: "A coach bans your strong hand in drills for five days. Layups look ugly.", choices: [
    { id: "buy", label: "Buy in", preview: "Handle and finishing with the other hand.", growth: 2, risk: 0, apply: ({ s }) => (sk(s, "handle", 1), sk(s, "finishing", 1), energy(s, -4), "By Friday the ugly ones start to drop.") },
    { id: "cheat", label: "Cheat when he looks away", preview: "Short-term scores. Habit stays.", growth: 0, risk: 1, apply: ({ s }) => (tr(s, "discipline", -2), sk(s, "finishing", 1), "You look fine in drills. The game still shows the truth.") },
  ]},
  { id: "youth-babysit", ages: [13, 17], cooldown: 30, weight: (s) => (s.family.siblings >= 1 || s.family.means <= 2 ? 0.98 : 0.38), title: "Babysitting vs a tournament", body: "Family needs you home Saturday. Your team has a morning tip out of town.", choices: [
    { id: "home", label: "Stay and babysit", preview: "Family and a little cash. No tournament film.", growth: 0, risk: 1, apply: ({ s }) => { const n = cost(s, 40); s.finance.cash += n; tr(s, "composure", 1); expo(s, -1); return `You stay. $${n.toLocaleString("en-US")} and a quiet Saturday.`; } },
    { id: "tourney", label: "Go with the team", preview: "Exposure. Someone at home covers.", growth: 2, risk: 1, apply: ({ s }) => (expo(s, 3), sk(s, "offBall", 1), energy(s, -5), "You play. A text at halftime says they figured it out.") },
  ]},
  { id: "youth-dinner-parents", ages: [15, 18], cooldown: 0, once: true, weight: () => 0.83, title: "Dinner with someone's parents", body: "A person you like asked you over. Their parents want to meet you before a weekend trip. You have early lift.", choices: [
    { id: "dinner", label: "Go to dinner", preview: "Confidence. Lift suffers.", growth: 0, risk: 0, apply: ({ s }) => (tr(s, "confidence", 3), energy(s, -3), scene(s, "date"), "You use the good fork. Morning lift is half speed.") },
    { id: "lift", label: "Keep the early lift", preview: "Discipline. You reschedule.", growth: 1, risk: 1, apply: ({ s }) => (tr(s, "discipline", 2), ath(s, "strength", 1), "They understand, mostly. You squat on time.") },
  ]},
  { id: "youth-senior-speech", ages: [17, 18.5], cooldown: 0, once: true, weight: (s) => (onTeam(s) ? 1.12 : 0.0), title: "They ask you to speak", body: "Senior night. A coach wants three sentences from you in front of the parents.", choices: [
    { id: "speak", label: "Say something honest", preview: "Composure and exposure.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "composure", 3), expo(s, 2), "You thank the quiet people. Someone cries in the second row.") },
    { id: "pass", label: "Ask a teammate to do it", preview: "You stay in the back.", growth: 0, risk: 0, apply: ({ s }) => (tr(s, "confidence", -1), "They clap for him. You clap too.") },
  ]},
];
