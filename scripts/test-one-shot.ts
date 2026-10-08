/**
 * ONE SHOT: world registry, FIBA crosswalk, sparse countries, determinism
 * across speeds and "Next decision", save/resume, focus proration, money,
 * body plausibility, injuries, box scores, draft eligibility, undrafted
 * debuts, peer isolation, the clock and QA careers by country.
 * Run: npx tsx scripts/test-one-shot.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { advise } from "../src/one-shot/advisor";
import { FAMILY_BIAS, generateParents, heightPercentile, parentTarget } from "../src/one-shot/body";
import { taxRate } from "../src/one-shot/finance";
import { fieldOf, tournamentsFor } from "../src/one-shot/international";
import { advanced, sumBoxes } from "../src/one-shot/stats";
import { levelOf, performanceLevel, simulateGame } from "../src/one-shot/career";
import { MAX_BATCH, tick } from "../src/one-shot/clock";
import { autoEligible, canDeclare } from "../src/one-shot/draft";
import { advance, advanceToDecision, autoChoice, createLife, resolveDecision, setPlan, stepMonth } from "../src/one-shot/engine";
import { EVENT_BY_ID, EVENTS } from "../src/one-shot/events";
import { dailyDate, dailySeed, parseSave, serialize } from "../src/one-shot/persistence";
import { outcomeTier, shareText } from "../src/one-shot/report";
import { createStreams, rngOf } from "../src/one-shot/rng";
import { offerBlocked, offseasonOffers } from "../src/one-shot/routes";
import { projectedCeiling } from "../src/one-shot/skills";
import { canAfford, chargeFamily, effectivePractice, monthlyDevelopment, stepInjury } from "../src/one-shot/training";
import type { LifeState, NewLifeOptions } from "../src/one-shot/types";
import { birthShare, COUNTRIES, country, domesticProLeagues, LEAGUES, maybeLeague, PLAYABLE_COUNTRIES, teamStrength } from "../src/one-shot/world";

const root = path.resolve(import.meta.dirname, "..");
const readJson = <T>(rel: string) => JSON.parse(readFileSync(path.join(root, rel), "utf8")) as T;

const base = (seed: number, extra: Partial<NewLifeOptions> = {}): NewLifeOptions => ({ seed, mode: "random", draw: "weighted", pacing: "standard", ...extra });

/** Smallest seed whose equal-odds birth lands in `countryId`. */
function seedFor(countryId: string, start = 1): number {
  for (let s = start; s < start + 200_000; s++) if (createLife(base(s, { draw: "equal" })).birthplace.countryId === countryId) return s;
  throw new Error(`no seed for ${countryId}`);
}

function autoLife(seed: number, months: number, opts: Partial<NewLifeOptions> = {}) {
  return advance(createLife(base(seed, opts)), months, { auto: true });
}

const strip = (s: LifeState) => JSON.stringify(s);
let checks = 0;
const ok = (name: string, fn: () => void) => {
  fn();
  checks++;
  console.log(`ok  ${name}`);
};

/* ------------------------------------------------------------ registry */

ok("registry covers every ISO 3166-1 entry plus Kosovo, with valid statuses", () => {
  const iso = readJson<{ entries: { alpha2: string }[] }>("scripts/one-shot-research/iso3166-1.json").entries;
  assert.equal(iso.length, 249);
  const ids = new Set(COUNTRIES.map((c) => c.id));
  for (const e of iso) assert.ok(ids.has(e.alpha2), `missing ${e.alpha2}`);
  assert.ok(ids.has("XK"));
  assert.equal(ids.size, COUNTRIES.length, "duplicate ids");
  assert.equal(new Set(COUNTRIES.map((c) => c.iso3)).size, COUNTRIES.length, "duplicate iso3");
  const allowed = new Set(["verified", "partial", "unknown", "inactive", "confirmed-absence"]);
  for (const c of COUNTRIES) {
    assert.ok(allowed.has(c.research.status), `${c.id} status`);
    assert.ok(c.research.reason.length > 10, `${c.id} reason`);
    assert.ok(c.citizenship && c.kind, `${c.id} citizenship/kind`);
    if (!c.inhabited) {
      assert.equal(c.research.status, "inactive");
      assert.equal(c.draw.weight, 0);
    } else assert.ok(c.draw.weight > 0, `${c.id} weight`);
    if (c.kind === "territory") assert.ok(c.administeredBy, `${c.id} administeredBy`);
  }
  assert.ok(PLAYABLE_COUNTRIES.length >= 240);
  for (const id of ["US", "ES", "NG", "KR", "JP", "BR"]) assert.equal(country(id).research.status, "verified", id);
});

