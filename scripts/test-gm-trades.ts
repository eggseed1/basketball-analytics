/**
 * Trade protections, cash, untouchables, Stepien, and the package finder.
 * Run: npx tsx scripts/test-gm-trades.ts
 */
import assert from "node:assert/strict";

import { createGeneratedLeague } from "../src/gm/seed/create-league";
import {
  applyTrade,
  evaluateTrade,
  findPlayerPackages,
  findTradePackage,
  stepienViolation,
} from "../src/gm/engine/trades";
import { pickStars } from "../src/gm/engine/value";

const league = createGeneratedLeague({
  userTeamId: "bos",
  season: 2026,
  seed: 7,
});
const bos = league.teams.find((t) => t.id === "bos")!;
const nyk = league.teams.find((t) => t.id === "nyk")!;
const firsts = bos.draftPicks.filter((p) => p.round === 1);
assert.ok(firsts.length >= 2, "two firsts to test Stepien");

const both: { type: "pick"; id: string }[] = firsts.map((p) => ({
  type: "pick",
  id: p.id,
}));
assert.equal(
  stepienViolation(bos, both, [], league.season),
  true,
  "trading consecutive firsts is refused"
);
assert.equal(
  stepienViolation(bos, [both[0]!], [], league.season),
  false,
  "one first can move"
);

const protectedPick = { ...firsts[0]!, protectionTopN: 4 };
assert.ok(pickStars(league, protectedPick) <= pickStars(league, firsts[0]!));

const locked = league.players.find((p) => p.teamId === "bos" && p.contract)!;
const withLock = {
  ...league,
  teams: league.teams.map((t) =>
    t.id === "bos" ? { ...t, untouchables: [locked.id] } : t
  ),
};
const blocked = evaluateTrade(
  withLock,
  "bos",
  "nyk",
  [{ type: "player", id: locked.id }],
  []
);
assert.equal(blocked.ok, false);

const partnerPlayer = league.players.find((p) => p.teamId === "nyk")!;
const pack = findTradePackage(league, "bos", "nyk", partnerPlayer.id);
if (pack) {
  const verdict = evaluateTrade(
    league,
    "bos",
    "nyk",
    pack,
    [{ type: "player", id: partnerPlayer.id }]
  );
  assert.equal(verdict.ok, true, verdict.ok ? "" : verdict.reason);
}

const tooMuchCash = evaluateTrade(
  league,
  "bos",
  "nyk",
  [{ type: "cash", id: "cash", cashM: 40 }],
  []
);
assert.equal(tooMuchCash.ok, false);
const applied = applyTrade(league, {
  fromTeamId: "bos",
  toTeamId: "nyk",
  fromAssets: [{ type: "cash", id: "cash", cashM: 3 }],
  toAssets: [],
});
const bosAfter = applied.teams.find((t) => t.id === "bos")!;
const nykAfter = applied.teams.find((t) => t.id === "nyk")!;
assert.ok((bosAfter.cashM ?? 0) < (nykAfter.cashM ?? 0));
void nyk;

const own = league.players.find((p) => p.teamId === "bos" && p.contract)!;
for (const pack of findPlayerPackages(league, "bos", own.id)) {
  assert.notEqual(pack.partnerId, "bos");
  assert.equal(pack.youSend.some((asset) => asset.type === "player" && asset.id === own.id), true);
  // Cash does not salary-match. Finder must not invent "player + money" packages.
  const receiveHasCash = pack.youReceive.some((asset) => asset.type === "cash");
  const receiveHasPlayer = pack.youReceive.some((asset) => asset.type === "player");
  assert.equal(
    receiveHasCash && receiveHasPlayer,
    false,
    "partner package should not pair a player with cash"
  );
  const verdict = evaluateTrade(league, "bos", pack.partnerId, pack.youSend, pack.youReceive);
  assert.equal(verdict.ok, true, verdict.reason);
}
for (const pack of findPlayerPackages(league, "bos", partnerPlayer.id)) {
  assert.equal(pack.partnerId, "nyk");
  const sendHasCash = pack.youSend.some((asset) => asset.type === "cash");
  const sendHasPlayer = pack.youSend.some((asset) => asset.type === "player");
  assert.equal(
    sendHasCash && sendHasPlayer,
    false,
    "acquire package should not pair a player with cash"
  );
  const verdict = evaluateTrade(league, "bos", "nyk", pack.youSend, pack.youReceive);
  assert.equal(verdict.ok, true, verdict.reason);
}
const lockedAway = {
  ...league,
  teams: league.teams.map((t) =>
    t.id === "nyk" ? { ...t, untouchables: [partnerPlayer.id] } : t
  ),
};
assert.equal(findPlayerPackages(lockedAway, "bos", partnerPlayer.id).length, 0);

console.log("gm trades: ok");
