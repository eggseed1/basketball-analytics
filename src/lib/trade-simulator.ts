/**
 * Two-team player swap sketch.
 * Dollars and model impact only. Not a CBA ruling, and not a pick ledger.
 */

export type TradeSimPlayer = {
  id: string;
  name: string;
  href: string | null;
  salary: number | null;
  drbl100: number | null;
};

export type TradeSimTeam = {
  id: string;
  abbr: string;
  name: string;
  /** Sum of matched salaries. Not a full cap sheet. */
  knownCommitments: number;
  playersWithoutSalary: number;
  players: TradeSimPlayer[];
};

export type TradeSketchSide = {
  sentSalary: number | null;
  receivedSalary: number | null;
  salaryNet: number | null;
  knownCommitmentsAfter: number | null;
  sentDrbl: number | null;
  receivedDrbl: number | null;
  drblNet: number | null;
};

export type TradeSketch = {
  completeSalary: boolean;
  completeImpact: boolean;
  sideA: TradeSketchSide;
  sideB: TradeSketchSide;
  sentCountA: number;
  sentCountB: number;
};

function playersById(team: TradeSimTeam, ids: string[]): TradeSimPlayer[] {
  const want = new Set(ids);
  return team.players.filter((player) => want.has(player.id));
}

function sumSalary(players: TradeSimPlayer[]): number | null {
  if (players.some((player) => player.salary == null)) return null;
  return players.reduce((sum, player) => sum + (player.salary ?? 0), 0);
}

function sumDrbl(players: TradeSimPlayer[]): number | null {
  if (players.some((player) => player.drbl100 == null)) return null;
  return players.reduce((sum, player) => sum + (player.drbl100 ?? 0), 0);
}

function sideSketch(
  team: TradeSimTeam,
  sent: TradeSimPlayer[],
  received: TradeSimPlayer[]
): TradeSketchSide {
  const sentSalary = sumSalary(sent);
  const receivedSalary = sumSalary(received);
  const salaryNet =
    sentSalary != null && receivedSalary != null
      ? receivedSalary - sentSalary
      : null;
  const knownCommitmentsAfter =
    salaryNet == null ? null : team.knownCommitments + salaryNet;
  const sentDrbl = sent.length ? sumDrbl(sent) : 0;
  const receivedDrbl = received.length ? sumDrbl(received) : 0;
  const drblNet =
    sentDrbl != null && receivedDrbl != null ? receivedDrbl - sentDrbl : null;
  return {
    sentSalary,
    receivedSalary,
    salaryNet,
    knownCommitmentsAfter,
    sentDrbl,
    receivedDrbl,
    drblNet,
  };
}

export function summarizePlayerTrade(
  teamA: TradeSimTeam,
  sendA: string[],
  teamB: TradeSimTeam,
  sendB: string[]
): TradeSketch {
  const sentA = playersById(teamA, sendA);
  const sentB = playersById(teamB, sendB);
  const sideA = sideSketch(teamA, sentA, sentB);
  const sideB = sideSketch(teamB, sentB, sentA);
  return {
    completeSalary: sideA.salaryNet != null && sideB.salaryNet != null,
    completeImpact: sideA.drblNet != null && sideB.drblNet != null,
    sideA,
    sideB,
    sentCountA: sentA.length,
    sentCountB: sentB.length,
  };
}
