import type { PlayerGame } from "@/data/types";
import type { PlayByPlayEvent } from "@/data/types/play-by-play";
import { buildCourtEvents, type StatKey } from "@/lib/games/court-events";

/** Below this share of play credits landing on box players, the ids don't line up. */
const MIN_ID_MATCH = 0.8;

const ENTERS = /\benters the game for\b/i;
const HEAVE = /\bheave\b/i;

type Tally = Record<StatKey, number>;

const empty = (): Tally => ({
  fgm: 0,
  fga: 0,
  tpm: 0,
  tpa: 0,
  ftm: 0,
  fta: 0,
  oreb: 0,
  dreb: 0,
  ast: 0,
  stl: 0,
  blk: 0,
  tov: 0,
  pf: 0,
});

/**
 * Player lines rebuilt from the plays that had happened by a cutoff. Counting
 * stats come from the plays. Minutes and plus/minus need who was on the floor,
 * which the feed doesn't log at quarter breaks, so they come back NaN (shown
 * blank). Bench players with nothing logged yet read as not in yet. Null when
 * the play credits don't match the box's player ids.
 */
export function boxAtCutoff(
  players: readonly PlayerGame[],
  events: readonly PlayByPlayEvent[],
  labels: { home: string; away: string }
): PlayerGame[] | null {
  const { ticks } = buildCourtEvents([...events], labels.home, labels.away);
  const ids = new Set(players.map((p) => p.playerId));
  const tallies = new Map<string, Tally>();
  let credited = 0;
  let matched = 0;
  for (const t of ticks) {
    if (!t.playerId) continue;
    credited += 1;
    if (!ids.has(t.playerId)) continue;
    matched += 1;
    const tally = tallies.get(t.playerId) ?? empty();
    tally[t.stat] += 1;
    tallies.set(t.playerId, tally);
  }
  if (credited > 0 && matched / credited < MIN_ID_MATCH) return null;

  for (const e of events) {
    if (!e.playerId) continue;
    const tally = tallies.get(e.playerId);
    if (!tally) continue;
    // The official box leaves missed end-of-quarter heaves out of attempts.
    if (e.isFieldGoal && e.shotResult === "Missed" && HEAVE.test(e.description)) {
      tally.fga -= 1;
      if (e.actionType === "3pt") tally.tpa -= 1;
    }
  }

  const entered = new Set<string>();
  for (const e of events) {
    if (!ENTERS.test(e.description)) continue;
    if (e.playerId) entered.add(e.playerId);
    if (e.secondPlayerId) entered.add(e.secondPlayerId);
  }

  return players.map((p) => {
    if (p.didNotPlay) return p;
    const t = tallies.get(p.playerId);
    const started = Boolean(p.startPosition?.trim());
    if (!t && !started && !entered.has(p.playerId)) {
      return { ...blankLine(p, empty()), didNotPlay: true, statusReason: undefined };
    }
    return blankLine(p, t ?? empty());
  });
}

function blankLine(p: PlayerGame, t: Tally): PlayerGame {
  return {
    ...p,
    minutes: Number.NaN,
    plusMinus: Number.NaN,
    points: 2 * t.fgm + t.tpm + t.ftm,
    fieldGoalsMade: t.fgm,
    fieldGoalsAttempted: t.fga,
    threePointersMade: t.tpm,
    threePointersAttempted: t.tpa,
    freeThrowsMade: t.ftm,
    freeThrowsAttempted: t.fta,
    offensiveRebounds: t.oreb,
    defensiveRebounds: t.dreb,
    rebounds: t.oreb + t.dreb,
    assists: t.ast,
    steals: t.stl,
    blocks: t.blk,
    turnovers: t.tov,
    personalFouls: t.pf,
    offensiveRating: undefined,
    defensiveRating: undefined,
    netRating: undefined,
    trueShootingPct: undefined,
    effectiveFieldGoalPct: undefined,
    usagePct: undefined,
    assistPct: undefined,
    turnoverPct: undefined,
    reboundPct: undefined,
    gameScore: undefined,
    pie: undefined,
  };
}
