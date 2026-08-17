/**
 * Sequential possession attribution (DRBL-P v2).
 *
 * Credit value at the observed state transition where it is created.
 * Opportunity quality is player-neutral; execution residuals are separated
 * and strongly down-weighted in stable player impact.
 *
 * Does NOT use position, archetype, or name as score multipliers.
 *
 * Data resolution (CDN PBP):
 * - Observed: FG/FT outcomes, coordinates, rebounds, TO, steal, block, foul
 * - Strongly inferable: assists (assistPersonId or description "(X AST)")
 * - Unavailable: screens, drives, cuts, defender distance, secondary assists,
 *   shot clock — parked as unobservedAttribution when needed
 */

import type { DrblEvent, DrblPossession } from "../types";
import { shotDistanceFeet } from "./behavior";

export const SEQUENTIAL_ATTRIBUTION_VERSION = "drbl-seq-attr-v1";

/**
 * Fraction of (actual − contextEP) counted in stable player totals.
 * 1.0 = full residual conservation into player totals (season EB still shrinks rates).
 * Lower values park make/miss luck as outcomeNoise (diagnostics only) but shrink
 * season-value scale and can reintroduce small-sample noise in WAR ranks —
 * keep at 1.0 unless using a separate ranking score on opportunity-only.
 */
export const EXECUTION_SKILL_FRACTION = 1.0;

export type AttributionCategory =
  | "creation"
  | "connection"
  | "conversionOpportunity"
  | "execution"
  | "recovery"
  | "turnover"
  | "defense"
  | "unobserved"
  | "outcomeNoise";

export interface PlayerCredit {
  playerId: string;
  category: AttributionCategory;
  /** Full accounting credit (conservation). */
  amount: number;
  /** Credit that enters stable DRBL totals (execution shrunk). */
  stableAmount: number;
}

export interface PossessionAttributionResult {
  startEp: number;
  contextEp: number | null;
  actualPoints: number;
  totalDelta: number;
  credits: PlayerCredit[];
  /** Sum of offense accounting (+ unobserved) — should ≈ totalDelta. */
  offenseAccountingSum: number;
  /** Sum of defense accounting — should ≈ -totalDelta. */
  defenseAccountingSum: number;
  /** Sum of stable amounts entering player totals. */
  stableSum: number;
  outcomeNoise: number;
  unobserved: number;
  assisted: boolean;
  assistPlayerId: string | null;
  shooterId: string | null;
}

const TOL = 1e-9;

/**
 * Player-neutral expected points for a shot attempt (no player identity).
 * League-average make rates by location bucket × point value.
 */
export function playerNeutralShotEp(
  isThree: boolean,
  distanceFeet: number | null,
  pointValue: 1 | 2 | 3
): number {
  if (pointValue === 1) {
    return 0.78;
  }
  const d = distanceFeet ?? (isThree ? 25 : 12);
  let pMake: number;
  if (isThree || pointValue === 3) {
    pMake = d <= 23.5 ? 0.39 : 0.35;
  } else if (d <= 4) {
    pMake = 0.66;
  } else if (d <= 8) {
    pMake = 0.56;
  } else if (d <= 16) {
    pMake = 0.42;
  } else {
    pMake = 0.38;
  }
  return pMake * pointValue;
}

/**
 * Possession-age proxy (seconds) from game clock — CDN PBP has no shot clock.
 * Used only as a weak late-clock pressure feature, never as fabricated tracking.
 */
export function possessionAgeSeconds(
  startClockSeconds: number,
  eventClockSeconds: number
): number {
  return Math.max(0, startClockSeconds - eventClockSeconds);
}

/**
 * Extra connection credit when an assist creates a shot under possession-age
 * pressure. Drawn from the unobserved bucket (not from make/miss luck), so
 * outcome-luck invariance of base opportunity is preserved.
 *
 * ageBoost = contextEp × 0.10 × min(age/18, 1)
 */
export function assistAgeConnectionBoost(
  contextEp: number,
  ageSeconds: number
): number {
  const pressure = Math.min(1, Math.max(0, ageSeconds) / 18);
  return Math.max(0, contextEp) * 0.1 * pressure;
}

/** Parse `(K. Wallace 1 AST)` / `(D. White 1 AST)` from CDN descriptions. */
export function parseAssistNameFromDescription(
  description: string
): string | null {
  const m = /\(([^)]+?)\s+\d+\s+AST\)/i.exec(description);
  if (!m) return null;
  return m[1]!.trim();
}

