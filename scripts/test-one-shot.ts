/**
 * ONE SHOT: world registry, FIBA crosswalk, sparse countries, determinism
 * across speeds and "Next decision", save/resume, focus proration, money,
 * body plausibility, injuries, box scores, draft eligibility, the draft
 * cycle and order, undrafted debuts, peer isolation, the clock, QA careers by country,
 * and NBA seasons measured against the real league.
 * Run: npx tsx scripts/test-one-shot.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { advise } from "../src/one-shot/advisor";
import { FAMILY_BIAS, generateParents, heightPercentile, parentTarget, shareAtLeast } from "../src/one-shot/body";
import { ASSETS, invested, mix, netWorth, PRESETS, rebalance, rebalanceCost, taxRate } from "../src/one-shot/finance";
import { fieldOf, tournamentsFor } from "../src/one-shot/international";
import { allStarPick, CALIBRATION, closest, LEAGUE_SEASON, nbaHonors, races, REAL, REAL_AWARDS, standings } from "../src/one-shot/league";
import { advanced, sumBoxes } from "../src/one-shot/stats";
import { calendar, levelOf, performanceLevel, simulateGame } from "../src/one-shot/career";
import { MAX_BATCH, tick } from "../src/one-shot/clock";
import { autoEligible, canDeclare, draftOrder, INTERVIEW_QUESTIONS, interviewDelta } from "../src/one-shot/draft";
import { advance, advanceToDecision, autoChoice, canDeclareNow, canRetireNow, createLife, declareNow, isUnicornSeed, manageMoney, resolveDecision, retireNow, setPlan, stepMonth, UNICORN_ODDS } from "../src/one-shot/engine";
import { EVENT_BY_ID, EVENTS } from "../src/one-shot/events";
import { dailyDate, dailySeed, parseSave, serialize } from "../src/one-shot/persistence";
import { outcomeTier, shareText } from "../src/one-shot/report";
import { createStreams, rngOf } from "../src/one-shot/rng";
import { NBA_TEAMS, offerBlocked, offseasonOffers } from "../src/one-shot/routes";
import { projectedCeiling } from "../src/one-shot/skills";
import { canAfford, chargeFamily, effectivePractice, monthlyDevelopment, stepInjury } from "../src/one-shot/training";
import { SCHEMA_VERSION, type LifeState, type NewLifeOptions, type SeasonLine } from "../src/one-shot/types";
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
  const s = drive(createLife(base(7)), 31 * 12, (x) => (x.pendingDecision!.templateId === "draft-declare" ? "wait" : null));
  assert.ok(s.achievements.nbaDebut !== null, "seed 7 should debut");
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
  const usSix = shareAtLeast(182.88, "male", "US");
  assert.ok(usSix > 0.12 && usSix < 0.3, `US men 6 ft+ ${usSix}`);
  assert.ok(shareAtLeast(182.88, "male", "IN") < 0.02);
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
      // The game log keeps the last 160 games, so an older tournament can be cut short.
      if (boxes.length === r.wins + r.losses) assert.equal(sumBoxes(boxes).wins, r.wins, `${r.name} wins`);
    }
  }
  assert.ok(played > 0, "some life plays for its country");
});

/* ------------------------------------------------------------ money */

