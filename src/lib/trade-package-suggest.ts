/**
 * Suggest two-team packages that pass salaryFitTrade (known-salary CBA bands).
 * Basketball ranking is secondary. Not a full legality search.
 */

import {
  summarizePlayerTrade,
  type PublishedCapLines,
  type TradeSimPlayer,
  type TradeSimTeam,
  type TradeSketch,
} from "@/lib/trade-simulator";
import {
  mechanismLabel,
  salaryFitTrade,
  teamSalaryBand,
  type TradeSalaryFit,
} from "@/lib/trade-salary-matching";

export type SuggestedPackage = {
  sendA: string[];
  sendB: string[];
  fit: TradeSalaryFit;
  sketch: TradeSketch;
  score: number;
  rationale: string;
  /** Which side the suggestion is primarily serving. */
  seedSide: "a" | "b";
};

const MAX_RETURN = 3;
const MAX_FILLERS = 2;
const TOP_N = 6;
const MAX_CANDIDATES = 4000;

function withSalary(players: TradeSimPlayer[]): TradeSimPlayer[] {
  return players.filter((player) => player.salary != null && player.salary > 0);
}

function comboSalaries(
  players: TradeSimPlayer[],
  maxSize: number
): TradeSimPlayer[][] {
  const pool = withSalary(players);
  const out: TradeSimPlayer[][] = [];
  const n = pool.length;
  // 1-player
  for (let i = 0; i < n; i++) {
    out.push([pool[i]!]);
  }
  if (maxSize >= 2) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        out.push([pool[i]!, pool[j]!]);
      }
    }
  }
  if (maxSize >= 3) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        for (let k = j + 1; k < n; k++) {
          out.push([pool[i]!, pool[j]!, pool[k]!]);
        }
      }
    }
  }
  return out;
}

function idsOf(players: TradeSimPlayer[]): string[] {
  return players.map((player) => player.id);
}

function salarySum(players: TradeSimPlayer[]): number {
  return players.reduce((sum, player) => sum + (player.salary ?? 0), 0);
}

function drblSum(players: TradeSimPlayer[]): number {
  return players.reduce((sum, player) => sum + (player.drbl100 ?? 0), 0);
}

function midWindow(fit: TradeSalaryFit, side: "a" | "b"): number {
  const s = side === "a" ? fit.sideA : fit.sideB;
  if (s.maxIncoming == null || s.outgoing == null) return 0;
  return (s.outgoing + s.maxIncoming) / 2;
}

function scorePackage(args: {
  fit: TradeSalaryFit;
  sketch: TradeSketch;
  seedSide: "a" | "b";
  sendA: TradeSimPlayer[];
  sendB: TradeSimPlayer[];
  otherTopDrbl: number;
}): number {
  const { fit, sketch, seedSide, sendA, sendB, otherTopDrbl } = args;
  const seedFit = seedSide === "a" ? fit.sideA : fit.sideB;
  const returnPlayers = seedSide === "a" ? sendB : sendA;
  const seedPlayers = seedSide === "a" ? sendA : sendB;
  const incoming = seedFit.incoming ?? 0;
  const mid = midWindow(fit, seedSide);
  const tightness = -Math.abs(incoming - mid) / 1_000_000;

  const seedDrbl =
    seedSide === "a" ? (sketch.sideA.drblNet ?? 0) : (sketch.sideB.drblNet ?? 0);
  const drblInterest = Math.abs(seedDrbl) * 2 + seedDrbl;

  const sizePenalty = -(seedPlayers.length + returnPlayers.length) * 0.35;

  const returnDrbl = drblSum(returnPlayers);
  const starDumpPenalty =
    otherTopDrbl > 0 && returnDrbl >= otherTopDrbl * 0.95 ? -4 : 0;

  return tightness + drblInterest + sizePenalty + starDumpPenalty;
}

