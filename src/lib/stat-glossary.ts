/**
 * Plain-language explanations for advanced / non-obvious basketball stats.
 * Keys accept short labels (USG%) and common aliases.
 */

export interface StatGlossaryEntry {
  title: string;
  body: string;
  /** Optional in-app docs link shown as "Learn more" in the tooltip. */
  learnMoreHref?: string;
}

const ENTRIES: Record<string, StatGlossaryEntry> = {
  "TS%": {
    title: "True shooting %",
    body: "Shooting efficiency that credits 2s, 3s, and free throws. Higher means more points per scoring attempt.",
  },
  "eFG%": {
    title: "Effective field goal %",
    body: "Field goal % with extra weight for threes (a make from deep counts as 1.5 field goals). Better than raw FG% for comparing shooters.",
  },
  "USG%": {
    title: "Usage %",
    body: "Share of team plays a player uses while on the floor (shots, free throws, turnovers). Higher = more of the offense runs through them.",
  },
  PER: {
    title: "Player efficiency rating",
    body: "All-in-one box-score rate (league average ≈ 15). Rewards positive production and penalizes misses and turnovers.",
  },
  VORP: {
    title: "Value over replacement player",
    body: "Estimate of how many wins a player adds versus a cheap bench replacement, scaled to playing time. Higher is more valuable.",
  },
  DPM: {
    title: "DARKO DPM",
    body: "Daily Player Metric from DARKO (darko.app) — estimated points per 100 possessions vs average, blending box score and on/off. 0 is average; stars are often +3 to +6.",
  },
  "O-DPM": {
    title: "DARKO offensive DPM",
    body: "Offensive half of DARKO DPM — estimated points added on offense per 100 possessions.",
  },
  "D-DPM": {
    title: "DARKO defensive DPM",
    body: "Defensive half of DARKO DPM — estimated points prevented on defense per 100 possessions.",
  },
  "Box DPM": {
    title: "DARKO box DPM",
    body: "Box-score component of DARKO DPM before on/off information is blended in.",
  },
  "On/Off DPM": {
    title: "DARKO on/off DPM",
    body: "On/off component of DARKO DPM — impact estimated from lineup plus/minus when the player is on the floor.",
  },
  "DRBL/100": {
    title: "DRBL ability rate",
    body: "Estimated player impact rate relative to a contextual, role-matched R1 reference, per 100 combined possession appearances. This is an ability/rate statistic — not season cumulative value.",
    learnMoreHref: "/learn/drbl",
  },
  "DRBL-P": {
    title: "DRBL possession component",
    body: "DRBL-P — Approach B marginal contribution from expected-possession residuals versus role-matched replacement.",
    learnMoreHref: "/learn/drbl",
  },
  "DRBL-LN": {
    title: "DRBL lineup component",
    body: "DRBL-LN — regularized possession lineup (RAPM-style) rating. Adjusted association, not a causal claim.",
    learnMoreHref: "/learn/drbl",
  },
  "DRBL-B": {
    title: "DRBL behavior component",
    body: "DRBL-B — regularized prediction from public box/PBP behavior features (usage, creation, shot mix, DRBL Gravity Proxy). Not optical tracking.",
    learnMoreHref: "/learn/drbl",
  },
  "DRBL-L": {
    title: "DRBL leverage",
    body: "Leverage-weighted seasonal impact Σ BaseValue × λ*, where λ* ∝ ∂WP/∂ExpectedPoints normalized to mean 1. Descriptive only — never added into R1 Points or R1 Win Equivalents.",
    learnMoreHref: "/learn/drbl",
  },
  "DRBL Δ": {
    title: "DRBL component disagreement",
    body: "Scale-standardized disagreement among DRBL-P, DRBL-LN, and DRBL-B (z-scored components). Diagnostic only — not a calibrated standard error and not a ranking penalty.",
    learnMoreHref: "/learn/drbl",
  },
  "DRBL-O": {
    title: "DRBL offense",
    body: "Offensive half of DRBL-P — value added on offensive possessions versus replacement.",
    learnMoreHref: "/learn/drbl",
  },
  "DRBL-D": {
    title: "DRBL defense",
    body: "Defensive half of DRBL-P — value added on defensive possessions versus replacement.",
    learnMoreHref: "/learn/drbl",
  },
  "R1 Points": {
    title: "R1 Points",
    body: "Realized player-attributed point residual above the contextual role-matched R1 reference over actual season exposure. Accounting value — not latent ability.",
    learnMoreHref: "/learn/drbl",
  },
  "R1 Win Eq.": {
    title: "R1 Win Equivalents",
    body: "R1 Points expressed in marginal win-equivalent units. Not traditional WAR; not a causal roster-replacement effect. R1 is not claimed to equal conventional NBA fringe replacement.",
    learnMoreHref: "/learn/drbl",
  },
  "R1 Win Equivalents": {
    title: "R1 Win Equivalents",
    body: "R1 Points expressed in marginal win-equivalent units. Not traditional WAR; not a causal roster-replacement effect. R1 is not claimed to equal conventional NBA fringe replacement.",
    learnMoreHref: "/learn/drbl",
  },
  "DRBL impact": {
    title: "DRBL seasonal impact",
    body: "Legacy companion field related to realized Approach-B attribution. Prefer R1 Points as the canonical realized attribution total.",
    learnMoreHref: "/learn/drbl",
  },
  "DRBL ±": {
    title: "DRBL uncertainty (legacy diagnostic)",
    body: "Not available for the validated DRBL/100 point estimate — predictive intervals remain unresolved. Legacy ± fields are diagnostic-only and are not shown as calibrated confidence intervals.",
    learnMoreHref: "/learn/drbl",
  },
  DRBL: {
    title: "Differential Replacement Basketball Level",
    body: "Possession-based impact versus a contextual role-matched R1 reference. DRBL/100 is the posterior ability rate; R1 Points is realized attributed season value; R1 Win Equivalents convert R1 Points with a frozen points-per-win factor.",
    learnMoreHref: "/learn/drbl",
  },
  BPM: {
    title: "Box plus/minus",
    body: "Estimated point differential per 100 possessions vs league average from box-score stats. 0 is average; +2 is strong.",
  },
  OBPM: {
    title: "Offensive box plus/minus",
    body: "Offensive half of box plus/minus — estimated points added on offense per 100 possessions.",
  },
  DBPM: {
    title: "Defensive box plus/minus",
    body: "Defensive half of box plus/minus — estimated points prevented on defense per 100 possessions.",
  },
  WS: {
    title: "Win shares",
    body: "Credit for team wins from box-score production (offense + defense). Roughly, 1 WS ≈ a win contributed.",
  },
  "WS/48": {
    title: "Win shares per 48 minutes",
    body: "Win shares rate so playing time is equalized. League average is about .100; stars are often .200+.",
  },
  OWS: {
    title: "Offensive win shares",
    body: "Portion of win shares from offensive production.",
  },
  DWS: {
    title: "Defensive win shares",
    body: "Portion of win shares from defensive production.",
  },
  ORtg: {
    title: "Offensive rating",
    body: "Points produced per 100 possessions. Team or on-court context; higher means more efficient offense.",
  },
  DRtg: {
    title: "Defensive rating",
    body: "Points allowed per 100 possessions. Lower is better defense.",
  },
  NRtg: {
    title: "Net rating",
    body: "Offensive rating minus defensive rating — point margin per 100 possessions. Positive means outscoring opponents.",
  },
  PIE: {
    title: "Player impact estimate",
    body: "NBA Stats share of “stuff that happens” in a game (scoring, rebounding, playmaking, etc.). Average players sit near the team share of minutes.",
  },
  "AST%": {
    title: "Assist %",
    body: "Estimated share of teammate field goals a player assisted while on the floor. Measures playmaking load, not just raw assists.",
  },
  "TOV%": {
    title: "Turnover %",
    body: "Turnovers per 100 plays used. Lower is better; high-usage creators often run higher than spot-up players.",
  },
  "ORB%": {
    title: "Offensive rebound %",
    body: "Estimated share of available offensive rebounds grabbed while on the floor.",
  },
  "DRB%": {
    title: "Defensive rebound %",
    body: "Estimated share of available defensive rebounds grabbed while on the floor.",
  },
  "TRB%": {
    title: "Total rebound %",
    body: "Estimated share of all available rebounds grabbed while on the floor.",
  },
  "STL%": {
    title: "Steal %",
    body: "Estimated steals per 100 opponent possessions while on the floor.",
  },
  "BLK%": {
    title: "Block %",
    body: "Estimated share of opponent 2-point attempts blocked while on the floor.",
  },
  "3PAr": {
    title: "Three-point attempt rate",
    body: "Share of field goal attempts that are threes. Higher = more perimeter-oriented shot diet.",
  },
  FTr: {
    title: "Free throw rate",
    body: "Free throw attempts per field goal attempt. Higher means getting to the line more often.",
  },
  Pace: {
    title: "Pace",
    body: "Possessions per 48 minutes. Higher teams play faster; lower teams grind.",
  },
  "+/-": {
    title: "Plus/minus",
    body: "Point margin while the player (or team) is on the floor. Context-heavy — teammates and opponents matter a lot.",
  },
  "W%": {
    title: "Winning percentage",
    body: "Wins divided by games played.",
  },
  "PTS/36": {
    title: "Points per 36 minutes",
    body: "Scoring rate normalized to 36 minutes so different playing times compare more fairly.",
  },
  "AST/36": {
    title: "Assists per 36 minutes",
    body: "Assist rate normalized to 36 minutes.",
  },
  "REB/36": {
    title: "Rebounds per 36 minutes",
    body: "Rebound rate normalized to 36 minutes.",
  },
  "STL/36": {
    title: "Steals per 36 minutes",
    body: "Steal rate normalized to 36 minutes.",
  },
  "BLK/36": {
    title: "Blocks per 36 minutes",
    body: "Block rate normalized to 36 minutes.",
  },
};

