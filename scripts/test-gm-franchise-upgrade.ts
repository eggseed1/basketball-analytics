import assert from "node:assert/strict";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import { simulateGame } from "../src/gm/engine/simulate";
import { boxToPlayByPlay, linesAtCutoff } from "../src/gm/engine/play-by-play";
import { prepareFranchise, parseFranchise, exportFranchise, archiveSeason, importDraftClass } from "../src/gm/engine/franchise";
import { createSimProfile, simulationRates } from "../src/gm/engine/player-profile";
import { tickInjuries } from "../src/gm/engine/progression";
import { applyRookieRatings } from "../src/gm/engine/rookie-ratings";
import { progressSheet } from "../src/gm/engine/attributes";
import { playerTradePoints } from "../src/gm/engine/value";
import { evaluateTrade } from "../src/gm/engine/trades";
import { rebalanceForInjuryChanges } from "../src/gm/engine/coaching";
import { playerSeasonToGmPlayer } from "../src/gm/seed/create-real-league";
import { withPlayerSeasonDefaults } from "../src/data/transformers/player-season-defaults";
import { recordSimGame } from "../src/gm/lib/season-line";
import type { GmPlayer, GmScheduleGame } from "../src/gm/types";

const league = prepareFranchise(createGeneratedLeague({ userTeamId: "bos", seed: 104, season: 2027 }));
const home = league.teams.find(t => t.id === "bos")!;
const away = league.teams.find(t => t.id !== home.id)!;
const game: GmScheduleGame = { id: "franchise-upgrade", season: 2027, day: 4, homeTeamId: home.id, awayTeamId: away.id, played: false };
for (let seed = 0; seed < 32; seed++) {
  const { box } = simulateGame(game, league.teams, league.players, seed);
  assert.deepEqual(box, simulateGame(game, league.teams, league.players, seed).box, "same seed and inputs reproduce the same game");
  for (const [teamId, score, margin] of [[home.id, box.homeScore, box.homeScore - box.awayScore], [away.id, box.awayScore, box.awayScore - box.homeScore]] as const) {
    const lines = box.players.filter(p => p.teamId === teamId);
    assert.equal(lines.reduce((n, p) => n + p.points, 0), score);
    assert.equal(lines.reduce((n, p) => n + p.minutes, 0), 240 + 25 * (box.overtime ?? 0));
    assert.equal(lines.reduce((n, p) => n + p.plusMinus, 0), margin * 5);
    for (const p of lines) {
      assert.equal(p.points, p.fgm * 2 + p.tpm + p.ftm, "every point is an actual make");
      assert.ok(p.fgm <= p.fga && p.tpm <= p.tpa && p.ftm <= p.fta);
      assert.equal(Object.values(p.positionMinutes ?? {}).reduce((n, v) => n + (v ?? 0), 0), p.minutes);
    }
  }
  for (const stint of box.stints!) { assert.equal(new Set(stint.home).size, 5); assert.equal(new Set(stint.away).size, 5); }
  const pbp = boxToPlayByPlay(box);
  assert.equal(pbp.at(-1)!.scoreHome, box.homeScore);
  assert.equal(pbp.at(-1)!.scoreAway, box.awayScore);
  const atTen = linesAtCutoff(box, pbp, 600);
  assert.equal(atTen.filter(p => p.teamId === home.id).reduce((n, p) => n + p.minutes, 0), 50, "replay minutes follow actual shared stints");
  const counted = pbp.filter(e => e.isFieldGoal).length;
  assert.equal(counted, box.players.reduce((n, p) => n + p.fga, 0));
}

const base = league.players.find(p => p.teamId === home.id)!;
const improved: GmPlayer = { ...base, sheet: { ...base.sheet!, attributes: { ...base.sheet!.attributes, threePoint: Math.min(99, base.sheet!.attributes.threePoint + 10), passAccuracy: Math.min(99, base.sheet!.attributes.passAccuracy + 10) } } };
assert.ok(simulationRates(improved).threePct >= simulationRates(base).threePct, "shooting development changes shot probability");
assert.ok(simulationRates(improved).ast >= simulationRates(base).ast, "passing development changes creation");
const savedRookie = { ...base, id: "123456", nbaPlayerId: "123456", age: 20, draftLabel: "2024 R1 P1" };
assert.equal(applyRookieRatings(savedRookie), savedRookie, "loading a profiled rookie does not reseed his development");
const playedRookie = { ...savedRookie, simProfile: undefined, seasonLine: { ...(base.nbaSeason ?? {}), gp: 12 } } as GmPlayer;
assert.equal(applyRookieRatings(playedRookie), playedRookie, "a played save keeps its rookie ratings");
const older = { ...base, sheet: { ...base.sheet!, version: 7, overall: 92, overallOffset: undefined } };
const migrated = prepareFranchise({ ...league, players: league.players.map(p => p.id === older.id ? older : p) });
assert.equal(migrated.players.find(p => p.id === older.id)!.sheet!.overall, 92, "migration preserves the old card");
const next = progressSheet(migrated.players.find(p => p.id === older.id)!, { pace: "season", form: 0 });
assert.ok(Math.abs(next.sheet!.overall - 92) <= 2, "development does not discard entry calibration");

