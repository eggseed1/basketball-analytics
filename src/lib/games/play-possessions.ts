/**
 * Count completed possessions from play-by-play. Integers only — no
 * Basketball-Reference fractional estimate.
 *
 * A possession ends on a made field goal (unless an and-1 free throw follows),
 * a turnover, a defensive rebound, the last free throw of a set that changes
 * possession, or the end of a period.
 */

import type { PlayByPlayEvent } from "@/data/types/play-by-play";

import { teamSides, type Side } from "./court-events";

const other = (s: Side): Side => (s === "home" ? "away" : "home");

function isLastFreeThrow(description: string): boolean {
  const set = /(\d)\s+of\s+(\d)/i.exec(description);
  return !set || set[1] === set[2];
}

function isAndOneFreeThrow(description: string): boolean {
  return /1\s+of\s+1/i.test(description);
}

/** Made FG followed soon by a 1-of-1 FT — same possession. */
function lookAheadAndOne(events: readonly PlayByPlayEvent[], index: number): boolean {
  for (let i = index + 1; i < Math.min(events.length, index + 8); i++) {
    const e = events[i]!;
    const d = e.description ?? "";
    if (e.actionType === "period" || /^end of\b/i.test(d)) return false;
    if (e.actionType === "jumpball") return false;
    if (e.actionType === "freethrow" && isAndOneFreeThrow(d)) return true;
    if (e.isFieldGoal || e.actionType === "turnover" || /\brebound\b/i.test(d)) {
      return false;
    }
  }
  return false;
}

export type PlayPossessionCounts = {
  home: number;
  away: number;
  /** Whole possessions for PPP when sides differ by at most one. */
  shared: number;
};

/**
 * Walk the feed and count possessions that have already ended for each side.
 */
export function countPlayPossessions(
  events: readonly PlayByPlayEvent[],
  homeLabel: string,
  awayLabel: string
): PlayPossessionCounts {
  const sides = teamSides([...events], homeLabel, awayLabel);
  const ended: Record<Side, number> = { home: 0, away: 0 };
  let offense: Side | null = null;

  const end = (side: Side | null) => {
    if (!side) return;
    ended[side]++;
    offense = null;
  };

  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    if (!e.period) continue;
    const d = e.description ?? "";

    if (e.actionType === "period" || /^end of\b/i.test(d)) {
      end(offense);
      continue;
    }

    const side = sides.get(e.teamId ?? e.teamTricode ?? "");
    if (!side) continue;
    const opp = other(side);

    if (e.actionType === "jumpball" || /\bjump\s*ball\b/i.test(d)) {
      offense = side;
      continue;
    }

    if (e.isFieldGoal && e.shotResult) {
      offense = side;
      if (e.shotResult === "Made") {
        if (!lookAheadAndOne(events, i)) {
          end(side);
          offense = opp;
        }
      }
      continue;
    }

    if (e.actionType === "freethrow" && e.shotResult) {
      offense = side;
      if (e.shotResult === "Made" && isLastFreeThrow(d)) {
        end(side);
        offense = opp;
      }
      continue;
    }

    if (/\brebound\b/i.test(d)) {
      if (/\boffensive\b/i.test(d)) {
        offense = side;
        continue;
      }
      // Defensive rebound ends the previous offense's trip.
      end(offense ?? opp);
      offense = side;
      continue;
    }

    if (/\bturnover\b/i.test(d)) {
      end(side);
      offense = opp;
    }
  }

  const home = ended.home;
  const away = ended.away;
  const shared =
    home + away === 0 ? 0 : Math.round((home + away) / 2);

  return { home, away, shared };
}
