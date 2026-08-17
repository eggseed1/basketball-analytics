import type {
  DrblBoxScore,
  DrblEvent,
  DrblGameReconcileReport,
  DrblLineupReconcileReport,
  DrblPossession,
  DrblReconcileStatDiff,
} from "../types";

interface EventTotals {
  points: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  threePointersMade: number;
  threePointersAttempted: number;
  freeThrowsMade: number;
  freeThrowsAttempted: number;
  offensiveRebounds: number;
  defensiveRebounds: number;
  turnovers: number;
  steals: number;
  blocks: number;
}

function emptyTotals(): EventTotals {
  return {
    points: 0,
    fieldGoalsMade: 0,
    fieldGoalsAttempted: 0,
    threePointersMade: 0,
    threePointersAttempted: 0,
    freeThrowsMade: 0,
    freeThrowsAttempted: 0,
    offensiveRebounds: 0,
    defensiveRebounds: 0,
    turnovers: 0,
    steals: 0,
    blocks: 0,
  };
}

function tallyEvents(events: DrblEvent[]): Map<string, EventTotals> {
  const byPlayer = new Map<string, EventTotals>();

  function row(playerId: string): EventTotals {
    let t = byPlayer.get(playerId);
    if (!t) {
      t = emptyTotals();
      byPlayer.set(playerId, t);
    }
    return t;
  }

  for (const event of events) {
    if (!event.playerId) continue;
    const t = row(event.playerId);

    if (event.actionType === "2pt") {
      t.fieldGoalsAttempted += 1;
      if (event.shotResult === "Made") {
        t.fieldGoalsMade += 1;
        t.points += 2;
      }
    } else if (event.actionType === "3pt") {
      t.fieldGoalsAttempted += 1;
      t.threePointersAttempted += 1;
      if (event.shotResult === "Made") {
        t.fieldGoalsMade += 1;
        t.threePointersMade += 1;
        t.points += 3;
      }
    } else if (event.actionType === "freethrow") {
      t.freeThrowsAttempted += 1;
      if (event.shotResult === "Made") {
        t.freeThrowsMade += 1;
        t.points += 1;
      }
    } else if (event.actionType === "rebound") {
      if (event.subType.toLowerCase().includes("offensive")) {
        t.offensiveRebounds += 1;
      } else if (event.subType.toLowerCase().includes("defensive")) {
        t.defensiveRebounds += 1;
      }
    } else if (event.actionType === "turnover") {
      t.turnovers += 1;
    } else if (event.actionType === "steal") {
      t.steals += 1;
    } else if (event.actionType === "block") {
      t.blocks += 1;
    }
  }

  return byPlayer;
}

const COMPARE_FIELDS: Array<{
  field: keyof EventTotals | "rebounds";
  box: (p: DrblBoxScore["players"][number]) => number;
  events: (t: EventTotals) => number;
}> = [
  { field: "points", box: (p) => p.points, events: (t) => t.points },
  {
    field: "fieldGoalsMade",
    box: (p) => p.fieldGoalsMade,
    events: (t) => t.fieldGoalsMade,
  },
  {
    field: "fieldGoalsAttempted",
    box: (p) => p.fieldGoalsAttempted,
    events: (t) => t.fieldGoalsAttempted,
  },
  {
    field: "threePointersMade",
    box: (p) => p.threePointersMade,
    events: (t) => t.threePointersMade,
  },
  {
    field: "threePointersAttempted",
    box: (p) => p.threePointersAttempted,
    events: (t) => t.threePointersAttempted,
  },
  {
    field: "freeThrowsMade",
    box: (p) => p.freeThrowsMade,
    events: (t) => t.freeThrowsMade,
  },
  {
    field: "freeThrowsAttempted",
    box: (p) => p.freeThrowsAttempted,
    events: (t) => t.freeThrowsAttempted,
  },
  {
    field: "offensiveRebounds",
    box: (p) => p.offensiveRebounds,
    events: (t) => t.offensiveRebounds,
  },
  {
    field: "defensiveRebounds",
    box: (p) => p.defensiveRebounds,
    events: (t) => t.defensiveRebounds,
  },
  {
    field: "rebounds",
    box: (p) => p.rebounds,
    events: (t) => t.offensiveRebounds + t.defensiveRebounds,
  },
  { field: "turnovers", box: (p) => p.turnovers, events: (t) => t.turnovers },
  { field: "steals", box: (p) => p.steals, events: (t) => t.steals },
  { field: "blocks", box: (p) => p.blocks, events: (t) => t.blocks },
];