const elite = { ...base, age: 27, sheet: { ...base.sheet!, overall: 97 } };
const starter = { ...base, age: 27, sheet: { ...base.sheet!, overall: 82 } };
assert.ok(playerTradePoints(elite, league) > playerTradePoints(starter, league) * 1.5, "elite talent is not flattened to the same five-star trade price");
assert.equal(evaluateTrade(league, home.id, away.id, [{ type: "player", id: base.id }, { type: "player", id: base.id }], []).ok, false);
assert.equal(evaluateTrade(league, away.id, home.id, [{ type: "player", id: base.id }], []).ok, false, "cannot trade another club's player");

const exported = exportFranchise(league);
const imported = parseFranchise(exported);
assert.equal(imported.userTeamId, league.userTeamId);
assert.deepEqual(imported.teams.map(t => t.coaching), JSON.parse(JSON.stringify(league.teams.map(t => t.coaching))), "round trip preserves coaching");
assert.throws(() => parseFranchise('{"league":{"version":1}}'));
assert.throws(() => parseFranchise('{"__proto__":{"polluted":true}}'));
const archived = archiveSeason(league);
assert.equal(archiveSeason(archived).history!.length, 1, "archive is idempotent");
assert.equal(archived.history![0]!.players.some(p => p.id === base.id), true);
const prospects = league.players.filter(p => league.draftPool.includes(p.id));
assert.ok(prospects.length >= 60);
const custom = importDraftClass(league, JSON.stringify({ players: prospects.slice(0, 60) }));
assert.equal(custom.draftPool.length, 60);
assert.equal(new Set(custom.players.map(p => p.id)).size, custom.players.length);
assert.ok(custom.players.filter(p => custom.draftPool.includes(p.id)).every(p => p.teamId == null && p.identityRevealed === false));
assert.throws(() => importDraftClass({ ...league, draftPickIndex: 1 }, JSON.stringify({ players: prospects.slice(0, 60) })));

const promised = { ...base, rolePromise: { teamId: home.id, minutes: 38, madeDay: 0, status: "pending" as const } };
let players = league.players.map(p => p.id === base.id ? promised : p);
for (let i = 0; i < 10; i++) {
  const box = simulateGame({ ...game, id: `promise-${i}` }, league.teams, players, i).box;
  box.players = box.players.filter(p => p.playerId !== base.id);
  players = recordSimGame(players, box, []);
}
assert.equal(players.find(p => p.id === base.id)!.rolePromise!.status, "unmet", "healthy DNPs count against a minutes promise");
const profile = createSimProfile({ ...base, nbaSeason: { season: "2025-26", gp: 5, min: 100, pts: 30, reb: 10, ast: 5, stl: 1, blk: 1, tov: 3, fgm: 10, fga: 30, tpm: 8, tpa: 10, ftm: 2, fta: 3 } });
assert.ok(profile.rates.threePct < 0.45, "ten hot attempts do not establish elite shooting ability");
const hurtPlayers = league.players.map(p => p.id === base.id ? { ...p, injury: { type: "Ankle sprain", gamesRemaining: 3, reinjuryRisk: 0.1 } } : p);
const injuryLeague = rebalanceForInjuryChanges({ ...league, players: hurtPlayers }, league.players);
assert.ok(injuryLeague.teams.find(t => t.id === home.id)!.injuryRotationBackup);
const recovered = rebalanceForInjuryChanges({ ...injuryLeague, players: league.players }, hurtPlayers);
assert.deepEqual(recovered.teams.find(t => t.id === home.id)!.coaching, home.coaching, "recovery restores the original coaching plan");
const row = withPlayerSeasonDefaults({ playerId: "seed-zero", playerName: "Zero Impact", teamId: "bos", teamName: "Boston Celtics", season: "2025-26", position: "SG", age: 26, gamesPlayed: 40, minutes: 1000, darkoDpm: 0, darkoOff: 0, darkoDef: 0 });
const seeded = playerSeasonToGmPlayer(row, "bos", 2026);
assert.equal(seeded.ratings.impact, 0, "a valid zero overlay stays zero");
assert.ok(Object.values(seeded.sheet!.attributes).every(Number.isFinite), "unpublished counting fields cannot generate NaN abilities");
assert.ok(Object.values(seeded.sheet!.tendencies).every(Number.isFinite));
assert.equal(seeded.ratings.offense + seeded.ratings.defense, seeded.ratings.impact);
const injured = { ...base, injury: { type: "Ankle sprain", gamesRemaining: 3, reinjuryRisk: 0.1 } };
const otherNight = tickInjuries([injured], 5, { teamIds: [away.id], before: [injured], trainerByTeam: { [home.id]: 5 } });
assert.equal(otherNight[0]!.injury!.gamesRemaining, 3, "another team's game does not consume your injury recovery games");
let weakTrainer = [injured], strongTrainer = [injured];
for (let i = 0; i < 2; i++) { weakTrainer = tickInjuries(weakTrainer, 1) as typeof weakTrainer; strongTrainer = tickInjuries(strongTrainer, 5) as typeof strongTrainer; }
assert.ok(weakTrainer[0]!.injury && !strongTrainer[0]!.injury, "trainer bonuses accumulate instead of being rounded away");
console.log("Franchise upgrade: shared possessions, accounting, development, trade value, migration, exports, promises, archives and draft imports passed.");
