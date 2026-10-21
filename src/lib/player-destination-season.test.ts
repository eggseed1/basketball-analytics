/**
 * Run: npx tsx --test src/lib/player-destination-season.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { PlayerSeason } from "@/data/types";
import { resolvePlayerSeason } from "@/lib/player-destination";

const beforeTip = new Date("2026-10-19T16:00:00.000Z");
const afterTip = new Date("2026-10-21T04:00:00.000Z");

function row(season: string, gamesPlayed: number): PlayerSeason {
  return { season, gamesPlayed } as PlayerSeason;
}

test("pre-tip defaults to latest season with games (skip empty stub)", () => {
  const career = [row("2026-27", 0), row("2025-26", 70)];
  assert.equal(
    resolvePlayerSeason(career, null, [], {
      nowSeason: "2026-27",
      isActive: true,
      preferPeakWhenHistorical: false,
      now: beforeTip,
    }),
    "2025-26"
  );
});

test("post-tip defaults to current season even at 0 GP for active players", () => {
  const career = [row("2026-27", 0), row("2025-26", 70)];
  assert.equal(
    resolvePlayerSeason(career, null, [], {
      nowSeason: "2026-27",
      isActive: true,
      preferPeakWhenHistorical: false,
      now: afterTip,
    }),
    "2026-27"
  );
});

test("post-tip defaults to current season when only prior-year GP exists", () => {
  // Cade-shaped: played 2025-26, no 2026-27 career stub yet, tip already passed.
  const career = [row("2025-26", 70), row("2024-25", 70)];
  assert.equal(
    resolvePlayerSeason(career, null, [], {
      nowSeason: "2026-27",
      preferPeakWhenHistorical: true,
      now: afterTip,
    }),
    "2026-27"
  );
});

test("post-tip honors explicit season param", () => {
  const career = [row("2026-27", 0), row("2025-26", 70)];
  assert.equal(
    resolvePlayerSeason(career, "2025-26", [], {
      nowSeason: "2026-27",
      isActive: true,
      preferPeakWhenHistorical: false,
      now: afterTip,
    }),
    "2025-26"
  );
});

test("empty career still falls back to nowSeason", () => {
  assert.equal(
    resolvePlayerSeason([], null, [], {
      nowSeason: "2026-27",
      preferPeakWhenHistorical: false,
      now: afterTip,
    }),
    "2026-27"
  );
});