ok("FIBA crosswalk is explicit and one-to-one", () => {
  const members = readJson<{ members: { fibaCode: string }[] }>("scripts/one-shot-research/fiba-federations.json").members.map((m) => ({ code: m.fibaCode }));
  assert.equal(members.length, 212);
  const byCode = new Map<string, string>();
  for (const c of COUNTRIES) {
    if (!c.federation) continue;
    assert.ok(!byCode.has(c.federation.fibaCode), `FIBA ${c.federation.fibaCode} mapped twice`);
    byCode.set(c.federation.fibaCode, c.id);
  }
  for (const m of members) assert.ok(byCode.has(m.code), `FIBA member ${m.code} not mapped`);
  assert.equal(byCode.get("KOS"), "XK");
  for (const c of COUNTRIES) if (!c.federation && c.inhabited) assert.notEqual(c.research.status, "verified", `${c.id} verified without a federation`);
});

ok("leagues: statuses, categories and no invented leagues", () => {
  const ids = new Set(LEAGUES.map((l) => l.id));
  assert.equal(ids.size, LEAGUES.length);
  for (const c of COUNTRIES) {
    for (const lid of [...c.competitions.domestic, ...c.competitions.crossBorder, ...c.competitions.selective]) assert.ok(ids.has(lid), `${c.id} -> ${lid}`);
  }
  const cat = (id: string) => maybeLeague(id)!.category;
  assert.equal(maybeLeague("euroleague")!.crossBorder, true);
  assert.match(cat("aba"), /^cross-border/);
  assert.match(cat("euroleague"), /^cross-border/);
  assert.equal(maybeLeague("bal")!.crossBorder, true);
  assert.equal(maybeLeague("bwb")!.selective, true);
  assert.notEqual(cat("bwb"), "professional league");
  assert.equal(maybeLeague("g-league-ignite")!.research.status, "inactive");
  for (const l of LEAGUES) if (l.research.status !== "verified") assert.equal(domesticProLeagues(l.countries[0] ?? "").some((x) => x.id === l.id), false, `${l.id} unverified but playable`);
});

/* ------------------------------------------------------------ sparse */

ok("sparse countries use a generic senior tier and never invent a league", () => {
  for (const id of ["TV", "GL", "IN"]) {
    const c = country(id);
    assert.equal(domesticProLeagues(id).length, 0, `${id} should have no verified pro league`);
    const seed = seedFor(id);
    const s = autoLife(seed, 26 * 12, { draw: "equal" });
    assert.equal(s.birthplace.countryId, id);
    for (const season of s.seasons) {
      if (season.countryId === id && season.leagueId) assert.equal(maybeLeague(season.leagueId)!.research.status, "verified", `${id} season in ${season.leagueId}`);
    }
    const local = s.seasons.filter((x) => x.countryId === id && x.node === "local-senior");
    if (s.seasons.some((x) => x.countryId === id && x.ageYears >= 18)) assert.ok(local.length > 0 || s.seasons.some((x) => x.countryId === id && x.node === "university"), `${c.name} adult seasons`);
  }
});

ok("birthplace, residence, citizenship and club country are separate fields", () => {
  const s = autoLife(seedFor("NG"), 25 * 12, { draw: "equal" });
  assert.equal(s.birthplace.countryId, "NG");
  assert.deepEqual(s.citizenships, ["NG"]);
  assert.ok(typeof s.residence.countryId === "string" && typeof s.placement.countryId === "string");
});

/* ------------------------------------------------------------ determinism */

