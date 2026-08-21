/**
 * NBA half-court geometry used by the shot map.
 * Run: npx tsx scripts/test-nba-court.ts
 */
import assert from "node:assert/strict";

import {
  COURT_SVG,
  COURT_VIEW,
  NBA_COURT,
  THREE_CORNER_Y_FT,
  courtX,
  courtY,
  freeThrowCirclePath,
  freeThrowLinePath,
  threePointPath,
} from "../src/lib/nba-court";

function dist(x: number, y: number) {
  return Math.hypot(x, y);
}

function main() {
  assert.equal(NBA_COURT.threeRadiusFt, 23.75);
  assert.equal(NBA_COURT.threeCornerFt, 22);
  assert.equal(NBA_COURT.ftFromHoopFt, 13.75);
  assert.equal(NBA_COURT.hoopFromBaselineFt, 5.25);

  assert.ok(
    Math.abs(THREE_CORNER_Y_FT - Math.sqrt(23.75 ** 2 - 22 ** 2)) < 1e-9
  );
  assert.ok(
    Math.abs(dist(NBA_COURT.threeCornerFt, THREE_CORNER_Y_FT) - 23.75) < 1e-9,
    "corner/arc join sits on the 23.75 ft circle"
  );
  assert.ok(
    Math.abs(dist(0, NBA_COURT.threeRadiusFt) - 23.75) < 1e-9,
    "top of the arc is 23.75 ft from the hoop"
  );

  // Uniform scale so a circle in feet is a circle in pixels.
  assert.equal(COURT_VIEW.pxPerFoot, 10);
  const rPx = NBA_COURT.threeRadiusFt * COURT_VIEW.pxPerFoot;
  const joinLeft = {
    x: courtX(-NBA_COURT.threeCornerFt),
    y: courtY(THREE_CORNER_Y_FT),
  };
  const hoop = { x: courtX(0), y: courtY(0) };
  const top = { x: courtX(0), y: courtY(NBA_COURT.threeRadiusFt) };
  assert.ok(
    Math.abs(Math.hypot(joinLeft.x - hoop.x, joinLeft.y - hoop.y) - rPx) < 1e-6
  );
  assert.ok(
    Math.abs(Math.hypot(top.x - hoop.x, top.y - hoop.y) - rPx) < 1e-6
  );

  const ftY = courtY(NBA_COURT.ftFromHoopFt);
  assert.ok(freeThrowLinePath().includes(String(ftY)));
  assert.ok(
    Math.abs(hoop.y - ftY - NBA_COURT.ftFromHoopFt * COURT_VIEW.pxPerFoot) <
      1e-6,
    "free-throw line is 13.75 ft in front of the hoop"
  );

  const three = threePointPath();
  assert.ok(three.startsWith("M "));
  // sweep-flag 1 (not 0): y-down SVG otherwise centers the arc above the
  // chord and the 3PT line becomes a shallow bump between the corners.
  assert.match(three, /A 237\.5 237\.5 0 0 1 /);
  assert.ok(
    freeThrowCirclePath().includes("A 60 60 0 0 1 "),
    "FT circle opens toward half-court"
  );

  assert.equal(COURT_SVG.width, 500);
  assert.equal(COURT_SVG.height, 470);

  console.log("test-nba-court: ok");
}

main();
