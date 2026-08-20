/**
 * Appendable shot-event contract for game / live / replay (P18).
 * Free throws are excluded from floor attempts.
 */

import {
  assignShotZone,
  normalizeNbaLegacyCoords,
  type ShotZoneId,
} from "@/lib/shots/court-geometry";
import {
  elapsedGameTimeSeconds,
  parsePlayClockToSeconds,
  type RawHistoryAction,
} from "@/lib/history/score-flow";

export interface GameShotEvent {
  gameId: string;
  eventId: string;
  eventIndex: number;
  period: number;
  clock: string;
  elapsedGameTime: number;
  teamId: string | null;
  playerId: string | null;
  playerName: string | null;
  made: boolean;
  points: number;
  shotType: "2PT" | "3PT" | null;
  shotDistance: number | null;
  x: number | null;
  y: number | null;
  zoneId: ShotZoneId;
  scoreBefore: { home: number; away: number };
  scoreAfter: { home: number; away: number };
  assistPlayerId: string | null;
  source: "nba_pbp" | "history_product" | "other";
  coordinateAvailable: boolean;
}

function asNum(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function asId(v: unknown): string | null {
  const n = asNum(v);
  return n ? String(n) : null;
}

function isFieldGoalAttempt(action: RawHistoryAction): boolean {
  const t = String(action.actionType ?? "").toLowerCase();
  return t === "made shot" || t === "missed shot";
}

/**
 * Build stable shot events from raw PBP actions.
 * Same sourceEventId / actionNumber → same eventId (live dedupe-ready).
 */
export function buildShotEventsFromActions(
  gameId: string,
  actions: RawHistoryAction[],
  opts?: { source?: GameShotEvent["source"] }
): GameShotEvent[] {
  const source = opts?.source ?? "nba_pbp";
  const shots: GameShotEvent[] = [];
  let home = 0;
  let away = 0;

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i]!;
    const t = String(action.actionType ?? "").toLowerCase();

    // Track score on scoring actions for before/after
    const isMadeFg = t === "made shot";
    const isMissFg = t === "missed shot";
    const isMadeFt =
      t === "free throw" &&
      !/\bMISS\b/i.test(String(action.description ?? "")) &&
      String(action.shotResult ?? "") !== "Missed";

    if (isMadeFg || isMadeFt) {
      const h = asNum(action.scoreHome);
      const a = asNum(action.scoreAway);
      if (h + a >= home + away && (h !== home || a !== away)) {
        home = h;
        away = a;
      }
    }

    if (!isFieldGoalAttempt(action)) continue;

    const made = isMadeFg;
    const scoreBefore = { home, away };
    const h = asNum(action.scoreHome);
    const a = asNum(action.scoreAway);
    let scoreAfter = { home, away };
    if (made && h + a >= home + away && (h !== home || a !== away)) {
      scoreAfter = { home: h, away: a };
      home = h;
      away = a;
    }

    const coords = normalizeNbaLegacyCoords(
      (action as { xLegacy?: unknown }).xLegacy,
      (action as { yLegacy?: unknown }).yLegacy
    );
    const shotValue = asNum(action.shotValue);
    const shotType: "2PT" | "3PT" | null =
      shotValue === 3 || /3pt|three/i.test(String(action.subType ?? ""))
        ? "3PT"
        : shotValue === 2 || made || isMissFg
          ? "2PT"
          : null;
    const distHint =
      asNum((action as { shotDistance?: unknown }).shotDistance) || null;
    const zoneId = assignShotZone(coords, shotType, distHint);
    const clockSeconds = parsePlayClockToSeconds(String(action.clock ?? ""));
    const period = asNum(action.period) || 1;
    const eventId = String(
      action.actionId ?? action.actionNumber ?? `idx-${i}`
    );

    shots.push({
      gameId,
      eventId: `${gameId}:${eventId}`,
      eventIndex: i,
      period,
      clock: String(action.clock ?? ""),
      elapsedGameTime: elapsedGameTimeSeconds(period, clockSeconds),
      teamId: asId(action.teamId),
      playerId: asId(action.personId),
      playerName:
        String(action.playerNameI || action.playerName || "").trim() || null,
      made,
      points: made ? (shotType === "3PT" ? 3 : 2) : 0,
      shotType,
      shotDistance: distHint,
      x: coords?.x ?? null,
      y: coords?.y ?? null,
      zoneId,
      scoreBefore,
      scoreAfter,
      assistPlayerId: null,
      source,
      coordinateAvailable: coords != null,
    });
  }

  return shots;
}

