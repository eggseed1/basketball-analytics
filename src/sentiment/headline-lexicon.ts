/**
 * Headline tone scorer (rss_headline_lexicon_v1).
 *
 * AFINN-165 word valences plus basketball overrides, with simple negation.
 * Unevaluated against the S0 gates (500 labeled mentions, F1 ≥ 0.75), so
 * every surface that shows these scores must say so.
 */

import { afinn165 } from "afinn-165";

export const HEADLINE_LEXICON_VERSION = "headline-lexicon-v1.2";

/**
 * Words whose everyday valence is wrong in NBA coverage, or that AFINN lacks.
 * "shot", "attack", "kill", "steal", "block" are game vocabulary, not tone.
 */
const BASKETBALL_OVERRIDES: Record<string, number> = {
  // game vocabulary AFINN misreads
  shot: 0,
  shots: 0,
  shoot: 0,
  shooting: 0,
  attack: 0,
  attacks: 0,
  offense: 0,
  offensive: 0,
  steal: 0,
  steals: 0,
  stole: 0,
  stolen: 0,
  block: 0,
  blocks: 0,
  blocked: 0,
  foul: 0,
  fouls: 0,
  charge: 0,
  charges: 0,
  kill: 0,
  killer: 0,
  miss: -1,
  misses: -1,
  missed: -1,
  pick: 0,
  picks: 0,
  free: 0,
  fire: 0,
  hot: 1,
  cold: -1,
  nasty: 0,
  fan: 0,
  fans: 0,
  fine: 0,
  big: 0,
  top: 0,
  mock: 0,
  grand: 0,
  winning: 2,
  focused: 1,
  poised: 1,
  contender: 1,
  contenders: 1,
  // common first names / surnames that AFINN scores
  rob: 0,
  victor: 0,
  moody: 0,
  love: 1,
  joy: 0,
  united: 0,
  // availability
  injury: -2,
  injuries: -2,
  injured: -2,
  surgery: -2,
  torn: -3,
  tear: -2,
  sprain: -2,
  sprained: -2,
  strain: -2,
  strained: -2,
  fracture: -3,
  fractured: -3,
  soreness: -1,
  sidelined: -2,
  setback: -2,
  "day-to-day": -1,
  questionable: -1,
  doubtful: -2,
  cleared: 2,
  healthy: 2,
  return: 1,
  returns: 1,
  returning: 1,
  // transactions
  waive: -2,
  waives: -2,
  waived: -2,
  release: -1,
  releases: -1,
  released: -1,
  cut: -1,
  cuts: -1,
  extension: 2,
  extend: 1,
  extends: 1,
  "re-sign": 2,
  "re-signs": 2,
  "re-signed": 2,
  signs: 1,
  signed: 1,
  agree: 1,
  agrees: 1,
  // conduct
  suspended: -3,
  suspension: -3,
  fined: -2,
  arrested: -3,
  ejected: -2,
  technical: -1,
  punch: -2,
  punches: -2,
  punched: -2,
  punching: -2,
  // criticism AFINN lacks
  ripped: -2,
  rips: -2,
  shortcomings: -2,
  // performance
  mvp: 2,
  "all-star": 2,
  "career-high": 3,
  "triple-double": 2,
  breakout: 2,
  dominant: 3,
  dominates: 3,
  dominated: 2,
  clutch: 2,
  elite: 2,
  // "Heat star Bam Adebayo" is a job title, not praise
  star: 0,
  superstar: 2,
  undisputed: 1,
  rookie: 0,
  slump: -2,
  struggles: -2,
  struggling: -2,
  benched: -2,
  overrated: -2,
  underrated: 1,
  bust: -3,
  wins: 2,
  win: 2,
  beat: 1,
  beats: 1,
  loss: -1,
  losses: -1,
  lose: -1,
  loses: -1,
  // league chatter that is neutral in headlines
  trade: 0,
  traded: 0,
  rumors: 0,
  camp: 0,
  training: 0,
  deal: 0,
  exhibit: 0,
  "two-way": 0,
  // headline framing that carries no tone toward the player
  exclusive: 0,
  interesting: 0,
  admits: 0,
  admitted: 0,
  feeling: 0,
  hope: 0,
  hopes: 0,
  joke: 0,
  jokes: 0,
  joked: 0,
  crazy: 0,
  battle: 0,
  battles: 0,
  fun: 1,
};

/** Phrases whose words mislead on their own. Matched before tokenizing. */
const HEADLINE_PHRASES: { pattern: RegExp; valence: number; hit: string }[] = [
  { pattern: /\blaugh(?:ed|s|ing)? at\b/g, valence: -2, hit: "laughed-at" },
  { pattern: /\blaughing ?stock\b/g, valence: -3, hit: "laughingstock" },
  { pattern: /\bnot close\b/g, valence: -2, hit: "not-close" },
];

const NEGATORS = new Set([
  "not",
  "no",
  "never",
  "without",
  "isn't",
  "aren't",
  "wasn't",
  "won't",
  "doesn't",
  "don't",
  "didn't",
  "can't",
  "cannot",
]);

export const FAN_LEXICON_VERSION = "fan-lexicon-v1.2";

/**
 * Fan chatter on top of the headline list. Hype words AFINN reads as negative
 * ("insane dunk", "sick pass") go to 0, profanity used as an intensifier
 * ("fucking awesome") carries no tone of its own, laughter is too often
 * mockery to count, and common fan insults get a score.
 */
