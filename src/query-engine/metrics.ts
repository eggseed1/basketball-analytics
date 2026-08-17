import type { AskMetricDef, AskMetricId } from "./types";
import { learnHrefFor } from "@/content/learn/registry";
import { DRBL_VOCABULARY } from "./drbl-vocabulary";

function href(id: string): string | undefined {
  return learnHrefFor(id) ?? undefined;
}

const VOCAB_TO_CONCEPT: Record<(typeof DRBL_VOCABULARY)[number]["id"], string> = {
  drbl100: "drbl",
  r1_points: "r1_points",
  r1_win_eq: "r1_win_eq",
  drbl_o: "drbl_o",
  drbl_d: "drbl_d",
  drbl_p: "drbl_p",
  drbl_ln: "drbl_ln",
  drbl_b: "drbl_b",
};

function drblMetric(
  id: AskMetricId,
  vocabId: (typeof DRBL_VOCABULARY)[number]["id"],
  extra?: Partial<AskMetricDef>
): AskMetricDef {
  const v = DRBL_VOCABULARY.find((e) => e.id === vocabId)!;
  return {
    id,
    label: v.label,
    synonyms: [...v.synonyms],
    scope: "player_season",
    learnHref: href(VOCAB_TO_CONCEPT[vocabId]) ?? "/learn/drbl",
    format: "impact",
    ...extra,
  };
}