ok("same seed and choices give the same life at any speed or with Next decision", () => {
  for (const seed of [11, 4242, 90001]) {
    const months = 22 * 12;
    let a = createLife(base(seed));
    for (let i = 0; i < months; i++) a = advance(a, 1, { auto: true });
    let b = createLife(base(seed));
    for (let i = 0; i < months; i += 16) b = advance(b, Math.min(16, months - i), { auto: true });
    let c = createLife(base(seed));
    while (c.ageMonths < months && !c.ended) {
      c = advanceToDecision(c, months - c.ageMonths);
      while (c.pendingDecision) c = resolveDecision(c, autoChoice(c));
    }
    assert.equal(strip(b), strip(a), `batch 16 seed ${seed}`);
    assert.equal(strip(c), strip(a), `next-decision seed ${seed}`);
  }
});

ok("advisor, projection and rendering helpers consume no randomness", () => {
  const s = autoLife(77, 15 * 12);
  const before = JSON.stringify(s.rng);
  advise(s);
  projectedCeiling(s);
  offerBlocked(s, { costPerYear: 1000, countryId: "US" } as never);
  shareText(s);
  assert.equal(JSON.stringify(s.rng), before);
});

ok("decisions pause time: advance stops at a required choice", () => {
  let s = createLife(base(5));
  s = advanceToDecision(s, 400);
  assert.ok(s.pendingDecision?.required);
  const age = s.ageMonths;
  const t = advance(s, 12);
  assert.equal(t.ageMonths, age, "time moved past a pending decision");
});

/* ------------------------------------------------------------ save */

ok("save and resume continues the exact same life", () => {
  const seed = 31337;
  const full = autoLife(seed, 24 * 12);
  const mid = autoLife(seed, 13 * 12);
  const loaded = parseSave(serialize(mid));
  assert.ok(loaded.ok);
  const resumed = advance(loaded.state, 11 * 12, { auto: true });
  assert.equal(strip(resumed), strip(full));
});

ok("bad saves are rejected with a reason", () => {
  assert.equal(parseSave(null).ok, false);
  const notJson = parseSave("{oops");
  assert.ok(!notJson.ok && /JSON/.test(notJson.reason));
  const s = createLife(base(1));
  const missing = JSON.parse(serialize(s));
  delete missing.rng;
  assert.equal(parseSave(JSON.stringify(missing)).ok, false);
  const newer = { ...JSON.parse(serialize(s)), schemaVersion: 99 };
  const r = parseSave(JSON.stringify(newer));
  assert.ok(!r.ok && /newer/.test(r.reason));
});

ok("daily seed follows the UTC date", () => {
  assert.equal(dailyDate(new Date("2026-10-08T23:30:00-05:00")), "2026-10-09");
  assert.equal(dailyDate(new Date("2026-10-08T00:10:00Z")), "2026-10-08");
  assert.equal(dailySeed("2026-10-08"), dailySeed("2026-10-08"));
  assert.notEqual(dailySeed("2026-10-08"), dailySeed("2026-10-09"));
});

/* ------------------------------------------------------------ focus and money */

ok("focus gains are prorated and show diminishing returns", () => {
  let s = autoLife(2024, 12 * 12);
  s = { ...s, condition: { ...s.condition, injury: null, energy: 90, health: 90 } };
  const gain = (st: LifeState) => monthlyDevelopment(st).skillGains.shooting ?? 0;
  const primary = gain(setPlan(s, { primary: "shooting", secondary: null }));
  const secondary = gain(setPlan(s, { primary: "defense", secondary: "shooting" }));
  const none = gain(setPlan(s, { primary: "defense", secondary: null }));
  assert.ok(primary > secondary && secondary > none, `${primary} > ${secondary} > ${none}`);
  const ratio = (primary - none) / (secondary - none);
  assert.ok(Math.abs(ratio - 0.65 / 0.35) < 0.05, `split ratio ${ratio}`);
  assert.ok(effectivePractice(20) - effectivePractice(10) < effectivePractice(10) - effectivePractice(0));
  const bal = gain(setPlan(s, { primary: "shooting", workload: "balanced" }));
  const high = gain(setPlan(s, { primary: "shooting", workload: "high" }));
  assert.ok(high > bal && high < bal * 1.6, `high ${high} vs balanced ${bal}`);
  assert.equal(Object.keys(monthlyDevelopment(createLife(base(3))).skillGains).length, 0, "no training before 3");
});

