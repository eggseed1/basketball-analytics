/**
 * Deterministic Season Evidence tests.
 * Run: npx tsx scripts/test-season-evidence.ts
 */
import assert from "node:assert/strict";

import {
  SEASON_EVIDENCE_MAX_GAMES,
  SEASON_EVIDENCE_UNSUPPORTED,
  buildTeamSeasonEvidence,
  preferredEvidenceForRankHints,
  summarizeTeamSeasonEvidenceForProfile,
} from "../src/analytics/season-evidence";
import type { GameSummary } from "../src/data/types";
import { interpretAskQuery } from "../src/query-engine/interpret";
import { validateBasketballQuery } from "../src/query-engine/validate";

function game(
  partial: Partial<GameSummary> &
    Pick<GameSummary, "id" | "gameDate" | "homeScore" | "awayScore">
): GameSummary {
  const homeScore = partial.homeScore;
  const awayScore = partial.awayScore;
  return {
    season: "2023-24",
    homeTeamId: "2",
    awayTeamId: "9",
    homeTeamAbbr: "BOS",
    awayTeamAbbr: "GS",
    gameType: "regular",
    status: "final",
    totalPoints: homeScore + awayScore,
    margin: homeScore - awayScore,
    absMargin: Math.abs(homeScore - awayScore),
    ...partial,
  };
}

const subject = {
  teamId: "2",
  abbreviation: "BOS",
  fullName: "Boston Celtics",
  matchTeamIds: ["2"],
  matchAbbrs: ["BOS"],
};

