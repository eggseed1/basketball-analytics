/**
 * Published-method DRBL/100, DRBL-P raw rate and possessions rebuilt from a
 * window of local normalized games. Needs the fitted EPV coefficients loaded
 * (requireEpvModel) before the first call.
 */
import { attributeGamePlayerValue, finalizePlayerSeasonRows } from "../models/player-value";
import {
  accumulateReplacementSignals,
  buildReplacementPool,
  finalizeRoleAccum,
} from "../models/replacement";
import { loadNormalizedGame } from "./m16c-dataset";

export interface WindowDrbl {
  drbl100: Map<string, number>;
  raw: Map<string, number>;
  possessions: Map<string, number>;
}

export async function drblForWindow(
  season: string,
  gameIds: readonly string[],
  canon: (id: string) => string = (id) => id
): Promise<WindowDrbl> {
  const roleAccum = new Map();
  let cutoff = "";
  for (const id of gameIds) {
    const g = await loadNormalizedGame(season, id);
    if (!g) continue;
    accumulateReplacementSignals(g.box, g.events, g.possessions, roleAccum);
    if (g.box.gameDate > cutoff) cutoff = g.box.gameDate;
  }
  const candidates = finalizeRoleAccum(roleAccum);
  const rolesByPlayer = new Map(candidates.map((c) => [c.playerId, c.role]));
  const replacementPool = buildReplacementPool(candidates, {
    cutoffDate: cutoff || "9999-12-31",
    level: "R1",
  });
  const acc = new Map();
  for (const id of gameIds) {
    const g = await loadNormalizedGame(season, id);
    if (!g) continue;
    attributeGamePlayerValue(g.box, g.events, g.possessions, acc, { replacementPool, rolesByPlayer });
  }
  const rows = finalizePlayerSeasonRows(acc, {
    minPossessions: 1,
    lineupRatingsPer100: null,
    behaviorRatingsPer100: null,
  });
  return {
    drbl100: new Map(rows.map((r) => [canon(r.playerId), r.drbl100])),
    raw: new Map(rows.map((r) => [canon(r.playerId), r.rawAbilityRate])),
    possessions: new Map(rows.map((r) => [canon(r.playerId), r.possessions])),
  };
}
