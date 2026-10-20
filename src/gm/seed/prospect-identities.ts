import type {
  GmPlayer,
  GmPosition,
  GmRatings,
  ProspectArchetypeId,
} from "@/gm/types";
import { pick, randInt, clamp } from "@/gm/engine/rng";

export type CodenameDef = {
  codename: string;
  archetype: ProspectArchetypeId;
  /** Style comps - never legend cosplay as identity. */
  comps: string[];
  positions: GmPosition[];
  flavor: string;
  /** Only top-of-draft talent may wear these. */
  eliteOnly?: boolean;
};

/**
 * Style-first war-room tags. Most of the class gets these.
 * Elite-only tags are reserved for true top-of-board talent.
 */
export const STYLE_CODENAMES: CodenameDef[] = [
  {
    codename: "3-and-D Phantom",
    archetype: "three_and_d",
    comps: ["Corner specialist", "low-usage wing"],
    positions: ["SF", "SG", "PF"],
    flavor: "Spacing and contests; never needs the ball to matter.",
  },
  {
    codename: "Board Magician",
    archetype: "glue_guy",
    comps: ["Glass cleaner", "second-chance engine"],
    positions: ["PF", "C"],
    flavor: "Rebound magnet with relentless second-effort DNA.",
  },
  {
    codename: "Point God Jr.",
    archetype: "floor_general",
    comps: ["Halfcourt tempo", "pocket passer"],
    positions: ["PG"],
    flavor: "Slows the game down and finds the next pass early.",
  },
  {
    codename: "Splash Specialist",
    archetype: "splash",
    comps: ["Catch-and-shoot", "off-screen sniper"],
    positions: ["SG", "SF", "PG"],
    flavor: "Quick trigger and gravity beyond the arc.",
  },
  {
    codename: "Glue Stick",
    archetype: "glue_guy",
    comps: ["Connector", "dirty-work wing"],
    positions: ["PF", "SF", "PG"],
    flavor: "Does the work box scores miss: cuts, helps, hockey assists.",
  },
  {
    codename: "Combo Voltage",
    archetype: "combo_guard",
    comps: ["Size at the point", "attack creator"],
    positions: ["SG", "PG"],
    flavor: "Handle + burst that collapses help before it arrives.",
  },
  {
    codename: "Rim Runner",
    archetype: "paint_beast",
    comps: ["Lob threat", "roll finisher"],
    positions: ["C", "PF"],
    flavor: "Vertical spacer who lives above the rim on the roll.",
  },
  {
    codename: "Stretch Four",
    archetype: "stretch_big",
    comps: ["Floor spacer", "pick-and-pop"],
    positions: ["PF", "C"],
    flavor: "Pulls bigs out and punishes drop coverage.",
  },
  {
    codename: "Switch Wing",
    archetype: "two_way_wing",
    comps: ["Positional defender", "versatile wing"],
    positions: ["SF", "SG", "PF"],
    flavor: "Can bump up or down on switches without panicking.",
  },
  {
    codename: "Pocket Passer",
    archetype: "pass_first",
    comps: ["PnR delivery", "skip-pass vision"],
    positions: ["PG", "SG"],
    flavor: "Sees two ahead; scoring is secondary.",
  },
  {
    codename: "Paint Plug",
    archetype: "rim_protector",
    comps: ["Drop anchor", "verticality"],
    positions: ["C"],
    flavor: "Owns the restricted area and erases drives.",
  },
  {
    codename: "Slasher Prototype",
    archetype: "athletic_freak",
    comps: ["Straight-line force", "transition finisher"],
    positions: ["SG", "SF", "PF"],
    flavor: "First step and hangtime that break help geometry.",
  },
  {
    codename: "Microwave Bench",
    archetype: "splash",
    comps: ["Instant offense", "bench spark"],
    positions: ["SG", "PG"],
    flavor: "Buckets in bunches off the pine.",
  },
  {
    codename: "Iso Craftsman",
    archetype: "iso_scorer",
    comps: ["Midrange footwork", "late-clock scorer"],
    positions: ["SG", "SF", "PF"],
    flavor: "Creates his own shot when the set dies.",
  },
  {
    codename: "Help-Side Hawk",
    archetype: "two_way_wing",
    comps: ["Passing-lane thief", "weakside helper"],
    positions: ["SF", "SG", "PF"],
    flavor: "Steals possessions without gambling every trip.",
  },
  {
    codename: "High-Low Hub",
    archetype: "pass_first",
    comps: ["Elbow facilitator", "big who passes"],
    positions: ["C", "PF"],
    flavor: "Treats the high post like a point guard.",
  },
  {
    codename: "Corner Cop",
    archetype: "three_and_d",
    comps: ["Closeout specialist", "spot-up wing"],
    positions: ["SF", "SG"],
    flavor: "Shoots open corners and survives on defense.",
  },
  {
    codename: "Pace Breaker",
    archetype: "athletic_freak",
    comps: ["Transition engine", "push-ahead guard"],
    positions: ["PG", "SG"],
    flavor: "Turns stops into numbers before the set defense loads.",
  },
  {
    codename: "Post Technician",
    archetype: "paint_beast",
    comps: ["Footwork first", "seal-and-finish"],
    positions: ["PF", "C"],
    flavor: "Angles and counters over raw bully ball.",
  },
  {
    codename: "Floor General Lite",
    archetype: "floor_general",
    comps: ["Secondary creator", "bench organizer"],
    positions: ["PG", "SG"],
    flavor: "Keeps the offense on schedule without star usage.",
  },
  {
    codename: "Mobile Five",
    archetype: "rim_protector",
    comps: ["Switch big", "short-roll threat"],
    positions: ["C", "PF"],
    flavor: "Can step out on switches and still protect the rim.",
  },
  {
    codename: "Off-Ball Ghost",
    archetype: "splash",
    comps: ["Movement shooter", "relocation"],
    positions: ["SG", "SF"],
    flavor: "Warps coverage before the catch with constant motion.",
  },
  {
    codename: "Connector Forward",
    archetype: "glue_guy",
    comps: ["Versatile four", "extra passer"],
    positions: ["PF", "SF"],
    flavor: "Links actions with screens, slips, and simple reads.",
  },
  {
    codename: "On-Ball Pest",
    archetype: "two_way_wing",
    comps: ["Primary defender", "pressure guard"],
    positions: ["PG", "SG", "SF"],
    flavor: "Ruins the opponent’s first option for stretches.",
  },
];

