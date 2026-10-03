/**
 * Rule-based movement classifier for publisher headlines (methodology
 * movement-rules-v1). Works on the headline plus attribution metadata only;
 * summary text is never stored (sentiment S0 news policy).
 *
 * Returns null for anything that is not a claim about where a player might
 * move or sign: completed minor moves (the transaction ledger covers those),
 * grades and columns, retrospectives about finished trades, and off-court
 * business stories.
 */

import type {
  MovementClaim,
  MovementClaimType,
  MovementEvidenceClass,
  MovementProvenanceKind,
} from "@/movement-center/types";
import type { ReporterMention } from "@/movement-center/reporters";

export const MOVEMENT_RULES_VERSION = "movement-rules-v1";

export type MovementFamily = "trade" | "contract";

export type MovementHeadlineClass = {
  claimType: MovementClaimType;
  family: MovementFamily;
  evidenceClass: Exclude<MovementEvidenceClass, "speculative">;
  provenanceKind: MovementProvenanceKind;
  negotiationSpecificity?: MovementClaim["negotiationSpecificity"];
  denial: boolean;
  agreement: boolean;
};

export type MovementHeadlineInput = {
  title: string;
  outlet: string;
  reporters?: ReporterMention[];
};

const RETROSPECTIVE =
  /\b(post|following|after|since)\b[^:]{0,40}\btrade\b|\b(made (the )?most sense|had options|why (he|i) (chose|signed|picked))\b/i;
const ANALYSIS =
  /\b(grades?|grading|ranked|rankings?|winners and losers|takeaways|what we learned|mock|re-?draft|best and worst|biggest questions?|breakdown|explained|explainer)\b/i;
const MINOR_MOVE =
  /\b(exhibit 10|two-way|camp (deals?|contracts?)|10-day|summer league|waives?|waived|releases?|released|buyout)\b/i;
const OFF_COURT =
  /\b(endorsement|polymarket|sneaker|shoe deal|jersey|governor|ownership|owners?|expansion|media rights|suspension|suspended|fined|lawsuit|investigation|auction|stock|cards?|memorabilia|sells for|sold for)\b/i;
const OTHER_LEAGUE =
  /\b(CBA|EuroLeague|Chinese Basketball|overseas|G League|WNBA|Sharks|Real Madrid|Fenerbahce)\b/;
const SPECULATION =
  /^(if|should|could|would|what if|why|how|who|which|is it time|time for|ranking)\b|\?\s*$|\b(should|could|would|might|consider|predict\w*|ideal|hypothetical|trade ideas?|proposals?|landing spots?|candidates?|next member)\b/i;

const TRADE_REQUEST = /\b(requests?|requested|demands?|wants?)\s+(a\s+)?trade\b|\bwants out\b/i;
const EXTENSION =
  /\bextensions?\b|\bextend(s|ed|ing)?\b|\bre-sign\w*\b|\blong-term (contract|deal)\b|\b(contract|deal) (talks|negotiations?|standoff|stalemate|dispute)\b|\bcontract (stalemate|standoff)\b/i;
const TRADE =
  /\btrade[sd]?\b|\btrading\b|\bdeal for\b|\bacquir(e|es|ed|ing)\b|\bswap\b|\bshop(ping)?\b|\bon the (trade )?market\b|\bavailable\b|\bpursu(e|es|ing|it)\b|\btarget(s|ing)?\b|\binterest(ed)? in\b|\blinked to\b/i;
const FREE_AGENCY =
  /\bfree agen(t|cy)\b|\bmeet(s|ing)? with\b|\bvisit(s|ing)?\b|\bhas interest\b|\binterest from\b/i;
const CONTRACT = /\bcontract\b|\boffer\b/i;
const DONE_SIGNING = /\bsigns?\b|\bsigned\b/i;

const REPORTING_CUE =
  /^sources?:|\bsources?\b|\breported(ly)?\b|\breports?\b|\bper\b|\baccording to\b|\bexpected to\b|\bagree(s|d)?\b|\bintends?\b|\bplans? to\b/i;
