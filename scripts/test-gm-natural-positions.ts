/**
 * Natural position from physicals + playstyle (not ESPN slot alone).
 * Run: npx tsx scripts/test-gm-natural-positions.ts
 */
import assert from "node:assert/strict";

import { playerSheet } from "../src/gm/engine/attributes";
import {
  classifyListedPosition,
  overallAtPosition,
  withListedPositions,
} from "../src/gm/engine/lineup";
import { createRealSeasonLeague } from "../src/gm/seed/create-real-season-league";
import type { GmPlayer, GmPosition } from "../src/gm/types";

function stub(
  partial: Partial<GmPlayer> &
    Pick<GmPlayer, "position" | "heightIn" | "weightLbs"> & {
      ratings?: Partial<GmPlayer["ratings"]>;
    }
): GmPlayer {
  const base: GmPlayer = {
    id: partial.id ?? "x",
    name: partial.name ?? "x",
    teamId: "bos",
    position: partial.position,
    age: 26,
    heightIn: partial.heightIn,
    weightLbs: partial.weightLbs,
    ratings: {
      impact: 2,
      offense: 2,
      defense: 1,
      finishing: 60,
      shooting: 60,
      playmaking: 55,
      rebounding: 50,
      durability: 70,
      potential: 4,
      ...partial.ratings,
    },
    scouted: { impact: 2, offense: 2, defense: 1, uncertainty: 0.1 },
    contract: null,
    injury: null,
    morale: 70,
    personality: 0,
    minutesPreference: 28,
  };
  return { ...base, sheet: playerSheet(base) };
}

function bestSpot(player: GmPlayer): GmPosition {
  return (["PG", "SG", "SF", "PF", "C"] as const)
    .map((spot) => ({ spot, ovr: overallAtPosition(player, spot) }))
    .sort((a, b) => b.ovr - a.ovr)[0]!.spot;
}

// Career four: 6'8" / 224, wing creation — not SG.
{
  const tatum = withListedPositions(
    stub({
      name: "Tatum",
      position: "SF",
      heightIn: 80,
      weightLbs: 224,
      ratings: {
        offense: 5.2,
        defense: 1.2,
        shooting: 80,
        finishing: 82,
        playmaking: 72,
        rebounding: 58,
      },
    })
  );
  assert.equal(tatum.position, "PF");
  assert.equal(tatum.secondaryPosition, "SF");
  assert.equal(bestSpot(tatum), "PF");
  assert.ok(
    overallAtPosition(tatum, "PF") >= overallAtPosition(tatum, "SG"),
    "Tatum PF should beat SG"
  );
}

// Stocky defensive playmaker stays PF even from an SF ESPN prior.
{
  const dray = withListedPositions(
    stub({
      name: "Draymond",
      position: "SF",
      heightIn: 78,
      weightLbs: 230,
      ratings: {
        offense: -1,
        defense: 2.2,
        shooting: 45,
        finishing: 50,
        playmaking: 74,
        rebounding: 58,
      },
    })
  );
  assert.equal(dray.position, "PF");
  assert.equal(dray.secondaryPosition, "SF");
}

// Light 6'11" stretch forward is PF/SF, not C.
{
  const stretch = classifyListedPosition(
    stub({
      position: "SF",
      heightIn: 83,
      weightLbs: 210,
      ratings: { rebounding: 72, playmaking: 50 },
    })
  );
  assert.equal(stretch.position, "PF");
  assert.equal(stretch.secondaryPosition, "SF");
}

// True center needs mass + height.
{
  const center = classifyListedPosition(
    stub({
      position: "C",
      heightIn: 84,
      weightLbs: 260,
      ratings: { rebounding: 80, finishing: 75, playmaking: 40, shooting: 40 },
    })
  );
  assert.equal(center.position, "C");
  assert.equal(center.secondaryPosition, "PF");
}

// Incomplete ratings + 7'6" still lands at center (not PG from NaN poison).
{
  const giant = classifyListedPosition(
    stub({
      position: "C",
      heightIn: 90,
      weightLbs: 299,
      ratings: {
        playmaking: Number.NaN,
        rebounding: Number.NaN,
        shooting: 55,
        finishing: 45,
      },
    })
  );
  assert.equal(giant.position, "C");
}

// Small playmaker → PG.
{
  const point = classifyListedPosition(
    stub({
      position: "SG",
      heightIn: 74,
      weightLbs: 185,
      ratings: { playmaking: 88, rebounding: 40, shooting: 70 },
    })
  );
  assert.equal(point.position, "PG");
  assert.equal(point.secondaryPosition, "SG");
}

async function realLeagueChecks() {
  const { league } = await createRealSeasonLeague({ userTeamId: "bos" });
  assert.equal(league.positionBook, 4);

  const expect: Record<string, GmPosition> = {
    "Jayson Tatum": "PF",
    "Draymond Green": "PF",
    "Nikola Jokic": "C",
    "Stephen Curry": "PG",
    "Shai Gilgeous-Alexander": "PG",
    "Anthony Edwards": "SG",
    "LeBron James": "PF",
    "Paolo Banchero": "PF",
    "Kevin Durant": "PF",
  };

  // Listed position is the contract; "best at" can tie a sibling within 1 OVR.
  const bestMustMatch = new Set([
    "Jayson Tatum",
    "Draymond Green",
    "Nikola Jokic",
    "Stephen Curry",
    "Anthony Edwards",
    "LeBron James",
    "Paolo Banchero",
    "Kevin Durant",
  ]);

  for (const [name, want] of Object.entries(expect)) {
    const player = league.players.find((p) => p.name === name);
    assert.ok(player, `missing ${name}`);
    assert.equal(
      player!.position,
      want,
      `${name} listed ${player!.position}, want ${want}`
    );
    if (bestMustMatch.has(name)) {
      assert.equal(
        bestSpot(player!),
        want,
        `${name} best ${bestSpot(player!)}, want ${want}`
      );
    }
  }

  // Guards under 6'4" should not list as forwards.
  const shortForwards = league.players.filter(
    (p) =>
      p.teamId &&
      p.heightIn > 0 &&
      p.heightIn < 76 &&
      (p.position === "SF" || p.position === "PF" || p.position === "C")
  );
  assert.equal(
    shortForwards.length,
    0,
    `short forwards: ${shortForwards.map((p) => `${p.name}@${p.heightIn}`).join(", ")}`
  );

  // True size centers (≥6'11", ≥250) should not list as guards.
  const bigGuards = league.players.filter(
    (p) =>
      p.teamId &&
      p.heightIn >= 83 &&
      p.weightLbs >= 250 &&
      (p.position === "PG" || p.position === "SG")
  );
  assert.equal(
    bigGuards.length,
    0,
    `big guards: ${bigGuards.map((p) => p.name).join(", ")}`
  );

  console.log("natural-positions ok", {
    tatum: league.players.find((p) => p.name === "Jayson Tatum")?.position,
    sample: Object.keys(expect).length,
  });
}

realLeagueChecks().catch((err) => {
  console.error(err);
  process.exit(1);
});
