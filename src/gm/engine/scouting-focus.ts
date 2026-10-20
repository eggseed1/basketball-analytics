/**
 * Madden-style monthly scouting focus.
 *
 * Once a calendar month, pause and let the user put eyes on up to three
 * prospects (Super Focus). An optional position focus mirrors regional
 * focus: a lighter second look at that group.
 */

import { rosterNeeds } from "@/gm/engine/draft-room";
import { automationOf } from "@/gm/engine/offseason";
import {
  gradeSortValue,
  spendScoutingLook,
  staffScoutContext,
} from "@/gm/engine/scouting";
import { ensureScoutKnack, scoutMatchBonus } from "@/gm/seed/scouts";
import { scoutKnackAutofocusWeight } from "@/gm/seed/staff-knacks";
import type {
  GmLeagueState,
  GmPlayer,
  GmPosition,
  GmScoutingFocusPrompt,
} from "@/gm/types";

export const SCOUTING_FOCUS_SLOTS = 3;

const MONTH_NAME: Record<string, string> = {
  "01": "January",
  "02": "February",
  "03": "March",
  "04": "April",
  "05": "May",
  "06": "June",
  "07": "July",
  "08": "August",
  "09": "September",
  "10": "October",
  "11": "November",
  "12": "December",
};

function monthSeen(league: GmLeagueState, monthKey: string): boolean {
  return (league.seenScoutingMonths ?? []).includes(monthKey);
}

function markMonth(league: GmLeagueState, monthKey: string): GmLeagueState {
  if (monthSeen(league, monthKey)) return league;
  return {
    ...league,
    seenScoutingMonths: [...(league.seenScoutingMonths ?? []), monthKey].slice(-16),
  };
}

/** YYYY-MM for the schedule day the league is on. */
export function monthKeyForLeague(league: GmLeagueState): string | null {
  const onDay = league.schedule.find((game) => game.day === league.day && game.gameDate);
  if (onDay?.gameDate) return onDay.gameDate.slice(0, 7);
  const prior = [...league.schedule]
    .filter((game) => game.day <= league.day && game.gameDate)
    .sort((a, b) => b.day - a.day)[0];
  return prior?.gameDate?.slice(0, 7) ?? null;
}

export function monthLabel(monthKey: string): string {
  const [, month] = monthKey.split("-");
  return MONTH_NAME[month ?? ""] ?? monthKey;
}

function fogScore(player: GmPlayer): number {
  const grades = player.scoutProfile?.grades;
  const blanks = grades
    ? (["athleticism", "shooting", "creation", "defense", "feel", "upside"] as const).filter(
        (key) => grades[key] == null
      ).length
    : 6;
  return (player.scouted.uncertainty ?? 0.8) * 10 + blanks * 1.5;
}

/**
 * Suggest prospects the room should put under the microscope:
 * high fog, roster need, and some board upside so the list is not only bunkers.
 */
export function suggestFocusProspects(league: GmLeagueState, limit = 8): string[] {
  const team = league.teams.find((entry) => entry.id === league.userTeamId);
  const needs = team ? rosterNeeds(team, league.players) : [];
  const needRank = new Map(needs.map((pos, index) => [pos, index]));
  const pool = league.draftPool
    .map((id) => league.players.find((player) => player.id === id))
    .filter((player): player is GmPlayer => Boolean(player));

  const ranked = pool
    .map((player) => {
      const need = needRank.get(player.position) ?? 9;
      const upside = gradeSortValue(player.scoutProfile?.grades.upside);
      const fog = fogScore(player);
      // Prefer foggy board pieces at positions you need.
      const score = fog * 1.4 - need * 2.2 + Math.max(upside, 0) * 0.35;
      return { id: player.id, score };
    })
    .sort((a, b) => b.score - a.score);

  return ranked.slice(0, limit).map((row) => row.id);
}

