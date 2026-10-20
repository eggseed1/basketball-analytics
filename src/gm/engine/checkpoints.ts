/**
 * Pause the sim on big team-building dates so the user can trade or resign
 * before the window closes.
 */

import { allStarBreak } from "@/gm/engine/allstar";
import { noteTradeDeadline } from "@/gm/engine/offseason";
import { tradeDeadlineDay } from "@/gm/engine/schedule";
import type { GmLeagueState, GmTeamBuildingCheckpoint } from "@/gm/types";

function seen(league: GmLeagueState, id: string): boolean {
  return (league.seenCheckpoints ?? []).includes(id);
}

function markSeen(league: GmLeagueState, id: string): GmLeagueState {
  if (seen(league, id)) return league;
  return {
    ...league,
    seenCheckpoints: [...(league.seenCheckpoints ?? []), id].slice(-20),
  };
}

function dayForDate(league: GmLeagueState, date: string): number | null {
  const onDate = league.schedule.find((game) => game.gameDate === date);
  if (onDate) return onDate.day;
  const next = league.schedule
    .filter((game) => (game.gameDate ?? "") >= date)
    .sort((a, b) => (a.gameDate ?? "").localeCompare(b.gameDate ?? ""))[0];
  return next?.day ?? null;
}

function tradeDeadlineCheckpoint(league: GmLeagueState): GmTeamBuildingCheckpoint | null {
  if (league.tradeDeadlinePassed || seen(league, "trade_deadline")) return null;
  const deadline = league.schedule?.length
    ? Math.max(tradeDeadlineDay(league.schedule), 100)
    : 110;
  // Eve of the deadline, or the morning of if a skip landed on it.
  if (league.day < deadline - 1) return null;
  const eve = league.day < deadline;
  return {
    id: "trade_deadline",
    kind: "trade_deadline",
    day: league.day,
    title: eve ? "Trade deadline is tomorrow" : "Trade deadline day",
    body: eve
      ? "Last full day to deal. Stay here to shop the board, or keep going and the window closes on schedule."
      : "Rosters lock after you move on. Stay to make a trade, or continue and close the market.",
    primaryHref: "/gm/trade",
    primaryLabel: "Go to trades",
    secondaryHref: "/gm/roster",
    secondaryLabel: "Review roster",
  };
}

function allStarCheckpoint(league: GmLeagueState): GmTeamBuildingCheckpoint | null {
  if (seen(league, "all_star_break")) return null;
  const brk = allStarBreak(league.schedule);
  if (!brk) return null;
  const startDay = dayForDate(league, brk.start);
  if (startDay == null) return null;
  if (league.day < startDay || league.day > startDay + 1) return null;
  return {
    id: "all_star_break",
    kind: "all_star_break",
    day: league.day,
    title: "All-Star break",
    body: league.tradeDeadlinePassed
      ? "A few quiet days. Good time to rework the rotation before the stretch run."
      : "A few quiet days. Good time to make a trade or rework the rotation before the stretch run.",
    primaryHref: league.tradeDeadlinePassed ? "/gm/lineup" : "/gm/trade",
    primaryLabel: league.tradeDeadlinePassed ? "Set coaching" : "Go to trades",
    secondaryHref: league.tradeDeadlinePassed ? "/gm/roster" : "/gm/lineup",
    secondaryLabel: league.tradeDeadlinePassed ? "Review roster" : "Set coaching",
  };
}

function seasonEndCheckpoint(league: GmLeagueState): GmTeamBuildingCheckpoint | null {
  if (seen(league, "season_end") || league.phase !== "regular") return null;
  const left = league.schedule.filter((game) => !game.played && !game.exhibition).length;
  if (left > 0) return null;
  return {
    id: "season_end",
    kind: "season_end",
    day: league.day,
    title: "Regular season is over",
    body: "Playoffs are next. Take a last look at the roster and rotations, or continue into the postseason.",
    primaryHref: "/gm/roster",
    primaryLabel: "Review roster",
    secondaryHref: "/gm/lineup",
    secondaryLabel: "Set coaching",
  };
}

