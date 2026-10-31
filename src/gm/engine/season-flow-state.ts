import type { GmLeagueSettings, GmLeagueState, GmOffseasonStage, GmSeasonFlow } from "@/gm/types";
import { getCbaRules } from "@/gm/myleague/cba-registry";

export const OFFSEASON_STAGES: ReadonlyArray<{ id: GmOffseasonStage; label: string; period: string; description: string }> = [
  { id: "review", label: "Season review", period: "After the Finals", description: "Review the season and set your priorities for the summer." },
  { id: "staff", label: "Staff review", period: "Early summer", description: "Review expiring staff contracts before scouting and development." },
  { id: "lottery", label: "Draft lottery", period: "Draft preparation", description: "Reveal the order and see the picks your club controls." },
  { id: "scouting", label: "Combine and workouts", period: "Before the draft", description: "Use combine results and scouting looks to narrow your board." },
  { id: "draft", label: "NBA draft", period: "Draft night", description: "Make your selections or delegate the remaining picks." },
  { id: "rookie_signing", label: "Rookie contracts", period: "After the draft", description: "Sign your picks at scale or release their unsigned rights." },
  { id: "free_agency", label: "Contracts and free agency", period: "June and July", description: "Options, qualifying offers, re-signing, negotiations, then signed contracts." },
  { id: "progression", label: "Player progression", period: "Summer development", description: "Review annual development after roster building." },
  { id: "summer_league", label: "Summer league", period: "July", description: "Evaluate young players in three prospect scrimmages, separate from season statistics." },
  { id: "training_camp", label: "Training camp", period: "September", description: "Assign focused camps and review the results." },
  { id: "roster_check", label: "Opening-night roster", period: "Before tip-off", description: "Meet roster limits and review the rotation before the new schedule starts." },
];

export function cbaSeason(league: GmLeagueState): number { return league.financialSeason ?? league.season; }

export function financialSettings(season: number, previous: GmLeagueSettings): GmLeagueSettings {
  const rules = getCbaRules(season);
  return { ...previous, salaryCapM: rules.salaryCapM || previous.salaryCapM,
    luxuryTaxM: rules.luxuryTaxM || previous.luxuryTaxM,
    firstApronM: rules.firstApronM ?? previous.firstApronM, secondApronM: rules.secondApronM ?? previous.secondApronM,
    maxRoster: rules.maxRoster || previous.maxRoster, minRoster: rules.minRoster || previous.minRoster };
}

export function offseasonRosterLimit(league: GmLeagueState): number {
  return ["draft", "free_agency", "offseason"].includes(league.phase) ? Math.max(league.settings.maxRoster, cbaSeason(league) >= 2024 ? 21 : 20) : league.settings.maxRoster;
}

/** Older saves resume at their real desk without replaying completed aging. */
export function normalizeSeasonFlow(league: GmLeagueState): GmLeagueState {
  if (league.seasonFlow?.version === 1 && league.seasonFlow.season === league.season) return league;
  const beforeDraft: GmOffseasonStage[] = ["review", "staff", "lottery", "scouting"];
  let flow: GmSeasonFlow = { version: 1, season: league.season, completed: [] };
  if (league.phase === "free_agency") flow = { ...flow, stage: "free_agency", completed: [...beforeDraft, "draft", "rookie_signing"], contractsRolled: true, progressionApplied: true, staffAged: true };
  else if (league.phase === "draft") flow = { ...flow, stage: "draft", completed: beforeDraft };
  else if (league.phase === "offseason") flow = { ...flow, stage: "review" };
  return { ...league, seasonFlow: flow };
}

export function flowOf(league: GmLeagueState): GmSeasonFlow { return normalizeSeasonFlow(league).seasonFlow!; }