function rationaleFor(
  fit: TradeSalaryFit,
  seedSide: "a" | "b",
  sendA: TradeSimPlayer[],
  sendB: TradeSimPlayer[]
): string {
  const seed = seedSide === "a" ? fit.sideA : fit.sideB;
  const other = seedSide === "a" ? fit.sideB : fit.sideA;
  const seedOut = seedSide === "a" ? sendA : sendB;
  const seedIn = seedSide === "a" ? sendB : sendA;
  return [
    `${mechanismLabel(seed.mechanism)} match`,
    seedOut.length > 1 ? `+${seedOut.length - 1} filler` : null,
    `${seedIn.length} back`,
    other.mechanism !== seed.mechanism
      ? `counter ${mechanismLabel(other.mechanism)}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Suggest packages given a seed selection.
 * `seedSide` = which side the user last touched; defaults to whichever has players.
 */
export function suggestMatchingPackages(args: {
  teamA: TradeSimTeam;
  teamB: TradeSimTeam;
  sendA: string[];
  sendB: string[];
  lines: PublishedCapLines;
  seedSide?: "a" | "b";
  limit?: number;
}): SuggestedPackage[] {
  const { teamA, teamB, lines } = args;
  const limit = args.limit ?? TOP_N;
  const hasA = args.sendA.length > 0;
  const hasB = args.sendB.length > 0;
  if (!hasA && !hasB) return [];

  const seedSide: "a" | "b" =
    args.seedSide ??
    (hasA && !hasB ? "a" : hasB && !hasA ? "b" : hasA ? "a" : "b");

  const seedTeam = seedSide === "a" ? teamA : teamB;
  const otherTeam = seedSide === "a" ? teamB : teamA;
  const seedIds = seedSide === "a" ? args.sendA : args.sendB;
  const seedPlayers = seedTeam.players.filter((player) =>
    seedIds.includes(player.id)
  );
  if (!seedPlayers.length) return [];
  if (seedPlayers.some((player) => player.salary == null)) return [];

  const seedBand = teamSalaryBand(seedTeam.knownCommitments, lines);
  const canAggregate = seedBand !== "secondApron";
  const otherEligible = otherTeam.players.filter(
    (player) => !seedIds.includes(player.id) && player.salary != null
  );
  const otherTopDrbl = Math.max(
    0,
    ...otherEligible.map((player) => player.drbl100 ?? -999)
  );

  // Fillers: teammates not already in seed (1–2), only if aggregation allowed
  const fillerPool = withSalary(
    seedTeam.players.filter((player) => !seedIds.includes(player.id))
  );
  const fillerCombos: TradeSimPlayer[][] = [[]];
  if (canAggregate && fillerPool.length) {
    for (const combo of comboSalaries(fillerPool, MAX_FILLERS)) {
      fillerCombos.push(combo);
    }
  }

  const returnCombos = comboSalaries(otherEligible, MAX_RETURN);
  const results: SuggestedPackage[] = [];
  let evaluated = 0;

  for (const fillers of fillerCombos) {
    const fullSeed = [...seedPlayers, ...fillers];
    if (seedBand === "secondApron" && fullSeed.length >= 2) continue;

    for (const ret of returnCombos) {
      if (evaluated >= MAX_CANDIDATES) break;
      evaluated += 1;

      const sendAPlayers = seedSide === "a" ? fullSeed : ret;
      const sendBPlayers = seedSide === "a" ? ret : fullSeed;
      const sendA = idsOf(sendAPlayers);
      const sendB = idsOf(sendBPlayers);

      // Skip exact current selection (already applied)
      if (
        sameSet(sendA, args.sendA) &&
        sameSet(sendB, args.sendB) &&
        args.sendA.length &&
        args.sendB.length
      ) {
        continue;
      }

      const fit = salaryFitTrade(teamA, sendA, teamB, sendB, lines);
      if (!fit.ok || !fit.completeSalary) continue;

      const sketch = summarizePlayerTrade(teamA, sendA, teamB, sendB, lines);
      const score = scorePackage({
        fit,
        sketch,
        seedSide,
        sendA: sendAPlayers,
        sendB: sendBPlayers,
        otherTopDrbl,
      });

      results.push({
        sendA,
        sendB,
        fit,
        sketch,
        score,
        rationale: rationaleFor(fit, seedSide, sendAPlayers, sendBPlayers),
        seedSide,
      });
    }
    if (evaluated >= MAX_CANDIDATES) break;
  }

  results.sort((a, b) => b.score - a.score);

  // Dedupe by sendA|sendB key
  const seen = new Set<string>();
  const unique: SuggestedPackage[] = [];
  for (const row of results) {
    const key = `${[...row.sendA].sort().join(",")}|${[...row.sendB].sort().join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
    if (unique.length >= limit) break;
  }
  return unique;
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sb = new Set(b);
  return a.every((id) => sb.has(id));
}

/** Cheap salary sum for pruning helpers / tests. */
export function packageSalaryTotal(players: TradeSimPlayer[]): number {
  return salarySum(players);
}
