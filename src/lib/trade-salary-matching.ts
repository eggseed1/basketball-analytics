/**
 * CBA salary-matching sketch from known commitments + published lines.
 * Salary-fit only — not a full legality ruling (no TPEs, holds, dead money, NTCs, BYC).
 *
 * Formulas from NBA CBA 101 (2024-25) Traded Player Exception table.
 */

import type {
  PublishedCapLines,
  TradeSimPlayer,
  TradeSimTeam,
} from "@/lib/trade-simulator";

/** 2024-25 official salary cap — pad indexes at the same rate as the cap. */
export const CAP_BASELINE_2024_25 = 140_588_000;
/** 2024-25 Expanded TPE flat pad ($7.752M). */
export const EXPANDED_PAD_BASELINE_2024_25 = 7_752_000;
export const MATCH_CUSHION = 250_000;

export type TeamSalaryBand =
  | "underCap"
  | "belowFirstApron"
  | "belowSecondApron"
  | "secondApron";

export type MatchMechanism =
  | "room"
  | "expanded"
  | "standard"
  | "secondApron";

export type MaxIncomingResult = {
  max: number;
  mechanism: MatchMechanism;
  padUsed: number;
  aggregationAllowed: boolean;
  /** True when Expanded is used (can hard-cap at first apron). */
  hardCapRisk: boolean;
};

export type SideSalaryFit = {
  ok: boolean;
  band: TeamSalaryBand;
  mechanism: MatchMechanism;
  outgoing: number | null;
  incoming: number | null;
  maxIncoming: number | null;
  aggregationAllowed: boolean;
  hardCapRisk: boolean;
  incompleteSalary: boolean;
  reasons: string[];
};

export type TradeSalaryFit = {
  ok: boolean;
  sideA: SideSalaryFit;
  sideB: SideSalaryFit;
  completeSalary: boolean;
};

export function expandedPadForCap(salaryCap: number): number {
  if (!Number.isFinite(salaryCap) || salaryCap <= 0) {
    return EXPANDED_PAD_BASELINE_2024_25;
  }
  return Math.round(
    EXPANDED_PAD_BASELINE_2024_25 * (salaryCap / CAP_BASELINE_2024_25)
  );
}

export function teamSalaryBand(
  knownCommitments: number,
  lines: PublishedCapLines
): TeamSalaryBand {
  if (knownCommitments < lines.salaryCap) return "underCap";
  if (lines.secondApron != null && knownCommitments >= lines.secondApron) {
    return "secondApron";
  }
  if (lines.firstApron != null && knownCommitments >= lines.firstApron) {
    return "belowSecondApron";
  }
  return "belowFirstApron";
}

/**
 * Max incoming Trade Salary for a given outgoing total, using pre-trade band.
 * For Standard, `postTradeKnown` decides whether the $250k cushion survives.
 */
export function maxIncomingSalary(args: {
  outgoing: number;
  band: TeamSalaryBand;
  knownCommitments: number;
  lines: PublishedCapLines;
  /** Known commitments after the swap (for cushion zeroing at first apron). */
  postTradeKnown?: number | null;
}): MaxIncomingResult {
  const { outgoing, band, knownCommitments, lines } = args;
  const pad = expandedPadForCap(lines.salaryCap);
  const post =
    args.postTradeKnown ??
    // Conservative: assume taking max might push over apron — refined in fit.
    null;

  if (band === "underCap") {
    const room = Math.max(0, lines.salaryCap - knownCommitments);
    return {
      max: room + MATCH_CUSHION,
      mechanism: "room",
      padUsed: 0,
      aggregationAllowed: true,
      hardCapRisk: false,
    };
  }

  if (band === "secondApron") {
    return {
      max: outgoing,
      mechanism: "secondApron",
      padUsed: 0,
      aggregationAllowed: false,
      hardCapRisk: false,
    };
  }

  if (band === "belowSecondApron") {
    const firstApron = lines.firstApron;
    const cushion =
      firstApron != null && post != null && post > firstApron
        ? 0
        : MATCH_CUSHION;
    return {
      max: outgoing + cushion,
      mechanism: "standard",
      padUsed: 0,
      aggregationAllowed: true,
      hardCapRisk: false,
    };
  }

  // belowFirstApron — Expanded TPE
  // max( min(2.0×Out + 250k, Out + pad), 1.25×Out + 250k )
  const twoX = 2 * outgoing + MATCH_CUSHION;
  const outPlusPad = outgoing + pad;
  const oneQuarter = 1.25 * outgoing + MATCH_CUSHION;
  const max = Math.max(Math.min(twoX, outPlusPad), oneQuarter);
  return {
    max,
    mechanism: "expanded",
    padUsed: pad,
    aggregationAllowed: true,
    hardCapRisk: true,
  };
}

function sumSalary(players: TradeSimPlayer[]): number | null {
  if (!players.length) return 0;
  if (players.some((player) => player.salary == null)) return null;
  return players.reduce((sum, player) => sum + (player.salary ?? 0), 0);
}

function playersById(team: TradeSimTeam, ids: string[]): TradeSimPlayer[] {
  const want = new Set(ids);
  return team.players.filter((player) => want.has(player.id));
}