ok("money: costs come out of savings and unaffordable offers are blocked", () => {
  const s = createLife(base(9));
  const before = s.family.savings;
  chargeFamily(s, 50);
  assert.equal(s.family.savings, Math.max(0, before - 50));
  chargeFamily(s, 1e9);
  assert.equal(s.family.savings, 0);
  assert.equal(canAfford(s, 1e7), false);
  assert.ok(offerBlocked(s, { costPerYear: 1e7, countryId: s.residence.countryId } as never));
  for (const seed of [1, 2, 3, 4, 5]) {
    const life = autoLife(seed, 30 * 12);
    assert.ok(Number.isFinite(life.family.savings) && life.family.savings >= 0);
    assert.ok(Number.isFinite(life.earnings) && life.earnings >= 0);
  }
});

/* ------------------------------------------------------------ body and injuries */

ok("bodies stay plausible and height never shrinks while growing", () => {
  for (let seed = 100; seed < 160; seed++) {
    let s = createLife(base(seed));
    let prev = s.body.heightCm;
    for (let m = 0; m < 22 * 12; m++) {
      s = advance(s, 1, { auto: true });
      assert.ok(s.body.heightCm + 1e-9 >= prev, `seed ${seed} shrank at ${s.ageMonths}`);
      prev = s.body.heightCm;
    }
    const b = s.body;
    assert.ok(b.heightCm > 148 && b.heightCm < 232, `height ${b.heightCm}`);
    const ratio = b.wingspanCm / b.heightCm;
    assert.ok(ratio > 0.94 && ratio < 1.13, `wingspan ratio ${ratio}`);
    const bmi = b.weightKg / (b.heightCm / 100) ** 2;
    assert.ok(bmi > 16.5 && bmi < 33, `bmi ${bmi}`);
    assert.ok(b.reachCm > b.heightCm, "reach above height");
  }
});

ok("injuries heal, health stays in range, and the injury stream always takes three draws", () => {
  const s = autoLife(606, 16 * 12);
  s.condition.injury = { id: "x", label: "Test sprain", monthsLeft: 2, severity: 1, causeEntryId: null };
  stepInjury(s, 10);
  assert.equal(s.condition.injury?.monthsLeft, 1);
  stepInjury(s, 10);
  assert.equal(s.condition.injury, null);
  const a = structuredClone(s);
  const b = structuredClone(s);
  b.condition.energy = 5;
  stepInjury(a, 0);
  stepInjury(b, 40);
  if (!b.condition.injury) assert.equal(a.rng.injury, b.rng.injury);
  const draws = structuredClone(s);
  const r = rngOf(draws.rng, "injury");
  r.next();
  r.next();
  r.next();
  const c = structuredClone(s);
  stepInjury(c, 10);
  assert.equal(c.rng.injury, draws.rng.injury);
  for (let seed = 1; seed < 30; seed++) {
    const life = autoLife(seed, 28 * 12);
    assert.ok(life.condition.health >= 0 && life.condition.health <= 100);
    assert.ok(!life.condition.injury || life.condition.injury.monthsLeft > 0);
  }
});

/* ------------------------------------------------------------ games */

ok("box scores reconcile in every game and season", () => {
  const s = autoLife(4040, 17 * 12);
  const lvl = levelOf(s);
  assert.ok(lvl, "needs a team at 17");
  const rng = rngOf(structuredClone(s.rng), "games");
  for (let i = 0; i < 400; i++) {
    const g = simulateGame(s, lvl!, rng);
    assert.equal(g.pts, 2 * (g.fgm - g.tpm) + 3 * g.tpm + g.ftm);
    assert.ok(g.fgm <= g.fga && g.tpm <= g.tpa && g.tpm <= g.fgm && g.ftm <= g.fta);
    assert.ok(g.min >= 0 && g.min <= 48 && g.teamScore !== g.oppScore);
    assert.ok(g.teamScore >= g.pts);
  }
  for (let seed = 1; seed < 25; seed++) {
    const life = autoLife(seed, 30 * 12);
    for (const x of life.seasons) {
      assert.equal(x.pts, 2 * (x.fgm - x.tpm) + 3 * x.tpm + x.ftm, `season ${x.key}`);
      assert.ok(x.wins + x.losses >= x.gp, `record ${x.key}: team games include ones he missed`);
    }
  }
});