/** Merge/dedupe by eventId — later updates win (live correction). */
export function upsertShotEvents(
  existing: GameShotEvent[],
  incoming: GameShotEvent[]
): GameShotEvent[] {
  const map = new Map<string, GameShotEvent>();
  for (const s of existing) map.set(s.eventId, s);
  for (const s of incoming) map.set(s.eventId, s);
  return [...map.values()].sort((a, b) => a.eventIndex - b.eventIndex);
}

export function filterShots(
  shots: GameShotEvent[],
  opts: {
    teamId?: string | null;
    playerId?: string | null;
    period?: number | "OT" | "ALL";
    timeCutoff?: number | null;
    eventIds?: string[] | null;
  }
): GameShotEvent[] {
  return shots.filter((s) => {
    if (opts.teamId && s.teamId !== opts.teamId) return false;
    if (opts.playerId && s.playerId !== opts.playerId) return false;
    if (opts.eventIds && !opts.eventIds.includes(s.eventId)) return false;
    if (opts.timeCutoff != null && s.elapsedGameTime > opts.timeCutoff)
      return false;
    if (opts.period && opts.period !== "ALL") {
      if (opts.period === "OT") {
        if (s.period <= 4) return false;
      } else if (s.period !== opts.period) return false;
    }
    return true;
  });
}

export function shotCoverage(shots: GameShotEvent[]): {
  total: number;
  withCoords: number;
  rate: number;
  completeness: "SUPPORTED" | "PARTIAL" | "UNAVAILABLE";
} {
  const total = shots.length;
  const withCoords = shots.filter((s) => s.coordinateAvailable).length;
  const rate = total ? withCoords / total : 0;
  let completeness: "SUPPORTED" | "PARTIAL" | "UNAVAILABLE" = "UNAVAILABLE";
  if (total === 0) completeness = "UNAVAILABLE";
  else if (rate >= 0.85) completeness = "SUPPORTED";
  else if (withCoords > 0) completeness = "PARTIAL";
  return { total, withCoords, rate, completeness };
}

export function zoneSummaries(shots: GameShotEvent[]) {
  const byZone = new Map<
    ShotZoneId,
    { fga: number; fgm: number; pts: number }
  >();
  for (const s of shots) {
    const row = byZone.get(s.zoneId) ?? { fga: 0, fgm: 0, pts: 0 };
    row.fga += 1;
    if (s.made) {
      row.fgm += 1;
      row.pts += s.points;
    }
    byZone.set(s.zoneId, row);
  }
  return [...byZone.entries()].map(([zoneId, r]) => ({
    zoneId,
    fga: r.fga,
    fgm: r.fgm,
    pts: r.pts,
    fgPct: r.fga > 0 ? r.fgm / r.fga : null,
    smallSample: r.fga > 0 && r.fga < 5,
  }));
}

export function buildShotInsights(
  shots: GameShotEvent[],
  labels: { teamName?: string; playerName?: string }
): string[] {
  if (!shots.length) return [];
  const zones = zoneSummaries(shots).filter((z) => z.fga >= 5);
  zones.sort((a, b) => b.fga - a.fga);
  const out: string[] = [];
  if (zones[0]) {
    const z = zones[0];
    const who = labels.playerName || labels.teamName || "This side";
    out.push(
      `${who} is ${z.fgm}/${z.fga} from ${z.zoneId.replace(/_/g, " ").toLowerCase()}.`
    );
  }
  const threes = shots.filter((s) => s.shotType === "3PT");
  if (threes.length >= 5 && labels.playerName) {
    out.push(
      `${threes.length} of ${labels.playerName}'s ${shots.length} attempts came from three.`
    );
  }
  return out.slice(0, 2);
}
