/**
 * Detect query dimensions ASK DRBL cannot execute yet.
 * Prefer explicit unsupported over silent simplification.
 */

export type UnsupportedHit = {
  clause: string;
  reason: string;
};

const PATTERNS: Array<{ re: RegExp; clause: string; reason: string }> = [
  {
    re: /\b(college\s+three|college\s+3|shot\s+zone|inside\s+the\s+(arc|paint)|at\s+the\s+rim|mid[- ]?range|corner\s+three|shot\s+map)\b/i,
    clause: "shot zone / location filter",
    reason:
      "This question requires possession-level play-by-play and shot-location data that is not currently available to ASK DRBL.",
  },
  {
    re: /\b(less\s+than\s+\d+\s+minutes?|under\s+\d+:\d+|game\s+clock|with\s+<\s*\d+|clutch\s+possession|final\s+\d+\s+minutes?)\b/i,
    clause: "game-clock filter",
    reason:
      "This question requires possession-level play-by-play with game-clock filters that ASK DRBL does not currently have.",
  },
  {
    re: /\b(fourth\s+quarter|4th\s+quarter|q[1-4]\b).{0,40}\b(minutes?|clock|left)\b/i,
    clause: "period + clock filter",
    reason:
      "Period-and-clock filters need play-by-play data that is not currently available to ASK DRBL.",
  },
  {
    re: /\b(possession|play[- ]?type|pick\s+and\s+roll|isolation|post[- ]?up|off[- ]?ball|screening|catch\s+and\s+shoot)\b/i,
    clause: "possession / play-type analysis",
    reason:
      "Possession and play-type analysis requires PBP infrastructure that is not currently available to ASK DRBL.",
  },
  {
    re: /\b(lineup|five[- ]?man|on[\s/-]?off|plus[- ]?minus\s+lineup|net\s+rating\s+lineup)\b/i,
    clause: "lineup combination",
    reason:
      "Lineup nets require lineup-tagged play-by-play that ASK DRBL does not currently have.",
  },
  {
    re: /\b(defender|matchup|guarded\s+by|vs\.?\s+defense)\b/i,
    clause: "defender / matchup context",
    reason:
      "Defender and matchup filters require tracking/PBP data that is not currently available.",
  },
  {
    re: /\b(shot\s+quality|contest(ed)?\s+shot|expected\s+fg|qsq)\b/i,
    clause: "shot quality",
    reason:
      "Shot-quality metrics require tracking data that ASK DRBL does not currently have.",
  },
  {
    re: /\b(drbl\s+value|off[- ]?ball\s+value|behavioral\s+analysis|possession\s+value)\b/i,
    clause: "DRBL value decomposition",
    reason:
      "DRBL possession/behavior value is not available on this branch yet.",
  },
  {
    re: /\b(how\s+did\s+.+\s+end\s+up\s+with|trade\s+tree|draft\s+rights\s+chain|asset\s+genealogy|ownership\s+graph)\b/i,
    clause: "transaction genealogy",
    reason:
      "Structured player/pick ownership genealogy is not available yet - ASK DRBL will not invent it from free-text transaction blurbs.",
  },
];

export function detectUnsupportedClauses(text: string): UnsupportedHit[] {
  const hits: UnsupportedHit[] = [];
  const seen = new Set<string>();
  for (const p of PATTERNS) {
    if (p.re.test(text) && !seen.has(p.clause)) {
      seen.add(p.clause);
      hits.push({ clause: p.clause, reason: p.reason });
    }
  }
  return hits;
}