/* ------------------------------------------------------------ eligibility */

ok("draft eligibility and NCAA grades rule", () => {
  const s = createLife(base(12));
  const y = (age: number) => s.identity.birthYear + age;
  const at = (months: number) => ({ ...s, ageMonths: months });
  assert.equal(canDeclare(at(18 * 12), y(18)), false);
  assert.equal(autoEligible(at(22 * 12), y(22)), true);
  assert.equal(autoEligible(at(19 * 12), y(19)), false);
  let lowGrades = autoLife(seedFor("US"), 18 * 12, { draw: "equal" });
  lowGrades = { ...lowGrades, education: { ...lowGrades.education, academics: 20, amateur: true }, exposure: 90 };
  for (let k = 0; k < 20; k++) {
    const probe = structuredClone(lowGrades);
    probe.rng.scouting = (probe.rng.scouting + k * 7919) >>> 0;
    assert.ok(!offseasonOffers(probe).some((o) => o.node === "university"), "NCAA offer with failing grades");
  }
});

ok("moving abroad as a youth always follows an invitation", () => {
  for (let seed = 1; seed < 120; seed++) {
    let s = createLife(base(seed, { draw: "equal" }));
    while (s.ageMonths < 18 * 12 && !s.ended) {
      stepMonth(s);
      const d = s.pendingDecision;
      if (d?.templateId === "offers") {
        for (const o of d.offers ?? []) {
          if (o.countryId !== s.residence.countryId && s.ageMonths < 17 * 12 && o.node === "elite-youth") {
            assert.ok(s.achievements.campInvite !== null || s.exposure >= 40, `seed ${seed}: uninvited move`);
          }
        }
      }
      if (s.pendingDecision) s = resolveDecision(s, autoChoice(s));
    }
  }
});

ok("an undrafted player can still make an NBA debut", () => {
  const s = autoLife(314, 31 * 12);
  assert.ok(s.achievements.nbaDebut !== null, "seed 314 should debut");
  assert.equal(s.achievements.drafted, null);
  assert.equal(outcomeTier(s), "nba-debut");
});

/* ------------------------------------------------------------ peers, events, clock */

ok("peers are isolated from the player's choices", () => {
  const a = autoLife(808, 25 * 12);
  let b = createLife(base(808));
  for (let m = 0; m < 25 * 12; m++) {
    if (m % 7 === 0 && m >= 120) b = setPlan(b, { primary: m % 2 ? "shooting" : "defense", workload: m % 3 ? "high" : "low" });
    b = advance(b, 1, { auto: true });
  }
  assert.notEqual(strip({ ...a, peers: [] }), strip({ ...b, peers: [] }), "choices should change the player's life");
  assert.deepEqual(b.peers, a.peers);
  assert.deepEqual(b.rng.peers, a.rng.peers);
});

ok("event library: 60+ templates with previews and valid follow-ups", () => {
  assert.ok(EVENTS.length >= 60, `${EVENTS.length} events`);
  assert.equal(new Set(EVENTS.map((e) => e.id)).size, EVENTS.length);
  const stages = new Set<number>();
  for (const e of EVENTS) {
    stages.add(e.ages[0] < 6 ? 0 : e.ages[0] < 12 ? 1 : e.ages[0] < 18 ? 2 : e.ages[0] < 25 ? 3 : 4);
    for (const c of e.choices ?? []) {
      assert.ok(c.preview, `${e.id}.${c.id} preview`);
      if (c.follow) assert.ok(EVENT_BY_ID[c.follow.id], `${e.id} follow-up ${c.follow.id}`);
    }
  }
  assert.equal(stages.size, 5, "every life stage has events");
});

