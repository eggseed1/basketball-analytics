import { normalizePlayerKey } from "../ingest/normalize";
import type { DrblBoxScore, DrblEvent, DrblLineupState } from "../types";

function sortedUnique(ids: Iterable<string>): string[] {
  return [...new Set(ids)].sort();
}

const ON_COURT_ACTIONS = new Set<DrblEvent["actionType"]>([
  "2pt",
  "3pt",
  "freethrow",
  "rebound",
  "turnover",
  "foul",
  "steal",
  "block",
  "jumpball",
  "violation",
]);
const OFF_COURT_POSSIBLE = /technical|t\.foul|ejection|delay/i;

/** A team's box players whose name is, or ends with, a surname-only substitution name. */
function nameCandidates(box: DrblBoxScore, teamId: string, name: string | null | undefined): string[] {
  const key = normalizePlayerKey(name ?? "");
  if (!key) return [];
  return box.players
    .filter((p) => {
      if (p.teamId !== teamId) return false;
      const full = normalizePlayerKey(p.playerName);
      return full === key || full.endsWith(` ${key}`);
    })
    .map((p) => p.playerId);
}

/**
 * Substitutions in with no player id, where the name fits several teammates
 * ("SUB: Green FOR Gordon" with two Greens on the roster). Within a period, a
 * candidate who has acted or come in since the period started is already on
 * the floor, and the player going out on the same row isn't coming back in.
 * If several remain, the one entering is the one whose next mention in the
 * period puts him on the floor. When one candidate remains, he is the one
 * entering.
 */
function resolveSubstitutionNames(events: DrblEvent[], box: DrblBoxScore): Map<DrblEvent, string> {
  const out = new Map<DrblEvent, string>();
  let period = 0;
  let state = new Map<string, "on" | "off">();
  const outAt = new Map<string, number>();
  const nextMentionIsOnCourt = (from: number, id: string): boolean => {
    for (let j = from + 1; j < events.length && events[j]!.period === events[from]!.period; j++) {
      const e = events[j]!;
      if (e.actionType === "substitution") {
        if (e.playerId === id) return e.substitutionSide === "out";
        continue;
      }
      if (!ON_COURT_ACTIONS.has(e.actionType) || OFF_COURT_POSSIBLE.test(e.description)) continue;
      if ([e.playerId, e.assistPlayerId, e.stealPlayerId, e.blockPlayerId].includes(id)) return true;
    }
    return false;
  };
  for (const [i, e] of events.entries()) {
    if (e.period !== period) {
      period = e.period;
      state = new Map();
    }
    if (e.actionType === "substitution") {
      const id = e.playerId ?? out.get(e);
      if (id) {
        state.set(id, e.substitutionSide === "in" ? "on" : "off");
        if (e.substitutionSide === "out") outAt.set(id, e.actionNumber);
        continue;
      }
      if (e.substitutionSide !== "in" || !e.teamId) continue;
      let free = nameCandidates(box, e.teamId, e.playerName).filter(
        (c) => state.get(c) !== "on" && outAt.get(c) !== e.actionNumber
      );
      if (free.length > 1) free = free.filter((c) => nextMentionIsOnCourt(i, c));
      if (free.length === 1) {
        out.set(e, free[0]!);
        state.set(free[0]!, "on");
      }
      continue;
    }
    if (!ON_COURT_ACTIONS.has(e.actionType) || OFF_COURT_POSSIBLE.test(e.description)) continue;
    for (const id of [e.playerId, e.assistPlayerId, e.stealPlayerId, e.blockPlayerId]) if (id) state.set(id, "on");
  }
  return out;
}

/**
 * Per period, each player's first appearance after the period-start event:
 * "in" when he first enters by substitution, "on" when he first acts or is
 * subbed out (so he was on the floor when the period started). CDN feeds log
 * break substitutions before that event; they are already applied by then.
 */
function firstAppearances(
  events: DrblEvent[],
  teamOf: ReadonlyMap<string, string>,
  resolved: ReadonlyMap<DrblEvent, string>
) {
  const byPeriod = new Map<number, Map<string, "in" | "on">>();
  const started = new Set<number>();
  const see = (period: number, id: string | null | undefined, kind: "in" | "on") => {
    if (!id || !teamOf.has(id)) return;
    let m = byPeriod.get(period);
    if (!m) byPeriod.set(period, (m = new Map()));
    if (!m.has(id)) m.set(id, kind);
  };
  for (const e of events) {
    if (e.actionType === "period" && e.subType.toLowerCase() === "start") started.add(e.period);
    if (!started.has(e.period)) continue;
    if (e.actionType === "substitution") {
      see(e.period, e.playerId ?? resolved.get(e), e.substitutionSide === "in" ? "in" : "on");
      continue;
    }
    if (!ON_COURT_ACTIONS.has(e.actionType) || OFF_COURT_POSSIBLE.test(e.description)) continue;
    see(e.period, e.playerId, "on");
    see(e.period, e.assistPlayerId, "on");
    see(e.period, e.stealPlayerId, "on");
    see(e.period, e.blockPlayerId, "on");
  }
  return byPeriod;
}