function buildPrompt(league: GmLeagueState, monthKey: string): GmScoutingFocusPrompt {
  const label = monthLabel(monthKey);
  return {
    id: `scout_focus_${monthKey}`,
    monthKey,
    day: league.day,
    title: `${label} scouting focus`,
    body: `Open the dossiers, compare fog and fit, then put ${SCOUTING_FOCUS_SLOTS} prospects under the microscope. Or hand it to your director of scouting.`,
    slots: SCOUTING_FOCUS_SLOTS,
    suggestedPlayerIds: suggestFocusProspects(league, 12),
  };
}

/**
 * Who the hired scout would focus, weighted by expertise + roster holes + fog.
 * Passable, not as sharp as a careful manual board review.
 */
export function autoPickScoutingFocus(league: GmLeagueState): {
  playerIds: string[];
  positionFocus: GmPosition | null;
} {
  const team = league.teams.find((entry) => entry.id === league.userTeamId);
  const needs = team ? rosterNeeds(team, league.players) : [];
  const needRank = new Map(needs.map((pos, index) => [pos, index]));
  const { scout } = staffScoutContext(league);
  const pool = league.draftPool
    .map((id) => league.players.find((player) => player.id === id))
    .filter((player): player is GmPlayer => Boolean(player));

  const ranked = pool
    .map((player) => {
      const need = needRank.get(player.position) ?? 8;
      const upside = gradeSortValue(player.scoutProfile?.grades.upside);
      const fog = fogScore(player);
      const withKnack = scout ? ensureScoutKnack(scout) : null;
      const match = withKnack
        ? scoutMatchBonus(withKnack, player.position, "overall", player)
        : 0;
      const knackW = scoutKnackAutofocusWeight(withKnack?.knack, player);
      // Autoscout leans on specialty and obvious holes; misses some sleepers.
      const score =
        fog * 1.1 - need * 2.6 + Math.max(upside, 0) * 0.25 + match * 8 + knackW;
      return { id: player.id, position: player.position, score };
    })
    .sort((a, b) => b.score - a.score);

  const slots = SCOUTING_FOCUS_SLOTS;
  const playerIds = ranked.slice(0, slots).map((row) => row.id);
  const positionFocus =
    needs[0] && ranked.some((row) => row.position === needs[0])
      ? needs[0]!
      : null;
  return { playerIds, positionFocus };
}

/** Pause once per calendar month while the draft class is still live. */
export function considerScoutingFocus(league: GmLeagueState): GmLeagueState {
  if (
    league.incomingOffer ||
    league.teamBuildingCheckpoint ||
    league.scoutingFocusPrompt ||
    league.phase !== "regular" ||
    !league.draftPool.length
  ) {
    return league;
  }

  const monthKey = monthKeyForLeague(league);
  if (!monthKey) return league;
  if (monthSeen(league, monthKey)) return league;
  if (league.scoutingFocus?.monthKey === monthKey) return league;
  // Skip preseason-ish calendar noise before tip-off month has games.
  if (league.day < 5) return league;

  const prompt = buildPrompt(league, monthKey);
  const withPrompt = {
    ...league,
    scoutingFocusPrompt: prompt,
    news: [
      {
        id: `sf-${monthKey}-${league.day}`,
        day: league.day,
        season: league.season,
        headline: prompt.title,
        body: prompt.body,
        tone: "info" as const,
      },
      ...league.news,
    ].slice(0, 50),
  };

  if (automationOf(league).autoScout) {
    return autoScoutingFocus(withPrompt);
  }
  return withPrompt;
}

function looksPerFocus(scoutEye: number, mode: "manual" | "auto"): number {
  // Manual focus digs deeper. Autoscout is passable but leaves more fog.
  const full = Math.max(1, Math.min(3, Math.round(scoutEye / 2) + 1));
  if (mode === "auto") return Math.max(1, full - 1);
  return full;
}

type FocusMode = "manual" | "auto";