ok("finance ledger: tax never exceeds income, fees stay bounded and money is never negative", () => {
  let pros = 0;
  for (let seed = 1; seed < 160; seed++) {
    const s = autoLife(seed * 7919 + 13, 30 * 12);
    const f = s.finance;
    assert.ok(f.cash >= 0 && ASSETS.every((k) => f.holdings[k] >= 0), `seed ${seed} negative money`);
    f.years.forEach((y, i) => {
      assert.ok(y.tax <= y.gross + 1, `seed ${seed} ${y.year} tax`);
      assert.ok(y.fees <= y.gross * 0.2 + (f.years[i - 1]?.netWorth ?? 0) * 0.05 + 1, `seed ${seed} ${y.year} fees`);
    });
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
  assert.equal(res.state.schemaVersion, SCHEMA_VERSION);
  assert.equal(typeof res.state.rng.finance, "number");
  assert.equal(typeof res.state.rng.intl, "number");
  assert.equal(res.state.finance.agent?.reach, "regional");
  assert.equal("agent" in res.state.flags, false);
  const next = advance(res.state, 24, { auto: true });
  assert.ok(next.ageMonths > res.state.ageMonths);
});

ok("version 3 saves migrate with empty draft-cycle fields", () => {
  const s = autoLife(4242, 20 * 12);
  const old = JSON.parse(serialize(s)) as Record<string, unknown>;
  old.schemaVersion = 3;
  old.draft = { declaredYear: 2040, classSeed: null, result: null, withdrewYears: [2039] };
  const hist = old.history as { id: string }[];
  hist.push({ ...hist[hist.length - 1]!, id: hist[0]!.id });
  const res = parseSave(JSON.stringify(old));
  assert.ok(res.ok, res.ok ? "" : res.reason);
  if (!res.ok) return;
  assert.equal(new Set(res.state.history.map((h) => h.id)).size, res.state.history.length, "history ids are unique after migration");
  assert.equal(res.state.history[res.state.history.length - 1]!.id, `h${res.state.counters.entry}`);
  assert.deepEqual(res.state.draft, { declaredYear: 2040, classSeed: null, result: null, withdrewYears: [2039], stock: 0, combine: null, interviews: [], workouts: null, promise: null, board: null });
});

ok("history entry ids are unique", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const life = autoLife(seed, 30 * 12);
    assert.equal(new Set(life.history.map((h) => h.id)).size, life.history.length, `seed ${seed}`);
  }
});

ok("draft: unique teams per round, bounded interviews, and a full cycle for prospects", () => {
  for (const year of [2040, 2041, 2055]) {
    const order = draftOrder(77, year);
    assert.equal(new Set(order).size, 30);
    assert.deepEqual([...order].sort(), [...NBA_TEAMS].sort());
  }
  const s = createLife(base(9));
  for (const q of INTERVIEW_QUESTIONS) {
    assert.equal(q.answers.length, 3, q.id);
    for (const a of q.answers) {
      for (const t of [0, 100]) {
        const probe = { ...s, traits: { coachability: t, confidence: t, composure: t, discipline: t, motivation: t } };
        for (const roll of [0, 0.5, 0.999]) {
          const d = interviewDelta(probe, a, roll);
          assert.ok(d >= -1.5 && d <= 1.5, `${q.id}: ${d}`);
        }
      }
    }
  }
  let cycles = 0;
  for (let seed = 1; seed <= 400 && cycles < 4; seed++) {
    const life = autoLife(seed, 31 * 12);
    const d = life.draft;
    if (!d.combine?.invited || !d.board) continue;
    cycles++;
    assert.equal(d.interviews.length, 3, `seed ${seed}: interviews`);
    assert.ok(d.workouts !== null, `seed ${seed}: workouts`);
    assert.equal(d.board.length, 60);
    for (const round of [d.board.slice(0, 30), d.board.slice(30)]) assert.equal(new Set(round.map((p) => p.team)).size, 30, `seed ${seed}: repeated team`);
    const me = d.board.find((p) => p.isPlayer);
    if (d.result?.pick) assert.equal(me?.pick, d.result.pick);
    else assert.equal(me, undefined);
  }
  assert.ok(cycles >= 2, `only ${cycles} full draft cycles in 400 lives`);
});

/** Drive a life with auto choices, except where `pick` returns a choice id. */
function drive(state: LifeState, months: number, pick: (s: LifeState) => string | null = () => null) {
  let s = state;
  const stop = s.ageMonths + months;
  while (!s.ended && s.ageMonths < stop) {
    s = advanceToDecision(s, stop - s.ageMonths);
    if (s.pendingDecision) s = resolveDecision(s, pick(s) ?? autoChoice(s));
  }
  return s;
}

ok("market returns ignore what he owns and the index averages about 8% a year", () => {
  const start = autoLife(31337, 18 * 12);
  const rich = manageMoney({ ...start, finance: { ...start.finance, cash: 500_000 } }, { type: "target", target: PRESETS.find((p) => p.id === "risky")!.target });
  const a = drive(manageMoney(rich, { type: "invest" }), 10 * 12);
  const b = drive(start, 10 * 12);
  assert.ok(invested(a.finance) > 0, "risky portfolio was invested");
  assert.deepEqual(
    a.finance.market.years.map((y) => y.r),
    b.finance.market.years.map((y) => y.r),
  );
  const idx: number[] = [];
  for (let seed = 1; seed <= 30; seed++) for (const y of autoLife(seed * 6151, 40 * 12).finance.market.years) idx.push(y.r.index);
  const mean = idx.reduce((x, y) => x + y, 0) / idx.length;
  const sd = Math.sqrt(idx.reduce((x, y) => x + (y - mean) ** 2, 0) / idx.length);
  assert.ok(mean > 0.04 && mean < 0.13, `index mean ${mean}`);
  assert.ok(sd > 0.1 && sd < 0.26, `index spread ${sd}`);
});

