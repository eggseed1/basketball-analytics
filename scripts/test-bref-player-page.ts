/**
 * BRef player-page grain: 2024-25 DAL / LAL / TOT must not share counting totals.
 * Per-game TOT PPG can equal a stint by coincidence (2024-25 TOT = LAL 28.2).
 * Run: npx tsx scripts/test-bref-player-page.ts
 */
import assert from "node:assert/strict";

import {
  fetchBrefPlayerPage,
  LUKA_BREF_ID,
} from "../src/data/providers/nba/bref-player-page";

async function main() {
  const page = await fetchBrefPlayerPage(LUKA_BREF_ID);
  assert.match(page.bio.displayName, /Dončić|Doncic/);
  assert.doesNotMatch(page.bio.displayName, /^uka /);
  assert.equal(page.bio.currentTeamAbbr, "LAL");
  assert.ok(page.bio.jersey === "77" || page.bio.jersey == null);
  assert.ok(page.bio.country === "Slovenia" || page.bio.birthPlace?.includes("Slovenia"));
  assert.doesNotMatch(page.bio.positionLine ?? "", /&#/);
  assert.doesNotMatch(page.bio.experienceLine ?? "", /&nbsp;/);

  const perGame = page.regular.perGame.filter((r) => r.season === "2024-25");
  const totals = page.regular.totals.filter((r) => r.season === "2024-25");
  const tot = totals.find((r) => r.combined);
  const dal = totals.find((r) => r.teamAbbr === "DAL" && !r.combined);
  const lal = totals.find((r) => r.teamAbbr === "LAL" && !r.combined);
  assert.ok(tot, "expected combined 2024-25 totals row");
  assert.ok(dal, "expected DAL stint totals");
  assert.ok(lal, "expected LAL stint totals");
  assert.notEqual(dal.points, lal.points, "stint PTS totals must differ");
  assert.notEqual(tot.points, dal.points, "TOT PTS must not equal DAL");
  assert.notEqual(tot.points, lal.points, "TOT PTS must not equal LAL");
  assert.equal(tot.points, (dal.points ?? 0) + (lal.points ?? 0));
  assert.equal(tot.gamesPlayed, (dal.gamesPlayed ?? 0) + (lal.gamesPlayed ?? 0));

  const pgDal = perGame.find((r) => r.teamAbbr === "DAL" && !r.combined);
  const pgLal = perGame.find((r) => r.teamAbbr === "LAL" && !r.combined);
  assert.ok(pgDal && pgLal);
  assert.notEqual(pgDal.points, pgLal.points, "stint per-game PTS must differ");

  console.log("ok", {
    tot: tot.points,
    dal: dal.points,
    lal: lal.points,
    name: page.bio.displayName,
    jersey: page.bio.jersey,
    country: page.bio.country,
    position: page.bio.positionLine,
  });
}

void main();