/**
 * Resolve assist player id from CDN field or description match against
 * on-court offense (name / initial match). Never invents tracking.
 */
export function resolveAssistPlayerId(
  event: DrblEvent,
  offensePlayerIds: string[],
  nameById: Map<string, string>
): { playerId: string | null; source: "cdn" | "description" | null } {
  if (event.assistPlayerId && offensePlayerIds.includes(event.assistPlayerId)) {
    return { playerId: event.assistPlayerId, source: "cdn" };
  }
  const fromDesc =
    event.assistPlayerName ||
    parseAssistNameFromDescription(event.description || "");
  if (!fromDesc) return { playerId: null, source: null };

  const needle = fromDesc.toLowerCase().replace(/\./g, "").trim();
  let match: string | null = null;
  for (const id of offensePlayerIds) {
    const name = (nameById.get(id) ?? "").toLowerCase().replace(/\./g, "");
    if (!name) continue;
    const parts = needle.split(/\s+/);
    const last = parts[parts.length - 1]!;
    if (last.length >= 3 && name.includes(last)) {
      if (parts.length === 1 || name.includes(parts[0]![0]!)) {
        if (match && match !== id) return { playerId: null, source: null };
        match = id;
      }
    }
  }
  return match
    ? { playerId: match, source: "description" }
    : { playerId: null, source: null };
}

function eventsOnPossession(
  possession: DrblPossession,
  events: DrblEvent[]
): DrblEvent[] {
  const set = new Set(possession.eventActionNumbers);
  return events
    .filter((e) => set.has(e.actionNumber))
    .sort(
      (a, b) =>
        a.orderNumber - b.orderNumber || a.actionNumber - b.actionNumber
    );
}

function pushCredit(
  credits: PlayerCredit[],
  playerId: string | null | undefined,
  category: AttributionCategory,
  amount: number,
  stableAmount?: number
): void {
  if (!playerId || !Number.isFinite(amount) || Math.abs(amount) < 1e-15) {
    return;
  }
  const stable =
    stableAmount !== undefined
      ? stableAmount
      : category === "execution"
        ? amount * EXECUTION_SKILL_FRACTION
        : amount;
  credits.push({ playerId, category, amount, stableAmount: stable });
}

function isOffensiveRebound(e: DrblEvent, offenseTeamId: string): boolean {
  if (e.actionType !== "rebound") return false;
  const st = (e.subType || "").toLowerCase();
  const qs = (e.qualifiers || []).map((q) => q.toLowerCase());
  if (st.includes("offensive") || qs.some((q) => q.includes("offensive"))) {
    return true;
  }
  if (st.includes("defensive") || qs.some((q) => q.includes("defensive"))) {
    return false;
  }
  return e.teamId === offenseTeamId;
}

/**
 * Attribute one possession with sequential opportunity / execution split.
 *
 * Offense conservation (accounting):
 *   sum(offense credit.amount) + unobserved ≈ actualPoints - startEp
 *
 * Defense conservation:
 *   sum(defense credit.amount) ≈ -(actualPoints - startEp)
 *
 * Stable DRBL totals use credit.stableAmount (execution shrunk).
 */