ok("rebalancing keeps value apart from its stated cost and hits the target", () => {
  const s = autoLife(777, 20 * 12);
  const f = structuredClone(s.finance);
  f.holdings = mix({ crypto: 60_000, property: 40_000, savings: 10_000 });
  f.target = mix({ index: 70, bonds: 30 });
  const before = invested(f);
  const cost = rebalanceCost(f);
  const paid = rebalance(f);
  assert.ok(Math.abs(paid - cost) < 1, `${paid} vs ${cost}`);
  assert.ok(Math.abs(invested(f) - (before - paid)) < 1);
  assert.ok(Math.abs(f.holdings.index / invested(f) - 0.7) < 0.001);
  const bad = manageMoney(s, { type: "target", target: mix({ index: 50 }) });
  assert.deepEqual(bad.finance.target, s.finance.target, "a mix that is not 100% is ignored");
});

ok("a player who misses the NBA can coach, earn a salary and live to 65", () => {
  let found: LifeState | null = null;
  for (let seed = 1; seed < 200 && !found; seed++) {
    const s = drive(createLife(base(seed * 2713, { draw: "equal" })), 33 * 12, (x) => (x.pendingDecision!.templateId === "crossroads" ? (x.pendingDecision!.choices.find((c) => c.id === "track:coach" && !c.disabled)?.id ?? null) : null));
    if (s.after?.track === "coach") found = s;
  }
  assert.ok(found, "some life reaches the coaching track");
  const end = drive(found!, 40 * 12);
  assert.ok(end.ended, "life ends");
  assert.ok(end.ageMonths <= 65 * 12 + 1, `ends at ${end.ageMonths / 12}`);
  assert.ok(end.after!.years.length > 0, "yearly job record");
  assert.ok(end.after!.years.some((y) => y.wins !== null), "coaching record");
  assert.ok(end.after!.salary > 0 && end.finance.years.at(-1)!.gross >= end.after!.salary * 0.9, "second career pays");
  assert.ok(netWorth(end.finance) >= 0);
  assert.ok(shareText(end).includes("After playing:"));
});

ok("a G League call-up puts him on the NBA roster, and NBA seasons follow", () => {
  const keep = (x: LifeState) => (x.pendingDecision!.templateId === "chapter" ? "keep" : null);
  let found = 0;
  for (let seed = 1; seed <= 80 && found < 2; seed++) {
    const s = drive(createLife(base(seed)), 30 * 12, keep);
    const call = s.history.find((h) => h.text.includes("for the rest of the season"));
    if (!call) continue;
    found++;
    const after = s.seasons.filter((x) => x.node === "nba" && x.gp > 0 && x.ageYears >= Math.floor(call.month / 12));
    assert.ok(after.length > 0, `seed ${seed}: no NBA games after the call-up`);
  }
  assert.ok(found >= 1, "some life gets called up");
});

ok("anyone eligible can declare in January to April, and auto keeps a manual declare", () => {
  let s = drive(createLife(base(1)), 19 * 12);
  for (let i = 0; i < 48 && !canDeclareNow(s); i++) s = s.pendingDecision ? resolveDecision(s, autoChoice(s)) : advance(s, 1);
  assert.ok(canDeclareNow(s), "an eligible month comes up");
  const asked = declareNow(s);
  assert.equal(asked.pendingDecision?.templateId, "draft-declare");
  assert.equal(autoChoice(asked), "declare");
  const done = resolveDecision(asked, "declare");
  assert.equal(done.draft.declaredYear, calendar(done).year);
  assert.equal(canDeclareNow(done), false);
});

ok("retiring by choice opens second careers, including a podcast", () => {
  let s = drive(createLife(base(5)), 24 * 12);
  assert.ok(canRetireNow(s));
  s = retireNow(s);
  assert.equal(s.pendingDecision?.title, "Retire from playing?");
  assert.ok(s.pendingDecision!.choices.some((c) => c.id === "keep"), "can change his mind");
  assert.equal(resolveDecision(s, "keep").after, null);
  s = drive(resolveDecision(s, "track:podcast"), 6 * 12);
  assert.equal(s.after?.track, "podcast");
  assert.equal(s.placement.node, "unattached");
  assert.ok(s.after!.years.length >= 5, "yearly podcast record");
});