/** Rare tags - only for true top-of-board pathways. */
export const ELITE_CODENAMES: CodenameDef[] = [
  {
    codename: "Generational Big",
    archetype: "stretch_big",
    comps: ["Size + skill unicorn", "scheme-breaker"],
    positions: ["C", "PF"],
    flavor: "Length and skill that rewrite what a five can do.",
    eliteOnly: true,
  },
  {
    codename: "Primary Creator",
    archetype: "iso_scorer",
    comps: ["On-ball engine", "usage monster"],
    positions: ["PG", "SG", "SF"],
    flavor: "The offense can live in his hands on demand.",
    eliteOnly: true,
  },
  {
    codename: "Two-Way Ace",
    archetype: "two_way_wing",
    comps: ["Star wing", "both ends"],
    positions: ["SF", "SG"],
    flavor: "Creates at a high level and still guards up.",
    eliteOnly: true,
  },
  {
    codename: "Franchise Point",
    archetype: "floor_general",
    comps: ["Lead guard", "table-setter"],
    positions: ["PG"],
    flavor: "Organizes winners and scales with any co-star.",
    eliteOnly: true,
  },
  {
    codename: "Defensive Anchor",
    archetype: "rim_protector",
    comps: ["Team defense hub", "eraser"],
    positions: ["C", "PF"],
    flavor: "Raises the floor of every lineup he closes.",
    eliteOnly: true,
  },
  {
    codename: "Athletic Unicorn",
    archetype: "athletic_freak",
    comps: ["Positionless freak", "transition terror"],
    positions: ["PF", "SF", "C"],
    flavor: "Tools that don’t fit a single box on the board.",
    eliteOnly: true,
  },
];

