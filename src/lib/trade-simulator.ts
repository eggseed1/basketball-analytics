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
  drblO: number | null;
  drblD: number | null;
  war1: number | null;
  position: string | null;
  age: number | null;
  games: number | null;
  mpg: number | null;
  points: number | null;
  assists: number | null;
  rebounds: number | null;
  steals: number | null;
  blocks: number | null;
  ts: number | null;
  usg: number | null;
  bpm: number | null;
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

export type PublishedCapLines = {
  salaryCap: number;
  luxuryTax: number;
  firstApron: number | null;
  secondApron: number | null;
};

/** Where known salary commitments sit. Not a cap-sheet or legality ruling. */
export type KnownSalaryLine =
  | "under cap"
  | "over cap, under tax"
  | "over tax"
  | "over tax, under first apron"
  | "over first apron, under second apron"
  | "over first apron"
  | "over second apron";

/** Dollars under (−) or over (+) a published line for known commitments only. */
export type KnownRoomStrip = {
  toCap: number;
  toTax: number;
  toFirstApron: number | null;
  toSecondApron: number | null;
};

export type PackageShape = {
  count: number;
  avgAge: number | null;
  avgMpg: number | null;
  positions: string[];
};

export type TradeSketchSide = {
  sentSalary: number | null;
  receivedSalary: number | null;
  salaryNet: number | null;
  knownCommitmentsAfter: number | null;
  knownLineBefore: KnownSalaryLine;
  knownLineAfter: KnownSalaryLine | null;
  roomBefore: KnownRoomStrip;
  roomAfter: KnownRoomStrip | null;
  rosterCountBefore: number;
  rosterCountAfter: number;
  sentPackage: PackageShape;
  receivedPackage: PackageShape;
  sentDrbl: number | null;
  receivedDrbl: number | null;
  drblNet: number | null;
  war1Net: number | null;
  bpmNet: number | null;
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

function sumWar1(players: TradeSimPlayer[]): number | null {
  if (players.some((player) => player.war1 == null)) return null;
  return players.reduce((sum, player) => sum + (player.war1 ?? 0), 0);
}

function sumBpm(players: TradeSimPlayer[]): number | null {
  if (players.some((player) => player.bpm == null)) return null;
  return players.reduce((sum, player) => sum + (player.bpm ?? 0), 0);
}

export function knownSalaryLine(
  amount: number,
  lines: PublishedCapLines
): KnownSalaryLine {
  if (lines.secondApron != null && amount >= lines.secondApron) {
    return "over second apron";
  }
  if (lines.firstApron != null && amount >= lines.firstApron) {
    return lines.secondApron != null
      ? "over first apron, under second apron"
      : "over first apron";
  }
  if (amount >= lines.luxuryTax) {
    return lines.firstApron != null
      ? "over tax, under first apron"
      : "over tax";
  }
  if (amount >= lines.salaryCap) return "over cap, under tax";
  return "under cap";
}

/** Positive = under the line. Negative = over the line. */
export function knownRoomStrip(
  amount: number,
  lines: PublishedCapLines
): KnownRoomStrip {
  return {
    toCap: lines.salaryCap - amount,
    toTax: lines.luxuryTax - amount,
    toFirstApron:
      lines.firstApron == null ? null : lines.firstApron - amount,
    toSecondApron:
      lines.secondApron == null ? null : lines.secondApron - amount,
  };
}

export function packageShape(players: TradeSimPlayer[]): PackageShape {
  const ages = players
    .map((player) => player.age)
    .filter((value): value is number => value != null && Number.isFinite(value));
  const mpgs = players
    .map((player) => player.mpg)
    .filter((value): value is number => value != null && Number.isFinite(value));
  const positions = [
    ...new Set(
      players
        .map((player) => player.position?.trim())
        .filter((value): value is string => Boolean(value))
    ),
  ].sort();
  return {
    count: players.length,
    avgAge: ages.length
      ? ages.reduce((sum, value) => sum + value, 0) / ages.length
      : null,
    avgMpg: mpgs.length
      ? mpgs.reduce((sum, value) => sum + value, 0) / mpgs.length
      : null,
    positions,
  };
}

function netOf(
  sent: TradeSimPlayer[],
  received: TradeSimPlayer[],
  sum: (players: TradeSimPlayer[]) => number | null
): number | null {
  const sentTotal = sent.length ? sum(sent) : 0;
  const receivedTotal = received.length ? sum(received) : 0;
  if (sentTotal == null || receivedTotal == null) return null;
  return receivedTotal - sentTotal;
}

function sideSketch(
  team: TradeSimTeam,
  sent: TradeSimPlayer[],
  received: TradeSimPlayer[],
  lines: PublishedCapLines
): TradeSketchSide {
  const sentSalary = sumSalary(sent);
  const receivedSalary = sumSalary(received);
  const salaryNet =
    sentSalary != null && receivedSalary != null
      ? receivedSalary - sentSalary
      : null;
  const knownCommitmentsAfter =
    salaryNet == null ? null : team.knownCommitments + salaryNet;
  const rosterCountBefore = team.players.length;
  return {
    sentSalary,
    receivedSalary,
    salaryNet,
    knownCommitmentsAfter,
    knownLineBefore: knownSalaryLine(team.knownCommitments, lines),
    knownLineAfter:
      knownCommitmentsAfter == null
        ? null
        : knownSalaryLine(knownCommitmentsAfter, lines),
    roomBefore: knownRoomStrip(team.knownCommitments, lines),
    roomAfter:
      knownCommitmentsAfter == null
        ? null
        : knownRoomStrip(knownCommitmentsAfter, lines),
    rosterCountBefore,
    rosterCountAfter: rosterCountBefore - sent.length + received.length,
    sentPackage: packageShape(sent),
    receivedPackage: packageShape(received),
    sentDrbl: sent.length ? sumDrbl(sent) : 0,
    receivedDrbl: received.length ? sumDrbl(received) : 0,
    drblNet: netOf(sent, received, sumDrbl),
    war1Net: netOf(sent, received, sumWar1),
    bpmNet: netOf(sent, received, sumBpm),
  };
}

export function summarizePlayerTrade(
  teamA: TradeSimTeam,
  sendA: string[],
  teamB: TradeSimTeam,
  sendB: string[],
  lines: PublishedCapLines
): TradeSketch {
  const sentA = playersById(teamA, sendA);
  const sentB = playersById(teamB, sendB);
  const sideA = sideSketch(teamA, sentA, sentB, lines);
  const sideB = sideSketch(teamB, sentB, sentA, lines);
  return {
    completeSalary: sideA.salaryNet != null && sideB.salaryNet != null,
    completeImpact: sideA.drblNet != null && sideB.drblNet != null,
    sideA,
    sideB,
    sentCountA: sentA.length,
    sentCountB: sentB.length,
  };
}
