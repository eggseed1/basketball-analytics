import type { EventTemplate } from "./events";
import { charge, canPay } from "./finance";
import { clamp } from "./rng";
import type { LifeState } from "./types";
import { country } from "./world";

const energy = (s: LifeState, d: number) => (s.condition.energy = clamp(s.condition.energy + d, 5, 100));
const health = (s: LifeState, d: number) => (s.condition.health = clamp(s.condition.health + d, 5, 100));
const expo = (s: LifeState, d: number) => (s.exposure = clamp(s.exposure + d, 0, 100));
const tr = (s: LifeState, k: "coachability" | "confidence" | "composure" | "discipline" | "motivation", d: number) => (s.traits[k] = clamp(s.traits[k] + d, 0, 100));
const cost = (s: LifeState, base: number) => Math.round(base * country(s.birthplace.countryId).model.costIndex);
const afford = (amount: number) => (s: LifeState) => (canPay(s, amount) ? null : "Not enough money right now.");
const scene = (s: LifeState, kind: string) => {
  s.flags.scene = kind;
  s.flags.sceneUntil = s.ageMonths + 1;
};
const rep = (s: LifeState, d: number) => {
  if (s.after) s.after.rep = clamp(s.after.rep + d, 0, 100);
};
const track = (s: LifeState, name: string) => s.after?.track === name;
const played = (s: LifeState) => s.nbaGames > 0 || s.seasons.some((x) => x.gp >= 20);

/**
 * One-time lives after the playing years. A coach, a scout, and a
 * broadcaster should not walk through the same three rooms.
 */
const earlyAfter = (s: LifeState) => Boolean(s.after && s.ageMonths - s.after.since < 36);