const FAN_OVERRIDES: Record<string, number> = {
  insane: 0,
  crazy: 0,
  sick: 0,
  ridiculous: 0,
  damn: 0,
  filthy: 0,
  lol: 0,
  lmao: 0,
  haha: 0,
  fucking: 0,
  fuckin: 0,
  tough: 0,
  hard: 0,
  washed: -2,
  frauds: -2,
  bum: -2,
  bums: -2,
  trash: -2,
  garbage: -2,
  mid: -1,
  goat: 2,
  hooping: 2,
};

function valence(token: string, extra?: Record<string, number>): number {
  if (extra && token in extra) return extra[token]!;
  if (token in BASKETBALL_OVERRIDES) return BASKETBALL_OVERRIDES[token]!;
  const base = (afinn165 as Record<string, number>)[token];
  return typeof base === "number" ? base : 0;
}

export function tokenizeHeadline(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9'\-\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^['\-]+|['\-]+$/g, ""))
    .filter(Boolean);
}

export type HeadlineTone = {
  /** −1..1 (tanh-squashed valence sum). */
  score: number;
  /** Raw valence sum before squashing. */
  raw: number;
  /** Tokens that carried valence, for exemplar debugging. */
  hits: string[];
};

function maskPhrases(text: string, phrases: string[]): string {
  let out = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const phrase of phrases) {
    const folded = phrase.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    out = out.replace(
      new RegExp(folded.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
      " "
    );
  }
  return out;
}

/**
 * Negation flips the next two scored tokens. Title counts fully, lede at half
 * weight. `maskNames` removes resolved player names so "Rob" or "Love" in a
 * name carries no tone.
 */
export function scoreHeadline(
  title: string,
  lede = "",
  maskNames: string[] = [],
  extra?: Record<string, number>
): HeadlineTone {
  const hits: string[] = [];
  const scorePart = (input: string, weight: number) => {
    let text = (maskNames.length ? maskPhrases(input, maskNames) : input)
      .toLowerCase()
      .replace(/[’‘]/g, "'");
    let sum = 0;
    for (const phrase of HEADLINE_PHRASES) {
      text = text.replace(phrase.pattern, () => {
        sum += phrase.valence * weight;
        hits.push(`${phrase.hit}${phrase.valence}`);
        return " ";
      });
    }
    let negateLeft = 0;
    for (const token of tokenizeHeadline(text)) {
      if (NEGATORS.has(token)) {
        negateLeft = 2;
        continue;
      }
      const v = valence(token, extra);
      if (v !== 0) {
        const signed = negateLeft > 0 ? -v : v;
        sum += signed * weight;
        hits.push(`${token}${signed >= 0 ? "+" : ""}${signed}`);
      }
      if (negateLeft > 0) negateLeft -= 1;
    }
    return sum;
  };
  const raw = scorePart(title, 1) + scorePart(lede, 0.5);
  const score = Math.round(Math.tanh(raw / 4) * 100) / 100;
  return { score, raw, hits };
}

/** Tone of a fan post or comment: headline scoring plus fan chatter. */
export function scoreFanText(text: string, maskNames: string[] = []): HeadlineTone {
  return scoreHeadline(text, "", maskNames, FAN_OVERRIDES);
}

const TOPIC_RULES: { topic: string; pattern: RegExp }[] = [
  {
    topic: "availability",
    pattern:
      /\b(injur\w*|surgery|torn|tear|sprain\w*|strain\w*|fractur\w*|sidelined|out for|ruled out|day-to-day|questionable|doubtful|soreness|setback)\b/i,
  },
  { topic: "injury_return", pattern: /\b(return\w*|cleared|back in|healthy)\b/i },
  { topic: "extension", pattern: /\b(extension|extend\w*|re-sign\w*)\b/i },
  {
    topic: "contract",
    pattern:
      /\b(sign\w*|contract|deal|waive\w*|release\w*|two-way|exhibit 10|max|salary|free agen\w*)\b/i,
  },
  { topic: "trade_rumors", pattern: /\b(trade\w*|rumor\w*|deadline|acquire\w*|swap)\b/i },
  { topic: "mvp_case", pattern: /\b(mvp|award|all-nba|all-star)\b/i },
  { topic: "title_odds", pattern: /\b(title|championship|contender\w*|odds|favorite\w*)\b/i },
  { topic: "role_debate", pattern: /\b(role|starting|starter|bench\w*|rotation|minutes)\b/i },
  { topic: "scoring", pattern: /\b(points|scor\w*|career-high|triple-double|shoot\w*)\b/i },
  { topic: "defense", pattern: /\b(defen\w*|dpoy|rim protect\w*)\b/i },
  { topic: "training_camp", pattern: /\b(camp|preseason|media day)\b/i },
  { topic: "conduct", pattern: /\b(suspend\w*|fined|arrest\w*|ejected|lawsuit|investigation)\b/i },
];

const OTHER_SPORTS =
  /\b(NFL|MLB|NHL|WNBA|NCAA|college|quarterback|QB|touchdown|Yankees|Giants|Bears|Hawkeyes|Ole Miss|golf|soccer)\b/i;

/** True when the item reads as NBA coverage (an NBA entity or "NBA" itself, no other sport). */
export function isNbaHeadline(title: string, hasEntity: boolean): boolean {
  if (OTHER_SPORTS.test(title)) return false;
  return hasEntity || /\bNBA\b/.test(title);
}

export function tagHeadlineTopics(title: string, lede = ""): string[] {
  const text = `${title} ${lede}`;
  const tags = TOPIC_RULES.filter((rule) => rule.pattern.test(text)).map(
    (rule) => rule.topic
  );
  return tags.length ? tags : ["general"];
}