function freeAgencyCheckpoint(league: GmLeagueState): GmTeamBuildingCheckpoint | null {
  if (seen(league, "free_agency") || league.phase !== "free_agency") return null;
  if (!league.faMarket || league.faMarket.done) return null;
  if (league.faMarket.day > 0) return null;
  return {
    id: "free_agency",
    kind: "free_agency",
    day: league.day,
    title: "Free agency is open",
    body: "Bring back your own free agents, or pitch on the open market. Stay to resign and sign, or keep the summer clock running.",
    primaryHref: "/gm/free-agency",
    primaryLabel: "Open free agency",
    secondaryHref: "/gm/roster",
    secondaryLabel: "Review roster",
  };
}

function activeCheckpoint(league: GmLeagueState): GmTeamBuildingCheckpoint | null {
  return (
    tradeDeadlineCheckpoint(league) ??
    allStarCheckpoint(league) ??
    seasonEndCheckpoint(league) ??
    freeAgencyCheckpoint(league)
  );
}

/** Attach a team-building pause when the calendar hits a key date. */
export function considerTeamBuildingCheckpoint(league: GmLeagueState): GmLeagueState {
  if (league.incomingOffer || league.teamBuildingCheckpoint) return league;

  const hit = activeCheckpoint(league);
  if (!hit) {
    return maybeCloseTradeDeadline(league);
  }

  // User chose "stay and manage" — leave them alone until they try to sim again.
  if (league.checkpointSnooze === hit.id) return league;

  return {
    ...league,
    teamBuildingCheckpoint: hit,
    news: [
      {
        id: `cp-${hit.id}-${league.day}`,
        day: league.day,
        season: league.season,
        headline: hit.title,
        body: hit.body,
        tone: "info" as const,
      },
      ...league.news,
    ].slice(0, 50),
  };
}

function maybeCloseTradeDeadline(league: GmLeagueState): GmLeagueState {
  if (league.tradeDeadlinePassed || league.phase !== "regular") return league;
  if (!seen(league, "trade_deadline")) return league;
  if (league.teamBuildingCheckpoint?.kind === "trade_deadline") return league;
  const deadline = league.schedule?.length
    ? Math.max(tradeDeadlineDay(league.schedule), 100)
    : 110;
  if (league.day < deadline) return league;
  return noteTradeDeadline(league);
}

/**
 * Re-open a snoozed pause when the user tries to advance the calendar.
 * Returns the league unchanged when there is nothing to restore.
 */
export function restoreSnoozedCheckpoint(league: GmLeagueState): GmLeagueState {
  if (!league.checkpointSnooze || league.teamBuildingCheckpoint) return league;
  const hit = activeCheckpoint(league);
  if (!hit || hit.id !== league.checkpointSnooze) {
    return { ...league, checkpointSnooze: undefined };
  }
  return {
    ...league,
    teamBuildingCheckpoint: hit,
    checkpointSnooze: undefined,
  };
}

/** Stay paused: clear the banner so the user can trade or resign. */
export function pauseForTeamBuilding(league: GmLeagueState): GmLeagueState {
  const checkpoint = league.teamBuildingCheckpoint;
  if (!checkpoint) return league;
  return {
    ...league,
    teamBuildingCheckpoint: undefined,
    checkpointSnooze: checkpoint.id,
  };
}

/** Clear the pause and, if needed, close the trade deadline. */
export function continuePastCheckpoint(league: GmLeagueState): GmLeagueState {
  const checkpoint = league.teamBuildingCheckpoint;
  if (!checkpoint) return league;
  const cleared = {
    ...markSeen(league, checkpoint.id),
    teamBuildingCheckpoint: undefined,
    checkpointSnooze: undefined,
  };
  return maybeCloseTradeDeadline(cleared);
}

/** True when a team-building banner should block the calendar. */
export function isTeamBuildingPaused(league: GmLeagueState): boolean {
  return Boolean(league.teamBuildingCheckpoint);
}

/** True when any calendar gate (team-building or monthly scouting) is up. */
export function isCalendarPaused(league: GmLeagueState): boolean {
  return Boolean(league.teamBuildingCheckpoint || league.scoutingFocusPrompt);
}