export function attributePossessionSequential(args: {
  possession: DrblPossession;
  events: DrblEvent[];
  startEp: number;
  offensePlayerIds: string[];
  defensePlayerIds: string[];
  nameById?: Map<string, string>;
}): PossessionAttributionResult {
  const {
    possession,
    events,
    startEp,
    offensePlayerIds,
    defensePlayerIds,
  } = args;
  const nameById = args.nameById ?? new Map<string, string>();
  const possEvents = eventsOnPossession(possession, events);
  const actualPoints = possession.points;
  const totalDelta = actualPoints - startEp;
  const credits: PlayerCredit[] = [];
  let unobserved = 0;

  const fgEvents = possEvents.filter(
    (e) =>
      (e.actionType === "2pt" || e.actionType === "3pt") &&
      (e.shotResult === "Made" || e.shotResult === "Missed")
  );
  const ftEvents = possEvents.filter(
    (e) => e.actionType === "freethrow" && e.shotResult != null
  );
  const primaryShot =
    fgEvents.length > 0
      ? fgEvents[fgEvents.length - 1]!
      : ftEvents.length > 0
        ? ftEvents[ftEvents.length - 1]!
        : null;

  let contextEp: number | null = null;
  let assisted = false;
  let assistPlayerId: string | null = null;
  let shooterId: string | null = null;

  if (possession.endReason === "turnover") {
    const toEvent = [...possEvents]
      .reverse()
      .find((e) => e.actionType === "turnover");
    const stealEvent = possEvents.find(
      (e) => e.actionType === "steal" || e.stealPlayerId
    );
    const toPlayer =
      toEvent?.playerId && offensePlayerIds.includes(toEvent.playerId)
        ? toEvent.playerId
        : null;
    const stealer =
      stealEvent?.stealPlayerId &&
      defensePlayerIds.includes(stealEvent.stealPlayerId)
        ? stealEvent.stealPlayerId
        : stealEvent?.playerId &&
            stealEvent.actionType === "steal" &&
            defensePlayerIds.includes(stealEvent.playerId)
          ? stealEvent.playerId
          : null;

    const offTarget = totalDelta;
    if (toPlayer) {
      pushCredit(credits, toPlayer, "turnover", offTarget);
    } else {
      const share = offensePlayerIds.length
        ? offTarget / offensePlayerIds.length
        : 0;
      for (const id of offensePlayerIds) {
        pushCredit(credits, id, "turnover", share);
      }
    }

    const defTarget = -offTarget;
    if (stealer) {
      pushCredit(credits, stealer, "defense", defTarget);
    } else {
      const share = defensePlayerIds.length
        ? defTarget / defensePlayerIds.length
        : 0;
      for (const id of defensePlayerIds) {
        pushCredit(credits, id, "defense", share);
      }
    }
  } else if (primaryShot) {
    shooterId = primaryShot.playerId;
    const isThree =
      primaryShot.actionType === "3pt" || primaryShot.pointsOnAction === 3;
    const isFt = primaryShot.actionType === "freethrow";
    const pointValue = (isFt ? 1 : isThree ? 3 : 2) as 1 | 2 | 3;
    const dist = isFt
      ? null
      : shotDistanceFeet(primaryShot.x, primaryShot.y);
    contextEp = playerNeutralShotEp(isThree && !isFt, dist, pointValue);

    if (isFt && ftEvents.length > 1) {
      contextEp = playerNeutralShotEp(false, null, 1) * ftEvents.length;
    }

    const assist = resolveAssistPlayerId(
      primaryShot,
      offensePlayerIds,
      nameById
    );
    assistPlayerId = assist.playerId;
    assisted = assistPlayerId != null;

    const opportunityDelta = contextEp - startEp;
    const executionRaw = actualPoints - contextEp;
    const ageSec = possessionAgeSeconds(
      possession.startClockSeconds,
      primaryShot.clockSeconds
    );
    const ageBoost =
      assisted && opportunityDelta >= 0
        ? assistAgeConnectionBoost(contextEp, ageSec)
        : 0;

    // Opportunity: assisted → connection to passer; else creation to shooter.
    // Age boost (assisted only) comes from unobserved, not make/miss.
    if (opportunityDelta >= 0 && assisted && assistPlayerId) {
      pushCredit(
        credits,
        assistPlayerId,
        "connection",
        opportunityDelta + ageBoost
      );
      unobserved -= ageBoost;
    } else if (shooterId && offensePlayerIds.includes(shooterId)) {
      pushCredit(
        credits,
        shooterId,
        opportunityDelta >= 0 ? "creation" : "conversionOpportunity",
        opportunityDelta
      );
    } else {
      unobserved += opportunityDelta;
    }

    // Execution to shooter. Block reduces shooter blame; blocked half → unobserved
    // contest (not rebound double-count).
    const hasBlock =
      Boolean(
        primaryShot.blockPlayerId &&
          defensePlayerIds.includes(primaryShot.blockPlayerId)
      ) ||
      possEvents.some(
        (e) =>
          e.actionType === "block" &&
          e.playerId &&
          defensePlayerIds.includes(e.playerId)
      );

    if (executionRaw < 0 && hasBlock) {
      const toShooter = executionRaw * 0.5;
      const contest = executionRaw * 0.5;
      if (shooterId && offensePlayerIds.includes(shooterId)) {
        pushCredit(credits, shooterId, "execution", toShooter);
      } else {
        unobserved += toShooter;
      }
      unobserved += contest;
    } else if (shooterId && offensePlayerIds.includes(shooterId)) {
      pushCredit(credits, shooterId, "execution", executionRaw);
    } else {
      unobserved += executionRaw;
    }

    // OREB: no extra points — second-chance value is in the final shot credits.
    // (Documented; avoids double-counting the same swing.)
    void isOffensiveRebound;

    // Defense: -totalDelta with mild steal/block emphasis; DREB tiny bump only.
    const defTarget = -totalDelta;
    const dWeights = new Map<string, number>();
    for (const id of defensePlayerIds) dWeights.set(id, 1);
    for (const e of possEvents) {
      if (e.actionType === "steal" && e.playerId && dWeights.has(e.playerId)) {
        dWeights.set(e.playerId, (dWeights.get(e.playerId) ?? 1) + 2);
      }
      if (e.actionType === "block" && e.playerId && dWeights.has(e.playerId)) {
        dWeights.set(e.playerId, (dWeights.get(e.playerId) ?? 1) + 1);
      }
      if (
        e.actionType === "rebound" &&
        e.playerId &&
        dWeights.has(e.playerId) &&
        !isOffensiveRebound(e, possession.offenseTeamId)
      ) {
        dWeights.set(e.playerId, (dWeights.get(e.playerId) ?? 1) + 0.25);
      }
    }
    let sumW = 0;
    for (const id of defensePlayerIds) sumW += dWeights.get(id) ?? 1;
    for (const id of defensePlayerIds) {
      const w = dWeights.get(id) ?? 1;
      const amt = sumW > 0 ? (defTarget * w) / sumW : 0;
      pushCredit(credits, id, "defense", amt, amt);
    }
  } else {
    const offShare = offensePlayerIds.length
      ? totalDelta / offensePlayerIds.length
      : 0;
    for (const id of offensePlayerIds) {
      pushCredit(credits, id, "unobserved", offShare, offShare);
    }
    const defTarget = -totalDelta;
    const defShare = defensePlayerIds.length
      ? defTarget / defensePlayerIds.length
      : 0;
    for (const id of defensePlayerIds) {
      pushCredit(credits, id, "defense", defShare, defShare);
    }
  }

  let execAccounting = 0;
  let execStable = 0;
  for (const c of credits) {
    if (c.category === "execution") {
      execAccounting += c.amount;
      execStable += c.stableAmount;
    }
  }
  const outcomeNoise = execAccounting - execStable;

  const offSet = new Set(offensePlayerIds);
  const defSet = new Set(defensePlayerIds);
  let offenseAccountingSum =
    credits
      .filter((c) => offSet.has(c.playerId))
      .reduce((s, c) => s + c.amount, 0) + unobserved;
  const defenseAccountingSum = credits
    .filter((c) => defSet.has(c.playerId))
    .reduce((s, c) => s + c.amount, 0);

  // Absorb tiny float residue into unobserved
  const offGap = totalDelta - offenseAccountingSum;
  if (Math.abs(offGap) > TOL && Math.abs(offGap) < 0.05) {
    unobserved += offGap;
    offenseAccountingSum += offGap;
  }

  const stableSum = credits.reduce((s, c) => s + c.stableAmount, 0);

  return {
    startEp,
    contextEp,
    actualPoints,
    totalDelta,
    credits,
    offenseAccountingSum,
    defenseAccountingSum,
    stableSum,
    outcomeNoise,
    unobserved,
    assisted,
    assistPlayerId,
    shooterId,
  };
}

export function aggregateStableByPlayer(
  result: PossessionAttributionResult
): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of result.credits) {
    m.set(c.playerId, (m.get(c.playerId) ?? 0) + c.stableAmount);
  }
  return m;
}

export function aggregateStableByPlayerAndCategory(
  result: PossessionAttributionResult
): Map<string, Partial<Record<AttributionCategory, number>>> {
  const m = new Map<string, Partial<Record<AttributionCategory, number>>>();
  for (const c of result.credits) {
    let row = m.get(c.playerId);
    if (!row) {
      row = {};
      m.set(c.playerId, row);
    }
    row[c.category] = (row[c.category] ?? 0) + c.stableAmount;
  }
  return m;
}

export function nearlyEqual(a: number, b: number, tol = 1e-6): boolean {
  return Math.abs(a - b) <= tol;
}