export const AFTER_SCENES: EventTemplate[] = [
  {
    id: "after-first-desk",
    ages: [28, 55],
    cooldown: 0,
    once: true,
    phase: "after",
    weight: (s) => (earlyAfter(s) ? 2.4 : 0),
    title: "The first week without a practice",
    body: "Nobody needs you at 6 a.m. The calendar has meetings instead of shootarounds. You still wake up early.",
    choices: [
      {
        id: "routine",
        label: "Build a new morning",
        preview: "Discipline. The job starts to feel real.",
        growth: 1,
        risk: 0,
        apply: ({ s }) => (scene(s, "classroom"), tr(s, "discipline", 3), rep(s, 1), "You walk before the emails. The day has edges again."),
      },
      {
        id: "drift",
        label: "Let the week happen",
        preview: "Easier. Emptier.",
        growth: 0,
        risk: 0,
        apply: ({ s }) => (tr(s, "motivation", -2), "You nap through a lunch you did not schedule. Friday feels the same as Tuesday."),
      },
    ],
  },
  {
    id: "after-identity",
    ages: [28, 58],
    cooldown: 0,
    once: true,
    phase: "after",
    weight: (s) => (earlyAfter(s) && played(s) ? 2.1 : 0),
    title: "Someone asks what you do now",
    body: "A stranger at a school event. Not who you played for. What you do. The answer sticks in your throat.",
    choices: [
      {
        id: "job",
        label: "Name the job",
        preview: "Plain. Accurate.",
        growth: 1,
        risk: 0,
        apply: ({ s }) => (tr(s, "composure", 2), rep(s, 1), `You say ${s.after?.title ?? "the work"}. It sounds smaller than the jersey and truer.`),
      },
      {
        id: "played",
        label: "Lead with the playing years",
        preview: "Familiar. Thin.",
        growth: 0,
        risk: 0,
        apply: ({ s }) => (tr(s, "confidence", 1), "You give the résumé. He nods like he already knew."),
      },
    ],
  },
  {
    id: "after-first-cut",
    ages: [30, 55],
    cooldown: 0,
    once: true,
    phase: "after",
    weight: (s) => (earlyAfter(s) && track(s, "coach") ? 2.2 : 0),
    title: "You cut a kid you like",
    body: "The list is one short. He stayed late every day. His mother already bought the travel bag.",
    choices: [
      {
        id: "call",
        label: "Call him yourself",
        preview: "Hard. Right.",
        growth: 2,
        risk: 0,
        apply: ({ s }) => (tr(s, "composure", 3), rep(s, 2), "You tell him what he still is. He hangs up before you finish. You call again in a week."),
      },
      {
        id: "assistant",
        label: "Let an assistant do it",
        preview: "Cowardly. Common.",
        growth: 0,
        risk: 1,
        apply: ({ s }) => (rep(s, -2), "The gym knows. You avoid the hallway for a day."),
      },
    ],
  },
  { id: "after-knees", ages: [34, 70], cooldown: 0, once: true, phase: "after", weight: () => 1.2, title: "The knees vote", body: "Stairs are a negotiation. A surgeon you trust says a cleanup would help, and a month off would follow.", choices: [
    { id: "cut", label: "Have the surgery", preview: "A quiet month. Walking gets easier.", growth: 1, risk: 1, apply: ({ s }) => (scene(s, "clinic"), health(s, 6), energy(s, -10), rep(s, -1), "You take the month. The first walk without the hitch is worth it.") },
    { id: "tape", label: "Tape them and keep working", preview: "You stay on the job. The ache stays too.", growth: 0, risk: 1, apply: ({ s }) => (health(s, -2), tr(s, "discipline", 1), "You learn which chairs to avoid.") },
  ]},
  { id: "after-memoir", ages: [36, 70], cooldown: 0, once: true, phase: "after", weight: (s) => (played(s) ? 1.1 : 0.4), title: "A publisher wants the book", body: "They want the fights, the money, and the name of the coach you still do not like.", choices: [
    { id: "honest", label: "Write it straight", preview: "The advance is real. So is the blowback.", growth: 1, risk: 2, apply: ({ s, rolls }) => { const n = cost(s, 40000 + s.exposure * 200); s.finance.cash += n; expo(s, 4); rep(s, rolls[0]! < 0.5 ? 3 : -4); return rolls[0]! < 0.5 ? `The book sells. You clear about $${n.toLocaleString("en-US")}.` : `It sells, and a teammate stops returning your calls. About $${n.toLocaleString("en-US")}.`; } },
    { id: "soft", label: "Keep the sharp parts out", preview: "Fewer enemies. A smaller check.", growth: 0, risk: 0, apply: ({ s }) => { const n = cost(s, 12000); s.finance.cash += n; return `A polite book. About $${n.toLocaleString("en-US")}.`; } },
    { id: "no", label: "Leave it unwritten", preview: "The stories stay yours.", growth: 0, risk: 0, apply: () => "You tell them you are not ready. You might never be." },
  ]},
  { id: "after-documentary", ages: [38, 70], cooldown: 0, once: true, phase: "after", weight: (s) => (s.exposure >= 40 || s.nbaGames > 40 ? 1.2 : 0.3), title: "A crew wants a year of your life", body: "Cameras at practice, at dinner, on the drive. They say you can kill any scene.", choices: [
    { id: "yes", label: "Let them in", preview: "Exposure. Less privacy.", growth: 1, risk: 1, apply: ({ s, rolls }) => (scene(s, "banquet"), expo(s, 5), rep(s, rolls[0]! < 0.6 ? 3 : -2), rolls[0]! < 0.6 ? "The film is fair. People who never saw you play send notes." : "They use the argument in the kitchen. You watch it once.") },
    { id: "no", label: "Close the door", preview: "Quiet.", growth: 0, risk: 0, apply: () => "You recommend a teammate who likes a microphone." },
  ]},
  { id: "after-hometown-court", ages: [34, 68], cooldown: 0, once: true, phase: "after", weight: () => 1, title: "The court you learned on is cracking", body: (s) => `The city in ${country(s.birthplace.countryId).name} will repave it if someone pays for the hoops and the lights.`, choices: [
    { id: "pay", label: "Pay for it", preview: "Your name on a small sign. It is not cheap.", growth: 1, risk: 0, blocked: (s) => afford(cost(s, 25000))(s), apply: ({ s }) => (charge(s, cost(s, 25000)), scene(s, "classroom"), tr(s, "motivation", 2), "Kids are on it the week the paint dries. The sign is smaller than the brochure.") },
    { id: "raise", label: "Raise the money instead", preview: "Slower. More people own it.", growth: 1, risk: 0, apply: ({ s }) => (rep(s, 2), "A car wash and a game do most of the work. You write the last check.") },
  ]},
  { id: "after-feud", ages: [36, 70], cooldown: 0, once: true, phase: "after", weight: () => 1, title: "The reunion leaves one name off", body: "An old teammate is organizing it. Yours is not on the text. You know which argument this is about.", choices: [
    { id: "call", label: "Call him", preview: "It might end. It might restart.", growth: 1, risk: 1, apply: ({ s, rolls }) => (tr(s, "composure", 1), rolls[0]! < 0.55 ? "You talk for twenty minutes. Your name goes on the list." : "He lets it ring. You stop trying.") },
    { id: "skip", label: "Stay home", preview: "The feud keeps.", growth: 0, risk: 0, apply: () => "You hear about the night from someone else. They say it was fine." },
  ]},
  { id: "after-card-show", ages: [34, 70], cooldown: 0, once: true, phase: "after", weight: (s) => (played(s) ? 1 : 0.3), title: "A card show in a hotel ballroom", body: "They will pay you to sign for four hours. A line of kids, and a line of men with graded slabs.", choices: [
    { id: "sign", label: "Sit the table", preview: "Cash. Your hand cramps.", growth: 0, risk: 0, apply: ({ s }) => { scene(s, "cards"); const n = cost(s, 6000 + Math.round(s.exposure * 40)); s.finance.cash += n; return `Four hours. About $${n.toLocaleString("en-US")}. One kid asks you to sign a ball from a team you only played ten games for.`; } },
    { id: "no", label: "Skip it", preview: "Your weekend stays yours.", growth: 0, risk: 0, apply: () => "You spend Saturday at home." },
  ]},
  { id: "after-speak", ages: [34, 70], cooldown: 0, once: true, phase: "after", weight: () => 1.1, title: "The high school wants an assembly", body: "Forty minutes in the gym where the bleachers still squeak. They want a speech, not a clinic.", choices: [
    { id: "go", label: "Go and tell the plain version", preview: "A good hour.", growth: 1, risk: 0, apply: ({ s }) => (scene(s, "classroom"), tr(s, "composure", 1), "You talk about the weeks nobody filmed. Two kids stay after to ask about workouts.") },
    { id: "clinic", label: "Turn it into a workout", preview: "Less talking. They remember the drill.", growth: 1, risk: 0, apply: ({ s }) => (scene(s, "classroom"), energy(s, -4), "You run them through the closeout you hated at 16.") },
  ]},
  { id: "after-golf", ages: [36, 70], cooldown: 0, once: true, phase: "after", weight: (s) => (track(s, "coach") || track(s, "scout") || s.nbaGames > 0 ? 1.2 : 0.4), title: "Eighteen holes with the people who hire", body: "An owner, a general manager, and a cart with your name on a piece of tape. The round is the interview.", choices: [
    { id: "play", label: "Play and listen", preview: "A job might come out of it. So might a quote you regret.", growth: 1, risk: 1, apply: ({ s, rolls }) => (scene(s, "golf"), rep(s, rolls[0]! < 0.6 ? 4 : -2), rolls[0]! < 0.6 ? "You shoot a number you can admit to. They call the next week." : "You talk too long about a player. The cart ride back is quiet.") },
    { id: "pass", label: "Say you do not golf", preview: "Honest. You miss the room.", growth: 0, risk: 0, apply: () => "They fill the foursome without you." },
  ]},
  { id: "after-grocery", ages: [34, 72], cooldown: 0, once: true, phase: "after", weight: () => 0.9, tone: "good", title: "A kid stops you in the grocery store", body: "He has the wrong season of your jersey and a pen that does not work on the fabric.", choices: [
    { id: "photo", label: "Take the photo", preview: "Two minutes.", growth: 0, risk: 0, apply: ({ s }) => (tr(s, "composure", 1), "His mother cries a little. You buy the milk and leave.") },
    { id: "rush", label: "Say you are late", preview: "You are not late.", growth: 0, risk: 0, apply: () => "You feel it in the parking lot." },
  ]},
  { id: "after-gambling-ad", ages: [32, 65], cooldown: 0, once: true, phase: "after", weight: (s) => (s.exposure >= 25 ? 1.1 : 0.4), title: "A betting company wants your face", body: "The money is silly for a few posts. The comments will not be.", choices: [
    { id: "take", label: "Take the money", preview: "A large check. A louder mention of your name.", growth: 0, risk: 2, apply: ({ s }) => { const n = cost(s, 80000); s.finance.cash += n; s.finance.endorsements.push({ brand: "a sportsbook", perYear: Math.round(n / 2), yearsLeft: 2 }); expo(s, 3); rep(s, -2); return `About $${n.toLocaleString("en-US")} up front. A player you like asks you not to do the next one.`; } },
    { id: "no", label: "Turn it down", preview: "You keep the ads off your face.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "discipline", 2), rep(s, 1), "You tell your agent to stop sending them.") },
  ]},
  { id: "after-tax", ages: [35, 68], cooldown: 0, once: true, phase: "after", weight: () => 0.8, tone: "bad", title: "A letter from the tax office", body: "A year you played in two countries was filed thin. They want a number, and they want it soon.", choices: [
    { id: "pay", label: "Pay an accountant and settle", preview: "It costs money. It ends.", growth: 0, risk: 0, blocked: (s) => afford(cost(s, 15000))(s), apply: ({ s }) => (charge(s, cost(s, 15000)), "The number is ugly and final. You sleep.") },
    { id: "fight", label: "Fight the assessment", preview: "You might win. You might owe more.", growth: 0, risk: 2, apply: ({ s, rolls }) => { if (rolls[0]! < 0.45) return "They drop half of it. Your accountant looks surprised."; const n = cost(s, 28000); charge(s, n); return `You lose. About $${n.toLocaleString("en-US")}, plus the feeling of having been sure.`; } },
  ]},
  { id: "after-nephew", ages: [40, 70], cooldown: 0, once: true, phase: "after", weight: () => 1, title: "A nephew wants a tryout", body: "He is quick and he is family. He is also not as good as the letter his mother wrote.", choices: [
    { id: "honest", label: "Tell him the truth and train him anyway", preview: "A hard conversation. A useful summer.", growth: 1, risk: 0, apply: ({ s }) => (scene(s, "classroom"), tr(s, "composure", 2), "He cries in the car. By August his left hand is real.") },
    { id: "call", label: "Call in a favor for a look", preview: "He gets a camp. Your name is on it if he is not ready.", growth: 0, risk: 2, apply: ({ s, rolls }) => (rep(s, rolls[0]! < 0.4 ? 1 : -3), rolls[0]! < 0.4 ? "He holds his own. The coach thanks you." : "He is overmatched. You hear your name in the explanation.") },
  ]},
  { id: "after-street", ages: [45, 75], cooldown: 0, once: true, phase: "after", weight: (s) => (s.seasons.some((x) => (x.awards?.length ?? 0) > 0) ? 1 : 0.5), tone: "good", title: "They want to rename a street", body: "A block near the gym. A vote at city hall. Your mother has already told the neighbors.", choices: [
    { id: "yes", label: "Accept it", preview: "A Tuesday ceremony.", growth: 0, risk: 0, apply: ({ s }) => (scene(s, "banquet"), expo(s, 1), "The sign goes up. Someone steals it within a month. The city replaces it.") },
    { id: "wait", label: "Ask them to wait", preview: "You are not ready to be a sign.", growth: 0, risk: 0, apply: () => "They table it. Your mother is annoyed for a week." },
  ]},
  { id: "after-alumni-boo", ages: [36, 68], cooldown: 0, once: true, phase: "after", weight: (s) => (played(s) ? 1 : 0), tone: "bad", title: "They boo the introduction", body: "Alumni night. Your old building remembers a leaving better than the years you stayed.", choices: [
    { id: "stay", label: "Stand there and wave", preview: "Composure. It lasts one song.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "composure", 3), "The boo thins out. A kid in your jersey does not join it.") },
    { id: "leave", label: "Skip the rest of the night", preview: "You go home early.", growth: 0, risk: 0, apply: () => "You watch the second half from the car." },
  ]},
  { id: "after-old-film", ages: [38, 72], cooldown: 0, once: true, phase: "after", weight: () => 0.9, title: "Someone digitizes your old games", body: "A full season you remembered as brilliant. The film is ordinary, with two nights that still hold up.", choices: [
    { id: "watch", label: "Watch the whole thing", preview: "You recalibrate.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "composure", 2), "You were better in the fourth than in your stories, and worse in the first.") },
    { id: "clip", label: "Keep the two good nights", preview: "The myth stays mostly intact.", growth: 0, risk: 0, apply: () => "You save those and close the laptop." },
  ]},
  { id: "after-coach-tank", ages: [32, 66], cooldown: 0, once: true, phase: "after", weight: (s) => (track(s, "coach") ? 1.5 : 0), title: "The front office wants the losses", body: "A text after a win: ease off. The draft pick is the plan. Your players can read a box score.", choices: [
    { id: "play", label: "Keep coaching to win", preview: "The room trusts you. The boss might not.", growth: 2, risk: 2, apply: ({ s, rolls }) => (rep(s, rolls[0]! < 0.5 ? 4 : -5), rolls[0]! < 0.5 ? "You steal a few wins. They grumble and keep you." : "They call it insubordination. Your name is in the papers.") },
    { id: "sit", label: "Rest the starters on the back-to-back", preview: "You give them the cover they asked for.", growth: 0, risk: 1, apply: ({ s }) => (rep(s, -1), tr(s, "discipline", -1), "The young guys play. You hate the film.") },
  ]},
  { id: "after-coach-parent", ages: [32, 66], cooldown: 0, once: true, phase: "after", weight: (s) => (track(s, "coach") ? 1.3 : 0), title: "A parent storms practice", body: "He wants his son's minutes explained in front of the team. The son is staring at the floor.", choices: [
    { id: "private", label: "Take it to the office", preview: "The practice survives.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "composure", 2), rep(s, 1), "You say the same thing you would have said on the floor, without the audience.") },
    { id: "floor", label: "Answer him on the floor", preview: "The team hears the standard. The parent might not come back.", growth: 1, risk: 2, apply: ({ s, rolls }) => (rep(s, rolls[0]! < 0.6 ? 2 : -2), rolls[0]! < 0.6 ? "The gym goes quiet. Practice finishes clean." : "It turns into a shove. You spend the evening on the phone with the school.") },
  ]},
  { id: "after-coach-gamble", ages: [32, 66], cooldown: 0, once: true, phase: "after", weight: (s) => (track(s, "coach") && (s.after?.step ?? 0) >= 1 ? 1.2 : 0), title: "You catch a player betting", body: "A phone left on a bench. Slips for games he is in. He is your best scorer.", choices: [
    { id: "report", label: "Turn it in", preview: "You lose him. You keep the program.", growth: 1, risk: 1, apply: ({ s }) => (rep(s, 4), tr(s, "discipline", 2), "He is gone by Monday. The rest of the roster plays scared, then normal.") },
    { id: "warn", label: "Handle it in the room", preview: "Maybe he stops. Maybe you own it if he does not.", growth: 0, risk: 3, apply: ({ s, rolls }) => (rep(s, rolls[0]! < 0.5 ? 1 : -6), rolls[0]! < 0.5 ? "He deletes the app in front of you. You check again in a month." : "It leaks anyway. You look like you covered it.") },
  ]},
  { id: "after-scout-flight", ages: [32, 66], cooldown: 0, once: true, phase: "after", weight: (s) => (track(s, "scout") ? 1.4 : 0), title: "You miss the only flight", body: "A workout on another continent. Weather, then a line, then the plane leaves with your seat empty.", choices: [
    { id: "chase", label: "Buy the next ticket", preview: "You arrive late and tired. The player is still there.", growth: 1, risk: 1, blocked: (s) => afford(cost(s, 1800))(s), apply: ({ s }) => (charge(s, cost(s, 1800)), rep(s, 2), "You see the last twenty minutes. The report is shorter and better for it.") },
    { id: "tape", label: "Write it from the film", preview: "Cheaper. You did not see his feet.", growth: 0, risk: 1, apply: ({ s }) => (rep(s, -1), "The film hides the thing you flew there to check.") },
  ]},
  { id: "after-scout-stolen", ages: [34, 66], cooldown: 0, once: true, phase: "after", weight: (s) => (track(s, "scout") ? 1.3 : 0), title: "Your report shows up under another name", body: "A prospect you filed six months ago is in a rival memo, same tells, same hometown coach.", choices: [
    { id: "quiet", label: "Tell your boss and leave it", preview: "You look like an adult. He might not care.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "composure", 2), rep(s, 1), "Your boss nods. The pick still happens. Your name is in the internal note.") },
    { id: "loud", label: "Call the other team out", preview: "Satisfying. Messy.", growth: 0, risk: 2, apply: ({ s, rolls }) => (rep(s, rolls[0]! < 0.4 ? 2 : -3), expo(s, 1), rolls[0]! < 0.4 ? "People in the business believe you." : "It becomes a feud. You lose a camp invite.") },
  ]},
  { id: "after-scout-war", ages: [32, 66], cooldown: 0, once: true, phase: "after", weight: (s) => (track(s, "scout") ? 1 : 0), title: "The camp is not safe to stay for", body: "The tournament moved cities twice. Your contact says the road back out is fine in daylight and stupid after dark.", choices: [
    { id: "stay", label: "Stay for the last game", preview: "You see the player. You take the risk.", growth: 2, risk: 2, apply: ({ s, rolls }) => (rep(s, 3), health(s, rolls[0]! < 0.15 ? -8 : 0), rolls[0]! < 0.15 ? "You see him. The ride out is longer than the plan." : "You see him play angry, which is what you came for, and you leave at noon.") },
    { id: "go", label: "Leave with the film you have", preview: "Safer. The report has a hole.", growth: 0, risk: 0, apply: ({ s }) => (tr(s, "discipline", 1), "You write what you saw and mark the rest unknown.") },
  ]},
  { id: "after-show-pulled", ages: [34, 66], cooldown: 0, once: true, phase: "after", weight: (s) => (track(s, "podcast") || track(s, "media") ? 1.4 : 0), title: "The sponsor pulls out", body: "An episode about a team doctor went further than the ad read. The email arrives before lunch.", choices: [
    { id: "keep", label: "Keep the episode up", preview: "You lose the money. The show sounds like itself.", growth: 1, risk: 1, apply: ({ s }) => (rep(s, 3), expo(s, 2), "Downloads jump. The next sponsor is smaller and less nervous.") },
    { id: "cut", label: "Trim it and apologize", preview: "The check survives. Listeners notice.", growth: 0, risk: 1, apply: ({ s }) => (rep(s, -2), "You cut four minutes. The comments are worse than the episode was.") },
  ]},
  { id: "after-guest-walks", ages: [32, 66], cooldown: 0, once: true, phase: "after", weight: (s) => (track(s, "podcast") || track(s, "media") ? 1.2 : 0), title: "The guest walks off", body: "You asked about a teammate he does not defend. He takes the microphone off like it is a watch.", choices: [
    { id: "air", label: "Air the walk-off", preview: "People will watch. He will not be back.", growth: 1, risk: 2, apply: ({ s }) => (scene(s, "banquet"), expo(s, 4), rep(s, 1), "The clip does the work. You spend a week saying you did not plan it.") },
    { id: "kill", label: "Kill the episode", preview: "You keep a relationship.", growth: 0, risk: 0, apply: ({ s }) => (tr(s, "composure", 2), "You talk in the hallway until he is a person again. The episode never posts.") },
  ]},
  { id: "after-call-your-kid", ages: [40, 68], cooldown: 0, once: true, phase: "after", weight: (s) => (track(s, "media") ? 1.3 : 0), title: "They assign you your own kid's game", body: "High school sectionals. The producer thinks it is a nice story. You know the referee, the coach, and the boy.", choices: [
    { id: "call", label: "Call it straight", preview: "Harder than an NBA game.", growth: 1, risk: 1, apply: ({ s }) => (scene(s, "classroom"), tr(s, "composure", 2), rep(s, 2), "You say his name the way you say everyone else's. He pretends not to look up.") },
    { id: "switch", label: "Ask for a different game", preview: "Cleaner. The producer sighs.", growth: 0, risk: 0, apply: () => "Someone else calls it. You watch from the top row." },
  ]},
  { id: "after-hot-take-ages", ages: [36, 68], cooldown: 0, once: true, phase: "after", weight: (s) => (track(s, "media") ? 1.2 : 0), title: "An old take aged badly", body: "A clip from three years ago is back. You said a player would never be more than a reserve. He is an All-Star this week.", choices: [
    { id: "own", label: "Say you were wrong on the air", preview: "Short and clean.", growth: 1, risk: 0, apply: ({ s }) => (tr(s, "composure", 2), rep(s, 2), "You say it in the first minute. He quotes you kindly, which is worse and better.") },
    { id: "ignore", label: "Let it scroll past", preview: "It does not scroll past.", growth: 0, risk: 1, apply: ({ s }) => (rep(s, -1), "The clip outlives the apology you did not make.") },
  ]},
  { id: "after-rival-client", ages: [32, 66], cooldown: 0, once: true, phase: "after", weight: (s) => (track(s, "trainer") ? 1.4 : 0), title: "A rival wants the summer", body: "The best player on the team that ended your last good year wants you in the gym. Your old teammates will see the photos.", choices: [
    { id: "train", label: "Train him", preview: "Money and a better shooter. A group chat you are not in.", growth: 1, risk: 1, apply: ({ s }) => { scene(s, "classroom"); const n = cost(s, 20000); s.finance.cash += n; rep(s, 2); return `You take the check, about $${n.toLocaleString("en-US")}. His jumper is quieter by August.`; } },
    { id: "no", label: "Send him to someone else", preview: "Loyalty, or stubbornness.", growth: 0, risk: 0, apply: () => "You give him a name. He hires that person." },
  ]},
  { id: "after-unpaid", ages: [32, 66], cooldown: 0, once: true, phase: "after", weight: (s) => (track(s, "trainer") ? 1.2 : 0), tone: "bad", title: "A client stops paying", body: "Six weeks of mornings. The invoices sit. He is on a roster and he is not answering.", choices: [
    { id: "stop", label: "Stop the workouts", preview: "You lose the time you already gave.", growth: 0, risk: 0, apply: ({ s }) => (tr(s, "discipline", 2), "You send one more note and lock the gym calendar.") },
    { id: "chase", label: "Have someone collect it", preview: "You might get paid. You will not train him again.", growth: 0, risk: 1, apply: ({ s, rolls }) => { if (rolls[0]! < 0.6) { const n = cost(s, 8000); s.finance.cash += n; return `Most of it arrives. About $${n.toLocaleString("en-US")}.`; } return "The collector gets silence too. You eat the month."; } },
  ]},
  { id: "after-fantasy-camp", ages: [40, 70], cooldown: 0, once: true, phase: "after", weight: (s) => (played(s) ? 1 : 0.2), title: "A fantasy camp wants the weekend", body: "Accountants in your jersey. A game on Saturday that they will describe as competitive.", choices: [
    { id: "go", label: "Go and take it seriously for an hour", preview: "They paid. You owe them a real rep.", growth: 0, risk: 0, apply: ({ s }) => { scene(s, "banquet"); const n = cost(s, 10000); s.finance.cash += n; energy(s, -6); return `You play a half. About $${n.toLocaleString("en-US")}. One of them can actually shoot.`; } },
    { id: "no", label: "Stay off the flyer", preview: "No check.", growth: 0, risk: 0, apply: () => "You let a teammate be the name on the poster." },
  ]},
  { id: "after-clinic-abroad", ages: [34, 68], cooldown: 0, once: true, phase: "after", weight: () => 1, title: "A federation wants a week of clinics", body: (s) => `Not the country you played for. A gym with one basket that dips to the left, and kids who have watched you on a phone.`, choices: [
    { id: "go", label: "Go for the week", preview: "Tiring. The work is obvious.", growth: 1, risk: 0, apply: ({ s }) => (scene(s, "clinic"), energy(s, -8), tr(s, "motivation", 2), rep(s, 1), "You teach the closeout until the net is the only thing wrong with the gym.") },
    { id: "send", label: "Send film and a drill sheet", preview: "Easier. Thinner.", growth: 0, risk: 0, apply: () => "They thank you. You are not sure they can use a sheet." },
  ]},
  { id: "after-politics", ages: [45, 72], cooldown: 0, once: true, phase: "after", weight: (s) => (s.exposure >= 35 ? 0.9 : 0.3), title: "Someone asks you to run", body: "A local seat. They like your name more than your positions, which you do not have yet.", choices: [
    { id: "no", label: "Stay out of it", preview: "You keep the gym and lose the headache.", growth: 0, risk: 0, apply: () => "You tell them you are bad at meetings. This is true." },
    { id: "listen", label: "Take the meeting", preview: "You might like the idea. You might hate the room.", growth: 0, risk: 1, apply: ({ s, rolls }) => (expo(s, 2), rolls[0]! < 0.3 ? "You like one issue enough to keep talking. Nothing is filed." : "The room wants a mascot. You leave at the hour.") },
  ]},
  { id: "after-shoes-auction", ages: [40, 75], cooldown: 0, once: true, phase: "after", weight: (s) => (played(s) ? 0.8 : 0), title: "The shoes from the last game", body: "An auction house wants the pair from your last real game. They are in a closet, still stained.", choices: [
    { id: "sell", label: "Sell them", preview: "Money. The closet gets lighter.", growth: 0, risk: 0, apply: ({ s }) => { const n = cost(s, 5000 + s.nbaGames * 40); s.finance.cash += n; return `They sell. About $${n.toLocaleString("en-US")}. You keep the socks, which nobody asked for.`; } },
    { id: "keep", label: "Keep them", preview: "They stay yours.", growth: 0, risk: 0, apply: () => "You put them back on the shelf." },
  ]},
  { id: "after-union", ages: [34, 60], cooldown: 0, once: true, phase: "after", weight: (s) => (s.nbaGames > 0 ? 1 : 0.3), title: "A players' meeting wants a retired voice", body: "They are arguing about the cut of playoff money. You are in the room as someone who already got his.", choices: [
    { id: "speak", label: "Say what the check looked like", preview: "Useful. You are not the one voting.", growth: 1, risk: 0, apply: ({ s }) => (scene(s, "banquet"), rep(s, 1), "You tell them the number after tax. The room gets quieter and more practical.") },
    { id: "sit", label: "Sit and listen", preview: "You are a guest.", growth: 0, risk: 0, apply: () => "You shake hands and leave before the vote." },
  ]},
  { id: "after-team-store", ages: [36, 70], cooldown: 0, once: true, phase: "after", weight: (s) => (played(s) ? 0.8 : 0), title: "The team store is selling your name", body: "A jersey with your number, a caption that skips the year you left angry. No one called.", choices: [
    { id: "call", label: "Call and fix the caption", preview: "Small. It matters to you.", growth: 0, risk: 0, apply: () => "They change a sentence. The jersey stays on the site." },
    { id: "lawyer", label: "Have someone send a letter", preview: "Louder. You might get a fee.", growth: 0, risk: 1, apply: ({ s, rolls }) => { if (rolls[0]! < 0.5) { const n = cost(s, 7000); s.finance.cash += n; return `They pay for the old use. About $${n.toLocaleString("en-US")}.`; } charge(s, cost(s, 2000)); return "The letter costs more than the jersey. You drop it."; } },
  ]},
  { id: "after-physical", ages: [50, 75], cooldown: 0, once: true, phase: "after", weight: () => 1, title: "The physical you have been skipping", body: "Your doctor stopped being polite about it. The appointment is Thursday.", choices: [
    { id: "go", label: "Go", preview: "You find out.", growth: 1, risk: 0, apply: ({ s, rolls }) => (scene(s, "clinic"), health(s, rolls[0]! < 0.7 ? 4 : -2), rolls[0]! < 0.7 ? "Nothing dramatic. A pill and a walk they want you to take." : "A number is high. You start the walk anyway.") },
    { id: "next", label: "Push it a month", preview: "The month becomes a season.", growth: 0, risk: 1, apply: ({ s }) => (health(s, -1), "You move it. You know you will move it again.") },
  ]},
];