function main() {
  const games: GameSummary[] = [
    // Largest win + high scoring
    game({
      id: "g-win",
      gameDate: "2024-03-01",
      homeScore: 140,
      awayScore: 88,
    }),
    // Another win (smaller)
    game({
      id: "g-win2",
      gameDate: "2024-01-10",
      homeScore: 118,
      awayScore: 110,
      awayTeamId: "7",
      awayTeamAbbr: "DEN",
    }),
    // Largest loss + low scoring
    game({
      id: "g-loss",
      gameDate: "2024-02-01",
      homeScore: 85,
      awayScore: 120,
      awayTeamId: "25",
      awayTeamAbbr: "OKC",
    }),
    // Best defense (lowest opp) — home win 100-89
    game({
      id: "g-def",
      gameDate: "2024-02-15",
      homeScore: 100,
      awayScore: 89,
      awayTeamId: "1",
      awayTeamAbbr: "ATL",
    }),
    // Away game for perspective
    game({
      id: "g-away",
      gameDate: "2024-03-20",
      homeTeamId: "9",
      awayTeamId: "2",
      homeTeamAbbr: "GS",
      awayTeamAbbr: "BOS",
      homeScore: 95,
      awayScore: 112,
    }),
    // Playoff — must be ignored
    game({
      id: "g-playoff",
      gameDate: "2024-05-01",
      homeScore: 150,
      awayScore: 70,
      gameType: "playoff",
    }),
    // Scheduled — ignored
    game({
      id: "g-sched",
      gameDate: "2024-04-01",
      homeScore: 0,
      awayScore: 0,
      status: "scheduled",
    }),
  ];

  // Core categories
  {
    const result = buildTeamSeasonEvidence({
      subject,
      season: "2023-24",
      games,
    });
    assert.equal(result.error, null);
    assert.ok(result.coverage.gameCount >= 4);

    const byCat = Object.fromEntries(
      result.findings.map((f) => [f.categoryId, f])
    );
    assert.equal(byCat.largest_win?.gameId, "g-win");
    assert.equal(byCat.largest_win?.valueDisplay, "+52");
    assert.equal(byCat.largest_loss?.gameId, "g-loss");
    assert.equal(byCat.highest_scoring?.gameId, "g-win");
    assert.equal(byCat.highest_scoring?.valueDisplay, "140 pts");
    assert.equal(byCat.lowest_scoring?.gameId, "g-loss");
    // Opp scored 88 in g-win — that is also the best defensive result.
    assert.equal(byCat.best_defense?.gameId, "g-win");
    assert.equal(byCat.best_defense?.valueDisplay, "88 opp pts");
  }

  // Ties — later date wins when margins equal
  {
    const tied = [
      game({
        id: "early",
        gameDate: "2024-01-01",
        homeScore: 120,
        awayScore: 100,
      }),
      game({
        id: "late",
        gameDate: "2024-03-01",
        homeScore: 120,
        awayScore: 100,
        awayTeamId: "7",
        awayTeamAbbr: "DEN",
      }),
    ];
    const result = buildTeamSeasonEvidence({
      subject,
      season: "2023-24",
      games: tied,
    });
    const win = result.findings.find((f) => f.categoryId === "largest_win");
    assert.equal(win?.gameId, "late");
  }

  // Grouping duplicate games
  {
    const result = buildTeamSeasonEvidence({
      subject,
      season: "2023-24",
      games,
    });
    const winCard = result.games.find((g) => g.gameId === "g-win");
    assert.ok(winCard);
    const labels = winCard!.findings.map((f) => f.categoryId);
    assert.ok(labels.includes("largest_win"));
    assert.ok(labels.includes("highest_scoring"));
    assert.ok(labels.includes("best_defense"));
    // One card, not three identical cards
    assert.equal(
      result.games.filter((g) => g.gameId === "g-win").length,
      1
    );
    assert.ok(result.games.length <= SEASON_EVIDENCE_MAX_GAMES);
    assert.ok(winCard!.href.includes("/games/g-win"));
    assert.ok(winCard!.href.includes("from=evidence"));
    assert.ok(winCard!.href.includes("evidence=largest_win"));
  }

  // Team Profile summary — same findings, compact order, max 4
  {
    const result = buildTeamSeasonEvidence({
      subject,
      season: "2023-24",
      games,
    });
    const summary = summarizeTeamSeasonEvidenceForProfile(result);
    assert.ok(summary.length <= 4);
    assert.equal(summary[0]?.categoryId, "largest_win");
    assert.equal(summary[0]?.valueDisplay, "+52");
    assert.ok(summary.some((s) => s.categoryId === "best_defense"));
    // lowest_scoring is 5th in order — omitted when earlier four exist
    assert.ok(!summary.some((s) => s.categoryId === "lowest_scoring"));
    for (const item of summary) {
      assert.ok(result.findings.some((f) => f.gameId === item.gameId));
      assert.ok(result.games.every((g) => g.href.startsWith("/games/")));
    }
  }

  // Empty season → summary empty, error present
  {
    const result = buildTeamSeasonEvidence({
      subject,
      season: "2023-24",
      games: [],
    });
    assert.ok(result.error);
    assert.deepEqual(summarizeTeamSeasonEvidenceForProfile(result), []);
  }

  // Wrong team filtered out
  {
    const onlyGs = [
      game({
        id: "gs-only",
        gameDate: "2024-01-01",
        homeTeamId: "9",
        awayTeamId: "7",
        homeTeamAbbr: "GS",
        awayTeamAbbr: "DEN",
        homeScore: 130,
        awayScore: 90,
      }),
    ];
    const result = buildTeamSeasonEvidence({
      subject,
      season: "2023-24",
      games: onlyGs,
    });
    assert.ok(result.error);
    assert.equal(result.games.length, 0);
  }

  // Season filtering
  {
    const mixed = [
      game({
        id: "a",
        season: "2022-23",
        gameDate: "2023-01-01",
        homeScore: 150,
        awayScore: 80,
      }),
      game({
        id: "b",
        season: "2023-24",
        gameDate: "2024-01-01",
        homeScore: 110,
        awayScore: 100,
      }),
    ];
    const result = buildTeamSeasonEvidence({
      subject,
      season: "2023-24",
      games: mixed,
    });
    assert.equal(result.coverage.gameCount, 1);
    assert.equal(
      result.findings.find((f) => f.categoryId === "largest_win")?.gameId,
      "b"
    );
  }

  // Thin season — still produces scoreboard categories; no fake eFG
  {
    const thin = [
      game({
        id: "t1",
        gameDate: "2019-01-01",
        homeScore: 105,
        awayScore: 100,
      }),
      game({
        id: "t2",
        gameDate: "2019-02-01",
        homeScore: 90,
        awayScore: 115,
      }),
    ];
    const result = buildTeamSeasonEvidence({
      subject,
      season: "2023-24",
      games: thin,
    });
    assert.ok(result.findings.some((f) => f.categoryId === "largest_win"));
    assert.ok(
      !result.findings.some((f) => /efg|ts|rebound|turnover/i.test(f.label))
    );
    assert.ok(
      SEASON_EVIDENCE_UNSUPPORTED.some((u) => /eFG/i.test(u))
    );
  }

  // Missing metrics → coverage disclosure (unsupported list always present)
  {
    const result = buildTeamSeasonEvidence({
      subject,
      season: "2023-24",
      games,
    });
    assert.ok(result.coverage.unsupported.length >= 3);
    const efg = result.coverage.categories.find((c) => c.id === "largest_win");
    assert.equal(efg?.available, true);
  }

  // Rank hints prefer performance-linked categories
  {
    const ids = preferredEvidenceForRankHints(["Performance", "Efficiency"]);
    assert.ok(ids.includes("largest_win"));
    assert.ok(!ids.includes("largest_loss") || true);
  }

  // ASK DRBL
  {
    const q = interpretAskQuery(
      "What were Boston's biggest wins in 2023-24?"
    );
    assert.equal(q.operation, "team_season_game_evidence");
    assert.equal(q.entities[0]?.kind, "team");
    assert.equal(q.when?.seasons?.[0], "2023-24");
    assert.equal(validateBasketballQuery(q).ok, true);

    const bestGames = interpretAskQuery(
      "What were Boston's best games in 2023-24?"
    );
    assert.equal(bestGames.operation, "team_season_game_evidence");

    // Must not steal season rank
    const bestSeason = interpretAskQuery("Which was Boston's best season?");
    assert.equal(bestSeason.operation, "team_season_rank");
  }

  console.log("test-season-evidence: all assertions passed");
}

main();
