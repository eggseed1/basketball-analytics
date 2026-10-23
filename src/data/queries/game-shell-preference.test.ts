import assert from "node:assert/strict";
import { test } from "node:test";

import { compareGameProgress } from "@/lib/game-status";
import type { Game } from "@/data/types";

/**
 * Mirrors preferLiveShellOverSnapshot in games.ts — keep in sync when that
 * helper changes. Guards the tip-off bug where a scheduled snapshot replaced a
 * live CDN shell that still had empty player minutes.
 */
function preferLiveShellOverSnapshot(
  shell: {
    hasBoxScore: boolean;
    hasPeriodScores: boolean;
    game: Pick<Game, "status" | "period" | "displayClock">;
  },
  snap: Pick<Game, "status" | "period" | "displayClock"> | null
): boolean {
  if (!snap) return true;
  if (shell.hasBoxScore || shell.hasPeriodScores) return true;
  return compareGameProgress(shell.game, snap) >= 0;
}

test("keeps in-progress CDN shell over scheduled snapshot without box minutes", () => {
  const keep = preferLiveShellOverSnapshot(
    {
      hasBoxScore: false,
      hasPeriodScores: false,
      game: { status: "in_progress", period: 1, displayClock: "11:40" },
    },
    { status: "scheduled", period: null, displayClock: null }
  );
  assert.equal(keep, true);
});

test("keeps shell when it already has player lines", () => {
  const keep = preferLiveShellOverSnapshot(
    {
      hasBoxScore: true,
      hasPeriodScores: false,
      game: { status: "in_progress", period: 1, displayClock: "9:00" },
    },
    { status: "scheduled", period: null, displayClock: null }
  );
  assert.equal(keep, true);
});

test("keeps CDN shell when progress matches the snapshot", () => {
  const keep = preferLiveShellOverSnapshot(
    {
      hasBoxScore: false,
      hasPeriodScores: false,
      game: { status: "scheduled", period: null, displayClock: null },
    },
    { status: "scheduled", period: null, displayClock: null }
  );
  assert.equal(keep, true);
});

test("drops a lagging shell when the snapshot is further along", () => {
  const keep = preferLiveShellOverSnapshot(
    {
      hasBoxScore: false,
      hasPeriodScores: false,
      game: { status: "scheduled", period: null, displayClock: null },
    },
    { status: "final", period: 4, displayClock: "0:00" }
  );
  assert.equal(keep, false);
});
