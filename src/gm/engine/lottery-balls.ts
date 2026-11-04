/**
 * 2027–29 NBA "3-2-1" lottery urn. Each of 37 distinct physical balls has
 * exactly one owner, making P(first pick) = 1, 2 or 3 divided by 37.
 *
 * The NBA has not specified a public mechanical procedure for applying its
 * pick restrictions. We use transparent rejection sampling: a ball that would
 * violate a mandated pick limit returns to the mixer and another is drawn.
 * This preserves proportional odds among legally eligible balls.
 *
 * These are the actual persisted draws that the animation replays. The 2-D
 * bouncing-ball visuals never pick a second winner.
 */
/** For new trades, NBA rules beginning with the 2027 Draft bar top-12, 13, 14 and 15 protection. */
export function legalNew321PickProtection(draftSeason: number, topN: number | null | undefined): boolean {
  return topN == null || topN <= 0 || draftSeason <= 2026 || topN < 12 || topN > 15;
}

export interface LotteryBall { id: number; teamId: string }
export interface LotteryAttempt {
  ballId: number;
  teamId: string;
  accepted: boolean;
  reason?: "consecutive-number-one" | "third-top-five" | "relegation-floor";
}
export interface PhysicalLotteryDraw {
  teamId: string;
  balls: number[];
  startingRank: number;
  oddsPct: number;
  attempts: LotteryAttempt[];
}
export interface PhysicalLotteryResult {
  draws: PhysicalLotteryDraw[];
  ballPool: LotteryBall[];
}

export function build321BallPool(
  eligible: string[], weights: ReadonlyMap<string, number>,
): LotteryBall[] {
  let id = 1;
  const result = eligible.flatMap(teamId =>
    Array.from({ length: weights.get(teamId) ?? 0 }, () => ({ id: id++, teamId }))
  );
  if (eligible.length !== 16 || result.length !== 37 ||
      new Set(eligible).size !== 16) {
    throw new Error("3-2-1 lottery requires 16 unique teams and exactly 37 balls");
  }
  return result;
}

export function draw321PhysicalUrn(args: {
  eligible: string[];
  weights: ReadonlyMap<string, number>;
  relegated: ReadonlySet<string>;
  previousWinner?: string;
  previousTopFive: ReadonlySet<string>;
  random: () => number;
}): PhysicalLotteryResult {
  const { eligible, weights, relegated, previousWinner, previousTopFive, random } = args;
  const ballPool = build321BallPool(eligible, weights);
  const remainingTeams = new Set(eligible);
  const draws: PhysicalLotteryDraw[] = [];
  for (let pick = 1; pick <= 16; pick++) {
    const relegatedLeft = [...remainingTeams].filter(id => relegated.has(id)).length;
    // If all remaining relegated picks must be assigned by slot 12,
    // do not let a different club consume one of their remaining slots.
    const mustRelegate = pick <= 12 && relegatedLeft === 13 - pick;
    const reasonFor = (teamId: string): LotteryAttempt["reason"] | undefined => {
      if (mustRelegate && !relegated.has(teamId)) return "relegation-floor";
      if (pick === 1 && teamId === previousWinner) return "consecutive-number-one";
      if (pick <= 5 && previousTopFive.has(teamId)) return "third-top-five";
      return undefined;
    };
    const eligibleForPick = [...remainingTeams].filter(id => !reasonFor(id));
    if (!eligibleForPick.length) {
      throw new Error("Lottery archive is incompatible with required 2027 pick restrictions");
    }
    const urn = ballPool.filter(ball => remainingTeams.has(ball.teamId));
    const attempts: LotteryAttempt[] = [];
    let winner: LotteryBall | undefined;
    // A rejected ball is RETURNED TO the urn; only a valid winner's full
    // allotment is removed. Each attempted ball is sampled uniformly.
    for (let tryNumber = 0; tryNumber < 2048; tryNumber++) {
      const sample = Math.min(urn.length - 1, Math.floor(random() * urn.length));
      const ball = urn[sample]!;
      const reason = reasonFor(ball.teamId);
      attempts.push({ ballId: ball.id, teamId: ball.teamId,
        accepted: !reason, ...(reason ? { reason } : {}) });
      if (!reason) { winner = ball; break; }
    }
    if (!winner) throw new Error("Lottery draw exceeded rejection-sampling safety limit");
    draws.push({
      teamId: winner.teamId,
      balls: [winner.id],
      startingRank: eligible.indexOf(winner.teamId) + 1,
      oddsPct: Math.round((weights.get(winner.teamId) ?? 0) / 37 * 1000) / 10,
      attempts,
    });
    remainingTeams.delete(winner.teamId);
  }
  return { draws, ballPool };
}