/**
 * Reconstruct on-court lineups after every substitution / period start.
 * Starts from box-score starters; applies substitution in/out events. With
 * `inferPeriodStarters`, for feeds that skip substitutions made between
 * periods (stats.nba.com playbyplayv3): when the next period's events
 * contradict the carried-over lineup, the period starts with the players seen
 * on the floor before entering, filled from the carried-over five.
 */
export function reconstructLineups(
  events: DrblEvent[],
  box: DrblBoxScore,
  options: { inferPeriodStarters?: boolean } = {}
): DrblLineupState[] {
  const homeStarters = box.players
    .filter((p) => p.teamId === box.homeTeamId && p.starter)
    .map((p) => p.playerId);
  const awayStarters = box.players
    .filter((p) => p.teamId === box.awayTeamId && p.starter)
    .map((p) => p.playerId);

  const home = new Set(homeStarters);
  const away = new Set(awayStarters);
  const states: DrblLineupState[] = [];
  if (home.size === 5 && away.size === 5) {
    states.push({
      afterActionNumber: 0,
      period: 1,
      clockSeconds: 720,
      homePlayerIds: sortedUnique(home),
      awayPlayerIds: sortedUnique(away),
    });
  }

  // Pending outs before matching ins within the same whistle.
  const pendingOutHome: string[] = [];
  const pendingOutAway: string[] = [];

  const teamOf = new Map(box.players.map((p) => [p.playerId, p.teamId]));
  const resolved = options.inferPeriodStarters
    ? resolveSubstitutionNames(events, box)
    : new Map<DrblEvent, string>();
  const appearances = options.inferPeriodStarters ? firstAppearances(events, teamOf, resolved) : new Map();
  let lastOut: { id: string; actionNumber: number } | null = null;
  function startPeriod(period: number): void {
    const seen = appearances.get(period);
    if (period <= 1 || !seen) return;
    for (const [onCourt, teamId] of [
      [home, box.homeTeamId],
      [away, box.awayTeamId],
    ] as const) {
      const on = [...seen].filter(([id, k]) => k === "on" && teamOf.get(id) === teamId).map(([id]) => id);
      const cameIn = new Set([...seen].filter(([, k]) => k === "in").map(([id]) => id));
      if (on.every((id) => onCourt.has(id)) && [...onCourt].every((id) => !cameIn.has(id))) continue;
      if (on.length > 5) continue;
      const next = new Set(on);
      for (const id of onCourt) if (next.size < 5 && !cameIn.has(id)) next.add(id);
      if (next.size !== 5) continue;
      onCourt.clear();
      for (const id of next) onCourt.add(id);
    }
  }

  function flushState(event: DrblEvent): void {
    if (home.size !== 5 || away.size !== 5) return;
    states.push({
      afterActionNumber: event.actionNumber,
      period: event.period,
      clockSeconds: event.clockSeconds,
      homePlayerIds: sortedUnique(home),
      awayPlayerIds: sortedUnique(away),
    });
  }

  for (const event of events) {
    if (event.actionType === "period" && event.subType.toLowerCase() === "start") {
      // Reset to starters only at start of game; later periods keep current
      // lineup (NBA does not auto-reset). First period already seeded.
      startPeriod(event.period);
      flushState(event);
      continue;
    }

    if (event.actionType !== "substitution" || !event.teamId) continue;

    const isHome = event.teamId === box.homeTeamId;
    const onCourt = isHome ? home : away;
    const pending = isHome ? pendingOutHome : pendingOutAway;

    let playerId = event.playerId ?? resolved.get(event) ?? null;
    if (!playerId && options.inferPeriodStarters && event.substitutionSide === "in") {
      const free = nameCandidates(box, event.teamId, event.playerName).filter(
        (c) => !onCourt.has(c) && !(lastOut?.id === c && lastOut.actionNumber === event.actionNumber)
      );
      if (free.length === 1) playerId = free[0]!;
    }
    if (!playerId) continue;

    if (event.substitutionSide === "out") {
      onCourt.delete(playerId);
      pending.push(playerId);
      lastOut = { id: playerId, actionNumber: event.actionNumber };
      // Do not flush mid-substitution (4-man) — wait for matching "in".
      continue;
    }

    if (event.substitutionSide === "in") {
      onCourt.add(playerId);
      // Clear one pending out if present (paired sub).
      if (pending.length > 0) pending.shift();
      // Cap at 5 if source glitches.
      if (onCourt.size > 5) {
        const keep = [...onCourt].slice(-5);
        onCourt.clear();
        for (const id of keep) onCourt.add(id);
      }
      flushState(event);
    }
  }

  return states;
}

/** Lineup active after a given action number. */
export function lineupAtAction(
  states: DrblLineupState[],
  actionNumber: number
): DrblLineupState {
  if (!states.length) {
    return {
      afterActionNumber: 0,
      period: 1,
      clockSeconds: 720,
      homePlayerIds: [],
      awayPlayerIds: [],
    };
  }
  let current = states[0]!;
  for (const state of states) {
    if (state.afterActionNumber <= actionNumber) current = state;
    else break;
  }
  return current;
}
