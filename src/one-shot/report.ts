import { perGame } from "./career";
import { netWorth } from "./finance";
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
  netWorth?: number;
  after?: string | null;
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

export function summarize(s: LifeState, finishedAt: string): CareerSummary {
  const best = [...s.seasons].filter((x) => x.gp >= 5).sort((a, b) => b.strength * 0.4 + perGame(b, "pts") - (a.strength * 0.4 + perGame(a, "pts")))[0];
  return {
    runId: s.runId,
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
    netWorth: Math.round(netWorth(s.finance)),
    after: s.after ? `${s.after.title}, ${s.after.employer}` : null,
  };
}

export function shareText(s: LifeState, origin = "https://drbl.io"): string {
  const tier = outcomeTier(s);
  const born = country(s.birthplace.countryId).name;
  const lines = [`ONE SHOT · ${s.identity.displayName}`, `Born in ${born}. ${TIER_LABEL[tier]}.`];
  if (s.achievements.nbaDebut !== null) lines.push(`NBA debut at ${Math.floor(s.achievements.nbaDebut / 12)}.`);
  if (s.achievements.drafted) lines.push(`Drafted: round ${s.achievements.drafted.round}, pick ${s.achievements.drafted.pick}.`);
  const honors = honorsLine(s);
  if (honors) lines.push(`${honors}.`);
  if (s.after) lines.push(`After playing: ${s.after.title}.`);
  const route = [...new Set(s.seasons.filter((x) => x.ageYears >= 12).map((x) => x.levelLabel))].slice(-4).join(" → ");
  if (route) lines.push(route);
  lines.push(`${origin}/arcade/one-shot${s.mode === "daily" ? "?daily=1" : `?seed=${s.seed}&draw=${s.draw}`}`);
  return lines.join("\n");
}