/** Extra aliases → canonical glossary key. */
const ALIASES: Record<string, string> = {
  trueShootingPct: "TS%",
  effectiveFieldGoalPct: "eFG%",
  usagePct: "USG%",
  per: "PER",
  vorp: "VORP",
  dpm: "DPM",
  oDpm: "O-DPM",
  dDpm: "D-DPM",
  boxDpm: "Box DPM",
  onOffDpm: "On/Off DPM",
  drbl100: "DRBL/100",
  r1Points: "R1 Points",
  r1WinEquivalents: "R1 Win Equivalents",
  drblP: "DRBL-P",
  drblLn: "DRBL-LN",
  drblB: "DRBL-B",
  drblL: "DRBL-L",
  drblDisagreement: "DRBL Δ",
  drblO: "DRBL-O",
  drblD: "DRBL-D",
  drblSeasonalImpact: "DRBL impact",
  bpm: "BPM",
  obpm: "OBPM",
  dbpm: "DBPM",
  winShares: "WS",
  winSharesPer48: "WS/48",
  ows: "OWS",
  dws: "DWS",
  offensiveRating: "ORtg",
  defensiveRating: "DRtg",
  netRating: "NRtg",
  pie: "PIE",
  assistPct: "AST%",
  turnoverPct: "TOV%",
  offensiveReboundPct: "ORB%",
  defensiveReboundPct: "DRB%",
  reboundPct: "TRB%",
  stealPct: "STL%",
  blockPct: "BLK%",
  threePointAttemptRate: "3PAr",
  freeThrowRate: "FTr",
  pace: "Pace",
  plusMinus: "+/-",
  winPct: "W%",
  pointsPer36: "PTS/36",
  assistRate: "AST/36",
  reboundRate: "REB/36",
  stealRate: "STL/36",
  blockRate: "BLK/36",
  "Net rating": "NRtg",
  "Offensive rating": "ORtg",
  "Defensive rating": "DRtg",
  "True shooting": "TS%",
  "Win %": "W%",
};

export function getStatGlossaryEntry(
  keyOrLabel: string | null | undefined
): StatGlossaryEntry | null {
  if (!keyOrLabel) return null;
  const raw = keyOrLabel.trim();
  if (!raw) return null;
  const aliased = ALIASES[raw] ?? ALIASES[raw.toLowerCase()] ?? raw;
  return ENTRIES[aliased] ?? ENTRIES[raw] ?? null;
}

export function hasStatGlossary(keyOrLabel: string | null | undefined): boolean {
  return getStatGlossaryEntry(keyOrLabel) != null;
}
