/**
 * Post-M7 — aggregate M6 ÊPV_shoot + M7-CV C2 V_cont into player accumulators.
 * SDV = ÊPV_shoot − V_cont; ShotMaking separate. Never folded into fusion here.
 */

import type { DrblProcessedGame } from "../index";
import {
  buildShotRowsForGame,
  chronologicalOofShotDecision,
} from "./shot-decision";
import {
  chronologicalOofContinuation,
  buildContinueRowsForGame,
  continueStateAtShot,
  predictVCont,
  accumulateTeamPppFromPossessions,
  possessionStartFlags,
  type TeamPppPrior,
} from "./continuation-value";
import type { DrblPlayerAccumulator } from "./player-value";

/**
 * Chronological OOF shoot + C2 continue on the season's games; accumulate
 * into existing player accumulators (must already have P attribution).
 */
export function accumulateShotDecisionComponents(
  processedGames: DrblProcessedGame[],
  accumulators: Map<string, DrblPlayerAccumulator>,
  options: { holdoutFrac?: number } = {}
): {
  continueCorrC2: number;
  continueMaeC2: number;
  continueMaeC0: number;
  shotsScored: number;
} {
  const holdoutFrac = options.holdoutFrac ?? 0.2;
  const sorted = processedGames
    .slice()
    .sort(
      (a, b) =>
        (a.box.gameDate || "").localeCompare(b.box.gameDate || "") ||
        a.box.gameId.localeCompare(b.box.gameId)
    );

  const shotBundles = sorted.map((g) => ({
    gameDate: g.box.gameDate || "",
    gameId: g.box.gameId,
    rows: buildShotRowsForGame(g.box, g.events, g.possessions),
  }));
  const contBundles = sorted.map((g) => ({
    gameDate: g.box.gameDate || "",
    gameId: g.box.gameId,
    continueRows: buildContinueRowsForGame(g.box, g.events, g.possessions),
    possessions: g.possessions,
  }));

  const shotOof = chronologicalOofShotDecision(shotBundles, {
    holdoutFrac,
    lambda: 5,
  });
  const contOof = chronologicalOofContinuation(contBundles, {
    holdoutFrac,
    lambda: 5,
  });

  const shotByKey = new Map(
    shotOof.oof.map((r) => [`${r.gameId}:${r.actionNumber}`, r] as const)
  );

  // Expanding team priors; C2 coefficients from train-only fit.
  const priors = new Map<string, TeamPppPrior>();
  let shotsScored = 0;

  for (const g of sorted) {
    for (const shot of buildShotRowsForGame(g.box, g.events, g.possessions)) {
      const m6 = shotByKey.get(`${shot.gameId}:${shot.actionNumber}`);
      if (!m6) continue;
      const poss = g.possessions.find(
        (p) => p.possessionId === shot.possessionId
      );
      const age = Math.max(
        0,
        (poss?.startClockSeconds ?? shot.clockSeconds) - shot.clockSeconds
      );
      const before = g.events.filter(
        (e) =>
          e.actionNumber < shot.actionNumber &&
          (poss?.eventActionNumbers.includes(e.actionNumber) ?? false)
      );
      const flags = possessionStartFlags(before);
      const st = continueStateAtShot({
        gameId: shot.gameId,
        gameDate: shot.gameDate,
        actionNumber: shot.actionNumber,
        possessionId: shot.possessionId,
        period: shot.period,
        clockSeconds: shot.clockSeconds,
        scoreDiff: shot.scoreDiff,
        offenseIsHome: shot.offenseIsHome,
        possessionAgeSec: age,
        startedViaOreb: flags.startedViaOreb,
        startedViaSteal: flags.startedViaSteal,
        teamId: shot.teamId,
        defenseTeamId: shot.defenseTeamId,
      });
      const vCont = predictVCont(
        st,
        "C2",
        contOof.c1Coef,
        contOof.c2Coef,
        priors
      );
      const sdv = m6.epvShoot - vCont;
      const row = accumulators.get(shot.playerId);
      if (!row) continue;
      row.sdvSum += sdv;
      row.sdvN += 1;
      row.shotMakingSum += m6.shotMaking;
      row.shotMakingN += 1;
      row.epvShootSum += m6.epvShoot;
      row.vContSum += vCont;
      shotsScored += 1;
    }
    accumulateTeamPppFromPossessions(g.possessions, priors);
  }

  return {
    continueCorrC2: contOof.c2.corr,
    continueMaeC2: contOof.c2.mae,
    continueMaeC0: contOof.c0.mae,
    shotsScored,
  };
}
