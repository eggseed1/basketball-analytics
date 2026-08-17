/**
 * Data-truth hardening — guard against fabricated missing values.
 * Run: npm run test:data-truth
 *
 * Protects the failure class: provider missing field → transformer invents 0
 * or a fake estimate (e.g. historical DRtg=0 / NET=ORtg−110).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  approxOffensiveRating,
  effectiveFieldGoalPct,
  trueShootingPct,
  usagePct,
} from "../src/data/providers/nba/compute-advanced";
import {
  buildHistoricalImpactIndex,
  queryHistoricalImpact,
} from "../src/data/providers/impact/historical-impact-index";
import { transformEspnPlayerSeason } from "../src/data/transformers/espn";
import { transformNbaPlayerSeason } from "../src/data/transformers/nba";
import {
  sortExplorePlayerRows,
  toExplorePlayerBoardRow,
} from "../src/data/queries/explore-players-board";
import { getAskCoverageGaps } from "../src/query-engine/coverage";
import { HISTORICAL_IMPACT_METHODOLOGY_VERSION } from "../src/data/types/historical-impact";
import type { PlayerSeason } from "../src/data/types";

function espnBoardRow(overrides?: {
  teamTotals?: boolean;
  fga?: number;
}): PlayerSeason {
  const fga = overrides?.fga ?? 1000;
  const teamMap = overrides?.teamTotals === false
    ? new Map()
    : new Map([
        [
          "7",
          {
            teamId: "7",
            abbreviation: "DEN",
            fullName: "Denver Nuggets",
            gamesPlayed: 70,
            fieldGoalsAttempted: 6000,
            freeThrowsAttempted: 2000,
            turnovers: 1000,
            points: 8000,
          },
        ],
      ]);

  return transformEspnPlayerSeason(
    {
      athlete: {
        id: "203999",
        displayName: "Nikola Jokic",
        teamId: "7",
        position: { abbreviation: "C" },
      },
      categories: [
        {
          name: "general",
          totals: [
            "70",
            "2400",
            "1800",
            "500",
            "700",
            "50",
            "40",
            "200",
            "600",
            String(fga),
            "80",
            "250",
            "300",
            "0.5",
            "0.4",
            "0.8",
          ],
        },
      ],
    } as never,
    "2025-26",
    teamMap as never,
    [
      {
        name: "general",
        displayName: "General",
        names: [
          "gamesPlayed",
          "minutes",
          "points",
          "assists",
          "rebounds",
          "steals",
          "blocks",
          "turnovers",
          "fieldGoalsMade",
          "fieldGoalsAttempted",
          "threePointFieldGoalsMade",
          "freeThrowsAttempted",
          "freeThrowsMade",
          "fieldGoalPct",
          "threePointFieldGoalPct",
          "freeThrowPct",
        ],
      },
    ] as never
  );
}

async function main() {
  // 1. Missing numeric provider field → remains missing (NBA Stats placeholder)
  {
    const row = transformNbaPlayerSeason(
      {
        PLAYER_ID: 1,
        PLAYER_NAME: "Test",
        TEAM_ID: 7,
        TEAM_ABBREVIATION: "DEN",
        GP: 10,
        MIN: 300,
        PTS: 200,
        AST: 50,
        REB: 80,
        STL: 10,
        BLK: 5,
        TOV: 20,
        FG_PCT: 0.5,
        FG3_PCT: 0.35,
        FT_PCT: 0.8,
        // TS / EFG / USG / ratings omitted
      },
      "2024-25",
      () => "Denver Nuggets"
    );
    assert.equal(row.trueShootingPct, undefined);
    assert.equal(row.effectiveFieldGoalPct, undefined);
    assert.equal(row.usagePct, undefined);
    assert.equal(row.defensiveRating, undefined);
    assert.equal(row.netRating, undefined);
  }

  // 2. Legitimate zero counting stats stay zero
  {
    const row = espnBoardRow();
    assert.equal(typeof row.blocks, "number");
    // Steals/blocks from fixture are > 0; craft a zero via slim projection path
    const zeroish: PlayerSeason = {
      ...row,
      steals: 0,
      blocks: 0,
    };
    assert.equal(zeroish.steals, 0);
    assert.equal(zeroish.blocks, 0);
    const slim = toExplorePlayerBoardRow(zeroish);
    assert.equal(slim.steals, 0);
    assert.equal(slim.spg, 0);
  }

  // 3. Valid derived statistic remains derived when inputs exist
  {
    const ts = trueShootingPct(100, 80, 20);
    assert.ok(ts != null && ts > 0 && ts < 1.5);
    const efg = effectiveFieldGoalPct(40, 10, 80);
    assert.ok(efg != null && efg > 0);
    const usg = usagePct({
      minutes: 2000,
      fieldGoalsAttempted: 800,
      freeThrowsAttempted: 200,
      turnovers: 100,
      teamGamesPlayed: 70,
      teamFieldGoalsAttempted: 6000,
      teamFreeThrowsAttempted: 2000,
      teamTurnovers: 1000,
    });
    assert.ok(usg != null && usg > 0);
    const ortg = approxOffensiveRating(1800, 1000, 250, 200);
    assert.ok(ortg != null && ortg > 0);
  }

  // 4. Missing denominator → no fake number
  {
    assert.equal(trueShootingPct(0, 0, 0), undefined);
    assert.equal(effectiveFieldGoalPct(0, 0, 0), undefined);
    assert.equal(approxOffensiveRating(0, 0, 0, 0), undefined);
    assert.equal(
      usagePct({
        minutes: 0,
        fieldGoalsAttempted: 10,
        freeThrowsAttempted: 2,
        turnovers: 1,
        teamGamesPlayed: 70,
        teamFieldGoalsAttempted: 6000,
        teamFreeThrowsAttempted: 2000,
        teamTurnovers: 1000,
      }),
      undefined
    );
  }

  // 5–6. ESPN DRtg / NET unavailable (never 0 / never ORtg−110)
  {
    const row = espnBoardRow();
    assert.equal(row.defensiveRating, undefined);
    assert.equal(row.netRating, undefined);
    assert.notEqual(row.defensiveRating, 0);
    assert.ok(
      row.offensiveRating == null || row.offensiveRating > 50,
      "approx ORtg only when possessions exist"
    );
    // No team totals → USG omitted (not 0)
    const noTeam = espnBoardRow({ teamTotals: false });
    assert.equal(noTeam.usagePct, undefined);
  }

  // 7–8. DARKO / LEBRON season-truth — reuse existing index contracts via source + fixture API
  {
    const impactIndexSrc = readFileSync(
      join(
        process.cwd(),
        "src/data/providers/impact/historical-impact-index.ts"
      ),
      "utf8"
    );
    assert.ok(
      impactIndexSrc.includes(
        "Live DARKO leaderboard snapshot admitted only for the stamped season"
      ) ||
        impactIndexSrc.includes(
          "DARKO live snapshot admitted only for its stamped canonical season"
        )
    );
    assert.ok(
      impactIndexSrc.includes("Does not invent missing seasons"),
      "queryHistoricalImpact must not invent missing seasons"
    );

    const index = await buildHistoricalImpactIndex({
      fixtures: [
        {
          playerId: "espn-1",
          nbaPlayerId: "1001",
          playerName: "Alpha Player",
          season: "2023-24",
          metric: "darko_dpm",
          value: 3.5,
          source: "darko",
          methodologyVersion: HISTORICAL_IMPACT_METHODOLOGY_VERSION,
          sourceVersion: "test",
          identityMatch: "nba_id",
          provenance: {
            dataset: "test",
            importedAt: "2026-01-01T00:00:00.000Z",
            notes: "fixture",
          },
        },
        {
          playerId: "espn-2",
          nbaPlayerId: "2002",
          playerName: "Beta Player",
          season: "2022-23",
          metric: "lebron",
          value: 2.1,
          source: "lebron",
          methodologyVersion: HISTORICAL_IMPACT_METHODOLOGY_VERSION,
          sourceVersion: "test",
          identityMatch: "nba_id",
          provenance: {
            dataset: "test",
            importedAt: "2026-01-01T00:00:00.000Z",
            notes: "fixture",
          },
        },
      ],
      includeLiveDarko: false,
      includeLebron: false,
      force: true,
    });
    assert.ok(Array.isArray(index.observations));
    assert.equal(
      queryHistoricalImpact(index, {
        playerId: "espn-1",
        season: "2018-19",
        metric: "darko_dpm",
      }).length,
      0
    );
    assert.equal(
      queryHistoricalImpact(index, {
        playerId: "espn-1",
        season: "2023-24",
        metric: "darko_dpm",
      }).length,
      1
    );
    assert.equal(
      queryHistoricalImpact(index, {
        playerId: "espn-2",
        season: "2024-25",
        metric: "lebron",
      }).length,
      0
    );
  }

  // 9. Production provider docs + guard exist (NBA, not silent sample)
  {
    const guardSrc = readFileSync(
      join(process.cwd(), "src/data/diagnostics/production-provider-guard.ts"),
      "utf8"
    );
    assert.ok(guardSrc.includes("sample_provider_on_canonical_id"));
    const providerSrc = readFileSync(
      join(process.cwd(), "src/data/providers/index.ts"),
      "utf8"
    );
    assert.ok(providerSrc.includes('VERCEL ? "nba"'));
  }

  // 10. ASK unavailable metric — coverage gaps keep DRtg/NET unsupported
  {
    const gaps = getAskCoverageGaps();
    const drtg = gaps.find((g) => g.label.includes("DRtg"));
    const net = gaps.find((g) => g.label.toLowerCase().includes("net"));
    assert.ok(drtg && drtg.reliable === false);
    assert.ok(net && net.reliable === false);
    assert.match(drtg!.notes, /missing|unavailable|does not publish/i);
    assert.doesNotMatch(drtg!.notes, /Often 0/);
  }

  // 11. Slim leaderboard projection preserves missingness
  {
    const row = espnBoardRow();
    const slim = toExplorePlayerBoardRow(row);
    assert.equal(slim.defensiveRating, undefined);
    assert.equal(slim.netRating, undefined);
    assert.equal("defensiveRating" in slim && slim.defensiveRating === 0, false);

    const withDrtg: PlayerSeason = {
      ...row,
      defensiveRating: 110,
      netRating: 3.4,
      offensiveRating: 113.4,
    };
    const slimOk = toExplorePlayerBoardRow(withDrtg);
    assert.equal(slimOk.offensiveRating, 113.4);
    assert.equal(slimOk.defensiveRating, 110);
    assert.equal(slimOk.netRating, 3.4);

    const mixed = sortExplorePlayerRows(
      [slim, slimOk],
      "defensiveRating",
      "asc"
    );
    assert.equal(mixed[mixed.length - 1]!.defensiveRating, undefined);
  }

  // 12. Historical season — no modern metric leakage (DARKO season gate in source)
  {
    const playersSrc = readFileSync(
      join(process.cwd(), "src/data/queries/players.ts"),
      "utf8"
    );
    assert.ok(
      playersSrc.includes("d.season !== boardSeason") ||
        playersSrc.includes("d.season !== boardSeason"),
      "live DARKO overlay must check stamped season"
    );
    assert.ok(
      playersSrc.includes("espnPlayerSeasonProvider"),
      "team roster must use ESPN NBADataProvider, not getDataProvider() sample rows"
    );
    assert.ok(
      playersSrc.includes("row.teamId === canonicalTeamId"),
      "ESPN roster filter must use canonical ESPN team id only"
    );
    assert.ok(
      playersSrc.includes("empty_espn_player_board"),
      "empty ESPN player board must be an error, not ok"
    );
    const histSrc = readFileSync(
      join(process.cwd(), "src/data/providers/historical/historical-nba-service.ts"),
      "utf8"
    );
    assert.ok(
      histSrc.includes("darkoApplies") || histSrc.includes("stamped"),
      "historical service season-gates DARKO"
    );
  }

  // Docs: Data Truth Rules section present
  {
    const docs = readFileSync(
      join(process.cwd(), "docs/data-architecture.md"),
      "utf8"
    );
    assert.ok(docs.includes("## Data Truth Rules"));
    assert.ok(docs.includes("Missing data is not zero"));
    assert.ok(
      docs.includes("tsx does not load"),
      "docs must record that tsx CLI tests do not auto-load .env.local"
    );
    assert.doesNotMatch(
      docs,
      /offensiveRating.*defensiveRating.*netRating.*are lightweight proxies/
    );
  }

  console.log("test-data-truth: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
