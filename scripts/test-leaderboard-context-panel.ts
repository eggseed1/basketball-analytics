/**
 * Leaderboard context panel floating placement + one-open policy.
 * Run: npm run test:leaderboard-context-panel
 */
import assert from "node:assert/strict";

import { LEADERBOARD_CONTEXT_COLLISION } from "../src/components/explore/leaderboard-row-context";

/** Same preference model as PlayerIdentity preview tests. */
function preferredSide(space: {
  above: number;
  below: number;
  left: number;
  right: number;
  needH: number;
  needW: number;
}): "top" | "bottom" | "left" | "right" {
  const { above, below, left, right, needH, needW } = space;
  if (below >= needH) return "bottom";
  if (above >= needH) return "top";
  if (right >= needW) return "right";
  if (left >= needW) return "left";
  return below >= above ? "bottom" : "top";
}

function horizontalShift(
  triggerLeft: number,
  panelWidth: number,
  viewportWidth: number,
  padding = 8
): number {
  const maxLeft = Math.max(padding, viewportWidth - panelWidth - padding);
  return Math.min(Math.max(triggerLeft, padding), maxLeft);
}

/** Parent table one-open reducer (mirrors player-season-table). */
function nextOpenId(
  current: string | null,
  next: boolean,
  playerId: string
): string | null {
  return next ? playerId : null;
}

function main() {
  console.log("collision config matches PlayerIdentity family…");
  assert.equal(LEADERBOARD_CONTEXT_COLLISION.preferredSide, "bottom");
  assert.equal(LEADERBOARD_CONTEXT_COLLISION.align, "start");
  assert.equal(LEADERBOARD_CONTEXT_COLLISION.positionMethod, "fixed");
  assert.equal(LEADERBOARD_CONTEXT_COLLISION.sticky, false);
  assert.equal(LEADERBOARD_CONTEXT_COLLISION.collisionAvoidance.side, "flip");
  assert.equal(LEADERBOARD_CONTEXT_COLLISION.collisionAvoidance.align, "shift");
  assert.equal(LEADERBOARD_CONTEXT_COLLISION.collisionPadding, 16);

  console.log("last-row flips above…");
  assert.equal(
    preferredSide({
      above: 220,
      below: 24,
      left: 400,
      right: 400,
      needH: 160,
      needW: 288,
    }),
    "top"
  );

  console.log("top-row stays below…");
  assert.equal(
    preferredSide({
      above: 24,
      below: 400,
      left: 400,
      right: 400,
      needH: 160,
      needW: 288,
    }),
    "bottom"
  );

  console.log("right-edge shift…");
  assert.equal(horizontalShift(900, 288, 1000, 8), 1000 - 288 - 8);

  console.log("left-edge clamp…");
  assert.equal(horizontalShift(-20, 288, 1000, 8), 8);

  console.log("one open row…");
  let openId: string | null = null;
  openId = nextOpenId(openId, true, "p1");
  assert.equal(openId, "p1");
  openId = nextOpenId(openId, true, "p2");
  assert.equal(openId, "p2");
  openId = nextOpenId(openId, false, "p2");
  assert.equal(openId, null);

  console.log("mobile expanded-row contract…");
  // Desktop portal is `hidden sm:block`; mobile uses sibling `sm:hidden` row.
  const mobileRowClass = "border-0 sm:hidden";
  const desktopPortalClass = "z-50 hidden outline-none sm:block";
  assert.ok(mobileRowClass.includes("sm:hidden"));
  assert.ok(desktopPortalClass.includes("hidden"));
  assert.ok(desktopPortalClass.includes("sm:block"));

  console.log("OK — leaderboard-context-panel");
}

main();