/** Lock the month's focus and spend looks on the chosen prospects. */
export function applyScoutingFocus(
  league: GmLeagueState,
  playerIds: string[],
  positionFocus: GmPosition | null = null,
  mode: FocusMode = "manual"
): GmLeagueState {
  const prompt = league.scoutingFocusPrompt;
  if (!prompt) return league;
  const monthKey = prompt.monthKey;
  const chosen = [...new Set(playerIds)]
    .filter((id) => league.draftPool.includes(id))
    .slice(0, prompt.slots);

  const { scout, level } = staffScoutContext(league);
  const looks = looksPerFocus(level, mode);
  let players = league.players;

  for (const id of chosen) {
    for (let pass = 0; pass < looks; pass++) {
      players = players.map((player) =>
        player.id === id ? spendScoutingLook(player, scout) : player
      );
    }
  }

  // Manual position focus gets two extras; autoscout gets one.
  const extraSlots = mode === "manual" ? 2 : 1;
  if (positionFocus) {
    const extras = league.draftPool
      .map((id) => players.find((player) => player.id === id))
      .filter(
        (player): player is GmPlayer =>
          Boolean(player) &&
          player!.position === positionFocus &&
          !chosen.includes(player!.id)
      )
      .sort(
        (a, b) =>
          gradeSortValue(b.scoutProfile?.grades.upside) -
          gradeSortValue(a.scoutProfile?.grades.upside)
      )
      .slice(0, extraSlots);
    for (const target of extras) {
      players = players.map((player) =>
        player.id === target.id ? spendScoutingLook(player, scout) : player
      );
    }
  }

  const names = chosen
    .map((id) => {
      const player = players.find((entry) => entry.id === id);
      return player?.name ?? player?.codename ?? "prospect";
    })
    .join(", ");
  const scoutName = scout?.name?.split(" ")[0] ?? "Staff";
  const focusNote =
    mode === "auto"
      ? `${scoutName} assigned the month: ${names || "position tape only"}.`
      : chosen.length
        ? `You locked in on ${names}. Fresh grades are on the board.`
        : "No individual focuses. Position tape only.";
  const posNote = positionFocus ? ` Extra eyes on ${positionFocus}s.` : "";

  return {
    ...markMonth(league, monthKey),
    players,
    scoutingFocusPrompt: undefined,
    scoutingFocus: {
      monthKey,
      playerIds: chosen,
      positionFocus,
    },
    news: [
      {
        id: `sf-done-${monthKey}-${league.day}`,
        day: league.day,
        season: league.season,
        headline:
          mode === "auto"
            ? `${monthLabel(monthKey)} autoscout done`
            : `${monthLabel(monthKey)} focus set`,
        body: `${focusNote}${posNote}`,
        tone: "good" as const,
      },
      ...league.news,
    ].slice(0, 50),
  };
}

/** Let the hired scout pick focuses. Weaker looks than a careful manual pass. */
export function autoScoutingFocus(league: GmLeagueState): GmLeagueState {
  if (!league.scoutingFocusPrompt) return league;
  const pick = autoPickScoutingFocus(league);
  return applyScoutingFocus(league, pick.playerIds, pick.positionFocus, "auto");
}

/** Wave off this month's focus window. */
export function skipScoutingFocus(league: GmLeagueState): GmLeagueState {
  const prompt = league.scoutingFocusPrompt;
  if (!prompt) return league;
  return {
    ...markMonth(league, prompt.monthKey),
    scoutingFocusPrompt: undefined,
    news: [
      {
        id: `sf-skip-${prompt.monthKey}-${league.day}`,
        day: league.day,
        season: league.season,
        headline: `${monthLabel(prompt.monthKey)} focus skipped`,
        body: "No deep looks this month. The board stays as foggy as it was.",
        tone: "info" as const,
      },
      ...league.news,
    ].slice(0, 50),
  };
}

export function isScoutingFocusPaused(league: GmLeagueState): boolean {
  return Boolean(league.scoutingFocusPrompt);
}