ok("clock ticks are bounded and never catch up on missed time", () => {
  let acc = 0;
  let total = 0;
  for (let i = 0; i < 40; i++) {
    const t = tick(acc, "standard", 1);
    acc = t.acc;
    total += t.months;
  }
  assert.equal(total, 10, "1x standard is 1 month per second");
  for (let i = 0; i < 100; i++) {
    const t = tick(acc, "short", 16);
    assert.ok(t.months <= MAX_BATCH);
    acc = t.acc;
  }
  assert.ok(tick(0, "standard", 16, 60_000).months <= MAX_BATCH, "a long stall does not batch more than the cap");
});

/* ------------------------------------------------------------ QA careers */

ok("QA careers follow country-aware routes", () => {
  const expect: Record<string, (s: LifeState) => boolean> = {
    US: (s) => s.seasons.some((x) => x.node === "us-high-school" || x.leagueId === "ncaa"),
    ES: (s) => s.seasons.some((x) => x.leagueId === "acb" || (x.node === "elite-youth" && x.countryId === "ES")),
    NG: (s) => s.seasons.some((x) => x.leagueId === "npbl-ng"),
    KR: (s) => s.seasons.some((x) => x.leagueId === "kbl"),
    JP: (s) => s.seasons.some((x) => x.leagueId === "bleague"),
    BR: (s) => s.seasons.some((x) => x.leagueId === "nbb"),
    IN: (s) => s.seasons.some((x) => x.node === "local-senior" && x.countryId === "IN"),
    TV: (s) => s.seasons.some((x) => x.node === "local-senior" && x.countryId === "TV"),
  };
  for (const [id, test] of Object.entries(expect)) {
    let seed = 1;
    let hits = 0;
    for (let i = 0; i < 6; i++) {
      seed = seedFor(id, seed + 1);
      const s = autoLife(seed, 31 * 12, { draw: "equal" });
      assert.ok(s.ended || s.ageMonths >= 31 * 12, `${id} life did not finish`);
      for (const x of s.seasons) if (x.leagueId) assert.ok(maybeLeague(x.leagueId), `${id} unknown league ${x.leagueId}`);
      if (test(s)) hits++;
      if (s.seasons.some((x) => x.ageYears >= 12)) assert.ok(performanceLevel(s) >= 0);
    }
    assert.ok(hits >= 2, `${id}: expected route in at least 2 of 6 lives, got ${hits}`);
  }
});

/* ------------------------------------------------------------ birth odds and parents */

ok("birth odds sum to 1 and parents follow their country's heights", () => {
  for (const draw of ["weighted", "equal"] as const) {
    const total = PLAYABLE_COUNTRIES.reduce((a, c) => a + birthShare(c.id, draw), 0);
    assert.ok(Math.abs(total - 1) < 1e-9, `${draw} shares sum to ${total}`);
  }
  for (const c of PLAYABLE_COUNTRIES) assert.ok(c.height && c.height.maleCm > 150 && c.height.maleCm < 190, `${c.id} height`);
  const avg = (id: string) => {
    const r = rngOf(createStreams(99), "generation");
    let f = 0;
    for (let i = 0; i < 4000; i++) f += generateParents(r, id).fatherHeightCm;
    return f / 4000;
  };
  const nl = avg("NL");
  const tl = avg("TL");
  assert.ok(Math.abs(nl - (country("NL").height!.maleCm + FAMILY_BIAS.male)) < 0.6, `NL fathers ${nl}`);
  assert.ok(nl - tl > 15, `NL ${nl} vs TL ${tl}`);
  assert.equal(heightPercentile(country("US").height!.maleCm, "male", "US"), 50);
  const t = parentTarget(180, 166);
  assert.equal(t.mid, 180);
  assert.ok(t.low < t.mid && t.high > t.mid);
});

/* ------------------------------------------------------------ national teams */