export const ASK_METRICS: AskMetricDef[] = [
  {
    id: "ppg",
    label: "Points per game",
    synonyms: ["ppg", "points per game", "scoring average", "points average", "points", "scoring"],
    scope: "player_season",
    format: "per_game",
  },
  {
    id: "rpg",
    label: "Rebounds per game",
    synonyms: ["rpg", "rebounds per game", "rebounds", "boards"],
    scope: "player_season",
    format: "per_game",
  },
  {
    id: "apg",
    label: "Assists per game",
    synonyms: ["apg", "assists per game", "assists"],
    scope: "player_season",
    format: "per_game",
  },
  {
    id: "spg",
    label: "Steals per game",
    synonyms: ["spg", "steals per game", "steals"],
    scope: "player_season",
    format: "per_game",
  },
  {
    id: "bpg",
    label: "Blocks per game",
    synonyms: ["bpg", "blocks per game", "blocks"],
    scope: "player_season",
    format: "per_game",
  },
  {
    id: "tov",
    label: "Turnovers per game",
    synonyms: ["tov", "turnovers", "turnovers per game", "topg"],
    scope: "player_season",
    format: "per_game",
  },
  {
    id: "mpg",
    label: "Minutes per game",
    synonyms: ["mpg", "minutes", "minutes per game"],
    scope: "player_season",
    format: "per_game",
  },
  {
    id: "fg_pct",
    label: "Field goal %",
    synonyms: ["fg%", "fg pct", "field goal", "field goal percentage", "field goal%"],
    scope: "either",
    format: "pct",
  },
  {
    id: "fg3_pct",
    label: "Three-point %",
    synonyms: ["3p%", "3pt%", "three point", "three-point", "3-point percentage"],
    scope: "either",
    format: "pct",
  },
  {
    id: "ft_pct",
    label: "Free throw %",
    synonyms: ["ft%", "free throw", "free-throw percentage"],
    scope: "either",
    format: "pct",
  },
  {
    id: "ts_pct",
    label: "True shooting %",
    synonyms: [
      "ts%",
      "ts",
      "true shooting",
      "true shooting%",
      "true shooting percentage",
      "true-shooting",
    ],
    scope: "either",
    learnHref: href("ts"),
    format: "pct",
  },
  {
    id: "efg_pct",
    label: "Effective FG%",
    synonyms: ["efg%", "efg", "effective fg", "effective field goal", "effective fg%"],
    scope: "either",
    learnHref: href("efg"),
    format: "pct",
  },
  {
    id: "usg_pct",
    label: "Usage rate",
    synonyms: ["usg%", "usg", "usage", "usage rate", "usage%"],
    scope: "player_season",
    learnHref: href("usg"),
    format: "pct",
  },
  {
    id: "darko",
    label: "DARKO DPM",
    synonyms: ["darko", "darko dpm", "dpm"],
    scope: "player_season",
    learnHref: href("darko"),
    format: "impact",
  },
  {
    id: "lebron",
    label: "LEBRON",
    synonyms: ["lebron metric", "lebron rating", "lebron impact"],
    scope: "player_season",
    learnHref: href("lebron"),
    format: "impact",
  },
  // DRBL vocabulary first among impact synonyms that overlap “ability” / “drbl”.
  drblMetric("drbl100", "drbl100"),
  drblMetric("r1_points", "r1_points", { format: "number" }),
  drblMetric("r1_win_eq", "r1_win_eq", { format: "number" }),
  drblMetric("drbl_o", "drbl_o"),
  drblMetric("drbl_d", "drbl_d"),
  drblMetric("drbl_p", "drbl_p"),
  drblMetric("drbl_ln", "drbl_ln"),
  drblMetric("drbl_b", "drbl_b"),
  {
    id: "cpi",
    label: "Career Production Index",
    synonyms: ["cpi", "career production", "production index"],
    scope: "derived",
    learnHref: href("cpi"),
    format: "number",
  },
  {
    id: "team_ppg",
    label: "Team points per game",
    synonyms: ["team ppg", "scoring", "points per game", "offense"],
    scope: "team_season",
    format: "per_game",
  },
  {
    id: "team_opp_ppg",
    label: "Opponent points per game",
    synonyms: ["opp ppg", "opponent ppg", "defensive scoring"],
    scope: "team_season",
    learnHref: href("opp_ppg"),
    format: "per_game",
  },
  {
    id: "team_diff",
    label: "Point differential",
    synonyms: [
      "point differential",
      "differential",
      "avg diff",
      "scoring margin",
      "average scoring margin",
      "net rating points",
      "margin",
    ],
    scope: "team_season",
    learnHref: href("diff"),
    format: "number",
  },
  {
    id: "team_efg",
    label: "Team effective FG%",
    synonyms: ["team efg", "efg%", "effective fg%"],
    scope: "team_season",
    learnHref: href("efg"),
    format: "pct",
  },
  {
    id: "team_ts",
    label: "Team true shooting %",
    synonyms: ["team ts", "team true shooting", "ts%"],
    scope: "team_season",
    learnHref: href("ts"),
    format: "pct",
  },
  {
    id: "team_fg3",
    label: "Team 3P%",
    synonyms: ["team 3p%", "three point percentage"],
    scope: "team_season",
    format: "pct",
  },
  {
    id: "team_tov",
    label: "Team turnovers per game",
    synonyms: ["team turnovers", "turnovers"],
    scope: "team_season",
    format: "per_game",
  },
  {
    id: "team_rpg",
    label: "Team rebounds per game",
    synonyms: ["team rebounds", "rebounds"],
    scope: "team_season",
    format: "per_game",
  },
  {
    id: "points",
    label: "Points",
    synonyms: ["points", "pts", "scored"],
    scope: "player_season",
    format: "number",
  },
  {
    id: "rebounds",
    label: "Rebounds",
    synonyms: ["rebounds", "reb"],
    scope: "player_season",
    format: "number",
  },
  {
    id: "assists",
    label: "Assists",
    synonyms: ["assists", "ast"],
    scope: "player_season",
    format: "number",
  },
];

export function resolveMetric(
  text: string,
  preferScope?: AskMetricDef["scope"]
): AskMetricDef | null {
  const hay = text.toLowerCase().replace(/\s+/g, " ").trim();
  const ranked = ASK_METRICS.map((m) => {
    let score = 0;
    for (const syn of m.synonyms) {
      const s = syn.toLowerCase();
      if (hay === s) score = Math.max(score, 100);
      else if (hay.includes(s)) score = Math.max(score, 40 + s.length);
    }
    if (preferScope && m.scope === preferScope) score += 5;
    if (preferScope === "team_season" && m.scope === "team_season") score += 10;
    if (preferScope === "player_season" && m.scope === "player_season") score += 10;
    return { m, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.m ?? null;
}

export function metricById(id: AskMetricId): AskMetricDef | undefined {
  return ASK_METRICS.find((m) => m.id === id);
}
