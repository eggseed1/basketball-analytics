/**
 * Curated ASK DRBL example pool + deterministic rotation.
 * Visible set is small; pool is large. No Math.random() at render time.
 */

export type AskExampleClass =
  | "player_stat"
  | "team_stat"
  | "leaderboard"
  | "player_compare"
  | "player_rank"
  | "career"
  | "team_compare"
  | "team_rank"
  | "game"
  | "evidence"
  | "offseason";

export type AskExampleEra = "current" | "recent" | "2010s" | "2000s" | "older";

export type AskExample = {
  id: string;
  prompt: string;
  class: AskExampleClass;
  /** Lowercase player keys for diversity accounting (optional). */
  players?: string[];
  /** Lowercase team abbrs for diversity accounting (optional). */
  teams?: string[];
  era: AskExampleEra;
  metric?: string;
};

/**
 * Validated, capability-aligned examples only.
 * Prefer players/teams the interpreter already recognizes.
 */
export const ASK_EXAMPLE_POOL: readonly AskExample[] = [
  // Player season stats — diverse players / eras / metrics
  {
    id: "ps-jokic-drbl-2425",
    prompt: "What was Jokic's DRBL/100 in 2024-25?",
    class: "player_stat",
    players: ["jokic"],
    era: "recent",
    metric: "drbl100",
  },
  {
    id: "ps-what-is-drbl",
    prompt: "What is DRBL/100?",
    class: "player_stat",
    era: "current",
    metric: "drbl100",
  },
  {
    id: "lb-drbl-2526",
    prompt: "Who led the NBA in DRBL/100 in 2025-26?",
    class: "leaderboard",
    era: "current",
    metric: "drbl100",
  },
  {
    id: "ps-jokic-ts-2425",
    prompt: "What was Jokic's TS% in 2024-25?",
    class: "player_stat",
    players: ["jokic"],
    era: "recent",
    metric: "ts_pct",
  },
  {
    id: "ps-giannis-usg-2324",
    prompt: "How much usage did Giannis have in 2023-24?",
    class: "player_stat",
    players: ["giannis"],
    era: "recent",
    metric: "usg_pct",
  },
  {
    id: "ps-curry-3p-1516",
    prompt: "What was Stephen Curry's 3P% in 2015-16?",
    class: "player_stat",
    players: ["curry"],
    era: "2010s",
    metric: "fg3_pct",
  },
  {
    id: "ps-lebron-ts-1213",
    prompt: "What was LeBron's TS% in 2012-13?",
    class: "player_stat",
    players: ["lebron"],
    era: "2010s",
    metric: "ts_pct",
  },
  {
    id: "ps-tatum-ppg-2425",
    prompt: "How many points did Tatum average in 2024-25?",
    class: "player_stat",
    players: ["tatum"],
    era: "recent",
    metric: "ppg",
  },
  {
    id: "ps-jokic-apg-2324",
    prompt: "What was Jokic's APG in 2023-24?",
    class: "player_stat",
    players: ["jokic"],
    era: "recent",
    metric: "apg",
  },
  {
    id: "ps-giannis-rpg-2223",
    prompt: "What was Giannis's RPG in 2022-23?",
    class: "player_stat",
    players: ["giannis"],
    era: "recent",
    metric: "rpg",
  },
  {
    id: "ps-curry-efg-2122",
    prompt: "How efficient was Curry by eFG% in 2021-22?",
    class: "player_stat",
    players: ["curry"],
    era: "recent",
    metric: "efg_pct",
  },
  {
    id: "ps-tatum-tov-2324",
    prompt: "What was Tatum's turnovers per game in 2023-24?",
    class: "player_stat",
    players: ["tatum"],
    era: "recent",
    metric: "tov",
  },
  {
    id: "ps-lebron-mpg-0809",
    prompt: "How many minutes did LeBron play per game in 2008-09?",
    class: "player_stat",
    players: ["lebron"],
    era: "2000s",
    metric: "mpg",
  },

  // Team season stats — franchise diversity
  {
    id: "ts-den-diff-2324",
    prompt: "What was Denver's point differential in 2023-24?",
    class: "team_stat",
    teams: ["den"],
    era: "recent",
    metric: "team_diff",
  },
  {
    id: "ts-okc-opp-2425",
    prompt: "What was Oklahoma City's opponent PPG in 2024-25?",
    class: "team_stat",
    teams: ["okc"],
    era: "recent",
    metric: "team_opp_ppg",
  },
  {
    id: "ts-min-ppg-2324",
    prompt: "What was Minnesota's team PPG in 2023-24?",
    class: "team_stat",
    teams: ["min"],
    era: "recent",
    metric: "team_ppg",
  },
  {
    id: "ts-nyk-diff-2425",
    prompt: "What was New York's point differential in 2024-25?",
    class: "team_stat",
    teams: ["ny"],
    era: "recent",
    metric: "team_diff",
  },
  {
    id: "ts-cle-opp-2324",
    prompt: "What was Cleveland's opponent PPG in 2023-24?",
    class: "team_stat",
    teams: ["cle"],
    era: "recent",
    metric: "team_opp_ppg",
  },
  {
    id: "ts-phx-ts-2122",
    prompt: "What was Phoenix's true shooting in 2021-22?",
    class: "team_stat",
    teams: ["phx"],
    era: "recent",
    metric: "team_ts",
  },
  {
    id: "ts-gsw-3p-1516",
    prompt: "What was Golden State's team 3P% in 2015-16?",
    class: "team_stat",
    teams: ["gs"],
    era: "2010s",
    metric: "team_fg3",
  },
  {
    id: "ts-mil-diff-2021",
    prompt: "What was Milwaukee's point differential in 2020-21?",
    class: "team_stat",
    teams: ["mil"],
    era: "recent",
    metric: "team_diff",
  },
  {
    id: "ts-mia-opp-2223",
    prompt: "What was Miami's opponent PPG in 2022-23?",
    class: "team_stat",
    teams: ["mia"],
    era: "recent",
    metric: "team_opp_ppg",
  },
  {
    id: "ts-dal-ppg-2324",
    prompt: "What was Dallas's team PPG in 2023-24?",
    class: "team_stat",
    teams: ["dal"],
    era: "recent",
    metric: "team_ppg",
  },
  {
    id: "ts-mem-diff-2122",
    prompt: "What was Memphis's point differential in 2021-22?",
    class: "team_stat",
    teams: ["mem"],
    era: "recent",
    metric: "team_diff",
  },
  {
    id: "ts-orl-opp-2425",
    prompt: "What was Orlando's opponent PPG in 2024-25?",
    class: "team_stat",
    teams: ["orl"],
    era: "recent",
    metric: "team_opp_ppg",
  },
  {
    id: "ts-ind-ppg-2324",
    prompt: "What was Indiana's team PPG in 2023-24?",
    class: "team_stat",
    teams: ["ind"],
    era: "recent",
    metric: "team_ppg",
  },
  {
    id: "ts-bos-diff-2324",
    prompt: "What was Boston's point differential in 2023-24?",
    class: "team_stat",
    teams: ["bos"],
    era: "recent",
    metric: "team_diff",
  },

  // Leaderboards
  {
    id: "lb-ts-2425",
    prompt: "Who led the NBA in TS% in 2024-25?",
    class: "leaderboard",
    era: "recent",
    metric: "ts_pct",
  },
  {
    id: "lb-ppg-2324",
    prompt: "Who led the NBA in PPG in 2023-24?",
    class: "leaderboard",
    era: "recent",
    metric: "ppg",
  },
  {
    id: "lb-usg-2223",
    prompt: "Who had the highest usage rate in 2022-23?",
    class: "leaderboard",
    era: "recent",
    metric: "usg_pct",
  },
  {
    id: "lb-apg-2425",
    prompt: "Who led the NBA in assists in 2024-25?",
    class: "leaderboard",
    era: "recent",
    metric: "apg",
  },
  {
    id: "lb-rpg-2122",
    prompt: "Who led the NBA in rebounds in 2021-22?",
    class: "leaderboard",
    era: "recent",
    metric: "rpg",
  },
  {
    id: "lb-efg-1516",
    prompt: "Who led the NBA in eFG% in 2015-16?",
    class: "leaderboard",
    era: "2010s",
    metric: "efg_pct",
  },

  // Player compare / rank / career
  {
    id: "pc-jokic-2324-2425",
    prompt: "Compare Jokic's 2023-24 and 2024-25 seasons.",
    class: "player_compare",
    players: ["jokic"],
    era: "recent",
  },
  {
    id: "pc-giannis-1920-2021",
    prompt: "Compare Giannis's 2019-20 and 2020-21 seasons.",
    class: "player_compare",
    players: ["giannis"],
    era: "recent",
  },
  {
    id: "pc-lebron-0809-1213",
    prompt: "Compare LeBron's 2008-09 and 2012-13 seasons.",
    class: "player_compare",
    players: ["lebron"],
    era: "2000s",
  },
  {
    id: "pc-curry-1415-1516",
    prompt: "Compare Curry's 2014-15 and 2015-16 seasons.",
    class: "player_compare",
    players: ["curry"],
    era: "2010s",
  },
  {
    id: "pc-tatum-2223-2324",
    prompt: "Compare Tatum's 2022-23 and 2023-24 seasons.",
    class: "player_compare",
    players: ["tatum"],
    era: "recent",
  },
  {
    id: "pr-jokic-rank",
    prompt: "Rank Jokic's seasons.",
    class: "player_rank",
    players: ["jokic"],
    era: "recent",
  },
  {
    id: "pr-giannis-rank",
    prompt: "Rank Giannis's best seasons.",
    class: "player_rank",
    players: ["giannis"],
    era: "recent",
  },
  {
    id: "pr-lebron-rank-window",
    prompt: "Rank LeBron's best seasons from 2008-09 to 2015-16.",
    class: "player_rank",
    players: ["lebron"],
    era: "2010s",
  },
  {
    id: "pr-curry-rank",
    prompt: "What is Curry's best season?",
    class: "player_rank",
    players: ["curry"],
    era: "2010s",
  },
  {
    id: "cr-jokic-peak",
    prompt: "What was Jokic's peak production season?",
    class: "career",
    players: ["jokic"],
    era: "recent",
  },
  {
    id: "cr-lebron-peak",
    prompt: "What was LeBron's peak production season?",
    class: "career",
    players: ["lebron"],
    era: "2010s",
  },
  {
    id: "cr-giannis-peak",
    prompt: "What was Giannis's peak production season?",
    class: "career",
    players: ["giannis"],
    era: "recent",
  },
  {
    id: "cr-curry-peak",
    prompt: "What was Stephen Curry's peak production season?",
    class: "career",
    players: ["curry"],
    era: "2010s",
  },

  // Team compare / rank
  {
    id: "tc-min-okc-2425",
    prompt: "Compare Minnesota and Oklahoma City in 2024-25.",
    class: "team_compare",
    teams: ["min", "okc"],
    era: "recent",
  },
  {
    id: "tc-den-phx-2223",
    prompt: "Compare Denver and Phoenix in 2022-23.",
    class: "team_compare",
    teams: ["den", "phx"],
    era: "recent",
  },
  {
    id: "tc-nyk-cle-2425",
    prompt: "Compare New York and Cleveland in 2024-25.",
    class: "team_compare",
    teams: ["ny", "cle"],
    era: "recent",
  },
  {
    id: "tc-mia-mil-2223",
    prompt: "Compare Miami and Milwaukee in 2022-23.",
    class: "team_compare",
    teams: ["mia", "mil"],
    era: "recent",
  },
  {
    id: "tc-gsw-bos-2122",
    prompt: "Compare Golden State and Boston in 2021-22.",
    class: "team_compare",
    teams: ["gs", "bos"],
    era: "recent",
  },
  {
    id: "tc-den-seasons",
    prompt: "Compare Denver's 2022-23 and 2023-24 seasons.",
    class: "team_compare",
    teams: ["den"],
    era: "recent",
  },
  {
    id: "tc-okc-seasons",
    prompt: "Compare Oklahoma City's 2023-24 and 2024-25 seasons.",
    class: "team_compare",
    teams: ["okc"],
    era: "recent",
  },
  {
    id: "tr-den-rank",
    prompt: "Rank Denver's recent seasons.",
    class: "team_rank",
    teams: ["den"],
    era: "recent",
  },
  {
    id: "tr-bos-rank",
    prompt: "Rank Boston's seasons from 2022-23 to 2024-25.",
    class: "team_rank",
    teams: ["bos"],
    era: "recent",
  },
  {
    id: "tr-gsw-rank",
    prompt: "Rank Golden State's recent seasons.",
    class: "team_rank",
    teams: ["gs"],
    era: "recent",
  },

  // Game / evidence / offseason
  {
    id: "gl-bos-bkn",
    prompt: "Who led Boston in scoring against Brooklyn?",
    class: "game",
    teams: ["bos", "bkn"],
    era: "recent",
  },
  {
    id: "gl-den-mia",
    prompt: "Who led Denver against Miami?",
    class: "game",
    teams: ["den", "mia"],
    era: "recent",
  },
  {
    id: "ev-den-wins-2324",
    prompt: "What were Denver's biggest wins in 2023-24?",
    class: "evidence",
    teams: ["den"],
    era: "recent",
  },
  {
    id: "ev-okc-wins-2425",
    prompt: "What stood out in Oklahoma City's biggest win of 2024-25?",
    class: "evidence",
    teams: ["okc"],
    era: "recent",
  },
  {
    id: "ev-min-wins-2324",
    prompt: "What were Minnesota's biggest wins in 2023-24?",
    class: "evidence",
    teams: ["min"],
    era: "recent",
  },
  {
    id: "ev-nyk-wins-2425",
    prompt: "What were New York's biggest wins in 2024-25?",
    class: "evidence",
    teams: ["ny"],
    era: "recent",
  },
  {
    id: "os-phx",
    prompt: "What happened to Phoenix this offseason?",
    class: "offseason",
    teams: ["phx"],
    era: "current",
  },
  {
    id: "os-den",
    prompt: "What happened to Denver this offseason?",
    class: "offseason",
    teams: ["den"],
    era: "current",
  },
  {
    id: "os-okc",
    prompt: "What happened to Oklahoma City this offseason?",
    class: "offseason",
    teams: ["okc"],
    era: "current",
  },
  {
    id: "os-mia",
    prompt: "What happened to Miami this offseason?",
    class: "offseason",
    teams: ["mia"],
    era: "current",
  },
  {
    id: "os-dal",
    prompt: "What happened to Dallas this offseason?",
    class: "offseason",
    teams: ["dal"],
    era: "current",
  },
  {
    id: "os-nyk",
    prompt: "What happened to New York this offseason?",
    class: "offseason",
    teams: ["ny"],
    era: "current",
  },
] as const;