ok("looking for a club abroad brings foreign offers", () => {
  let got = 0;
  for (let seed = 1; seed < 300 && got < 3; seed++) {
    let s = createLife(base(seed * 4099, { draw: "equal" }));
    s = drive(s, 22 * 12, (x) => (x.pendingDecision!.choices.some((c) => c.id === "overseas" && !c.disabled) ? "overseas" : null));
    if (s.history.some((h) => h.text.includes("clubs abroad"))) {
      got++;
      const signed = s.seasons.some((x) => x.node === "foreign-pro") || s.placement.node === "foreign-pro" || s.history.some((h) => h.text === "No club abroad bites this time.");
      assert.ok(signed, `seed ${seed}: search ended with neither a club nor a no`);
    }
  }
  assert.ok(got >= 1, "some life asks for a club abroad");
});

ok("version 2 saves move invested money into holdings", () => {
  const s = autoLife(9090, 24 * 12);
  const old = JSON.parse(serialize(s)) as Record<string, unknown>;
  old.schemaVersion = 2;
  delete old.after;
  delete (old.rng as Record<string, unknown>).after;
  const f = old.finance as Record<string, unknown>;
  delete f.holdings;
  delete f.target;
  delete f.autoInvest;
  delete f.market;
  f.invested = 50_000;
  f.advisor = "balanced";
  const res = parseSave(JSON.stringify(old));
  assert.ok(res.ok, res.ok ? "" : res.reason);
  if (!res.ok) return;
  assert.equal(res.state.schemaVersion, SCHEMA_VERSION);
  assert.equal(res.state.after, null);
  assert.equal(typeof res.state.rng.after, "number");
  assert.ok(Math.abs(invested(res.state.finance) - 50_000) < 1);
  assert.equal(res.state.finance.holdings.bonds, 20_000);
  assert.equal(res.state.finance.autoInvest, true);
  advance(res.state, 24, { auto: true });
});

/* ------------------------------------------------------------ NBA */

const nbaLine = (per: Partial<Record<"min" | "pts" | "reb" | "ast" | "stl" | "blk" | "tov" | "fgm" | "fga" | "tpm" | "tpa" | "ftm" | "fta", number>>, gp: number, role: SeasonLine["role"] = "star"): SeasonLine => {
  const t = (k: keyof typeof per) => Math.round((per[k] ?? 0) * gp);
  return { key: "t", ageYears: 26, calendarYear: 2030, node: "nba", leagueId: "nba", levelLabel: "NBA", teamName: "Boston Celtics", countryId: "US", role, gp, min: t("min"), pts: t("pts"), reb: t("reb"), ast: t("ast"), stl: t("stl"), blk: t("blk"), tov: t("tov"), fgm: t("fgm"), fga: t("fga"), tpm: t("tpm"), tpa: t("tpa"), ftm: t("ftm"), fta: t("fta"), wins: 50, losses: 32, strength: 1 };
};

ok("the real NBA table is complete and its awards and calibration are stated", () => {
  assert.ok(REAL.length > 400, `${REAL.length} rows`);
  assert.equal(new Set(REAL.map((r) => r.name)).size, REAL.length, "one row per player");
  for (const r of REAL) {
    assert.ok(r.gp > 0 && r.gp <= 82 && r.gs <= r.gp, `${r.name} games`);
    assert.ok(r.min >= 0 && r.min <= 48 && r.fgm <= r.fga + 1e-9 && r.tpm <= r.tpa + 1e-9 && r.ftm <= r.fta + 1e-9, `${r.name} shooting`);
  }
  assert.ok(REAL.some((r) => r.year === 1) && REAL.some((r) => r.year === 2), "rookies and second-year players are marked");
  assert.ok(REAL_AWARDS.mvp && REAL.some((r) => r.name === REAL_AWARDS.mvp), "real MVP is in the table");
  for (const k of ["allNba", "mvpTop3", "dpoyFirst", "allDefTop10", "royTopRookie"] as const) assert.ok(CALIBRATION[k][0] <= CALIBRATION[k][1] && CALIBRATION[k][1] > 0, k);
  assert.match(LEAGUE_SEASON, /^\d{4}-\d{2}$/);
});

