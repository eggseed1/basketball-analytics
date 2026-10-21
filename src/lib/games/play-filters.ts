/**
 * Scoring-context filters for live game pages (shot chart + play-by-play).
 *
 * Zones use located spots. Fast break uses ESPN's "running" transition wording.
 * Second chance / off turnovers follow the same possession flags as live insights.
 */

import type { PlayByPlayEvent } from "@/data/types/play-by-play";
import {
  shotZone,
  teamSides,
  type CourtEvent,
  type Side,
  type ShotZone,
} from "@/lib/games/court-events";

export type PlayFilterId =
  | "paint"
  | "mid"
  | "three"
  | "fastBreak"
  | "secondChance"
  | "offTurnover"
  | "lastSecond";

export const PLAY_FILTERS: { id: PlayFilterId; label: string }[] = [
  { id: "paint", label: "Paint" },
  { id: "mid", label: "Mid-range" },
  { id: "three", label: "Threes" },
  { id: "fastBreak", label: "Fast break" },
  { id: "secondChance", label: "Second chance" },
  { id: "offTurnover", label: "Off turnovers" },
  { id: "lastSecond", label: "Last 5 sec" },
];

/** End-of-period / buzzer window, in seconds remaining on the game clock. */
export const LAST_SECOND_CLOCK = 5;

const ZONE_FOR_FILTER: Partial<Record<PlayFilterId, ReadonlySet<ShotZone>>> = {
  paint: new Set(["rim", "paint"]),
  mid: new Set(["mid"]),
  three: new Set(["corner3", "arc3"]),
};

function isRunningTransition(description: string): boolean {
  return /\brunning\b/i.test(description);
}

function zoneFromLoc(
  locX: number | null | undefined,
  locY: number | null | undefined,
  three: boolean
): ShotZone | null {
  if (locX == null || locY == null) return null;
  if (three) return Math.abs(locX) >= 21 && locY <= 9 ? "corner3" : "arc3";
  if (Math.hypot(locX, locY) <= 4) return "rim";
  if (Math.abs(locX) <= 8 && locY <= 13.75) return "paint";
  return "mid";
}

/**
 * Tag each play id with the scoring contexts it belongs to.
 * Possession flags are per side, matching live-insights scoring.
 */
export function tagPlayContexts(
  events: readonly PlayByPlayEvent[],
  homeLabel = "",
  awayLabel = ""
): Map<string, Set<PlayFilterId>> {
  const tags = new Map<string, Set<PlayFilterId>>();
  const add = (id: string, tag: PlayFilterId) => {
    let set = tags.get(id);
    if (!set) {
      set = new Set();
      tags.set(id, set);
    }
    set.add(tag);
  };

  const sides = teamSides([...events], homeLabel, awayLabel);
  const other = (s: Side): Side => (s === "home" ? "away" : "home");
  const secondChance: Record<Side, boolean> = { home: false, away: false };
  const offTurnover: Record<Side, boolean> = { home: false, away: false };
  const clear = (s: Side) => {
    secondChance[s] = false;
    offTurnover[s] = false;
  };

  for (const e of events) {
    if (!e.period) continue;
    const d = e.description ?? "";

    if (e.actionType === "period" || /^end of\b/i.test(d)) {
      clear("home");
      clear("away");
      continue;
    }

    const side = sides.get(e.teamId ?? e.teamTricode ?? "");
    if (!side) {
      // Still zone-tag located field goals when team side is unknown.
      if (e.isFieldGoal && e.shotResult) {
        const three = e.actionType === "3pt";
        const zone = zoneFromLoc(e.locX, e.locY, three);
        if (zone === "rim" || zone === "paint") add(e.id, "paint");
        if (zone === "mid") add(e.id, "mid");
        if (zone === "corner3" || zone === "arc3" || three) add(e.id, "three");
        if (isRunningTransition(d)) add(e.id, "fastBreak");
        if (e.clockSeconds <= LAST_SECOND_CLOCK) add(e.id, "lastSecond");
      }
      continue;
    }
    const opp = other(side);

    if (/\brebound\b/i.test(d)) {
      const offensive = /\boffensive\b/i.test(d);
      if (offensive) secondChance[side] = true;
      else clear(opp);
      continue;
    }

    if (/\bturnover\b/i.test(d)) {
      clear(side);
      offTurnover[opp] = true;
      secondChance[opp] = false;
      continue;
    }

    if (e.isFieldGoal && e.shotResult) {
      clear(opp);
      const three = e.actionType === "3pt";
      const zone = zoneFromLoc(e.locX, e.locY, three);
      if (zone === "rim" || zone === "paint") add(e.id, "paint");
      if (zone === "mid") add(e.id, "mid");
      if (zone === "corner3" || zone === "arc3" || three) add(e.id, "three");
      if (isRunningTransition(d)) add(e.id, "fastBreak");
      if (secondChance[side]) add(e.id, "secondChance");
      if (offTurnover[side]) add(e.id, "offTurnover");
      if (e.clockSeconds <= LAST_SECOND_CLOCK) add(e.id, "lastSecond");
      if (e.shotResult === "Made") clear(side);
      continue;
    }

    if (e.actionType === "freethrow" && e.shotResult) {
      clear(opp);
      if (secondChance[side]) add(e.id, "secondChance");
      if (offTurnover[side]) add(e.id, "offTurnover");
      if (e.clockSeconds <= LAST_SECOND_CLOCK) add(e.id, "lastSecond");
      const set = /(\d)\s+of\s+(\d)/i.exec(d);
      const lastOfSet = !set || set[1] === set[2];
      if (e.shotResult === "Made" && lastOfSet) clear(side);
    }
  }

  return tags;
}

export function courtEventMatchesFilter(
  event: CourtEvent,
  filter: PlayFilterId | null,
  tags: ReadonlyMap<string, ReadonlySet<PlayFilterId>>
): boolean {
  if (!filter) return true;
  const zones = ZONE_FOR_FILTER[filter];
  if (zones) {
    const z = shotZone(event);
    return z != null && zones.has(z);
  }
  return tags.get(event.id)?.has(filter) ?? false;
}

export function playEventMatchesFilter(
  event: PlayByPlayEvent,
  filter: PlayFilterId | null,
  tags: ReadonlyMap<string, ReadonlySet<PlayFilterId>>
): boolean {
  if (!filter) return true;
  return tags.get(event.id)?.has(filter) ?? false;
}

export function countTaggedPlays(
  tags: ReadonlyMap<string, ReadonlySet<PlayFilterId>>,
  filter: PlayFilterId
): number {
  let n = 0;
  for (const set of tags.values()) {
    if (set.has(filter)) n++;
  }
  return n;
}
