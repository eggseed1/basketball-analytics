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

  console.log("test-game-status: all assertions passed");
}

main();
