/**
 * Game status, countdown, and watch mapping tests.
 * Run: npx tsx scripts/test-game-status.ts
 */
import assert from "node:assert/strict";

import { formatGameCountdown } from "../src/lib/game-countdown";
import {
  isFinalStatus,
  isLiveLikeStatus,
  isPreTipStatus,
  normalizeEspnStatusType,
  shouldDisplayScores,
  statusHeadline,
} from "../src/lib/game-status";
import {
  mapEspnBroadcasts,
  resolveWatchAvailability,
} from "../src/lib/game-watch";
import { transformEspnScheduleEvent } from "../src/data/transformers/espn";
import { applyStandingRecords } from "../src/data/queries/standings";
import type { Game } from "../src/data/types";
import type { LeagueStandings } from "../src/data/types/standings";

function main() {
  // --- Critical regression: scheduled 0-0 never final ---
  {
    const status = normalizeEspnStatusType(
      {
        state: "pre",
        completed: false,
        name: "STATUS_SCHEDULED",
        description: "Scheduled",
        shortDetail: "8/15 - 7:30 PM EDT",
      },
      { home: 0, away: 0 }
    );
    assert.equal(status, "scheduled");
    assert.equal(isFinalStatus(status), false);
    assert.equal(isPreTipStatus(status), true);
    assert.equal(
      shouldDisplayScores({ status, homeScore: 0, awayScore: 0 }),
      false
    );
  }

  // ESPN quirk: completed true + 0-0 without STATUS_FINAL → scheduled
  {
    const status = normalizeEspnStatusType(
      {
        state: "post",
        completed: true,
        name: "STATUS_SCHEDULED",
        description: "Scheduled",
      },
      { home: 0, away: 0 }
    );
    assert.notEqual(status, "final");
  }

  {
    const status = normalizeEspnStatusType(
      {
        state: "post",
        completed: true,
        name: "STATUS_FINAL",
        description: "Final",
      },
      { home: 0, away: 0 }
    );
    assert.notEqual(status, "final");
  }

  {
    const status = normalizeEspnStatusType(
      {
        state: "post",
        completed: true,
        name: "STATUS_FINAL",
        description: "Final",
      },
      { home: 112, away: 107 }
    );
    assert.equal(status, "final");
  }

  // Live / halftime / period break
  {
    assert.equal(
      normalizeEspnStatusType({
        state: "in",
        name: "STATUS_IN_PROGRESS",
      }),
      "in_progress"
    );
    assert.equal(
      normalizeEspnStatusType({
        state: "in",
        name: "STATUS_HALFTIME",
        description: "Halftime",
      }),
      "halftime"
    );
    assert.ok(isLiveLikeStatus("halftime"));
    assert.equal(statusHeadline("halftime"), "Halftime");
  }

  // Postponed / cancelled / delayed / unknown
  {
    assert.equal(
      normalizeEspnStatusType({
        name: "STATUS_POSTPONED",
        description: "Postponed",
        completed: true,
        state: "post",
      }),
      "postponed"
    );
    assert.equal(
      normalizeEspnStatusType({
        name: "STATUS_CANCELED",
        description: "Canceled",
      }),
      "cancelled"
    );
    assert.equal(
      normalizeEspnStatusType({
        name: "STATUS_DELAYED",
        description: "Delayed",
        state: "pre",
      }),
      "delayed"
    );
    assert.equal(
      normalizeEspnStatusType({
        name: "STATUS_WEIRD_NEW_THING",
        state: "foo",
      }),
      "unknown"
    );
  }

  // Transformer end-to-end: scheduled 0-0
  {
    const game = transformEspnScheduleEvent(
      {
        id: "sched-1",
        date: "2026-10-15T23:30:00Z",
        status: {
          type: {
            state: "pre",
            completed: false,
            name: "STATUS_SCHEDULED",
            shortDetail: "10/15 - 7:30 PM EDT",
          },
        },
        competitions: [
          {
            status: {
              type: {
                state: "pre",
                completed: false,
                name: "STATUS_SCHEDULED",
                shortDetail: "10/15 - 7:30 PM EDT",
              },
            },
            broadcasts: [{ market: "national", names: ["ESPN"] }],
            competitors: [
              {
                homeAway: "home",
                score: "0",
                team: { id: "2", abbreviation: "BOS", displayName: "Boston" },
              },
              {
                homeAway: "away",
                score: "0",
                team: { id: "18", abbreviation: "NY", displayName: "Knicks" },
              },
            ],
          },
        ],
      },
      "2026-27"
    );
    assert.ok(game);
    assert.equal(game!.status, "scheduled");
    assert.equal(game!.homeScore, 0);
    assert.equal(game!.awayScore, 0);
    assert.equal(game!.broadcasts?.[0]?.label, "ESPN");
    assert.equal(
      shouldDisplayScores({
        status: game!.status,
        homeScore: game!.homeScore,
        awayScore: game!.awayScore,
      }),
      false
    );
  }

  // Transformer copies overall W-L and uses an en dash
  {
    const game = transformEspnScheduleEvent(
      {
        id: "401902644",
        date: "2026-10-03T23:00:00Z",
        competitions: [
          {
            status: {
              type: {
                state: "pre",
                completed: false,
                name: "STATUS_SCHEDULED",
              },
            },
            competitors: [
              {
                homeAway: "home",
                score: "0",
                team: { id: "28", abbreviation: "TOR", displayName: "Toronto Raptors" },
                records: [
                  { name: "overall", type: "total", summary: "30-52" },
                  { name: "Home", type: "home", summary: "18-23" },
                ],
              },
              {
                homeAway: "away",
                score: "0",
                team: { id: "14", abbreviation: "MIA", displayName: "Miami Heat" },
                records: [{ name: "overall", type: "total", summary: "37-45" }],
              },
            ],
          },
        ],
      },
      "2026-27"
    );
    assert.ok(game);
    assert.equal(game!.awayRecord, "37-45");
    assert.equal(game!.homeRecord, "30-52");
  }

  // Countdown formatting
  {
    const tip = "2030-01-15T00:00:00.000Z";
    const now = Date.parse("2030-01-14T22:18:00.000Z"); // 1h 42m before
    const c = formatGameCountdown(tip, now);
    assert.equal(c.phase, "future");
    assert.match(c.primary, /Starts in 1h/i);
    assert.ok(c.absoluteLocal);

    const soon = formatGameCountdown(tip, Date.parse("2030-01-14T23:40:00.000Z"));
    assert.match(soon.primary, /Starts in \d+m/);

    const secs = formatGameCountdown(tip, Date.parse("2030-01-14T23:59:22.000Z"));
    assert.match(secs.primary, /Starts in \d+s/);

    const passed = formatGameCountdown(tip, Date.parse("2030-01-15T00:05:00.000Z"));
    assert.equal(passed.phase, "start_passed");
    assert.match(passed.primary, /passed/i);
    assert.notEqual(passed.primary.toLowerCase(), "final");
  }

  // Watch options
  {
    const mapped = mapEspnBroadcasts({
      broadcasts: [{ market: "national", names: ["ESPN", "ABC"] }],
      geoBroadcasts: [
        {
          market: { type: "National" },
          media: { shortName: "ESPN" },
          type: { shortName: "TV" },
        },
      ],
    });
    assert.ok(mapped.some((m) => m.label === "ESPN"));
    assert.ok(mapped.some((m) => m.market === "national"));

    const noLoc = resolveWatchAvailability({
      broadcasts: mapped,
      locationLabel: null,
    });
    const lp = noLoc.find((r) => r.option.id === "nba-league-pass");
    assert.ok(lp);
    assert.equal(lp!.availability, "location_required");

    const withLoc = resolveWatchAvailability({
      broadcasts: mapped,
      locationLabel: "Boston, MA",
    });
    const lp2 = withLoc.find((r) => r.option.id === "nba-league-pass");
    assert.equal(lp2!.availability, "blackout_possible");
    assert.match(lp2!.note, /blackout/i);
  }

  // Empty broadcasts → no fabricated national TV
  {
    const mapped = mapEspnBroadcasts({});
    assert.equal(mapped.length, 0);
  }

  // Standings fill missing W-L for the matching season only
  {
    const game: Game = {
      id: "g1",
      season: "2025-26",
      gameDate: "2026-01-15",
      homeTeamId: "2",
      awayTeamId: "14",
      homeTeamAbbr: "BOS",
      awayTeamAbbr: "MIA",
      homeScore: 0,
      awayScore: 0,
      gameType: "regular",
    };
    const standings: LeagueStandings = {
      season: "2025-26",
      conferences: [
        {
          conference: "East",
          rows: [
            {
              teamId: "2",
              abbreviation: "BOS",
              displayName: "Boston Celtics",
              conference: "East",
              rank: 1,
              wins: 60,
              losses: 22,
              winPct: 0.732,
              gamesBehind: 0,
              differential: 8,
              ppg: 116,
              oppPpg: 108,
              streak: "W2",
              homeRecord: "32-9",
              roadRecord: "28-13",
              lastTen: "7-3",
              playoffSeed: 1,
            },
            {
              teamId: "14",
              abbreviation: "MIA",
              displayName: "Miami Heat",
              conference: "East",
              rank: 8,
              wins: 37,
              losses: 45,
              winPct: 0.451,
              gamesBehind: 23,
              differential: -1,
              ppg: 110,
              oppPpg: 111,
              streak: "L1",
              homeRecord: "21-20",
              roadRecord: "16-25",
              lastTen: "4-6",
              playoffSeed: 8,
            },
          ],
        },
        { conference: "West", rows: [] },
      ],
    };
    const filled = applyStandingRecords([game], standings);
    assert.equal(filled[0]!.awayRecord, "37-45");
    assert.equal(filled[0]!.homeRecord, "60-22");

    const kept = applyStandingRecords(
      [{ ...game, awayRecord: "1-0", homeRecord: "2-0" }],
      standings
    );
    assert.equal(kept[0]!.awayRecord, "1-0");
    assert.equal(kept[0]!.homeRecord, "2-0");

    const skipped = applyStandingRecords(
      [{ ...game, season: "2026-27" }],
      standings
    );
    assert.equal(skipped[0]!.awayRecord, undefined);
    assert.equal(skipped[0]!.homeRecord, undefined);

    const cross = applyStandingRecords(
      [{ ...game, season: "2026-27" }],
      standings,
      { requireSeasonMatch: false }
    );
    assert.equal(cross[0]!.awayRecord, "37-45");
    assert.equal(cross[0]!.homeRecord, "60-22");
  }

  console.log("test-game-status: all assertions passed");
}

main();
