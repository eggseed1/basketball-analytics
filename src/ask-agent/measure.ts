export type MeasurePlan = {
  claim: string;
  level: string;
  hole: string;
  rejected: string;
};

const SHAPE =
  /hole|system|interchange|complete|two-way|two way|well-rounded|well rounded|scheme|any coach|versatil|no weak/i;

/** A judgment about the shape of a game, not a plain stat ranking. */
export function needsMeasure(question: string): boolean {
  return SHAPE.test(question);
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

/**
 * Checks that a plan separates "this player is good" from "this player has no hole."
 * It does not pick a winner or a cutoff.
 */
export function reviewMeasure(question: string, plan: MeasurePlan): { ok: true; guidance: string } | { ok: false; error: string } {
  if (!plan.claim || !plan.level || !plan.hole || !plan.rejected) {
    return {
      ok: false,
      error: "Name the basketball claim, the column for overall impact, the column for the hole (or none), and the measure you are rejecting.",
    };
  }

  const levelOk = /impact_ratings\.total|drbl_per100|wins_above_r1/.test(plan.level);
  if (!levelOk) {
    return {
      ok: false,
      error:
        "Overall impact has to be impact_ratings.total, drbl_per100, or wins_above_r1. A component, a box stat, or a count of teams does not say how good the player is.",
    };
  }

  const aboutShape = needsMeasure(question) || SHAPE.test(plan.claim);
  if (!aboutShape) {
    return {
      ok: true,
      guidance: "Query that measure. Every number in the answer has to come back in the rows.",
    };
  }

  const hole = plan.hole.toLowerCase();
  const usesDarkoEnds = /impact_ratings/.test(hole) && /offense/.test(hole) && /defense/.test(hole);
  if (!usesDarkoEnds) {
    return {
      ok: false,
      error:
        "A hole is the weaker of DARKO offense and DARKO defense in impact_ratings (source darko). Those are points per 100 versus an average player. DRBL offense, defense, and playmaking are one diagnostic, not the two ends of overall impact, so do not rank by their minimum. A high DRBL floor only means the impact stayed high.",
    };
  }

  return {
    ok: true,
    guidance:
      "Query DARKO seasons, source darko, from 2022-23 on. Keep seasons where total is star-level (around +4 or better) and both offense and defense are clearly positive (about +1 or better). A barely positive end is still a hole. Require more than one such season. Rank by the lowest MIN(offense, defense) in those seasons, and also return average total. Come back with several players, not one row. In the answer, name whose weaker end holds up and who is the best overall player on that list when those are different people. Say this is two-way completeness. There is no coach column.",
  };
}

export function planFromArgs(args: Record<string, unknown>): MeasurePlan {
  return {
    claim: text(args.claim),
    level: text(args.level),
    hole: text(args.hole),
    rejected: text(args.rejected),
  };
}