const ARCHETYPE_LABELS: Record<ProspectArchetypeId, string> = {
  paint_beast: "Paint Finisher",
  rim_protector: "Rim Protector",
  stretch_big: "Stretch Big",
  floor_general: "Floor General",
  combo_guard: "Combo Guard",
  splash: "Shooting Specialist",
  iso_scorer: "Shot Creator",
  two_way_wing: "Two-Way Wing",
  three_and_d: "3-and-D Wing",
  athletic_freak: "Athletic Freak",
  pass_first: "Pass-First Guard",
  glue_guy: "Connector",
};

export function archetypeLabel(id: ProspectArchetypeId): string {
  return ARCHETYPE_LABELS[id];
}

export function detectArchetype(
  ratings: GmRatings,
  position: GmPosition
): ProspectArchetypeId {
  const { shooting, finishing, playmaking, rebounding, defense, offense, impact } =
    ratings;
  const big = position === "C" || position === "PF";
  const guard = position === "PG" || position === "SG";

  if (big && finishing >= 70 && shooting < 55) return "paint_beast";
  if (big && defense >= offense && rebounding >= 60) return "rim_protector";
  if (big && shooting >= 65) return "stretch_big";
  if (guard && playmaking >= 70 && shooting < 60) return "pass_first";
  if (position === "PG" && playmaking >= 65) return "floor_general";
  if (shooting >= 78 && playmaking < 60) return "splash";
  if (defense >= 65 && shooting >= 60 && impact < 2.5) return "three_and_d";
  if (defense >= 68 && (position === "SF" || position === "SG"))
    return "two_way_wing";
  if (finishing >= 75 && shooting < 55 && !big) return "athletic_freak";
  if (big && finishing >= 70 && impact >= 3) return "athletic_freak";
  if (offense >= defense + 1.2 && shooting >= 60) return "iso_scorer";
  if (guard && playmaking >= 55 && shooting >= 55) return "combo_guard";
  if (defense >= 60 || rebounding >= 70) return "glue_guy";
  return guard ? "combo_guard" : big ? "stretch_big" : "two_way_wing";
}

const FIRST = [
  "Jamal", "Tariq", "Nico", "Ellis", "Kai", "Andre", "Malik", "Roman",
  "Mateo", "Isaiah", "Caleb", "Devin", "Omar", "Hugo", "Seth", "Miles",
  "Jalen", "Amari", "Keon", "Darius", "Nasir", "Theo", "Leon", "Bryce",
];
const LAST = [
  "Okonkwo", "Reyes", "Harper", "Vance", "Crowe", "Okoye", "Silva",
  "Anders", "Mercer", "Hale", "Brooks", "Nguyen", "Patel", "Grant",
  "Bishop", "Frost", "Wilder", "Nash", "Pike", "Shaw", "Dunn", "Blair",
];

export function generateTrueName(rng: () => number): string {
  return `${pick(rng, FIRST)} ${pick(rng, LAST)}`;
}

export type ProspectTier =
  | "superstar"
  | "allstar"
  | "starter"
  | "rotation"
  | "fringe"
  | "depth";

/** Realistic draft pyramid - few true stars. */
export function rollProspectTier(count: number, rng: () => number): ProspectTier[] {
  const tiers: ProspectTier[] = [];
  // Target mix for a ~60-player pool (2 rounds + extras)
  const quotas: { tier: ProspectTier; n: number }[] = [
    { tier: "superstar", n: count >= 50 ? (rng() < 0.55 ? 2 : 1) : 1 },
    { tier: "allstar", n: Math.max(2, Math.round(count * 0.07)) },
    { tier: "starter", n: Math.max(6, Math.round(count * 0.15)) },
    { tier: "rotation", n: Math.max(12, Math.round(count * 0.28)) },
    { tier: "fringe", n: Math.max(12, Math.round(count * 0.28)) },
    { tier: "depth", n: 0 },
  ];
  for (const q of quotas) {
    for (let i = 0; i < q.n && tiers.length < count; i++) tiers.push(q.tier);
  }
  while (tiers.length < count) tiers.push("depth");
  // Shuffle
  for (let i = tiers.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [tiers[i], tiers[j]] = [tiers[j]!, tiers[i]!];
  }
  return tiers;
}

