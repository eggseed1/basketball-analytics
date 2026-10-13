import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  includeGameInSeasonModel,
  seasonRequiresLineupMinutes,
} from "../compute-season";

describe("historical lineup minute gate", () => {
  it("requires matching minutes before 2020-21 and not after", () => {
    assert.equal(seasonRequiresLineupMinutes("2019-20"), true);
    assert.equal(seasonRequiresLineupMinutes("2018-19"), true);
    assert.equal(seasonRequiresLineupMinutes("2020-21"), false);
    assert.equal(seasonRequiresLineupMinutes("2025-26"), false);
  });

  it("drops a score-clean game when minutes miss and the gate is on", () => {
    const reconcile = { quarantined: false, lineup: { ok: false } };
    assert.equal(includeGameInSeasonModel(reconcile, { requireLineupMinutes: true }), false);
    assert.equal(includeGameInSeasonModel(reconcile, { requireLineupMinutes: false }), true);
  });

  it("never trains on a quarantined score", () => {
    const reconcile = { quarantined: true, lineup: { ok: true } };
    assert.equal(includeGameInSeasonModel(reconcile, { requireLineupMinutes: false }), false);
  });
});
