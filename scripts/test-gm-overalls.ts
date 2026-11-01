/**
 * League OVR board should track consensus stars, not thin-sample flukes
 * or rate-only role bigs — and OVR must track the same latent the sim uses.
 * Run: npx tsx scripts/test-gm-overalls.ts
 */
import assert from "node:assert/strict";

import { playerSheet, SHEET_VERSION } from "../src/gm/engine/attributes";
import { simulateGame } from "../src/gm/engine/simulate";
import {
  impactToOverall,
  netStrength,
  overallToImpact,
} from "../src/gm/engine/true-strength";
import { createRealSeasonLeague } from "../src/gm/seed/create-real-season-league";
import type { GmPlayer, GmScheduleGame, GmTeam } from "../src/gm/types";

function spearman(xs: number[], ys: number[]): number {
  assert.equal(xs.length, ys.length);
  const n = xs.length;
  const rank = (values: number[]) => {
    const order = values
      .map((value, index) => ({ value, index }))
      .sort((a, b) => a.value - b.value || a.index - b.index);
    const ranks = new Array<number>(n);
    for (let i = 0; i < n; ) {
      let j = i + 1;
      while (j < n && order[j]!.value === order[i]!.value) j++;
      const avg = (i + j - 1) / 2 + 1;
      for (let k = i; k < j; k++) ranks[order[k]!.index] = avg;
      i = j;
    }
    return ranks;
  };
  const rx = rank(xs);
  const ry = rank(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  const mx = rx.reduce((a, b) => a + b, 0) / n;
  const my = ry.reduce((a, b) => a + b, 0) / n;
  for (let i = 0; i < n; i++) {
    const a = rx[i]! - mx;
    const b = ry[i]! - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  return num / Math.sqrt(dx * dy);
}

function teamNet(team: GmTeam, players: GmPlayer[]): number {
  const roster = players.filter((p) => p.teamId === team.id && !p.injury);
  const starterIds = Object.values(team.starters ?? {}).filter(
    (id): id is string => Boolean(id)
  );
  const starters = starterIds
    .map((id) => roster.find((p) => p.id === id))
    .filter((p): p is GmPlayer => Boolean(p));
  const group =
    starters.length >= 3
      ? starters
      : [...roster]
          .sort(
            (a, b) =>
              netStrength(b.ratings) - netStrength(a.ratings) ||
              playerSheet(b).overall - playerSheet(a).overall
          )
          .slice(0, 5);
  if (!group.length) return -99;
  return group.reduce((sum, p) => sum + netStrength(p.ratings), 0) / group.length;
}

async function main() {
  assert.equal(SHEET_VERSION, 8);
  assert.ok(Math.abs(overallToImpact(impactToOverall(5.1)) - 5.1) < 0.05);

  const { league } = await createRealSeasonLeague({ userTeamId: "bos" });

  const ranked = league.players
    .filter((p) => p.teamId)
    .map((p) => ({
      name: p.name,
      ovr: playerSheet(p).overall,
      impact: p.ratings.impact,
      net: netStrength(p.ratings),
      player: p,
    }))
    .sort((a, b) => b.ovr - a.ovr || b.net - a.net);

  const top10 = ranked.slice(0, 10).map((r) => r.name);
  const top15 = new Set(ranked.slice(0, 15).map((r) => r.name));
  const top20 = new Set(ranked.slice(0, 20).map((r) => r.name));

  for (const name of [
    "Nikola Jokic",
    "Shai Gilgeous-Alexander",
    "Giannis Antetokounmpo",
    "Luka Doncic",
    "Victor Wembanyama",
  ]) {
    assert.ok(
      top15.has(name),
      `${name} should be top 15, got: ${top10.join(", ")}`
    );
  }

  assert.equal(ranked[0]?.name, "Nikola Jokic");
  assert.ok((ranked[0]?.ovr ?? 0) >= 92, `Jokic ovr ${ranked[0]?.ovr}`);

  const byName = new Map(ranked.map((r) => [r.name, r]));
  const curry = byName.get("Stephen Curry");
  assert.ok(curry, "Curry on roster");
  assert.ok(
    (curry?.ovr ?? 0) >= 82,
    `Curry ovr ${curry?.ovr} should clear 82 with 25+ ppg`
  );
  const lebron = byName.get("LeBron James");
  assert.ok(lebron, "LeBron on roster");
  assert.ok(
    (lebron?.ovr ?? 0) >= 80,
    `LeBron ovr ${lebron?.ovr} should clear 80`
  );
  const tatum = byName.get("Jayson Tatum");
  assert.ok(tatum, "Tatum on roster");
  assert.ok(
    (tatum?.ovr ?? 0) >= 88,
    `Tatum ovr ${tatum?.ovr} should clear 88 (DARKO / full prior season)`
  );
  assert.ok(
    top20.has("Jayson Tatum"),
    `Tatum should be top 20, got: ${ranked
      .slice(0, 20)
      .map((r) => `${r.name}:${r.ovr}`)
      .join(", ")}`
  );

  const djg = ranked.find((r) => r.name === "David Jones Garcia");
  if (djg) {
    assert.ok(djg.ovr <= 78, `thin-sample fluke ovr ${djg.ovr}`);
    assert.ok(djg.impact < 2, `thin-sample impact ${djg.impact}`);
  }

  const mitch = ranked.findIndex((r) => r.name === "Mitchell Robinson");
  assert.ok(
    mitch < 0 || mitch >= 15,
    `Mitch Robinson should not top-15 (rank ${mitch + 1})`
  );

  // OVR must not invent a different board from the sim latent.
  const rho = spearman(
    ranked.map((r) => r.ovr),
    ranked.map((r) => r.net)
  );
  assert.ok(rho >= 0.95, `OVR↔net Spearman ${rho.toFixed(3)} should be ≥ 0.95`);

  // Corrected stars should carry offense/defense, not only a card bump.
  for (const star of [curry, lebron]) {
    assert.ok(star);
    assert.ok(
      star!.player.ratings.offense + star!.player.ratings.defense >= 2.0,
      `${star!.name} net ${star!.net} too cold for ovr ${star!.ovr}`
    );
  }

  // DARKO-only role player with clearly negative DRBL gets trimmed.
  const carter = byName.get("Devin Carter");
  if (carter) {
    assert.ok(carter.ovr <= 72, `Devin Carter ovr ${carter.ovr} should be trimmed by DRBL`);
  }

  const teamRows = league.teams
    .map((team) => ({
      team,
      net: teamNet(team, league.players),
      ovr:
        league.players
          .filter((p) => p.teamId === team.id)
          .map((p) => playerSheet(p).overall)
          .sort((a, b) => b - a)
          .slice(0, 5)
          .reduce((s, v, _, arr) => s + v / arr.length, 0) || 0,
    }))
    .sort((a, b) => b.net - a.net);

  // Cross every top-3 net team against every bottom-3 over a few seeds.
  const top = teamRows.slice(0, 3);
  const bottom = teamRows.slice(-3);
  let topWins = 0;
  let games = 0;
  for (const home of top) {
    for (const away of bottom) {
      for (let g = 0; g < 30; g++) {
        const game: GmScheduleGame = {
          id: `ovr-sanity-${home.team.id}-${away.team.id}-${g}`,
          day: g,
          season: league.season,
          homeTeamId: home.team.id,
          awayTeamId: away.team.id,
          played: false,
        };
        const { box } = simulateGame(
          game,
          league.teams,
          league.players,
          9000 + g * 17 + home.team.id.charCodeAt(0) + away.team.id.charCodeAt(0)
        );
        games += 1;
        if (box.homeScore > box.awayScore) topWins += 1;
      }
    }
  }
  const winRate = topWins / games;
  assert.ok(
    winRate >= 0.6,
    `top-3 net teams should beat bottom-3 (≥60%), got ${(winRate * 100).toFixed(0)}% (${topWins}/${games})`
  );

  console.log("overalls ok", {
    top10,
    jokic: ranked[0]?.ovr,
    tatum: tatum?.ovr,
    curry: curry?.ovr,
    lebron: lebron?.ovr,
    spearman: Number(rho.toFixed(3)),
    simWinRate: Number(winRate.toFixed(3)),
    sheet: SHEET_VERSION,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