/**
 * Reconcile reconstructed possessions + event tallies to official box score.
 * Failed score reconciliation → quarantined (not training data).
 */
export function reconcileGame(
  box: DrblBoxScore,
  events: DrblEvent[],
  possessions: DrblPossession[],
  options: {
    maxAbsPlayerDelta?: number;
    lineup?: DrblLineupReconcileReport | null;
  } = {}
): DrblGameReconcileReport {
  const maxAbsPlayerDelta = options.maxAbsPlayerDelta ?? 0;
  const warnings: string[] = [];
  const playerDiffs: DrblReconcileStatDiff[] = [];

  let homePointsFromPossessions = 0;
  let awayPointsFromPossessions = 0;
  for (const possession of possessions) {
    if (possession.offenseTeamId === box.homeTeamId) {
      homePointsFromPossessions += possession.points;
    } else if (possession.offenseTeamId === box.awayTeamId) {
      awayPointsFromPossessions += possession.points;
    }
  }

  const scoreDeltaHome = homePointsFromPossessions - box.homeScore;
  const scoreDeltaAway = awayPointsFromPossessions - box.awayScore;
  if (scoreDeltaHome !== 0 || scoreDeltaAway !== 0) {
    warnings.push(
      `Possession points ${homePointsFromPossessions}-${awayPointsFromPossessions} vs box ${box.homeScore}-${box.awayScore}`
    );
  }

  const tallies = tallyEvents(events);
  for (const player of box.players) {
    if (player.minutes <= 0 && player.points === 0) continue;
    const t = tallies.get(player.playerId) ?? emptyTotals();
    for (const cmp of COMPARE_FIELDS) {
      const boxVal = cmp.box(player);
      const eventVal = cmp.events(t);
      const delta = eventVal - boxVal;
      if (Math.abs(delta) > maxAbsPlayerDelta) {
        playerDiffs.push({
          playerId: player.playerId,
          playerName: player.playerName,
          teamId: player.teamId,
          field: cmp.field,
          box: boxVal,
          events: eventVal,
          delta,
        });
      }
    }
  }

  let homeEventPts = 0;
  let awayEventPts = 0;
  for (const player of box.players) {
    const t = tallies.get(player.playerId);
    if (!t) continue;
    if (player.teamId === box.homeTeamId) homeEventPts += t.points;
    if (player.teamId === box.awayTeamId) awayEventPts += t.points;
  }
  if (homeEventPts !== box.homeScore || awayEventPts !== box.awayScore) {
    warnings.push(
      `Event-tallied points ${homeEventPts}-${awayEventPts} vs box ${box.homeScore}-${box.awayScore}`
    );
  }

  const lineup = options.lineup ?? null;
  if (lineup && !lineup.ok) {
    warnings.push(...lineup.warnings.map((w) => `lineup: ${w}`));
  }

  const scoreOk =
    scoreDeltaHome === 0 &&
    scoreDeltaAway === 0 &&
    homeEventPts === box.homeScore &&
    awayEventPts === box.awayScore;
  const quarantined = !scoreOk;
  // Overall ok = scoring + box event tallies. Lineup minutes are reported
  // separately (M4) and do not block Core v0 attribution.
  const ok = scoreOk && playerDiffs.length === 0;

  return {
    gameId: box.gameId,
    ok,
    quarantined,
    possessionCount: possessions.length,
    homePointsFromPossessions,
    awayPointsFromPossessions,
    homeScoreBox: box.homeScore,
    awayScoreBox: box.awayScore,
    scoreDeltaHome,
    scoreDeltaAway,
    playerDiffs,
    lineup,
    warnings,
  };
}
