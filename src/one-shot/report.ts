import { careerArc } from "./arcs";
import { badgeLabels, careerBadges } from "./badges";
import { challengeStatusLine } from "./challenges";
import { perGame } from "./career";
import { netWorth } from "./finance";
import { peerCompareLines } from "./peers";
import { highlightReel } from "./plot";
import type { LifeState } from "./types";
import { country, maybeLeague } from "./world";

export type OutcomeTier = "nba-career" | "nba-debut" | "drafted" | "top-pro" | "pro" | "semi-pro" | "youth";

export const TIER_LABEL: Record<OutcomeTier, string> = {
  "nba-career": "NBA career",
  "nba-debut": "Made the NBA",
  drafted: "Drafted, never debuted",
  "top-pro": "Top-level pro",
  pro: "Professional",
  "semi-pro": "Senior club player",
  youth: "Youth and school basketball",
};

/** Higher is better for daily ghost compare. */
export const TIER_RANK: Record<OutcomeTier, number> = {
  "nba-career": 6,
  "nba-debut": 5,
  drafted: 4,
  "top-pro": 3,
  pro: 2,
  "semi-pro": 1,
  youth: 0,
};

const PRO_NODES = new Set(["domestic-pro", "foreign-pro", "g-league", "nba"]);

export function outcomeTier(s: LifeState): OutcomeTier {
  if (s.achievements.nbaDebut !== null) return s.nbaGames >= 100 ? "nba-career" : "nba-debut";
  if (s.achievements.drafted) return "drafted";
  const pro = s.seasons.filter((x) => PRO_NODES.has(x.node));
  if (pro.some((x) => (maybeLeague(x.leagueId)?.model?.strength ?? 0) >= 68)) return "top-pro";
  if (pro.length) return "pro";
  if (s.seasons.some((x) => x.node === "local-senior" || x.node === "university")) return "semi-pro";
  return "youth";
}

export interface CareerSummary {
  runId: string;
  /** Unique id for the all-time board. A seed can be played more than once. */
  boardId?: string;
  seed: number;
  mode: LifeState["mode"];
  dailyDate: string | null;
  name: string;
  birthCountry: string;
  heightCm: number;
  tier: OutcomeTier;
  debutAge: number | null;
  draft: string | null;
  peak: string | null;
  endedAge: number;
  finishedAt: string;
  honors?: string | null;
  /** Career earnings before tax. Absent on lives saved before the board existed. */
  earnings?: number;
  netWorth?: number;
  after?: string | null;
  nbaGames?: number;
  /** Three letters the player put on the board. */
  tag?: string | null;
  unicorn?: boolean;
  /** Named career arc chip, when the life had a clear peak. */
  arc?: string | null;
  hometown?: string;
  /** A few punchy history lines for the museum wall. */
  highlights?: string[];
  challenge?: string | null;
  /** Named stamps (unicorn, rival, titles). Absent on older device saves. */
  badges?: string[];
}

export function medalCount(s: LifeState) {
  const m = { gold: 0, silver: 0, bronze: 0 };
  for (const t of s.international.tournaments) if (t.medal) m[t.medal]++;
  return m;
}

export const awardCount = (s: LifeState) => s.seasons.reduce((a, x) => a + (x.awards?.length ?? 0), 0);

/** NBA honors with counts, most frequent first: "2× NBA champion, NBA All-Star". Null when there are none. */
export function nbaHonorList(s: LifeState): string | null {
  const counts = new Map<string, number>();
  for (const x of s.seasons) if (x.node === "nba") for (const a of x.awards ?? []) counts.set(a, (counts.get(a) ?? 0) + 1);
  if (!counts.size) return null;
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => (n > 1 ? `${n}× ${k}` : k))
    .join(", ");
}

/** Short honors line: national team medals and caps, then season honors. Null when there are none. */
export function honorsLine(s: LifeState): string | null {
  const m = medalCount(s);
  const parts: string[] = [];
  const medals = (["gold", "silver", "bronze"] as const).filter((k) => m[k]).map((k) => `${m[k]} ${k}`);
  if (medals.length) parts.push(`${medals.join(", ")} with ${country(s.international.tournaments.at(-1)!.countryId).name}`);
  if (s.international.caps) parts.push(`${s.international.caps} caps`);
  const all = s.seasons.flatMap((x) => x.awards ?? []);
  const named = (name: string, label: string, plural = `${label}s`) => {
    const n = all.filter((x) => x === name).length;
    if (n) parts.push(n === 1 ? `${label}` : `${n}× ${plural}`);
    return n;
  };
  const shown = named("NBA champion", "NBA title", "NBA titles") + named("NBA Most Valuable Player", "MVP", "MVPs") + named("NBA All-Star", "All-Star", "All-Star");
  const a = awardCount(s) - shown;
  if (a) parts.push(`${a} ${shown ? "other " : ""}season honor${a === 1 ? "" : "s"}`);
  return parts.length ? parts.join(" · ") : null;
}

