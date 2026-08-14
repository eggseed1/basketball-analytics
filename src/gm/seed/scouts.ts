import type { GmPosition } from "@/gm/types";
import { pick, randInt, clamp, createRng, uid } from "@/gm/engine/rng";

export type ScoutExpertise =
  | "guards"
  | "wings"
  | "bigs"
  | "defense"
  | "offense"
  | "international"
  | "general";

export interface GmScout {
  id: string;
  name: string;
  /** Years on the road / in rooms. */
  yearsExperience: number;
  expertise: ScoutExpertise;
  /** 1-5 eye for talent (drives fog). */
  eye: number;
  /** Soft salary cost for hiring UI. */
  salaryM: number;
  bio: string;
}

const EXPERTISE_LABEL: Record<ScoutExpertise, string> = {
  guards: "Guards",
  wings: "Wings",
  bigs: "Bigs",
  defense: "Defense",
  offense: "Offense",
  international: "International",
  general: "Generalist",
};

export function expertiseLabel(e: ScoutExpertise): string {
  return EXPERTISE_LABEL[e];
}

const FIRST = [
  "Dana", "Reese", "Morgan", "Casey", "Avery", "Quinn", "Jordan", "Cameron",
  "Drew", "Harper", "Skyler", "Riley", "Parker", "Emerson", "Hayden",
];
const LAST = [
  "Vaughn", "Sato", "Okoro", "Brennan", "Ibarra", "Cho", "Feldman", "Nguyen",
  "Price", "Diaz", "Keller", "Brooks", "Singh", "Walsh", "Torres",
];

const BIOS: Record<ScoutExpertise, string[]> = {
  guards: [
    "Former college PG who lives in pick-and-roll film.",
    "Known for separating true creators from empty-stat handlers.",
  ],
  wings: [
    "Specializes in 3-and-D translation and switch versatility.",
    "Tracks wing measurables and closeout discipline obsessively.",
  ],
  bigs: [
    "Paint-and-rim evaluator - drop vs switch fit is their edge.",
    "Has a soft spot for stretch fives who can still protect.",
  ],
  defense: [
    "Team-defense first. Charts help habits more than block totals.",
    "Former assistant who grades on-ball pests and anchors.",
  ],
  offense: [
    "Shot-diet and creation burden specialist.",
    "Reads usage × efficiency better than raw scoring.",
  ],
  international: [
    "Euro / Aus / NBL pipeline - context adjusts production.",
    "Fluent in federation tape and age-rule quirks.",
  ],
  general: [
    "Balanced board builder - no positional blind spot, no specialty spike.",
    "Trusted for cross-checks when the room disagrees.",
  ],
};

export function makeScout(rng: () => number, force?: Partial<GmScout>): GmScout {
  const expertise = force?.expertise ?? pick(rng, [
    "guards", "wings", "bigs", "defense", "offense", "international", "general",
  ] as ScoutExpertise[]);
  const years = force?.yearsExperience ?? randInt(rng, 3, 28);
  const eye = force?.eye ?? clamp(
    Math.round(1 + years / 7 + (rng() - 0.35) * 2),
    1,
    5
  );
  return {
    id: force?.id ?? uid("scout"),
    name: force?.name ?? `${pick(rng, FIRST)} ${pick(rng, LAST)}`,
    yearsExperience: years,
    expertise,
    eye,
    salaryM: force?.salaryM ?? Math.round((0.4 + eye * 0.35 + years * 0.02) * 10) / 10,
    bio: force?.bio ?? pick(rng, BIOS[expertise]),
  };
}

export function generateScoutMarket(
  seed: number,
  count = 4
): GmScout[] {
  const rng = createRng(seed);
  const scouts: GmScout[] = [];
  const usedExpertise = new Set<ScoutExpertise>();
  for (let i = 0; i < count; i++) {
    let expertise = pick(rng, [
      "guards", "wings", "bigs", "defense", "offense", "international", "general",
    ] as ScoutExpertise[]);
    if (usedExpertise.has(expertise) && rng() > 0.35) {
      expertise = pick(rng, [
        "guards", "wings", "bigs", "defense", "offense", "international", "general",
      ] as ScoutExpertise[]);
    }
    usedExpertise.add(expertise);
    scouts.push(makeScout(rng, { expertise }));
  }
  return scouts.sort((a, b) => b.eye - a.eye || b.yearsExperience - a.yearsExperience);
}

export function defaultTeamScout(seed: number): GmScout {
  return makeScout(createRng(seed));
}

/** How much this scout’s eye sharpens for a given prospect. */
export function scoutMatchBonus(
  scout: GmScout | undefined | null,
  position: GmPosition,
  focus: "overall" | "offense" | "defense" | "shooting" | "creation" | "athleticism" | "feel"
): number {
  if (!scout) return 0;
  let bonus = 0;
  const exp = scout.expertise;
  if (exp === "general") bonus += 0.15;
  if (exp === "guards" && (position === "PG" || position === "SG")) bonus += 0.55;
  if (exp === "wings" && (position === "SF" || position === "SG" || position === "PF"))
    bonus += 0.5;
  if (exp === "bigs" && (position === "PF" || position === "C")) bonus += 0.55;
  if (exp === "defense" && (focus === "defense" || focus === "overall")) bonus += 0.45;
  if (
    exp === "offense" &&
    (focus === "offense" ||
      focus === "shooting" ||
      focus === "creation" ||
      focus === "overall")
  ) {
    bonus += 0.45;
  }
  if (exp === "international") bonus += 0.2;
  // Experience steadies the eye
  bonus += clamp(scout.yearsExperience / 40, 0, 0.35);
  return bonus;
}

/** Effective scout level 1-5 from hired scout (+ legacy fallback). */
export function effectiveScoutLevel(
  scout: GmScout | undefined | null,
  legacyLevel = 1
): number {
  if (!scout) return clamp(legacyLevel, 1, 5);
  return clamp(scout.eye, 1, 5);
}
