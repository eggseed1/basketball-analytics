import assert from "node:assert/strict";

import { parseDarkoPlayers } from "../src/data/providers/nba/darko-scraper";

const fields = { nba_id: 203999, player_name: "Nikola Jokic", team_name: "Denver Nuggets", season: 2026, dpm: 6.5, o_dpm: 5, d_dpm: 1.5, box_dpm: 4.7, on_off_dpm: 6.8 };

function testRowLayout() {
  const rows = parseDarkoPlayers({ players: [fields, { player_name: "No id" }] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].nbaId, "203999");
  assert.equal(rows[0].dpm, 6.5);
}

function testColumnLayout() {
  const keys = Object.keys(fields);
  const values = keys.map((k) => [fields[k as keyof typeof fields], k === "nba_id" ? 1628983 : k === "player_name" ? "Shai Gilgeous-Alexander" : 1]);
  const rows = parseDarkoPlayers({ players: { keys, values } });
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((r) => [r.nbaId, r.playerName, r.oDpm]),
    [
      ["203999", "Nikola Jokic", 5],
      ["1628983", "Shai Gilgeous-Alexander", 1],
    ]
  );
}

function testUnknownLayout() {
  assert.deepEqual(parseDarkoPlayers({ players: { keys: ["nba_id"] } }), []);
  assert.deepEqual(parseDarkoPlayers(null), []);
}

testRowLayout();
testColumnLayout();
testUnknownLayout();
console.log("darko parse: ok");
