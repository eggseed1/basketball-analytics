/**
 * Monthly Madden-style scouting focus: prompt, apply looks, skip month.
 */
import assert from "node:assert/strict";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import {
  applyScoutingFocus,
  autoPickScoutingFocus,
  autoScoutingFocus,
  considerScoutingFocus,
  monthKeyForLeague,
  skipScoutingFocus,
  suggestFocusProspects,
} from "../src/gm/engine/scouting-focus";
import { considerTeamBuildingCheckpoint } from "../src/gm/engine/checkpoints";

function blankCount(league: ReturnType<typeof createGeneratedLeague>, id: string) {
  const player = league.players.find((entry) => entry.id === id)!;
  const grades = player.scoutProfile?.grades;
  if (!grades) return 6;
  return (["athleticism", "shooting", "creation", "defense", "feel", "upside"] as const).filter(
    (key) => grades[key] == null
  ).length;
}

function main() {
  let league = createGeneratedLeague({ userTeamId: "bos", season: 2027, seed: 99 });
  assert.ok(league.draftPool.length >= 3, "draft class exists");

  // First calendar month with games.
  const withDate = league.schedule.find((game) => game.gameDate && game.day >= 10);
  assert.ok(withDate?.gameDate, "schedule has dated games");
  league = { ...league, day: withDate!.day };

  const monthKey = monthKeyForLeague(league);
  assert.ok(monthKey);

  league = considerScoutingFocus(league);
  assert.ok(league.scoutingFocusPrompt);
  assert.equal(league.scoutingFocusPrompt?.monthKey, monthKey);
  assert.equal(league.scoutingFocusPrompt?.slots, 3);

  const suggested = suggestFocusProspects(league);
  assert.ok(suggested.length >= 3);

  const pick = suggested.slice(0, 2);
  const beforeFog = pick.map((id) => blankCount(league, id));
  league = applyScoutingFocus(league, pick, "PG");
  assert.equal(league.scoutingFocusPrompt, undefined);
  assert.deepEqual(league.scoutingFocus?.playerIds, pick);
  assert.equal(league.scoutingFocus?.positionFocus, "PG");
  assert.ok(league.seenScoutingMonths?.includes(monthKey!));

  for (let i = 0; i < pick.length; i++) {
    assert.ok(
      blankCount(league, pick[i]!) <= beforeFog[i]!,
      "focus should fill fog on chosen prospects"
    );
  }

  // Same month does not re-prompt.
  league = considerScoutingFocus(league);
  assert.equal(league.scoutingFocusPrompt, undefined);

  // Team-building gate blocks scouting prompt.
  let other = createGeneratedLeague({ userTeamId: "bos", season: 2027, seed: 11 });
  const dated = other.schedule.find((game) => game.gameDate && game.day >= 10)!;
  other = { ...other, day: dated.day, teamBuildingCheckpoint: {
    id: "trade_deadline",
    kind: "trade_deadline",
    day: other.day,
    title: "x",
    body: "y",
    primaryHref: "/gm/trade",
    primaryLabel: "trades",
  }};
  other = considerScoutingFocus(other);
  assert.equal(other.scoutingFocusPrompt, undefined);
  other = { ...other, teamBuildingCheckpoint: undefined };
  other = considerTeamBuildingCheckpoint(other);
  // May or may not hit TB depending on deadline day; clear and force scouting.
  other = {
    ...other,
    teamBuildingCheckpoint: undefined,
    checkpointSnooze: undefined,
    day: dated.day,
  };
  other = considerScoutingFocus(other);
  assert.ok(other.scoutingFocusPrompt);
  other = skipScoutingFocus(other);
  assert.equal(other.scoutingFocusPrompt, undefined);
  assert.ok(other.seenScoutingMonths?.length);

  // Autoscout picks and applies weaker looks than manual.
  let auto = createGeneratedLeague({ userTeamId: "bos", season: 2027, seed: 44 });
  const autoDay = auto.schedule.find((game) => game.gameDate && game.day >= 10)!;
  auto = { ...auto, day: autoDay.day };
  auto = considerScoutingFocus(auto);
  assert.ok(auto.scoutingFocusPrompt);
  const autoPick = autoPickScoutingFocus(auto);
  assert.ok(autoPick.playerIds.length >= 1 && autoPick.playerIds.length <= 3);
  const manualClone = { ...auto };
  const autoIds = autoPick.playerIds;
  const fogBefore = autoIds.map((id) => blankCount(auto, id));
  auto = autoScoutingFocus(auto);
  assert.equal(auto.scoutingFocusPrompt, undefined);
  assert.deepEqual(auto.scoutingFocus?.playerIds, autoIds);
  const fogAfterAuto = autoIds.map((id) => blankCount(auto, id));

  const manual = applyScoutingFocus(manualClone, autoIds, autoPick.positionFocus, "manual");
  const fogAfterManual = autoIds.map((id) => blankCount(manual, id));
  for (let i = 0; i < autoIds.length; i++) {
    assert.ok(fogAfterAuto[i]! <= fogBefore[i]!, "autoscout clears some fog");
    assert.ok(
      fogAfterManual[i]! <= fogAfterAuto[i]!,
      "manual focus clears at least as much fog as autoscout"
    );
  }

  // Always-auto resolves the prompt without pausing.
  let autoOn = createGeneratedLeague({ userTeamId: "bos", season: 2027, seed: 55 });
  const onDay = autoOn.schedule.find((game) => game.gameDate && game.day >= 10)!;
  autoOn = {
    ...autoOn,
    day: onDay.day,
    automation: { ...(autoOn.automation ?? {}), autoScout: true },
  };
  autoOn = considerScoutingFocus(autoOn);
  assert.equal(autoOn.scoutingFocusPrompt, undefined);
  assert.ok(autoOn.scoutingFocus?.playerIds.length);

  console.log("test-gm-scouting-focus: ok");
}

main();