export function ratingsForTier(
  tier: ProspectTier,
  position: GmPosition,
  rng: () => number
): GmRatings {
  // Skill bands are draft-night raw, not finished NBA overalls. Superstars
  // still clear the pack; depth stays in the 60s so long runs do not flood
  // the league with 78+ rookies.
  const base = {
    superstar: { impact: [3.8, 6.2], pot: [8.5, 10], skill: [58, 80] },
    allstar: { impact: [2.0, 3.8], pot: [7.0, 8.7], skill: [52, 74] },
    starter: { impact: [0.6, 2.2], pot: [5.0, 7.1], skill: [46, 68] },
    rotation: { impact: [-0.5, 1.1], pot: [3.0, 5.4], skill: [36, 60] },
    fringe: { impact: [-1.8, 0.35], pot: [1.4, 3.8], skill: [28, 52] },
    depth: { impact: [-2.8, -0.2], pot: [0.4, 2.8], skill: [20, 46] },
  }[tier];

  const impact =
    Math.round((base.impact[0]! + rng() * (base.impact[1]! - base.impact[0]!)) * 100) /
    100;
  const skill = () => randInt(rng, base.skill[0]!, base.skill[1]!);
  const big = position === "C" || position === "PF";
  const guard = position === "PG" || position === "SG";

  return {
    impact,
    offense: impact * 0.7 + (rng() - 0.5) * 0.8,
    defense: impact * 0.55 + (rng() - 0.5) * 0.8,
    shooting: clamp(skill() + (guard ? 5 : big ? -8 : 0), 18, 95),
    finishing: clamp(skill() + (big ? 8 : 0), 20, 95),
    playmaking: clamp(skill() + (guard ? 10 : big ? -10 : 0), 15, 95),
    rebounding: clamp(skill() + (big ? 12 : -5), 15, 95),
    durability: randInt(rng, 55, 95),
    potential: clamp(
      base.pot[0]! + rng() * (base.pot[1]! - base.pot[0]!),
      0,
      10
    ),
  };
}

export function assignProspectIdentity(
  player: GmPlayer,
  rng: () => number,
  usedCodenames: Set<string>,
  opts?: { eliteEligible?: boolean }
): GmPlayer {
  const eliteEligible =
    opts?.eliteEligible ??
    (player.ratings.impact >= 4.0 && player.ratings.potential >= 7.5);
  const archetype = detectArchetype(player.ratings, player.position);

  const elitePool = ELITE_CODENAMES.filter(
    (c) =>
      !usedCodenames.has(c.codename) &&
      (c.archetype === archetype || c.positions.includes(player.position))
  );
  const stylePool = STYLE_CODENAMES.filter(
    (c) =>
      !usedCodenames.has(c.codename) &&
      (c.archetype === archetype || c.positions.includes(player.position))
  );
  const styleFallback = STYLE_CODENAMES.filter((c) => !usedCodenames.has(c.codename));

  let def: CodenameDef | null = null;
  if (eliteEligible && elitePool.length) {
    def = pick(rng, elitePool);
  } else {
    const pool = stylePool.length ? stylePool : styleFallback;
    if (pool.length) def = pick(rng, pool);
  }

  if (!def) {
    const base = pick(rng, STYLE_CODENAMES);
    let n = 2;
    let codename = `${base.codename} ${n}`;
    while (usedCodenames.has(codename)) {
      n += 1;
      codename = `${base.codename} ${n}`;
    }
    def = { ...base, codename };
  }
  usedCodenames.add(def.codename);

  return {
    ...player,
    name: generateTrueName(rng),
    codename: def.codename,
    identityRevealed: false,
    position: def.positions.includes(player.position)
      ? player.position
      : pick(rng, def.positions),
  };
}

export function codenameDef(codename: string | undefined): CodenameDef | undefined {
  if (!codename) return undefined;
  return (
    STYLE_CODENAMES.find((c) => c.codename === codename) ||
    ELITE_CODENAMES.find((c) => c.codename === codename)
  );
}

const POSITIONS: GmPosition[] = ["PG", "SG", "SF", "PF", "C"];
const HEIGHT: Record<GmPosition, [number, number]> = {
  PG: [72, 76],
  SG: [74, 79],
  SF: [77, 81],
  PF: [79, 84],
  C: [81, 87],
};

