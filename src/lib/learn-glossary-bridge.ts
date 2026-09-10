/**
 * Map UI stat labels and legacy glossary keys to Learn registry concept ids.
 */

import { conceptIdForColumnLabel } from "@/lib/learn-column-concepts";
import { getLearnConcept } from "@/content/learn/registry";

/** Glossary / BRef / dashboard keys not covered by column labels. */
const STAT_KEY_TO_CONCEPT: Record<string, string> = {
  PER: "per",
  per: "per",
  VORP: "vorp",
  vorp: "vorp",
  BPM: "bpm",
  OBPM: "obpm",
  DBPM: "dbpm",
  WS: "ws",
  "WS/48": "ws48",
  OWS: "ows",
  DWS: "dws",
  NRtg: "net",
  DPM: "darko",
  "O-DPM": "darko_o",
  "D-DPM": "darko_d",
  "Box DPM": "darko_box",
  "On/Off DPM": "darko_onoff",
  dpm: "darko",
  oDpm: "darko_o",
  dDpm: "darko_d",
  raptor: "raptor",
  oRaptor: "raptor_o",
  dRaptor: "raptor_d",
  oraptor: "raptor_o",
  draptor: "raptor_d",
  winsAdded: "wins_added",
  wins_added: "wins_added",
  PIE: "pie",
  "AST%": "ast_pct",
  "TOV%": "tov_pct",
  "DRB%": "drb_pct",
  "TRB%": "trb_pct",
  "STL%": "stl_pct",
  "BLK%": "blk_pct",
  FTr: "ftr",
  "DRBL-P": "drbl_p",
  "DRBL-LN": "drbl_ln",
  "DRBL-B": "drbl_b",
  "DRBL-L": "drbl_l",
  "DRBL Δ": "drbl_disagreement",
  "DRBL ±": "drbl_uncertainty",
  "DRBL impact": "r1_win_eq",
  trueShootingPct: "ts",
  effectiveFieldGoalPct: "efg",
  usagePct: "usg",
  Minutes: "min",
  min: "min",
  Games: "gp",
  gp: "gp",
  PTS: "pts",
  AST: "ast",
  REB: "reb",
  STL: "stl",
  BLK: "blk",
  "PTS/36": "pts_per36",
  "AST/36": "ast_per36",
  "REB/36": "reb_per36",
  "STL/36": "stl_per36",
  "BLK/36": "blk_per36",
  "W%": "win_pct",
};

export function conceptIdForStatLabel(label: string): string | null {
  const trimmed = label.trim();
  if (!trimmed) return null;

  const column = conceptIdForColumnLabel(trimmed);
  if (column && getLearnConcept(column)) return column;

  const direct = STAT_KEY_TO_CONCEPT[trimmed];
  if (direct && getLearnConcept(direct)) return direct;

  const concept = getLearnConcept(trimmed);
  if (concept) return concept.id;

  const lower = trimmed.toLowerCase();
  const lowerHit = STAT_KEY_TO_CONCEPT[lower];
  if (lowerHit && getLearnConcept(lowerHit)) return lowerHit;

  return null;
}