ok("NBA honors place his line among the real league", () => {
  const star = nbaLine({ min: 36, pts: 36, reb: 9, ast: 9, stl: 2, blk: 1, tov: 3, fgm: 12, fga: 22, tpm: 4, tpa: 9, ftm: 8, fta: 9 }, 76);
  const won = nbaHonors(star, { role: "star", rookie: false, winPct: 0.68 });
  for (const h of ["NBA Most Valuable Player", "All-NBA First Team", "Scoring title"]) assert.ok(won.includes(h), `star misses ${h}: ${won.join(", ")}`);
  assert.ok(!nbaHonors(star, { role: "star", rookie: false, winPct: 0.4 }).includes("NBA Most Valuable Player"), "no MVP on a losing team");
  assert.deepEqual(nbaHonors({ ...star, gp: 60 }, { role: "star", rookie: false, winPct: 0.68 }).filter((h) => !h.endsWith("title")), [], "60 games can't win 65-game awards");
  const bench = nbaLine({ min: 8, pts: 3, reb: 1.5, ast: 0.6, stl: 0.2, blk: 0.1, tov: 0.4, fgm: 1.2, fga: 2.8, tpm: 0.3, tpa: 1, ftm: 0.3, fta: 0.4 }, 70, "bench");
  assert.deepEqual(nbaHonors(bench, { role: "bench", rookie: true, winPct: 0.7 }), []);
  assert.equal(allStarPick(star), "starter");
  assert.equal(allStarPick(bench), null);
  const st = standings(star);
  assert.equal(st.find((x) => x.metric.key === "pts")!.rank, 1);
  const low = standings(bench).find((x) => x.metric.key === "pts")!;
  assert.ok(low.rank! > low.of / 2, "bench scorer ranks in the bottom half");
  assert.equal(closest(bench).length, 3);
  assert.ok(races(star, { role: "star", rookie: false, winPct: 0.68, gamesLeft: 0 }).every((r) => r.status === "in" || r.id === "all-def"), "star leads every scoring race");
});

const NBA_SEEDS = [6, 35, 106];
const keepChapter = (x: LifeState) => (x.pendingDecision!.templateId === "chapter" ? "keep" : null);

ok("NBA seasons reconcile: records, playoffs, titles and honors", () => {
  let runs = 0;
  for (const seed of NBA_SEEDS) {
    const s = drive(createLife(base(seed)), 36 * 12, keepChapter);
    const nba = s.seasons.filter((x) => x.node === "nba" && x.gp > 0);
    assert.ok(nba.length >= 3, `seed ${seed}: ${nba.length} NBA seasons`);
    const years = new Map<number, number>();
    for (const x of nba) years.set(x.nbaYear!, (years.get(x.nbaYear!) ?? 0) + x.wins + x.losses);
    for (const [y, g] of years) assert.ok(g <= 82, `seed ${seed} ${y}: ${g} games`);
    for (const x of nba) {
      assert.ok(Math.abs(x.teamEdge ?? 0) <= 0.25, "team edge stays in range");
      const aw = x.awards ?? [];
      assert.equal(new Set(aw).size, aw.length, `seed ${seed}: repeated award ${aw.join(", ")}`);
      if (aw.includes("NBA Most Valuable Player") || aw.some((a) => a.startsWith("All-NBA"))) assert.ok(x.gp >= 65);
      const po = x.playoffs;
      if (!po) {
        assert.ok(!aw.includes("NBA champion"), "no title without playoffs");
        continue;
      }
      runs++;
      assert.ok(po.seed >= 1 && po.seed <= 8);
      assert.ok(po.result, `seed ${seed}: playoffs never finished`);
      if (po.result === "Left the team before the playoffs") continue;
      assert.equal(po.champion, po.rounds === 4);
      assert.equal(po.series.length, po.rounds + (po.champion ? 0 : 1));
      assert.ok(po.wins >= 4 * po.rounds && po.wins <= 4 * po.rounds + 3, `wins ${po.wins} rounds ${po.rounds}`);
      assert.ok(po.losses <= 3 * po.rounds + 4);
      assert.ok(po.gp <= po.wins + po.losses);
      assert.equal(aw.includes("NBA champion"), po.champion);
      if (aw.includes("Finals MVP")) assert.ok(po.champion);
    }
  }
  assert.ok(runs >= 5, `only ${runs} playoff runs`);
});

