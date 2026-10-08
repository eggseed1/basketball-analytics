import { perGame } from "./career";
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
  };
}

export function shareText(s: LifeState, origin = "https://drbl.io"): string {
  const tier = outcomeTier(s);
  const born = country(s.birthplace.countryId).name;
  const lines = [
    `ONE SHOT · ${s.identity.displayName}`,
    `Born in ${born}. ${TIER_LABEL[tier]}.`,
  ];
  if (s.achievements.nbaDebut !== null) lines.push(`NBA debut at ${Math.floor(s.achievements.nbaDebut / 12)}.`);
  if (s.achievements.drafted) lines.push(`Drafted: round ${s.achievements.drafted.round}, pick ${s.achievements.drafted.pick}.`);
  const route = [...new Set(s.seasons.filter((x) => x.ageYears >= 12).map((x) => x.levelLabel))].slice(-4).join(" → ");
  if (route) lines.push(route);
  lines.push(`${origin}/arcade/one-shot${s.mode === "daily" ? "?daily=1" : `?seed=${s.seed}&draw=${s.draw}`}`);
  return lines.join("\n");
}
