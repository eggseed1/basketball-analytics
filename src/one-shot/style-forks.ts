import type { EventTemplate } from "./events";
import { clamp } from "./rng";
import { tiltCeilings } from "./skills";
import type { AthleticKey, LifeState, SkillKey, TraitKey } from "./types";

const sk = (s: LifeState, k: SkillKey, d: number) => (s.skills[k] = clamp(s.skills[k] + d, 1, Math.max(s.skills[k], s.potentials[k])));
const drop = (s: LifeState, k: SkillKey, d: number) => (s.skills[k] = clamp(s.skills[k] - d, 1, 99));
const tr = (s: LifeState, k: TraitKey, d: number) => (s.traits[k] = clamp(s.traits[k] + d, 0, 100));
const ath = (s: LifeState, k: AthleticKey, d: number) => (s.body[k] = clamp(s.body[k] + d, 1, 99));
const energy = (s: LifeState, d: number) => (s.condition.energy = clamp(s.condition.energy + d, 5, 100));
const health = (s: LifeState, d: number) => (s.condition.health = clamp(s.condition.health + d, 5, 100));
const onTeam = (s: LifeState) => !["home", "playground", "unattached"].includes(s.placement.node);
const isPro = (s: LifeState) => ["domestic-pro", "foreign-pro", "g-league", "nba"].includes(s.placement.node);
const styled = (s: LifeState) => s.flags.style === "scorer" || s.flags.style === "connector" || s.flags.style === "defender";

/**
 * Hard forks that reshape skill ceilings and habits. Safe choices usually
 * protect the balanced game; bold ones make a better specialist and a worse
 * everything else.
 */