ok("an NBA life is the same month by month as with Next decision", () => {
  const seed = NBA_SEEDS[0]!;
  const months = 30 * 12;
  let a = createLife(base(seed));
  while (a.ageMonths < months && !a.ended) a = a.pendingDecision ? resolveDecision(a, keepChapter(a) ?? autoChoice(a)) : advance(a, 1);
  while (a.pendingDecision) a = resolveDecision(a, keepChapter(a) ?? autoChoice(a));
  const b = drive(createLife(base(seed)), months, keepChapter);
  assert.ok(a.seasons.some((x) => x.node === "nba"), "reaches the NBA");
  assert.equal(strip(b), strip(a));
});

ok("energy settles by workload instead of draining to the floor, in the NBA too", () => {
  const pro = drive(createLife(base(NBA_SEEDS[0]!)), 26 * 12, keepChapter);
  assert.equal(pro.placement.node, "nba");
  const settle = (w: "low" | "balanced" | "high") => {
    let s = setPlan(pro, { workload: w });
    const seen: number[] = [];
    for (let m = 0; m < 12; m++) {
      s = advance(s, 1);
      while (s.pendingDecision) s = resolveDecision(s, keepChapter(s) ?? autoChoice(s));
      s = setPlan(s, { workload: w });
      seen.push(s.condition.energy);
    }
    return seen.slice(4).reduce((a, x) => a + x, 0) / 8;
  };
  const [low, bal, high] = [settle("low"), settle("balanced"), settle("high")];
  assert.ok(low > bal && bal > high, `${low} ${bal} ${high}`);
  assert.ok(bal >= 55, `balanced settles at ${bal}`);
  assert.ok(high >= 30, `high settles at ${high}`);
});

ok("trained athleticism stays above the untrained curve", () => {
  const start = drive(createLife(base(NBA_SEEDS[1]!)), 18 * 12, keepChapter);
  let s = setPlan(start, { primary: "athleticism", secondary: "strength" });
  for (let m = 0; m < 48; m++) {
    s = advance(s, 1);
    while (s.pendingDecision) s = resolveDecision(s, keepChapter(s) ?? autoChoice(s));
    s = setPlan(s, { primary: "athleticism", secondary: "strength" });
  }
  const untrained = drive(start, 48, keepChapter);
  for (const k of ["acceleration", "vertical", "strength"] as const) {
    assert.ok(s.body[k] >= untrained.body[k] + 6, `${k}: trained ${s.body[k]} vs ${untrained.body[k]}`);
    assert.ok(s.body[k] > s.growth.athleticCeiling[k] + 4, `${k}: ${s.body[k]} vs natural ${s.growth.athleticCeiling[k]}`);
  }
});

ok("about 1 seed in 200 is a unicorn with top talent, body and family", () => {
  let n = 0;
  for (let seed = 1; seed <= 100_000; seed++) if (isUnicornSeed(seed)) n++;
  assert.ok(Math.abs(n / 100_000 - UNICORN_ODDS) < 0.001, `${n} unicorns`);
  const seeds = Array.from({ length: 4000 }, (_, i) => i + 1).filter(isUnicornSeed).slice(0, 8);
  for (const seed of seeds) {
    const s = createLife(base(seed));
    assert.equal(s.unicorn, true);
    assert.equal(strip(createLife(base(seed))), strip(s), "unicorns are deterministic");
    assert.ok(Object.values(s.potentials).every((p) => p >= 82), `seed ${seed} potentials`);
    assert.ok(Object.values(s.growth.athleticCeiling).every((p) => p >= 72), `seed ${seed} athletic ceilings`);
    assert.ok(s.family.means >= 4 && s.family.support === "high" && s.family.courtAccess === "excellent", `seed ${seed} family`);
    assert.ok(heightPercentile(s.family.fatherHeightCm, "male", s.birthplace.countryId) >= 85, `seed ${seed} father`);
  }
  const plain = createLife(base(seeds[0]! + 1));
  assert.equal("unicorn" in plain, false);
});

ok("version 4 saves gain the NBA random stream", () => {
  const s = drive(createLife(base(NBA_SEEDS[0]!)), 26 * 12, keepChapter);
  const old = JSON.parse(serialize(s)) as Record<string, unknown>;
  old.schemaVersion = 4;
  delete (old.rng as Record<string, unknown>).nba;
  const res = parseSave(JSON.stringify(old));
  assert.ok(res.ok, res.ok ? "" : res.reason);
  if (!res.ok) return;
  assert.equal(res.state.schemaVersion, SCHEMA_VERSION);
  assert.equal(typeof res.state.rng.nba, "number");
  drive(res.state, 24, keepChapter);
});

console.log(`\n${checks} ONE SHOT checks passed`);