const ON_RECORD =
  /['‘’"“”]|\b(says|said|explains|admits|calls|declares|confirms|announces?|tells|leaves no doubt)\b/i;
const RUMOR_CUE = /\brumou?rs?\b|\binterest(ed)?\b|\bmonitor\w*\b|\blinked\b|\bexplor\w*\b|\bgaug\w*\b|\bhoping\b/i;

const DENIAL =
  /\b(den(y|ies|ied)|no truth|not (trading|shopping|interested)|won'?t (trade|be traded)|shoots? down|refutes?|no plans to (trade|move))\b/i;
const AGREEMENT = /\bagree(s|d)?\b|\bagreement\b|\bfinaliz\w*\b|\bdeal (is )?done\b/i;
const NO_TALKS =
  /\b(haven'?t|hasn'?t|no|not|wait\w*|won'?t|until)\b[^.]{0,40}\b(talks|engaged|negotiat\w*)\b/i;

function negotiationLevel(title: string, agreement: boolean): MovementHeadlineClass["negotiationSpecificity"] {
  if (agreement) return "offer";
  if (NO_TALKS.test(title)) return undefined;
  if (/\boffers?\b|\boffered\b/i.test(title)) return "offer";
  if (/\b(talks|negotiat\w*|standoff|stalemate|stalled|discussions?|engaged)\b/i.test(title)) {
    return "active_talks";
  }
  if (/\b(framework|close to|nearing|closer to|hoping for|apart)\b/i.test(title)) return "framework";
  if (/\b(interest\w*|inquir\w*|called|monitor\w*|eye(s|ing)?|gaug\w*)\b/i.test(title)) {
    return "contact";
  }
  return undefined;
}

function claimTypeFor(title: string): MovementClaimType | null {
  if (TRADE_REQUEST.test(title)) return "trade_request";
  if (EXTENSION.test(title)) return "extension_talks";
  if (TRADE.test(title)) return "trade_interest";
  if (FREE_AGENCY.test(title)) return "free_agent_interest";
  if (CONTRACT.test(title)) return "contract_movement";
  return null;
}

function familyFor(type: MovementClaimType): MovementFamily {
  return type === "trade_interest" || type === "trade_request" || type === "availability"
    ? "trade"
    : "contract";
}

function provenanceFor(
  input: MovementHeadlineInput,
  onRecord: boolean,
  reported: boolean
): MovementProvenanceKind {
  const reporters = input.reporters ?? [];
  if (/^sources?:/i.test(input.title)) return "original_report";
  if (reporters.some((r) => r.outlet && r.outlet === input.outlet)) return "original_report";
  if (reporters.length) return "cites_report";
  if (onRecord && !/\bsources?\b|\breported(ly)?\b/i.test(input.title)) return "official_statement";
  if (input.outlet === "RealGM") return "aggregation";
  return reported ? "cites_report" : "aggregation";
}

export function classifyMovementHeadline(
  input: MovementHeadlineInput
): MovementHeadlineClass | null {
  const title = input.title.trim();
  if (!title) return null;
  if (RETROSPECTIVE.test(title) || ANALYSIS.test(title)) return null;
  if (OFF_COURT.test(title) || OTHER_LEAGUE.test(title)) return null;
  if (MINOR_MOVE.test(title) && !/\b(extension|trade)\b/i.test(title)) return null;

  const claimType = claimTypeFor(title);
  if (!claimType) return null;
  if (claimType === "contract_movement" && DONE_SIGNING.test(title) && !AGREEMENT.test(title)) {
    return null;
  }

  const hasReporters = (input.reporters ?? []).length > 0;
  const reported = REPORTING_CUE.test(title) || hasReporters;
  const onRecord = ON_RECORD.test(title) || DENIAL.test(title);
  if (SPECULATION.test(title) && !reported) return null;

  let evidenceClass: MovementHeadlineClass["evidenceClass"];
  if (reported || onRecord || input.outlet === "RealGM") evidenceClass = "reported";
  else if (RUMOR_CUE.test(title)) evidenceClass = "rumored";
  else return null;

  const agreement = AGREEMENT.test(title);
  return {
    claimType,
    family: familyFor(claimType),
    evidenceClass,
    provenanceKind: provenanceFor(input, onRecord, reported),
    negotiationSpecificity: negotiationLevel(title, agreement),
    denial: DENIAL.test(title),
    agreement,
  };
}
