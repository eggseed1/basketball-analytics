/**
 * Map dense-table column labels / Game Lab factor ids → Learn concept ids.
 * Header-level MetricHelp only — keep cells clean.
 */

import { getLearnConcept } from "@/content/learn/registry";

/** Common UI abbreviations → registry concept id. */
const COLUMN_CONCEPT: Record<string, string> = {
  "TS%": "ts",
  TS: "ts",
  "eFG%": "efg",
  eFG: "efg",
  "USG%": "usg",
  USG: "usg",
  "FG%": "fg",
  "3P%": "fg3",
  "3P": "fg3",
  ORtg: "ortg",
  DRtg: "drtg",
  NET: "net",
  "+/-": "plus_minus",
  "+/−": "plus_minus",
  TOV: "tov",
  TO: "tov",
  "AST/TO": "ast_to",
  OREB: "orb",
  "ORB%": "orb",
  DARKO: "darko",
  LEBRON: "lebron",
  CPI: "cpi",
  DIFF: "diff",
  "DRBL/100": "drbl",
  DRBL: "drbl",
  "R1 Points": "r1_points",
  WAR1: "r1_win_eq",
  "Wins Above R1": "r1_win_eq",
  "R1 Win Eq.": "r1_win_eq",
  "R1 Win Equivalents": "r1_win_eq",
  "DRBL-O": "drbl_o",
  "DRBL-D": "drbl_d",
  "DARKO DPM": "darko",
};

/** Game Lab winning-factor / hero metric ids → concept. */
const FACTOR_CONCEPT: Record<string, string> = {
  efg: "efg",
  ts: "ts",
  tov: "tov",
  orb: "orb",
  reb: "reb",
  ft: "ft",
  fta: "ft",
  "3pa": "fg3",
  "3pm": "fg3",
  fg3: "fg3",
  ast: "ast",
  stl: "stl",
  blk: "blk",
  pts: "pts",
  margin: "diff",
  total: "pts",
  lead: "diff",
};

export function conceptIdForColumnLabel(label: string): string | null {
  const trimmed = label.trim();
  const direct = COLUMN_CONCEPT[trimmed];
  if (direct && getLearnConcept(direct)?.showTooltip) return direct;
  const concept = getLearnConcept(trimmed);
  if (concept?.showTooltip) return concept.id;
  return null;
}

export function conceptIdForFactorId(id: string): string | null {
  const mapped = FACTOR_CONCEPT[id] ?? id;
  const concept = getLearnConcept(mapped);
  if (concept?.showTooltip) return concept.id;
  return null;
}

/** ASK DRBL metricId / status → registry concept (when tooltip-worthy). */
export function conceptIdForAskMetric(metricId: string | undefined | null): string | null {
  if (!metricId) return null;
  const concept = getLearnConcept(metricId);
  if (concept?.showTooltip) return concept.id;
  return null;
}

const ASK_STATUS_CONCEPT: Record<string, string> = {
  insufficient_data: "insufficient_evidence",
  insufficient_evidence: "insufficient_evidence",
};

export function conceptIdForAskStatus(status: string): string | null {
  const mapped = ASK_STATUS_CONCEPT[status] ?? status;
  const concept = getLearnConcept(mapped);
  if (concept?.showTooltip) return concept.id;
  return null;
}
