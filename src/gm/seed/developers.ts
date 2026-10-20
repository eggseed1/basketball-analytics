import type { DevKnackId } from "@/gm/seed/staff-knacks";
import { DEV_KNACKS } from "@/gm/seed/staff-knacks";
import { pick, randInt, clamp, createRng, uid } from "@/gm/engine/rng";

export interface GmDeveloper {
  id: string;
  name: string;
  yearsExperience: number;
  /** 1-5 teaching touch (pairs with knack strength). */
  touch: number;
  knack: DevKnackId;
  salaryM: number;
  bio: string;
}

const FIRST = [
  "Lane", "Remy", "Chris", "Pat", "Sam", "Alex", "Jamie", "Terry",
  "Kai", "Noel", "Shawn", "Devon", "Ellis", "Frankie", "Jules",
];
const LAST = [
  "Hollis", "Vargas", "Kim", "Okafor", "Prieto", "Beck", "Landes", "Crowe",
  "Mendez", "Shore", "Quincy", "Bell", "Stark", "Iver", "Nolan",
];

const KNACK_LIST = Object.keys(DEV_KNACKS) as DevKnackId[];

export function makeDeveloper(
  rng: () => number,
  force?: Partial<GmDeveloper>
): GmDeveloper {
  const knack = force?.knack ?? pick(rng, KNACK_LIST);
  const years = force?.yearsExperience ?? randInt(rng, 4, 26);
  const touch = force?.touch ?? clamp(
    Math.round(1 + years / 8 + (rng() - 0.3) * 2),
    1,
    5
  );
  return {
    id: force?.id ?? uid("pdev"),
    name: force?.name ?? `${pick(rng, FIRST)} ${pick(rng, LAST)}`,
    yearsExperience: years,
    touch,
    knack,
    salaryM:
      force?.salaryM ??
      Math.round((0.35 + touch * 0.32 + years * 0.015) * 10) / 10,
    bio: force?.bio ?? DEV_KNACKS[knack].blurb,
  };
}

export function generateDeveloperMarket(seed: number, count = 4): GmDeveloper[] {
  const rng = createRng(seed);
  const used = new Set<DevKnackId>();
  const out: GmDeveloper[] = [];
  for (let i = 0; i < count; i++) {
    let knack = pick(rng, KNACK_LIST);
    if (used.has(knack) && rng() > 0.3) {
      knack = pick(rng, KNACK_LIST);
    }
    used.add(knack);
    out.push(makeDeveloper(rng, { knack }));
  }
  return out.sort((a, b) => b.touch - a.touch || b.yearsExperience - a.yearsExperience);
}

export function defaultTeamDeveloper(seed: number): GmDeveloper {
  return makeDeveloper(createRng(seed));
}