function newBoardId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  c?.getRandomValues?.(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function summarize(s: LifeState, finishedAt: string): CareerSummary {
  const best = [...s.seasons].filter((x) => x.gp >= 5).sort((a, b) => b.strength * 0.4 + perGame(b, "pts") - (a.strength * 0.4 + perGame(a, "pts")))[0];
  const arc = careerArc(s);
  return {
    runId: s.runId,
    boardId: newBoardId(),
    seed: s.seed,
    mode: s.mode,
    dailyDate: s.dailyDate,
    name: s.identity.displayName,
    birthCountry: s.birthplace.countryId,
    heightCm: Math.round(s.body.heightCm),
    tier: outcomeTier(s),
    debutAge: s.achievements.nbaDebut !== null ? Math.floor(s.achievements.nbaDebut / 12) : null,
    draft: s.achievements.drafted ? `Round ${s.achievements.drafted.round}, pick ${s.achievements.drafted.pick}` : null,
    peak: best ? `${perGame(best, "pts").toFixed(1)} pts in ${best.levelLabel} at ${best.ageYears}` : null,
    endedAge: Math.floor(s.ageMonths / 12),
    finishedAt,
    honors: honorsLine(s),
    earnings: Math.round(s.earnings),
    netWorth: Math.round(netWorth(s.finance)),
    after: s.after ? `${s.after.title}, ${s.after.employer}` : null,
    nbaGames: s.nbaGames,
    arc: arc.title,
    hometown: s.birthplace.locality,
    highlights: highlightReel(s, 4),
    challenge: challengeStatusLine(s),
    badges: badgeLabels(s),
    ...(s.unicorn ? { unicorn: true } : {}),
  };
}

/**
 * How this daily finish compares to other finishes of the same UTC day on this device.
 * Empty when the life is not daily.
 */
export function dailyGhostLines(careers: CareerSummary[], s: LifeState): string[] {
  if (s.mode !== "daily" || !s.dailyDate) return [];
  const myTier = outcomeTier(s);
  const myBadges = new Set(badgeLabels(s));
  const peers = careers.filter((c) => c.mode === "daily" && c.dailyDate === s.dailyDate && c.runId !== s.runId);
  if (!peers.length) return ["First finish of today’s daily on this device."];
  const better = peers.filter((c) => TIER_RANK[c.tier] > TIER_RANK[myTier]).length;
  const same = peers.filter((c) => c.tier === myTier).length;
  const worse = peers.length - better - same;
  const lines = [`${peers.length} other finish${peers.length === 1 ? "" : "es"} of today’s daily on this device.`];
  if (better === 0 && worse > 0) lines.push(`Your tier (${TIER_LABEL[myTier]}) leads the pack here.`);
  else if (better === 0 && same > 0) lines.push(`Tied at the top with ${same} other${same === 1 ? "" : "s"} at ${TIER_LABEL[myTier]}.`);
  else lines.push(`${better} finished higher, ${same} matched ${TIER_LABEL[myTier]}, ${worse} finished lower.`);
  const nba = peers.filter((c) => c.debutAge !== null).length + (s.achievements.nbaDebut !== null ? 1 : 0);
  if (nba) lines.push(`${nba} of ${peers.length + 1} made an NBA debut on this day’s birth.`);
  const uni = peers.filter((c) => c.unicorn || c.badges?.includes("Unicorn seed")).length + (s.unicorn ? 1 : 0);
  if (uni) lines.push(`${uni} of ${peers.length + 1} were unicorn seeds.`);
  const earnPeers = peers.filter((c) => typeof c.earnings === "number");
  if (earnPeers.length && typeof s.earnings === "number" && s.earnings > 0) {
    const richer = earnPeers.filter((c) => (c.earnings ?? 0) > s.earnings).length;
    if (richer === 0) lines.push("Highest pre-tax earnings among finishes of this daily so far.");
    else lines.push(`${richer} finish${richer === 1 ? "" : "es"} earned more pre-tax than you on this daily.`);
  }
  const rare = [...myBadges].filter((b) => b !== "Unicorn seed" && peers.every((c) => !(c.badges ?? []).includes(b)));
  if (rare[0]) lines.push(`Only you stamped “${rare[0]}” on this daily so far.`);
  return lines;
}

export function shareText(s: LifeState, origin = "https://drbl.io"): string {
  const tier = outcomeTier(s);
  const arc = careerArc(s);
  const born = country(s.birthplace.countryId).name;
  const lines = [`ONE SHOT · ${s.identity.displayName}${s.unicorn ? " · unicorn seed" : ""}`, `Born in ${born}. ${arc.title}.`];
  if (s.achievements.nbaDebut !== null) lines.push(`NBA debut at ${Math.floor(s.achievements.nbaDebut / 12)}.`);
  if (s.achievements.drafted) lines.push(`Drafted: round ${s.achievements.drafted.round}, pick ${s.achievements.drafted.pick}.`);
  const honors = honorsLine(s);
  if (honors) lines.push(`${honors}.`);
  const challenge = challengeStatusLine(s);
  if (challenge) lines.push(challenge);
  if (s.after) lines.push(`After playing: ${s.after.title}.`);
  const peer = peerCompareLines(s.peers, s.achievements.nbaDebut !== null, Boolean(s.achievements.drafted), s.achievements.drafted?.pick ?? null)[0];
  if (peer) lines.push(peer);
  const stamps = careerBadges(s)
    .slice(0, 4)
    .map((b) => b.label);
  if (stamps.length) lines.push(`Badges: ${stamps.join(" · ")}`);
  const route = [...new Set(s.seasons.filter((x) => x.ageYears >= 12).map((x) => x.levelLabel))].slice(-4).join(" → ");
  if (route) lines.push(route);
  lines.push(`${origin}/arcade/one-shot${s.mode === "daily" ? "?daily=1" : `?seed=${s.seed}&draw=${s.draw}`}`);
  return lines.join("\n");
}