/** Preferred class order for a balanced 8-example strip. */
export const ASK_EXAMPLE_DISPLAY_CLASSES: AskExampleClass[] = [
  "player_stat",
  "team_stat",
  "leaderboard",
  "player_compare",
  "player_rank",
  "career",
  "game",
  "offseason",
];

/**
 * Seed-dependent class slots so compare/rank/game rotate across
 * player vs team and game vs evidence without Math.random().
 */
export function displayClassesForSeed(seed: number): AskExampleClass[] {
  const compare: AskExampleClass =
    seed % 2 === 0 ? "player_compare" : "team_compare";
  const rank: AskExampleClass =
    (seed >>> 1) % 2 === 0 ? "player_rank" : "team_rank";
  const gameOrEvidence: AskExampleClass =
    (seed >>> 2) % 2 === 0 ? "game" : "evidence";
  return [
    "player_stat",
    "team_stat",
    "leaderboard",
    compare,
    rank,
    "career",
    gameOrEvidence,
    "offseason",
  ];
}

/** FNV-1a 32-bit — deterministic, no Math.random. */
export function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function daySeed(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  let s = seed || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

/**
 * Pick a balanced visible set. Same seed → same prompts.
 */
export function pickAskExamples(
  seedInput: string,
  count = 8
): AskExample[] {
  const seed = hashSeed(seedInput);
  const byClass = new Map<AskExampleClass, AskExample[]>();
  for (const ex of ASK_EXAMPLE_POOL) {
    const list = byClass.get(ex.class) ?? [];
    list.push(ex);
    byClass.set(ex.class, list);
  }

  const picked: AskExample[] = [];
  const usedIds = new Set<string>();
  const playerCounts = new Map<string, number>();
  const teamCounts = new Map<string, number>();

  const bump = (map: Map<string, number>, keys: string[] | undefined) => {
    for (const k of keys ?? []) map.set(k, (map.get(k) ?? 0) + 1);
  };
  const tooMany = (map: Map<string, number>, keys: string[] | undefined, max = 1) =>
    (keys ?? []).some((k) => (map.get(k) ?? 0) >= max);

  const classOrder = displayClassesForSeed(seed);
  for (let i = 0; i < classOrder.length && picked.length < count; i++) {
    const cls = classOrder[i]!;
    const candidates = seededShuffle(byClass.get(cls) ?? [], seed + i + 17).filter(
      (ex) =>
        !usedIds.has(ex.id) &&
        !tooMany(playerCounts, ex.players, 1) &&
        !tooMany(teamCounts, ex.teams, 2)
    );
    const choice = candidates[0] ?? seededShuffle(byClass.get(cls) ?? [], seed + i)[0];
    if (!choice || usedIds.has(choice.id)) continue;
    picked.push(choice);
    usedIds.add(choice.id);
    bump(playerCounts, choice.players);
    bump(teamCounts, choice.teams);
  }

  // Fill remaining from full pool if needed.
  if (picked.length < count) {
    const rest = seededShuffle(ASK_EXAMPLE_POOL, seed + 99).filter(
      (ex) => !usedIds.has(ex.id)
    );
    for (const ex of rest) {
      if (picked.length >= count) break;
      picked.push(ex);
      usedIds.add(ex.id);
    }
  }

  return picked.slice(0, count);
}

export function askExampleDiversityReport(examples: AskExample[]): {
  classes: string[];
  players: string[];
  teams: string[];
  eras: string[];
} {
  return {
    classes: [...new Set(examples.map((e) => e.class))],
    players: [
      ...new Set(examples.flatMap((e) => e.players ?? [])),
    ].sort(),
    teams: [...new Set(examples.flatMap((e) => e.teams ?? []))].sort(),
    eras: [...new Set(examples.map((e) => e.era))],
  };
}
