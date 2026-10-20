/**
 * Which home surface Franchise Lab should show.
 * Regular season keeps the calendar. After tip-out, the page walks awards →
 * play-in/bracket → champion splash → summer hub.
 */

import type { GmLeagueState, GmPlayoffSeries } from "@/gm/types";

export type GmHomeStage =
  | "regular"
  | "awards"
  | "play_in"
  | "playoffs"
  | "champion"
  | "draft"
  | "free_agency"
  | "offseason";

export function finalsSeries(league: GmLeagueState): GmPlayoffSeries | undefined {
  return league.playoffBracket?.find((series) => series.conf === "Finals");
}

export function finalsComplete(league: GmLeagueState): boolean {
  const finals = finalsSeries(league);
  return Boolean(finals?.done && finals.winnerId);
}

export function resolveHomeStage(league: GmLeagueState): GmHomeStage {
  const flow = league.homeFlow ?? {};
  const awardsReady =
    league.awards?.season === league.season &&
    (league.awards.races?.length ?? 0) > 0;

  if (league.phase === "regular") return "regular";

  if (awardsReady && !flow.awardsSeen) return "awards";

  if (league.phase === "play_in") return "play_in";

  if (league.phase === "playoffs") {
    if ((league.champion || finalsComplete(league)) && !flow.championSeen) {
      return "champion";
    }
    if ((league.champion || finalsComplete(league)) && flow.championSeen) {
      return "draft";
    }
    return "playoffs";
  }

  if (league.phase === "draft") return "draft";
  if (league.phase === "free_agency") return "free_agency";
  if (league.phase === "offseason") return "offseason";

  return "regular";
}

export function homeStageLabel(stage: GmHomeStage): string {
  switch (stage) {
    case "regular":
      return "Regular season";
    case "awards":
      return "Season awards";
    case "play_in":
      return "Play-in";
    case "playoffs":
      return "Playoffs";
    case "champion":
      return "Champions";
    case "draft":
      return "Draft night";
    case "free_agency":
      return "Free agency";
    case "offseason":
      return "Offseason";
  }
}
