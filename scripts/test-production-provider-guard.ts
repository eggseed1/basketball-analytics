/**
 * Production DATA_PROVIDER guard - regression for the silent empty-career footgun.
 * Run: npm run test:production-provider-guard
 */
import assert from "node:assert/strict";

import {
  assessProductionProviderGuard,
  assertLiveNbaProviderOrThrow,
  looksLikeEspnAthleteId,
  requireNbaProviderForTest,
} from "../src/data/diagnostics/production-provider-guard";

console.log("ESPN athlete id shape…");
assert.equal(looksLikeEspnAthleteId("3112335"), true);
assert.equal(looksLikeEspnAthleteId("1966"), true);
assert.equal(looksLikeEspnAthleteId("jokic"), false);
assert.equal(looksLikeEspnAthleteId("tatum"), false);

console.log("exact failure mode: unset → local + ESPN id → 0 rows…");
{
  const guard = assessProductionProviderGuard({
    providerName: "local",
    playerId: "3112335",
    careerRowCount: 0,
    configuredKey: "local",
    expectsLiveNba: true,
  });
  assert.equal(guard.status, "sample_provider_on_canonical_id");
  assert.equal(guard.isSilentEmptyCareerRisk, true);
  assert.match(guard.message, /DATA_PROVIDER=nba/i);
  assert.match(guard.message, /sample/i);
  // Must NOT look like a normal empty career copy alone.
  assert.doesNotMatch(guard.label, /No career season rows available/i);
}

console.log("intentional local sample lookup by slug can be empty without Vercel risk…");
{
  const guard = assessProductionProviderGuard({
    providerName: "local",
    playerId: "nobody",
    careerRowCount: 0,
    configuredKey: "local",
    expectsLiveNba: false,
  });
  assert.equal(guard.status, "sample_provider_empty_career");
  assert.equal(guard.isSilentEmptyCareerRisk, false);
}

console.log("live nba with rows → ok…");
{
  const guard = assessProductionProviderGuard({
    providerName: "nba",
    playerId: "3112335",
    careerRowCount: 11,
    configuredKey: "nba",
    expectsLiveNba: true,
  });
  assert.equal(guard.status, "ok");
  assert.equal(guard.isSilentEmptyCareerRisk, false);
}

console.log("live nba empty career → distinct from sample misconfig…");
{
  const guard = assessProductionProviderGuard({
    providerName: "nba",
    playerId: "3112335",
    careerRowCount: 0,
    configuredKey: "nba",
    expectsLiveNba: true,
  });
  assert.equal(guard.status, "live_provider_empty_career");
  assert.equal(guard.isSilentEmptyCareerRisk, false);
  assert.doesNotMatch(guard.message, /Set DATA_PROVIDER=nba/);
}

console.log("deployment invariant throws when Vercel/nba expects live but sample is active…");
assert.throws(
  () =>
    assertLiveNbaProviderOrThrow({
      providerName: "local",
      configuredKey: "nba",
    }),
  /Production data invariant failed/
);
assert.doesNotThrow(() =>
  assertLiveNbaProviderOrThrow({
    providerName: "nba",
    configuredKey: "nba",
  })
);

console.log("requireNbaProviderForTest is loud when sample is active…");
assert.throws(
  () =>
    requireNbaProviderForTest({
      providerName: "local",
      testName: "parity-audit",
    }),
  /NBA provider required for this test/
);
assert.doesNotThrow(() =>
  requireNbaProviderForTest({
    providerName: "nba",
    testName: "parity-audit",
  })
);

console.log("OK - production-provider-guard");