/**
 * Draft-night ages 18–24 by slot (NBA-ish).
 * Lottery leans 19–20 (one-and-dones / young internationals). Late first and
 * seconds pull more juniors/seniors. Age 24 is rare.
 * Index 0 = 18 … index 6 = 24.
 */
const AGE_BANDS: Array<{ through: number; weights: number[] }> = [
  { through: 5, weights: [0.14, 0.48, 0.28, 0.08, 0.02, 0, 0] },
  { through: 14, weights: [0.08, 0.34, 0.36, 0.16, 0.06, 0, 0] },
  { through: 30, weights: [0.02, 0.14, 0.32, 0.32, 0.16, 0.04, 0] },
  { through: 45, weights: [0, 0.06, 0.2, 0.3, 0.28, 0.14, 0.02] },
  { through: 60, weights: [0, 0.03, 0.12, 0.26, 0.32, 0.22, 0.05] },
];

function ageForSlot(slot: number, rng: () => number): number {
  const band = AGE_BANDS.find((row) => slot <= row.through) ?? AGE_BANDS[AGE_BANDS.length - 1]!;
  let roll = rng();
  for (let i = 0; i < band.weights.length; i++) {
    roll -= band.weights[i]!;
    if (roll <= 0) return 18 + i;
  }
  return 21;
}

/**
 * Real-draft tradeoff: younger = higher ceiling + more bust variance;
 * older = more NBA-ready now, lower upside, safer outcome band.
 * Applied after the tier roll so board order still comes from talent tier.
 */
export function applyDraftAgeProfile(
  ratings: GmRatings,
  age: number,
  rng: () => number
): GmRatings {
  const jitter = () => (rng() - 0.5) * 0.15;
  let { impact, potential } = ratings;
  let skillTilt = 0;

  if (age <= 18) {
    // Prep-to-pro / young international: huge range.
    potential = potential + 1.15 + jitter();
    impact = impact * 0.82 + jitter() * 0.4;
    skillTilt = -6;
  } else if (age === 19) {
    potential = potential + 0.75 + jitter();
    impact = impact * 0.88 + jitter() * 0.3;
    skillTilt = -3;
  } else if (age === 20) {
    potential = potential + 0.35 + jitter();
    impact = impact * 0.95 + jitter() * 0.25;
    skillTilt = -1;
  } else if (age === 21) {
    potential = potential + jitter() * 0.5;
    impact = impact * (1 + jitter() * 0.08);
  } else if (age === 22) {
    // Junior / older soph: more polished, less rocket fuel.
    potential = potential - 0.55 + jitter();
    impact = impact * 1.08 + Math.abs(jitter()) * 0.2;
    skillTilt = 3;
  } else if (age === 23) {
    potential = potential - 1.05 + jitter();
    impact = impact * 1.14 + Math.abs(jitter()) * 0.25;
    skillTilt = 5;
  } else {
    // 24+: senior / older euro — floor raiser, not a jackpot ticket.
    potential = potential - 1.55 + jitter();
    impact = impact * 1.18 + Math.abs(jitter()) * 0.2;
    skillTilt = 7;
  }

  const bump = (value: number) => clamp(Math.round(value + skillTilt), 15, 95);

  return {
    ...ratings,
    impact: Math.round(clamp(impact, -3.5, 7.5) * 100) / 100,
    offense: Math.round((impact * 0.7 + (rng() - 0.5) * 0.6) * 100) / 100,
    defense: Math.round((impact * 0.55 + (rng() - 0.5) * 0.6) * 100) / 100,
    potential: Math.round(clamp(potential, 0.2, 10) * 10) / 10,
    shooting: bump(ratings.shooting),
    finishing: bump(ratings.finishing),
    playmaking: bump(ratings.playmaking),
    rebounding: bump(ratings.rebounding),
  };
}

const TIER_RANK: Record<ProspectTier, number> = {
  superstar: 0,
  allstar: 1,
  starter: 2,
  rotation: 3,
  fringe: 4,
  depth: 5,
};

/** Consensus board value for a tier (used as the public pre-draft number). */
function consensusForTier(tier: ProspectTier, rng: () => number): number {
  const base = {
    superstar: 1.6,
    allstar: 0.7,
    starter: 0.05,
    rotation: -0.55,
    fringe: -1.15,
    depth: -1.7,
  }[tier];
  return Math.round((base + (rng() - 0.5) * 0.35) * 100) / 100;
}