export const STYLE_FORK_EVENTS: EventTemplate[] = [
  {
    id: "fork-camp-lane",
    ages: [12, 17],
    cooldown: 0,
    once: true,
    weight: (s) => (onTeam(s) ? 1.6 : 0.7),
    title: "Two camps, one summer",
    body: "A shooting coach and a defense coach both want your July. You only get one.",
    choices: [
      {
        id: "shot",
        label: "Shooting camp",
        preview: "Shooting ceiling rises. Defense ceiling falls. You come back a hunter.",
        growth: 2,
        risk: 2,
        apply: ({ s }) => {
          tiltCeilings(s, { shooting: 5, freeThrows: 3, offBall: 2 }, { perimeterD: 4, interiorD: 2 });
          sk(s, "shooting", 4);
          drop(s, "perimeterD", 2);
          s.plan.primary = "shooting";
          return "You leave with a cleaner release. Help defense feels foreign in August.";
        },
      },
      {
        id: "stop",
        label: "Defense camp",
        preview: "Defense ceiling rises. Shot creation ceiling falls.",
        growth: 2,
        risk: 2,
        apply: ({ s }) => {
          tiltCeilings(s, { perimeterD: 5, interiorD: 3, iq: 2 }, { shooting: 4, handle: 2 });
          sk(s, "perimeterD", 4);
          drop(s, "shooting", 2);
          s.plan.primary = "defense";
          return "You leave lower in your stance. Open catch-and-shoots feel slower.";
        },
      },
      {
        id: "split",
        label: "Split the weeks",
        preview: "Small bumps both ways. Neither ceiling moves much.",
        growth: 1,
        risk: 0,
        apply: ({ s }) => (sk(s, "shooting", 1), sk(s, "perimeterD", 1), "You get both flavors and neither imprint."),
      },
    ],
  },
  {
    id: "fork-aau-role",
    ages: [13, 17],
    cooldown: 0,
    once: true,
    weight: (s) => (onTeam(s) || s.exposure >= 8 ? 1.5 : 0.4),
    title: "Travel team wants a role",
    body: "The coach will give you the ball every trip, or he will ask you to cut, screen, and guard. He will not do both.",
    choices: [
      {
        id: "ball",
        label: "Take every trip",
        preview: "Handle and finishing ceilings rise. Off-ball and team defense fall.",
        growth: 2,
        risk: 2,
        apply: ({ s }) => {
          tiltCeilings(s, { handle: 4, finishing: 4, decisions: 2 }, { offBall: 4, perimeterD: 3 });
          sk(s, "handle", 3);
          sk(s, "finishing", 3);
          drop(s, "offBall", 2);
          drop(s, "perimeterD", 2);
          s.plan.primary = "finishing";
          s.plan.secondary = "playmaking";
          return "You start every action. Moving without the ball feels like waiting.";
        },
      },
      {
        id: "glue",
        label: "Be the glue",
        preview: "Off-ball, passing, and defense ceilings rise. Creation falls.",
        growth: 2,
        risk: 2,
        apply: ({ s }) => {
          tiltCeilings(s, { offBall: 4, passing: 3, perimeterD: 3 }, { handle: 4, finishing: 3 });
          sk(s, "offBall", 3);
          sk(s, "passing", 2);
          sk(s, "perimeterD", 2);
          drop(s, "handle", 2);
          s.plan.primary = "defense";
          s.plan.secondary = "film-iq";
          return "You cut, screen, and stay attached. Iso nights look selfish.";
        },
      },
    ],
  },
  {
    id: "fork-kill-threes",
    ages: [14, 19],
    cooldown: 0,
    once: true,
    weight: (s) => (onTeam(s) && s.skills.shooting >= 35 ? 1.4 : 0.3),
    title: "Coach bans your threes",
    body: "He says you are hunting logos. For a month he wants paint touches only, or you can keep firing and fight him.",
    choices: [
      {
        id: "paint",
        label: "Live in the paint",
        preview: "Finishing ceiling rises. Three-point ceiling falls hard.",
        growth: 2,
        risk: 2,
        apply: ({ s }) => {
          tiltCeilings(s, { finishing: 5, freeThrows: 2, iq: 1 }, { shooting: 6 });
          sk(s, "finishing", 4);
          drop(s, "shooting", 3);
          s.plan.primary = "finishing";
          return "You attack the rim for weeks. The deep ones feel foreign when he softens.";
        },
      },
      {
        id: "fire",
        label: "Keep firing",
        preview: "Shooting ceiling rises. Coachability and minutes may suffer.",
        growth: 2,
        risk: 3,
        apply: ({ s }) => {
          tiltCeilings(s, { shooting: 5, freeThrows: 2 }, { finishing: 3 });
          sk(s, "shooting", 4);
          drop(s, "finishing", 2);
          tr(s, "coachability", -6);
          tr(s, "confidence", 3);
          s.plan.primary = "shooting";
          return "You make enough of them that he stops yelling. He still starts someone else some nights.";
        },
      },
    ],
  },
  {
    id: "fork-post-or-wing",
    ages: [14, 18],
    cooldown: 0,
    once: true,
    weight: (s) => (onTeam(s) && s.body.heightCm >= 195 ? 1.7 : s.body.heightCm >= 188 ? 0.8 : 0),
    title: "They want you on the block",
    body: "Your coach sees a post player. You grew up on the wing. One summer decides which sheet you become.",
    choices: [
      {
        id: "post",
        label: "Learn the post",
        preview: "Rebounding and interior ceilings rise. Handle and lateral speed fall.",
        growth: 2,
        risk: 2,
        apply: ({ s }) => {
          tiltCeilings(s, { rebounding: 5, interiorD: 4, finishing: 3 }, { handle: 4, perimeterD: 3 });
          sk(s, "rebounding", 4);
          sk(s, "interiorD", 3);
          ath(s, "strength", 2);
          ath(s, "lateral", -2);
          drop(s, "handle", 2);
          s.plan.primary = "rebounding-post";
          s.flags.listedAs = s.body.heightCm >= 205 ? "rim protector" : "post forward";
          return "You live on the block. Open-floor switches feel late.";
        },
      },
      {
        id: "wing",
        label: "Stay on the wing",
        preview: "Shooting and perimeter ceilings rise. You leave post strength on the table.",
        growth: 2,
        risk: 2,
        apply: ({ s }) => {
          tiltCeilings(s, { shooting: 4, perimeterD: 3, offBall: 3 }, { rebounding: 4, interiorD: 3 });
          sk(s, "shooting", 3);
          sk(s, "perimeterD", 2);
          drop(s, "rebounding", 2);
          s.plan.primary = "shooting";
          s.plan.secondary = "defense";
          s.flags.listedAs = "wing";
          return "You keep the wing. Post mismatches still push you around.";
        },
      },
    ],
  },
  {
    id: "fork-pickup-kings",
    ages: [13, 18],
    cooldown: 24,
    weight: () => 1.2,
    title: "Runs until dark",
    body: "The park game is winners stay. Structured practice is tomorrow morning.",
    choices: [
      {
        id: "park",
        label: "Stay on the winners",
        preview: "Handle and confidence. Decision-making and discipline slip.",
        growth: 2,
        risk: 2,
        apply: ({ s }) => {
          tiltCeilings(s, { handle: 2, finishing: 2 }, { decisions: 2, iq: 1 });
          sk(s, "handle", 2);
          sk(s, "finishing", 2);
          drop(s, "decisions", 1);
          tr(s, "confidence", 3);
          tr(s, "discipline", -3);
          energy(s, -8);
          return "You win four games. The scout sheet still wants cleaner reads.";
        },
      },
      {
        id: "sleep",
        label: "Go home for practice",
        preview: "IQ and discipline. The park forgets you for a night.",
        growth: 1,
        risk: 0,
        apply: ({ s }) => (sk(s, "iq", 2), sk(s, "decisions", 1), tr(s, "discipline", 2), energy(s, 4), "You sleep. Morning film sticks."),
      },
    ],
  },
  {
    id: "fork-weak-hand-year",
    ages: [12, 16],
    cooldown: 0,
    once: true,
    weight: () => 1.3,
    title: "A year of the other hand",
    body: "A trainer wants every finish and dribble off your weak hand for a full season. Scoring will look ugly until it does not.",
    choices: [
      {
        id: "year",
        label: "Commit the year",
        preview: "Handle and finishing ceilings rise a lot. Shooting dips while you relearn.",
        growth: 2,
        risk: 2,
        apply: ({ s }) => {
          tiltCeilings(s, { handle: 6, finishing: 4 }, { shooting: 3 });
          sk(s, "handle", 4);
          sk(s, "finishing", 3);
          drop(s, "shooting", 2);
          tr(s, "discipline", 3);
          s.plan.primary = "finishing";
          s.plan.secondary = "playmaking";
          return "Games are ugly for months. By spring the weak hand is just a hand.";
        },
      },
      {
        id: "mix",
        label: "Mix it in sometimes",
        preview: "Small handle bump. The ceiling barely moves.",
        growth: 1,
        risk: 0,
        apply: ({ s }) => (sk(s, "handle", 1), "You dabble. The strong hand still runs the show."),
      },
    ],
  },
  {
    id: "fork-midrange-kill",
    ages: [16, 24],
    cooldown: 0,
    once: true,
    weight: (s) => (onTeam(s) ? 1.3 : 0),
    title: "Kill the midrange",
    body: "The analytics sheet says your long twos are empty. A coach wants only threes and paint, or you can keep the pull-up that got you here.",
    choices: [
      {
        id: "modern",
        label: "Threes and paint only",
        preview: "Shooting and finishing ceilings rise. Midrange touch and some free-throw rhythm fall.",
        growth: 2,
        risk: 2,
        apply: ({ s }) => {
          tiltCeilings(s, { shooting: 4, finishing: 3, offBall: 2 }, { freeThrows: 2, decisions: 1 });
          sk(s, "shooting", 3);
          sk(s, "finishing", 3);
          drop(s, "freeThrows", 1);
          s.plan.primary = s.placement.node === "nba" ? "nba-three" : "shooting";
          s.plan.secondary = s.placement.node === "nba" ? "nba-on-ball" : "finishing";
          return "You delete the midrange. Spacing nights look cleaner. Contested pull-ups feel wrong.";
        },
      },
      {
        id: "keep",
        label: "Keep the pull-up",
        preview: "Handle and midgame scoring stay. Spacing sheet hates you.",
        growth: 1,
        risk: 2,
        apply: ({ s }) => {
          tiltCeilings(s, { handle: 3, finishing: 2, decisions: 2 }, { shooting: 3 });
          sk(s, "handle", 2);
          sk(s, "decisions", 2);
          drop(s, "shooting", 1);
          tr(s, "confidence", 2);
          return "You keep the footwork. Some coaches call it craft. Others call it stubborn.";
        },
      },
    ],
  },
  {
    id: "fork-green-light",
    ages: [17, 28],
    cooldown: 0,
    once: true,
    weight: (s) => (onTeam(s) && ["rotation", "starter", "star"].includes(s.placement.role) ? 1.5 : 0),
    title: "Green light or system",
    body: "The coach offers a real green light on offense, if you stop calling for help defense switches you like.",
    choices: [
      {
        id: "green",
        label: "Take the green light",
        preview: "Creation ceilings rise. Team defense and passing ceilings fall.",
        growth: 2,
        risk: 2,
        apply: ({ s }) => {
          tiltCeilings(s, { shooting: 3, handle: 4, finishing: 3 }, { perimeterD: 4, passing: 3 });
          sk(s, "handle", 3);
          sk(s, "shooting", 2);
          drop(s, "perimeterD", 3);
          drop(s, "passing", 2);
          if (!s.flags.style) {
            s.flags.style = "scorer";
            s.flags.styleAt = s.ageMonths;
          }
          s.plan.primary = s.placement.node === "nba" ? "nba-on-ball" : "playmaking";
          return "You hunt. Help defense becomes someone else's job.";
        },
      },
      {
        id: "system",
        label: "Stay in the system",
        preview: "Passing, IQ, and defense ceilings rise. Usage falls.",
        growth: 2,
        risk: 1,
        apply: ({ s }) => {
          tiltCeilings(s, { passing: 3, iq: 3, perimeterD: 3, decisions: 2 }, { handle: 3, shooting: 2 });
          sk(s, "passing", 2);
          sk(s, "iq", 2);
          sk(s, "perimeterD", 2);
          drop(s, "handle", 1);
          if (!s.flags.style) {
            s.flags.style = "connector";
            s.flags.styleAt = s.ageMonths;
          }
          s.plan.primary = "film-iq";
          return "You fit. Highlight reels skip you. Wins do not.";
        },
      },
    ],
  },
  {
    id: "fork-closer",
    ages: [18, 30],
    cooldown: 0,
    once: true,
    weight: (s) => (isPro(s) && ["starter", "star"].includes(s.placement.role) ? 1.6 : 0),
    title: "Who takes the last shot",
    body: "Late clock. The coach asks if you want it every time, or if you want to be the one who finds the open man.",
    choices: [
      {
        id: "me",
        label: "I want it",
        preview: "Shooting, composure under fire. Passing ceiling falls. Misses get loud.",
        growth: 2,
        risk: 3,
        apply: ({ s }) => {
          tiltCeilings(s, { shooting: 4, freeThrows: 3, finishing: 2 }, { passing: 4 });
          sk(s, "shooting", 3);
          sk(s, "freeThrows", 2);
          drop(s, "passing", 3);
          tr(s, "confidence", 4);
          tr(s, "composure", 2);
          s.flags.style = "scorer";
          s.flags.styleAt = s.ageMonths;
          return "The ball finds you at :08. Teammates clear out whether they like it or not.";
        },
      },
      {
        id: "find",
        label: "I find him",
        preview: "Passing and decisions ceilings rise. You stop being the first look.",
        growth: 2,
        risk: 1,
        apply: ({ s }) => {
          tiltCeilings(s, { passing: 4, decisions: 4, iq: 2 }, { shooting: 3 });
          sk(s, "passing", 3);
          sk(s, "decisions", 3);
          drop(s, "shooting", 2);
          tr(s, "composure", 3);
          s.flags.style = "connector";
          s.flags.styleAt = s.ageMonths;
          return "You hit the open man. The papers credit the make, not the pass.";
        },
      },
    ],
  },
  {
    id: "fork-stopper",
    ages: [17, 28],
    cooldown: 0,
    once: true,
    weight: (s) => (onTeam(s) ? 1.3 : 0),
    title: "Primary stopper",
    body: "Someone has to take the other team's best wing every night. It empties your legs for offense.",
    choices: [
      {
        id: "take",
        label: "I will take him",
        preview: "Defense ceilings rise hard. Shooting and stamina take the tax.",
        growth: 2,
        risk: 2,
        apply: ({ s }) => {
          tiltCeilings(s, { perimeterD: 6, iq: 2 }, { shooting: 4, finishing: 2 });
          sk(s, "perimeterD", 5);
          drop(s, "shooting", 2);
          ath(s, "lateral", 2);
          ath(s, "stamina", -2);
          energy(s, -6);
          s.flags.style = "defender";
          s.flags.styleAt = s.ageMonths;
          s.plan.primary = "defense";
          return "You check the star. Your own shot comes late and tired.";
        },
      },
      {
        id: "pass",
        label: "Let someone else",
        preview: "You keep offensive legs. Defense ceiling stalls.",
        growth: 1,
        risk: 1,
        apply: ({ s }) => {
          tiltCeilings(s, { shooting: 2, finishing: 1 }, { perimeterD: 3 });
          sk(s, "shooting", 1);
          drop(s, "perimeterD", 1);
          tr(s, "coachability", -2);
          return "Someone else takes the assignment. You score more. The coach remembers.";
        },
      },
    ],
  },
  {
    id: "fork-stretch-big",
    ages: [16, 24],
    cooldown: 0,
    once: true,
    weight: (s) => (s.body.heightCm >= 203 && onTeam(s) ? 1.7 : 0),
    title: "Stretch or dunk",
    body: "The staff wants you spaced at the three or crashing as a rim runner. Centers do not get both on this roster.",
    choices: [
      {
        id: "stretch",
        label: "Space the floor",
        preview: "Shooting ceiling rises. Rim protection and offensive rebounding fall.",
        growth: 2,
        risk: 2,
        apply: ({ s }) => {
          tiltCeilings(s, { shooting: 6, freeThrows: 3, offBall: 3 }, { interiorD: 5, rebounding: 4, finishing: 2 });
          sk(s, "shooting", 5);
          drop(s, "interiorD", 3);
          drop(s, "rebounding", 2);
          s.flags.listedAs = "stretch big";
          s.plan.primary = s.placement.node === "nba" ? "nba-three" : "shooting";
          return "You live on the arc. Paint help is late and soft.";
        },
      },
      {
        id: "rim",
        label: "Own the rim",
        preview: "Finishing, rebounding, interior ceilings rise. The three dies.",
        growth: 2,
        risk: 2,
        apply: ({ s }) => {
          tiltCeilings(s, { finishing: 5, rebounding: 5, interiorD: 5 }, { shooting: 7 });
          sk(s, "finishing", 4);
          sk(s, "rebounding", 4);
          sk(s, "interiorD", 4);
          drop(s, "shooting", 4);
          ath(s, "vertical", 2);
          s.flags.listedAs = "rim runner";
          s.plan.primary = "rebounding-post";
          return "You dunk and block. Spot-up threes are someone else's job.";
        },
      },
    ],
  },
  {
    id: "fork-floater-or-contact",
    ages: [15, 22],
    cooldown: 0,
    once: true,
    weight: (s) => (onTeam(s) ? 1.2 : 0.4),
    title: "Floater or through contact",
    body: "Bigs are waiting in the paint. You can master the soft touch or learn to finish through chests.",
    choices: [
      {
        id: "soft",
        label: "Master the floater",
        preview: "Finishing and touch rise. Strength and free-throw pressure fall a bit.",
        growth: 2,
        risk: 1,
        apply: ({ s }) => {
          tiltCeilings(s, { finishing: 5, freeThrows: 1 }, {});
          sk(s, "finishing", 4);
          ath(s, "coordination", 2);
          ath(s, "strength", -1);
          return "You drop it over length. Contact finishes stay rare.";
        },
      },
      {
        id: "through",
        label: "Play through contact",
        preview: "Finishing and strength rise. You take more punishment.",
        growth: 2,
        risk: 2,
        apply: ({ s }) => {
          tiltCeilings(s, { finishing: 4, freeThrows: 3 }, { shooting: 2 });
          sk(s, "finishing", 3);
          sk(s, "freeThrows", 2);
          ath(s, "strength", 3);
          ath(s, "durability", -2);
          health(s, -3);
          return "You initiate contact. Wrists and ribs keep the receipt.";
        },
      },
    ],
  },
  {
    id: "fork-catch-shoot-deal",
    ages: [18, 27],
    cooldown: 0,
    once: true,
    weight: (s) => (isPro(s) && s.skills.shooting >= 55 ? 1.4 : 0),
    title: "A catch-and-shoot deal",
    body: "A contender wants you as a spacer who never puts it on the floor. More money. A narrower game.",
    choices: [
      {
        id: "space",
        label: "Take the spacer role",
        preview: "Shooting and off-ball ceilings rise. Handle and creation fall hard.",
        growth: 2,
        risk: 2,
        apply: ({ s }) => {
          tiltCeilings(s, { shooting: 5, offBall: 5, freeThrows: 2 }, { handle: 6, finishing: 3, decisions: 2 });
          sk(s, "shooting", 4);
          sk(s, "offBall", 4);
          drop(s, "handle", 4);
          drop(s, "finishing", 2);
          s.flags.listedAs = "spacer";
          if (!s.flags.style) {
            s.flags.style = "scorer";
            s.flags.styleAt = s.ageMonths;
          }
          s.plan.primary = s.placement.node === "nba" ? "nba-three" : "shooting";
          return "You relocate and shoot. Putting it on the floor feels like a foul.";
        },
      },
      {
        id: "keep",
        label: "Keep the full bag",
        preview: "You stay versatile. The bigger check walks.",
        growth: 1,
        risk: 1,
        apply: ({ s }) => {
          tiltCeilings(s, { handle: 2, decisions: 2 }, { shooting: 1 });
          sk(s, "handle", 1);
          tr(s, "confidence", 2);
          return "You decline. Your game stays wide and the market stays cooler.";
        },
      },
    ],
  },
  {
    id: "fork-pass-first-pg",
    ages: [15, 22],
    cooldown: 0,
    once: true,
    weight: (s) => (onTeam(s) && s.body.heightCm < 198 ? 1.4 : 0.3),
    title: "Pass-first or score-first",
    body: "Your point coach says the next leap is either finding everyone early or breaking the defense yourself.",
    choices: [
      {
        id: "pass",
        label: "Pass-first",
        preview: "Passing and IQ ceilings rise. Scoring usage and confidence take a hit.",
        growth: 2,
        risk: 2,
        apply: ({ s }) => {
          tiltCeilings(s, { passing: 6, iq: 4, decisions: 4 }, { shooting: 4, finishing: 3 });
          sk(s, "passing", 4);
          sk(s, "iq", 3);
          sk(s, "decisions", 3);
          drop(s, "shooting", 2);
          drop(s, "finishing", 2);
          s.flags.style = "connector";
          s.flags.styleAt = s.ageMonths;
          s.plan.primary = "playmaking";
          s.plan.secondary = "film-iq";
          return "You see the second option. Defenses sag knowing you will give it up.";
        },
      },
      {
        id: "score",
        label: "Score-first",
        preview: "Shooting and handle ceilings rise. Pure playmaking falls.",
        growth: 2,
        risk: 2,
        apply: ({ s }) => {
          tiltCeilings(s, { shooting: 5, handle: 4, finishing: 3 }, { passing: 5, iq: 2 });
          sk(s, "shooting", 3);
          sk(s, "handle", 3);
          drop(s, "passing", 3);
          s.flags.style = "scorer";
          s.flags.styleAt = s.ageMonths;
          s.plan.primary = "shooting";
          s.plan.secondary = "playmaking";
          return "You break them first. Teammates wait for leftovers.";
        },
      },
    ],
  },
  {
    id: "fork-help-or-stay",
    ages: [16, 26],
    cooldown: 18,
    weight: (s) => (onTeam(s) ? 1.1 : 0),
    title: "Help or stay home",
    body: "Film shows you gambling into the paint for strips. The coach wants you glued to your man.",
    choices: [
      {
        id: "gamble",
        label: "Keep gambling",
        preview: "Steals-minded defense rises. Team scheme and discipline fall.",
        growth: 2,
        risk: 2,
        apply: ({ s }) => {
          tiltCeilings(s, { perimeterD: 3 }, { iq: 3, decisions: 2 });
          sk(s, "perimeterD", 2);
          ath(s, "acceleration", 1);
          drop(s, "iq", 1);
          tr(s, "discipline", -3);
          tr(s, "confidence", 2);
          return "You jump lanes. Help rotations behind you stay messy.";
        },
      },
      {
        id: "glue",
        label: "Stay glued",
        preview: "IQ and discipline rise. Highlight steals dry up.",
        growth: 1,
        risk: 0,
        apply: ({ s }) => {
          tiltCeilings(s, { iq: 3, decisions: 2, perimeterD: 1 }, {});
          sk(s, "iq", 2);
          sk(s, "decisions", 2);
          tr(s, "discipline", 3);
          s.plan.secondary = "film-iq";
          return "You stay attached. The strip totals look quieter and the scheme holds.";
        },
      },
    ],
  },
  {
    id: "fork-load-manage-skill",
    ages: [22, 32],
    cooldown: 0,
    once: true,
    weight: (s) => (isPro(s) && s.placement.role === "star" ? 1.3 : 0),
    title: "Minutes or craft",
    body: "The staff will sit you on back-to-backs to save your legs, or play you heavy so the craft keeps sharpening.",
    choices: [
      {
        id: "sit",
        label: "Sit the back-to-backs",
        preview: "Health and durability. Skill growth slows this year.",
        growth: 0,
        risk: 1,
        apply: ({ s }) => {
          ath(s, "durability", 3);
          health(s, 6);
          energy(s, 8);
          tiltCeilings(s, {}, { handle: 1, shooting: 1 });
          tr(s, "discipline", 2);
          return "You watch some nights. April legs are there. February rust is too.";
        },
      },
      {
        id: "play",
        label: "Play through them",
        preview: "Skills keep climbing. Durability takes the hit.",
        growth: 2,
        risk: 3,
        apply: ({ s }) => {
          tiltCeilings(s, { shooting: 2, decisions: 2, iq: 1 }, {});
          sk(s, "shooting", 2);
          sk(s, "decisions", 2);
          ath(s, "durability", -3);
          health(s, -4);
          energy(s, -8);
          return "You pile up minutes and touches. The body files the complaint later.";
        },
      },
    ],
  },
  {
    id: "fork-style-double-down",
    ages: [19, 29],
    cooldown: 0,
    once: true,
    weight: (s) => (styled(s) && typeof s.flags.styleAt === "number" && s.ageMonths - s.flags.styleAt >= 10 ? 1.8 : 0),
    title: "Double down on the label",
    body: (s) => `Agents and coaches still sell you as a ${s.flags.style}. You can deepen that lane until it is all you are, or claw back the parts you dropped.`,
    choices: [
      {
        id: "deep",
        label: "Go all the way",
        preview: "Your style ceilings jump again. The neglected skills sink further.",
        growth: 2,
        risk: 3,
        apply: ({ s }) => {
          if (s.flags.style === "scorer") {
            tiltCeilings(s, { shooting: 4, finishing: 3, handle: 2 }, { passing: 4, perimeterD: 4 });
            sk(s, "shooting", 3);
            drop(s, "passing", 2);
            drop(s, "perimeterD", 2);
            s.plan.primary = s.placement.node === "nba" ? "nba-on-ball" : "shooting";
          } else if (s.flags.style === "connector") {
            tiltCeilings(s, { passing: 4, decisions: 3, handle: 2 }, { shooting: 4, finishing: 3 });
            sk(s, "passing", 3);
            drop(s, "shooting", 2);
            s.plan.primary = "playmaking";
          } else {
            tiltCeilings(s, { perimeterD: 4, interiorD: 3, rebounding: 2 }, { shooting: 4, handle: 3 });
            sk(s, "perimeterD", 3);
            drop(s, "shooting", 2);
            s.plan.primary = "defense";
          }
          tr(s, "confidence", 3);
          return `You lean harder into ${s.flags.style}. The scouting report gets shorter and sharper.`;
        },
      },
      {
        id: "round",
        label: "Round out the holes",
        preview: "Neglected skills climb. Your label softens and practice bias weakens.",
        growth: 1,
        risk: 1,
        apply: ({ s }) => {
          if (s.flags.style === "scorer") {
            tiltCeilings(s, { passing: 3, perimeterD: 3 }, { shooting: 2 });
            sk(s, "passing", 2);
            sk(s, "perimeterD", 2);
          } else if (s.flags.style === "connector") {
            tiltCeilings(s, { shooting: 3, finishing: 2 }, { passing: 2 });
            sk(s, "shooting", 2);
            sk(s, "finishing", 2);
          } else {
            tiltCeilings(s, { shooting: 3, handle: 2 }, { perimeterD: 2 });
            sk(s, "shooting", 2);
            sk(s, "handle", 2);
          }
          delete s.flags.style;
          delete s.flags.styleAt;
          tr(s, "coachability", 2);
          return "You sand the edges. Sheets stop knowing exactly what to call you.";
        },
      },
    ],
  },
  {
    id: "fork-early-idol",
    ages: [8, 12],
    cooldown: 0,
    once: true,
    weight: () => 1.6,
    title: "Who you copy every day",
    body: "Kids on the court argue over who is better. You pick one lane to steal from for a year.",
    choices: [
      {
        id: "bucket",
        label: "The scorer",
        preview: "Early shooting ceiling bump. Passing starts behind.",
        growth: 2,
        risk: 1,
        apply: ({ s }) => {
          tiltCeilings(s, { shooting: 4, finishing: 2 }, { passing: 3 });
          sk(s, "shooting", 3);
          s.flags.earlyStyle = "scorer";
          return "You chase makes. Assists feel like giving away your turn.";
        },
      },
      {
        id: "dish",
        label: "The passer",
        preview: "Early passing ceiling bump. Scoring starts behind.",
        growth: 2,
        risk: 1,
        apply: ({ s }) => {
          tiltCeilings(s, { passing: 4, handle: 2 }, { shooting: 3 });
          sk(s, "passing", 3);
          s.flags.earlyStyle = "connector";
          return "You look for the extra pass. Empty possessions bother you more than empty boxes.";
        },
      },
      {
        id: "lock",
        label: "The stopper",
        preview: "Early defense ceiling bump. Offense starts behind.",
        growth: 2,
        risk: 1,
        apply: ({ s }) => {
          tiltCeilings(s, { perimeterD: 4, rebounding: 2 }, { shooting: 3 });
          sk(s, "perimeterD", 3);
          s.flags.earlyStyle = "defender";
          return "You stay in front. Scoring is what happens after you get a stop.";
        },
      },
    ],
  },
];