export function salaryFitForSide(args: {
  team: TradeSimTeam;
  outgoingPlayers: TradeSimPlayer[];
  incomingPlayers: TradeSimPlayer[];
  lines: PublishedCapLines;
}): SideSalaryFit {
  const { team, outgoingPlayers, incomingPlayers, lines } = args;
  const band = teamSalaryBand(team.knownCommitments, lines);
  const outgoing = sumSalary(outgoingPlayers);
  const incoming = sumSalary(incomingPlayers);
  const incompleteSalary = outgoing == null || incoming == null;
  const reasons: string[] = [];

  if (!outgoingPlayers.length && !incomingPlayers.length) {
    return {
      ok: true,
      band,
      mechanism:
        band === "underCap"
          ? "room"
          : band === "secondApron"
            ? "secondApron"
            : band === "belowSecondApron"
              ? "standard"
              : "expanded",
      outgoing: 0,
      incoming: 0,
      maxIncoming: 0,
      aggregationAllowed: band !== "secondApron",
      hardCapRisk: false,
      incompleteSalary: false,
      reasons: [],
    };
  }

  if (incompleteSalary) {
    reasons.push("A moved player has no matched salary.");
    return {
      ok: false,
      band,
      mechanism:
        band === "underCap"
          ? "room"
          : band === "secondApron"
            ? "secondApron"
            : band === "belowSecondApron"
              ? "standard"
              : "expanded",
      outgoing,
      incoming,
      maxIncoming: null,
      aggregationAllowed: band !== "secondApron",
      hardCapRisk: false,
      incompleteSalary: true,
      reasons,
    };
  }

  const out = outgoing ?? 0;
  const inn = incoming ?? 0;

  if (band === "secondApron" && outgoingPlayers.length >= 2) {
    reasons.push(
      "Second-apron teams cannot aggregate two or more outgoing players."
    );
  }

  // Post-trade known for cushion / room checks
  const postTradeKnown = team.knownCommitments - out + inn;

  let maxResult = maxIncomingSalary({
    outgoing: out,
    band,
    knownCommitments: team.knownCommitments,
    lines,
    postTradeKnown,
  });

  // Recompute Standard cushion with known post-trade (already passed).
  // For under-cap: also allow absorbing if staying under cap+cushion via room.
  if (band === "underCap") {
    const roomMax = maxResult.max;
    // Under-cap teams may also use matching if they go over cap via trade —
    // if post-trade exceeds cap+cushion, fall through to Expanded rules on
    // the overage path: treat as needing Expanded once over the cap.
    if (postTradeKnown > lines.salaryCap + MATCH_CUSHION) {
      // Crossing well over cap: apply Expanded limits as if over-cap.
      maxResult = maxIncomingSalary({
        outgoing: out,
        band: "belowFirstApron",
        knownCommitments: team.knownCommitments,
        lines,
        postTradeKnown,
      });
      // But if they had room and took more than room+$250k while ending over cap,
      // Expanded still applies to the match.
    } else if (inn > roomMax) {
      reasons.push(
        `Incoming ${inn} exceeds room + $250k allowance (${Math.round(roomMax)}).`
      );
    }
  }

  // First-apron Standard: re-evaluate cushion if post-trade over first apron
  if (band === "belowSecondApron") {
    maxResult = maxIncomingSalary({
      outgoing: out,
      band,
      knownCommitments: team.knownCommitments,
      lines,
      postTradeKnown,
    });
  }

  if (band === "secondApron") {
    maxResult = maxIncomingSalary({
      outgoing: out,
      band,
      knownCommitments: team.knownCommitments,
      lines,
      postTradeKnown,
    });
  }

  if (band === "belowFirstApron") {
    maxResult = maxIncomingSalary({
      outgoing: out,
      band,
      knownCommitments: team.knownCommitments,
      lines,
      postTradeKnown,
    });
  }

  // Zero outgoing: under-cap can still absorb via room; over-cap cannot take salary in
  // without sending something (except empty both-ways already handled).
  if (out === 0 && inn > 0 && band !== "underCap") {
    reasons.push("Over-cap teams need outgoing salary to create a TPE.");
  }

  if (inn > maxResult.max + 0.5) {
    // 0.5 for float safety; salaries are integers
    reasons.push(
      `Incoming exceeds ${maxResult.mechanism} max (${Math.round(maxResult.max)}).`
    );
  }

  const ok = reasons.length === 0;
  return {
    ok,
    band,
    mechanism: maxResult.mechanism,
    outgoing: out,
    incoming: inn,
    maxIncoming: maxResult.max,
    aggregationAllowed: maxResult.aggregationAllowed,
    hardCapRisk: maxResult.hardCapRisk && inn > out,
    incompleteSalary: false,
    reasons,
  };
}

export function salaryFitTrade(
  teamA: TradeSimTeam,
  sendA: string[],
  teamB: TradeSimTeam,
  sendB: string[],
  lines: PublishedCapLines
): TradeSalaryFit {
  const outA = playersById(teamA, sendA);
  const outB = playersById(teamB, sendB);
  const sideA = salaryFitForSide({
    team: teamA,
    outgoingPlayers: outA,
    incomingPlayers: outB,
    lines,
  });
  const sideB = salaryFitForSide({
    team: teamB,
    outgoingPlayers: outB,
    incomingPlayers: outA,
    lines,
  });
  return {
    ok: sideA.ok && sideB.ok,
    sideA,
    sideB,
    completeSalary: !sideA.incompleteSalary && !sideB.incompleteSalary,
  };
}

export function mechanismLabel(mechanism: MatchMechanism): string {
  switch (mechanism) {
    case "room":
      return "Room";
    case "expanded":
      return "Expanded";
    case "standard":
      return "Standard";
    case "secondApron":
      return "2nd apron 1:1";
  }
}