/** Build a full realistic sealed draft class. */
export function createDraftClass(options: {
  count?: number;
  seasonEndYear: number;
  scoutLevel: number;
  rng: () => number;
  seal: (
    player: GmPlayer,
    scoutLevel: number,
    boardIndex: number,
    rng: () => number
  ) => GmPlayer;
}): GmPlayer[] {
  const count = options.count ?? 60;
  const { rng, seasonEndYear, scoutLevel, seal } = options;
  const used = new Set<string>();
  const out: GmPlayer[] = [];

  // Pyramid first, then board chaos: stars can slide, and a sleeper can climb.
  const ranked = rollProspectTier(count, rng)
    .map((tier, index) => {
      let bump = 0;
      const roll = rng();
      // Risers.
      if (tier === "rotation" && roll < 0.1) bump = -2.2;
      else if (tier === "fringe" && roll < 0.06) bump = -2.4;
      else if (tier === "starter" && roll < 0.22) bump = -1.1;
      // Fallers — keeps pick 1 from being automatic and feeds late steals.
      else if (tier === "superstar" && roll < 0.42) bump = 1.1 + rng() * 1.4;
      else if (tier === "allstar" && roll < 0.28) bump = 1.4 + rng() * 1.8;
      else if (tier === "starter" && roll < 0.2) bump = 1.8 + rng() * 1.5;
      return {
        tier,
        index,
        order: TIER_RANK[tier] + bump + (rng() - 0.5) * 1.35,
      };
    })
    .sort((a, b) => a.order - b.order || a.index - b.index);

  for (let board = 0; board < count; board++) {
    const tier = ranked[board]!.tier;
    const slot = Math.min(
      60,
      Math.max(1, Math.round((board * 59) / Math.max(1, count - 1)) + 1)
    );
    const position = pick(rng, POSITIONS);
    let age = ageForSlot(slot, rng);
    const pipeRoll = rng();
    const pipeline: GmPlayer["pipeline"] =
      pipeRoll < 0.14 ? "international" : pipeRoll < 0.2 ? "gleague" : "ncaa";
    // Internationals skew younger (Wemby / Sarr path); NCAA seniors stay older.
    if (pipeline === "international" && age >= 21 && rng() < 0.55) {
      age = Math.max(18, age - 1);
    }
    if (pipeline === "ncaa" && age <= 19 && slot > 20 && rng() < 0.25) {
      age = Math.min(23, age + 1);
    }
    const ratings = applyDraftAgeProfile(
      ratingsForTier(tier, position, rng),
      age,
      rng
    );
    const consensus = consensusForTier(tier, rng);
    const minutes = clamp(
      Math.round(14 + Math.max(0, ratings.impact) * 3.2 + (tier === "superstar" ? 6 : 0)),
      8,
      34
    );
    const [hLo, hHi] = HEIGHT[position];
    let raw: GmPlayer = {
      id: `prospect-${seasonEndYear}-${board}-${Math.floor(rng() * 1e9).toString(36)}`,
      name: "Prospect",
      teamId: null,
      position,
      age,
      heightIn: randInt(rng, hLo!, hHi!),
      weightLbs: randInt(rng, position === "C" ? 220 : 185, position === "C" ? 280 : 245),
      ratings,
      consensus,
      scouted: {
        impact: null,
        offense: null,
        defense: null,
        uncertainty: 1,
      },
      contract: null,
      injury: null,
      morale: 80,
      personality: randInt(rng, -15, 25),
      minutesPreference: minutes,
      draftYear: seasonEndYear,
      identityRevealed: false,
      pipeline,
      college:
        pipeline === "international"
          ? pick(rng, ["EuroLeague", "NBL Australia", "Adriatic League", "Spain ACB"])
          : pipeline === "gleague"
            ? "G League Ignite"
            : undefined,
    };
    raw = assignProspectIdentity(raw, rng, used, {
      eliteEligible:
        tier === "superstar" ||
        tier === "allstar" ||
        slot <= 5 ||
        ratings.impact >= 3.4,
    });
    out.push(seal(raw, scoutLevel, board, rng));
  }
  return out;
}