ok("national team calendar, fields and results stay consistent", () => {
  const og = tournamentsFor("US", 2028).find((t) => t.kind === "olympics")!;
  assert.equal(og.month, 7);
  assert.match(og.name, /Los Angeles/);
  assert.ok(fieldOf(og).includes("US"), "host qualifies");
  assert.equal(fieldOf(og).length, 12);
  const wc = tournamentsFor("ES", 2027).find((t) => t.kind === "world-cup")!;
  assert.equal(fieldOf(wc).length, 32);
  assert.ok(fieldOf(wc).includes("QA"), "World Cup host qualifies");
  assert.equal(tournamentsFor("FR", 2029).find((t) => t.kind === "continental")!.name, "EuroBasket 2029");
  assert.equal(tournamentsFor("NZ", 2029).find((t) => t.kind === "continental")!.name, "FIBA Asia Cup 2029");
  assert.ok(teamStrength("US") > teamStrength("DE") && teamStrength("DE") > teamStrength("IN") && teamStrength("IN") > 0);
  let played = 0;
  for (let seed = 1; seed < 400 && played < 4; seed++) {
    const s = autoLife(seed * 104729, 28 * 12, { draw: "equal" });
    for (const r of s.international.tournaments) {
      played++;
      assert.ok(r.age >= 14, `${r.name} age ${r.age}`);
      assert.equal(r.medal !== null, ["Gold", "Silver", "Bronze"].includes(r.finish), r.finish);
      assert.equal(r.pts, 2 * (r.fgm - r.tpm) + 3 * r.tpm + r.ftm, r.name);
      const boxes = s.gameLog.filter((b) => b.seasonKey === `intl:${r.id}`);
      if (boxes.length) assert.equal(sumBoxes(boxes).wins, r.wins, `${r.name} wins`);
    }
  }
  assert.ok(played > 0, "some life plays for its country");
});

/* ------------------------------------------------------------ money */

ok("finance ledger: taxes and fees never exceed income and net worth is never negative", () => {
  let pros = 0;
  for (let seed = 1; seed < 160; seed++) {
    const s = autoLife(seed * 7919 + 13, 30 * 12);
    const f = s.finance;
    assert.ok(f.cash >= 0 && f.invested >= 0, `seed ${seed} negative money`);
    for (const y of f.years) assert.ok(y.tax + y.fees <= y.gross + 1, `seed ${seed} ${y.year}`);
    if (f.years.some((y) => y.gross > 0)) pros++;
    for (const e of f.endorsements) assert.ok(e.yearsLeft > 0 && e.perYear > 0);
    if (f.agent) assert.ok(f.agent.fee > 0 && f.agent.fee <= 0.1);
  }
  assert.ok(pros > 10, `only ${pros} lives earned money`);
  assert.ok(taxRate("US", 1_000_000) > taxRate("US", 40_000));
  assert.ok(taxRate("US", 1_000_000) <= 0.42);
});

ok("advanced stats use the standard formulas and blanks for empty denominators", () => {
  const l = { gp: 2, min: 60, pts: 40, reb: 10, ast: 8, stl: 2, blk: 1, tov: 4, fgm: 15, fga: 30, tpm: 4, tpa: 10, ftm: 6, fta: 8 };
  const a = advanced(l);
  assert.ok(Math.abs(a.ts! - 40 / (2 * (30 + 0.44 * 8))) < 1e-9);
  assert.ok(Math.abs(a.efg! - (15 + 2) / 30) < 1e-9);
  assert.equal(a.astTov, 2);
  assert.equal(a.pts36, 24);
  assert.equal(advanced({ ...l, fga: 0, fgm: 0, tpm: 0, tpa: 0, fta: 0, ftm: 0 }).ts, null);
});

ok("version 1 saves migrate with new streams, money and an agent", () => {
  const s = autoLife(4242, 20 * 12);
  const old = JSON.parse(serialize(s)) as Record<string, unknown>;
  old.schemaVersion = 1;
  delete old.finance;
  delete old.international;
  delete old.gameLog;
  const rng = old.rng as Record<string, unknown>;
  delete rng.finance;
  delete rng.intl;
  (old.flags as Record<string, unknown>).agent = true;
  const res = parseSave(JSON.stringify(old));
  assert.ok(res.ok, res.ok ? "" : res.reason);
  if (!res.ok) return;
  assert.equal(res.state.schemaVersion, 2);
  assert.equal(typeof res.state.rng.finance, "number");
  assert.equal(typeof res.state.rng.intl, "number");
  assert.equal(res.state.finance.agent?.reach, "regional");
  assert.equal("agent" in res.state.flags, false);
  const next = advance(res.state, 24, { auto: true });
  assert.ok(next.ageMonths > res.state.ageMonths);
});

console.log(`\n${checks} ONE SHOT checks passed`);
