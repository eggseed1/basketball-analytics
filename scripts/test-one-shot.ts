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
import { addMass, buildOutlook, FAMILY_BIAS, generateParents, heightPercentile, parentTarget, raiseAdultHeight, shareAtLeast } from "../src/one-shot/body";
import { ASSETS, invested, mix, netWorth, PRESETS, rebalance, rebalanceCost, taxRate } from "../src/one-shot/finance";
import { fieldOf, tournamentsFor } from "../src/one-shot/international";
import { allStarPick, CALIBRATION, closest, LEAGUE_SEASON, nbaHonors, races, REAL, REAL_AWARDS, standings } from "../src/one-shot/league";
import { advanced, sumBoxes } from "../src/one-shot/stats";
import { calendar, levelOf, performanceLevel, simulateGame } from "../src/one-shot/career";
import { hofEligible, hofSpeech } from "../src/one-shot/ceremony";
import { rngOf } from "../src/one-shot/rng";
import { MAX_BATCH, tick } from "../src/one-shot/clock";
import { accoladeDraftValue, autoEligible, canDeclare, draftOrder, INTERVIEW_QUESTIONS, interviewDelta, projectedRank } from "../src/one-shot/draft";
import { advance, advanceToDecision, autoChoice, canDeclareNow, canRetireNow, createLife, declareNow, isUnicornSeed, manageMoney, resolveDecision, retireNow, seasonAwards, setPlan, stepMonth, UNICORN_ODDS } from "../src/one-shot/engine";
import { EVENT_BY_ID, EVENTS } from "../src/one-shot/events";
import { dailyDate, dailySeed, parseSave, serialize } from "../src/one-shot/persistence";
import { earningsRank, ordinal, parseEarningsRow, placeOnBoard, placeRows, type EarningsRow } from "../src/one-shot/leaderboard";
import { outcomeTier, shareText, type CareerSummary } from "../src/one-shot/report";
import { createStreams, rngOf } from "../src/one-shot/rng";
import { NBA_TEAMS, namedPlace, offerBlocked, offseasonOffers } from "../src/one-shot/routes";
import { citiesFor } from "../src/one-shot/cities";
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

ok("an automatic injury does not reuse the event id", () => {
  let injured = false;
  for (let seed = 1; seed <= 30 && !injured; seed++) {
    const s = createLife(base(seed));
    s.pendingDecision = null;
    s.scheduled.push({ templateId: "knee-ache", month: s.ageMonths, causeId: null });
    stepMonth(s);
    const ids = s.history.map((h) => h.id);
    assert.equal(new Set(ids).size, ids.length, `duplicate history id on seed ${seed}`);
    const injury = s.history.find((h) => h.kind === "injury");
    if (!injury) continue;
    injured = true;
    const event = s.history.find((h) => h.kind === "event" && h.text.startsWith("Knee pain"));
    assert.ok(event);
    assert.equal(injury.causeId, event.id);
    assert.notEqual(injury.id, event.id);
  }
  assert.ok(injured, "no seeded life logged the knee injury");
});

ok("a save with a repeated history id keeps the later row", () => {
  const s = createLife(base(2));
  const event = s.history[s.history.length - 1]!;
  s.history.splice(s.history.length - 1, 0, { ...event, id: event.id, kind: "injury", text: "Knee tendon irritation." });
  const loaded = parseSave(serialize(s));
  assert.ok(loaded.ok);
  const ids = loaded.state.history.map((h) => h.id);
  assert.equal(new Set(ids).size, ids.length);
  const kept = loaded.state.history.find((h) => h.kind === event.kind && h.text === event.text);
  assert.equal(kept?.id, event.id);
  const injury = loaded.state.history.find((h) => h.kind === "injury");
  assert.ok(injury && injury.id !== event.id);
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

ok("new lives cover guard height through center height", () => {
  const heights = Array.from({ length: 500 }, (_, i) => createLife(base(i + 1)).growth.adultHeightCm);
  const n = (lo: number, hi: number) => heights.filter((h) => h >= lo && h < hi).length;
  assert.ok(n(168, 193) >= 40, `guards ${n(168, 193)}`);
  assert.ok(n(193, 203) >= 40, `wings ${n(193, 203)}`);
  assert.ok(n(203, 210) >= 30, `forwards ${n(203, 210)}`);
  assert.ok(n(210, 229) >= 25, `bigs ${n(210, 229)}`);
  const outlook = buildOutlook(180, 166);
  assert.ok(outlook.high - outlook.low > 25, `${outlook.low} to ${outlook.high}`);
  assert.ok(outlook.mid > 190, `typical ${outlook.mid}`);
});

ok("growing players can add height and weight, and closed plates add none", () => {
  const s = createLife(base(4));
  s.ageMonths = 13 * 12;
  const before = s.body.heightCm;
  const cm = raiseAdultHeight(s, 2);
  assert.ok(cm > 1 && s.body.heightCm > before, `grew ${cm} cm, height ${s.body.heightCm}`);
  const kg = addMass(s, 0.05);
  assert.ok(kg >= 1, `gained ${kg} kg`);
  s.ageMonths = 24 * 12;
  assert.equal(raiseAdultHeight(s, 5), 0);
  for (const id of ["milk-with-dinner", "apple-juice", "hang-from-rim", "lights-out", "second-plate", "garage-bar", "growth-checkup", "gym-guy"]) {
    assert.ok(EVENTS.some((e) => e.id === id), id);
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

ok("a higher coach rating means more minutes, and fighting for them can move you up", () => {
  const make = (coaching: number) => {
    const s = createLife(base(4));
    s.ageMonths = 17 * 12;
    s.placement = { ...s.placement, node: "us-high-school", role: "rotation", coaching, teamName: "Test High" };
    return s;
  };
  const low = make(35);
  const high = make(92);
  const level = levelOf(high) ?? levelOf(low);
  assert.ok(level, "a pro placement has a level");
  let lowMin = 0;
  let highMin = 0;
  for (let i = 0; i < 40; i++) {
    lowMin += simulateGame(low, level!, rngOf(low.rng, "games")).min;
    highMin += simulateGame(high, level!, rngOf(high.rng, "games")).min;
  }
  assert.ok(highMin > lowMin + 40, `coach rating minutes high ${highMin} low ${lowMin}`);

  const s = createLife(base(4));
  s.ageMonths = 20 * 12;
  s.placement = { ...s.placement, node: "university", role: "bench", teamName: "State", coaching: 88 };
  s.traits.coachability = 70;
  const ev = EVENT_BY_ID["fight-minutes"]!;
  assert.ok(ev.weight(s) > 0, "a bench player can fight for minutes");
  assert.equal(ev.weight({ ...s, placement: { ...s.placement, role: "star" } }), 0, "the go-to player is already playing");
  const earn = ev.choices.find((c) => c.id === "earn")!;
  const won = structuredClone(s);
  earn.apply({ s: won, rolls: [0.45], entryId: "t" });
  assert.equal(won.placement.role, "rotation");
  const missed = structuredClone(s);
  missed.placement.coaching = 30;
  missed.traits.coachability = 30;
  earn.apply({ s: missed, rolls: [0.45], entryId: "t" });
  assert.equal(missed.placement.role, "bench");
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
  const recruit = (lvlTarget: "great" | "ordinary") => {
    const s = createLife(base(seedFor("US"), { draw: "equal" }));
    s.ageMonths = 18 * 12;
    s.education = { ...s.education, academics: 70, amateur: true, ncaaEligible: true, graduatedHighSchool: true };
    s.exposure = 8;
    s.residence = { ...s.residence, countryId: "US" };
    s.placement = { ...s.placement, node: "us-high-school", teamName: "Home High School" };
    for (const k of Object.keys(s.skills) as (keyof typeof s.skills)[]) s.skills[k] = lvlTarget === "great" ? 92 : 68;
    s.body.heightCm = lvlTarget === "great" ? 203 : 193;
    return s;
  };
  const star = recruit("great");
  assert.ok(performanceLevel(star) >= 55, `great prospect level ${performanceLevel(star)}`);
  const starOffers = offseasonOffers(star).filter((o) => o.node === "university");
  assert.ok(starOffers.some((o) => o.reason.startsWith("A top program")), "great prospect hears from a top program");
  assert.ok(starOffers.some((o) => o.reason.startsWith("A mid-major")), "mid-majors still call");
  assert.ok(starOffers.some((o) => o.reason.startsWith("A Division III")), "Division III still calls");
  const ordinary = recruit("ordinary");
  const ordinaryOffers = offseasonOffers(ordinary).filter((o) => o.node === "university");
  assert.ok(!ordinaryOffers.some((o) => o.reason.startsWith("A top program")), "an ordinary prospect is not a top-program recruit");
  assert.ok(ordinaryOffers.some((o) => o.node === "university"), "an ordinary prospect still has a school");
  assert.ok(EVENT_BY_ID["nil-deal"], "NIL deals exist");
  assert.equal(EVENT_BY_ID["nil-deal"]!.weight({ ...star, placement: { ...star.placement, node: "university", role: "star", coaching: 90 } }), 1.7);
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
            const filmed = o.reason.includes("dominating at home");
            assert.ok(s.achievements.campInvite !== null || s.exposure >= 40 || filmed, `seed ${seed}: uninvited move`);
          }
        }
      }
      if (s.pendingDecision) s = resolveDecision(s, autoChoice(s));
    }
  }
});

ok("an undrafted player can still make an NBA debut", () => {
  let found: LifeState | null = null;
  for (let seed = 1; seed <= 12 && !found; seed++) {
    const s = drive(createLife(base(seed)), 31 * 12, (x) => (x.pendingDecision!.templateId === "draft-declare" ? "wait" : null));
    if (s.achievements.nbaDebut !== null && s.achievements.drafted === null) found = s;
  }
  assert.ok(found, "no undrafted NBA debut in seeds 1-12");
  assert.equal(outcomeTier(found!), "nba-debut");
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
  assert.ok(EVENTS.length >= 90, `${EVENTS.length} events`);
});

ok("club names are cities in the country, not the country plus a mascot", () => {
  const s = createLife(base(42));
  for (const id of ["TW", "HK", "IL", "JP", "CN", "BR", "NG"]) {
    const names = Array.from({ length: 16 }, (_, i) => namedPlace(s, id, "club", `city:${id}:${i}`));
    const cname = country(id).name;
    assert.ok(names.every((n) => !n.startsWith(cname + " ") && n !== cname), `${id}: ${names.join(", ")}`);
    assert.ok(new Set(names).size >= 4, `${id} only produced ${[...new Set(names)].join(", ")}`);
    assert.ok(citiesFor(id).length >= 3, id);
  }
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
    KR: (s) => s.seasons.some((x) => x.leagueId === "kbl" || (x.node === "elite-youth" && x.countryId === "KR")),
    JP: (s) => s.seasons.some((x) => x.leagueId === "bleague"),
    BR: (s) => s.seasons.some((x) => x.leagueId === "nbb"),
    IN: (s) => s.seasons.some((x) => x.countryId === "IN" && (x.node === "local-senior" || x.node === "local-club")),
    TV: (s) => s.seasons.some((x) => x.countryId === "TV" && (x.node === "local-senior" || x.node === "local-club")),
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

ok("a perfect run from India can reach the NBA", () => {
  const s = createLife(base(seedFor("IN"), { draw: "equal" }));
  s.ageMonths = 16 * 12;
  s.education = { ...s.education, academics: 80, amateur: true, ncaaEligible: true };
  s.family = { ...s.family, means: 5, support: "high", courtAccess: "excellent", savings: 40_000 };
  s.exposure = 18;
  s.body.heightCm = 206;
  s.body.wingspanCm = 218;
  s.growth.adultHeightCm = 208;
  s.growth.wingspanRatio = 1.06;
  for (const k of ["strength", "acceleration", "lateral", "vertical", "stamina", "coordination", "durability"] as const) {
    s.body[k] = 82;
    s.growth.athleticCeiling[k] = 90;
  }
  for (const k of Object.keys(s.skills) as (keyof typeof s.skills)[]) {
    s.skills[k] = 88;
    s.potentials[k] = 96;
  }
  for (const k of Object.keys(s.traits) as (keyof typeof s.traits)[]) s.traits[k] = 85;
  s.placement = { ...s.placement, node: "local-club", countryId: "IN", teamName: "Mumbai club", role: "star", coaching: 60 };
  const end = advance(s, 10 * 12, { auto: true });
  assert.ok(end.achievements.drafted || end.achievements.nbaDebut !== null, "drafted or debuted");
  assert.ok(end.placement.node === "nba" || end.achievements.nbaDebut !== null, `landed in ${end.placement.node}`);
});

ok("a contract with years left does not come with offers to leave", () => {
  const s = createLife(base(seedFor("ES"), { draw: "equal" }));
  s.ageMonths = 24 * 12;
  s.exposure = 80;
  s.body.heightCm = 200;
  for (const k of Object.keys(s.skills) as (keyof typeof s.skills)[]) s.skills[k] = 80;
  s.placement = {
    ...s.placement,
    node: "foreign-pro",
    countryId: "ES",
    leagueId: "acb",
    teamName: "Madrid",
    role: "starter",
    contract: { salary: 2_000_000, yearsLeft: 2, guaranteed: true },
  };
  assert.equal(offseasonOffers(s).length, 0);
  s.placement.role = "bench";
  assert.equal(offseasonOffers(s).length, 0, "a bench deal is still a deal");
  s.placement.contract = null;
  assert.ok(offseasonOffers(s).length > 0, "once the deal is up, clubs can call");
  s.placement = { ...s.placement, node: "university", teamName: "State", contract: null };
  s.education = { ...s.education, amateur: true, universityYears: 1 };
  assert.equal(offseasonOffers(s).length, 0, "college eligibility is a commitment too");
});

/* ------------------------------------------------------------ birth odds and parents */

ok("two Taiwanese league MVPs are not a Hall of Fame career", () => {
  const need = (id: string) => maybeLeague(id)!.model.strength * 0.8;
  const tw = need("tpbl-tw");
  const euro = need("euroleague");
  assert.ok(tw < 66 && euro >= 66, `Taiwan ${tw} EuroLeague ${euro}`);
  const box = (over: Partial<SeasonLine> = {}): SeasonLine => ({
    key: "t", ageYears: 27, calendarYear: 2032, node: "domestic-pro", leagueId: "tpbl-tw",
    levelLabel: "Taiwan Professional Basketball League (TPBL)", teamName: "Taipei", countryId: "TW", role: "star",
    gp: 32, min: 1000, pts: 800, reb: 200, ast: 120, stl: 40, blk: 20, tov: 60,
    fgm: 280, fga: 560, tpm: 40, tpa: 120, ftm: 200, fta: 240, wins: 22, losses: 10, strength: tw,
    awards: ["League MVP"],
    ...over,
  });
  const life = createLife(base(3));
  life.seasons = [box(), box({ calendarYear: 2033, key: "t2" })];
  assert.equal(hofEligible(life), false);
  const asia = structuredClone(life);
  asia.seasons = [];
  asia.international.tournaments.push({
    id: "asia", name: "FIBA Asia Cup 2031", kind: "continental", year: 2031, age: 26, countryId: "TW",
    finish: "Champions", medal: "gold", role: "star", gp: 6, min: 180, pts: 120, reb: 30, ast: 24,
    stl: 6, blk: 2, tov: 8, fgm: 40, fga: 80, tpm: 8, tpa: 20, ftm: 32, fta: 36, wins: 6, losses: 0,
  });
  assert.equal(hofEligible(asia), false, "a continental gold is not the hall");
  const role = structuredClone(life);
  role.seasons = Array.from({ length: 8 }, (_, i) => box({ node: "nba", leagueId: "nba", levelLabel: "NBA", teamName: "Heat", countryId: "US", strength: 80, awards: [], gp: 70, key: `n${i}`, calendarYear: 2030 + i }));
  assert.equal(hofEligible(role), false, "eight NBA seasons without honors stay home");
  const euroOnly = structuredClone(life);
  euroOnly.seasons = [box({ leagueId: "euroleague", levelLabel: "EuroLeague", strength: euro, teamName: "Real Madrid", countryId: "ES" }), box({ leagueId: "euroleague", levelLabel: "EuroLeague", strength: euro, key: "e2", calendarYear: 2033, teamName: "Real Madrid", countryId: "ES" })];
  assert.equal(hofEligible(euroOnly), false, "two EuroLeague MVPs still need a world title");
  const euroGold = structuredClone(euroOnly);
  euroGold.international.tournaments.push({
    id: "og", name: "Olympic Games 2032", kind: "olympics", year: 2032, age: 27, countryId: "ES",
    finish: "Champions", medal: "gold", role: "star", gp: 6, min: 180, pts: 110, reb: 20, ast: 18,
    stl: 4, blk: 1, tov: 6, fgm: 36, fga: 70, tpm: 10, tpa: 24, ftm: 28, fta: 32, wins: 6, losses: 0,
  });
  assert.equal(hofEligible(euroGold), true);
  const mvp = structuredClone(life);
  mvp.identity.displayName = "Luis Ortega";
  mvp.birthplace.locality = "Madrid";
  mvp.seasons = [box({ node: "nba", leagueId: "nba", levelLabel: "NBA", teamName: "Nuggets", countryId: "US", strength: 80, gp: 74, awards: ["NBA Most Valuable Player"] })];
  assert.equal(hofEligible(mvp), true);
  mvp.history.push(
    { id: "h8", month: 14 * 12, kind: "decision", text: "Move to the city: Move. You leave your friends and train on a better court.", tone: "neutral" },
    { id: "h9", month: 12 * 12, kind: "decision", text: "School team: Sign up. You get a jersey two sizes too big.", tone: "neutral" },
    { id: "h10", month: 18 * 12, kind: "move", text: "Moved to Germany. Joined Hamburg Baskets (Basketball Bundesliga). $80,000 a year.", tone: "good" },
    { id: "h11", month: 22 * 12, kind: "decision", text: "A new coach: Ask for minutes. The coach moves you into the rotation.", tone: "good" },
  );
  const speech = hofSpeech(mvp);
  assert.match(speech, /^Thank you\. I am Luis Ortega, from Madrid\./);
  assert.match(speech, /At 12, school team: I decided to sign up\./);
  assert.match(speech, /At 14 I decided to move to the city\. I leave my friends and train on a better court\./);
  assert.match(speech, /At 18 I moved to Germany and joined Hamburg Baskets\./);
  assert.match(speech, /At 22, a new coach: I decided to ask for minutes\. The coach moves me into the rotation\./);
  assert.match(speech, /They named me MVP once/);
  assert.doesNotMatch(speech, /hall inducts|scouts|plaque|What the|record shows/);
});

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
  let s = createLife(base(4242));
  const stop = s.ageMonths + 20 * 12;
  let guard = 0;
  while (s.ageMonths < stop && !s.ended && guard++ < 4000) {
    s = s.pendingDecision ? resolveDecision(s, s.pendingDecision.templateId === "chapter" ? "keep" : autoChoice(s)) : advance(s, 1);
  }
  if (s.pendingDecision?.templateId === "chapter") s = resolveDecision(s, "keep");
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

ok("college MVP is harder, and the awards move the draft board", () => {
  const s = createLife(base(11));
  s.ageMonths = 20 * 12;
  s.exposure = 50;
  s.body = { ...s.body, heightCm: 196, wingspanCm: 206, reachCm: 260, weightKg: 95, vertical: 62, strength: 62, acceleration: 62, lateral: 62, stamina: 62, coordination: 62, durability: 62 };
  s.growth = { ...s.growth, adultHeightCm: 198, wingspanRatio: 1.04 };
  for (const k of ["strength", "acceleration", "lateral", "vertical", "stamina", "coordination", "durability"] as const) s.growth.athleticCeiling[k] = 66;
  const year = calendar(s).year;
  const keys = Object.keys(s.skills) as (keyof typeof s.skills)[];
  let placed = projectedRank(s, year);
  for (let v = 48; v <= 90 && (placed < 35 || placed > 60); v++) {
    for (const k of keys) {
      s.skills[k] = v;
      s.potentials[k] = v;
    }
    placed = projectedRank(s, year);
  }
  assert.ok(placed >= 35 && placed <= 60, `could not place a late first-rounder, got ${placed}`);
  const lvl = performanceLevel(s);
  const ncaa = maybeLeague("ncaa")!.model!;
  const level = { label: "NCAA", need: lvl - 16, model: ncaa, leagueId: "ncaa", youth: false };
  const line = (over: Partial<SeasonLine>): SeasonLine => ({
    key: "c", ageYears: 19, calendarYear: year, node: "university", leagueId: "ncaa", levelLabel: "NCAA",
    teamName: "State", countryId: "US", role: "star", gp: 28, min: 900, pts: 23 * 28, reb: 6 * 28, ast: 4 * 28,
    stl: 28, blk: 20, tov: 60, fgm: 220, fga: 420, tpm: 40, tpa: 110, ftm: 164, fta: 190, wins: 24, losses: 8, strength: 58, ...over,
  });
  const thin = seasonAwards(s, line({ wins: 10, losses: 18, pts: 22 * 28, strength: 46 }), level);
  assert.ok(!thin.includes("National Player of the Year") && !thin.includes("League MVP"), `a losing 22-point season still won ${thin.join(", ")}`);
  const chucker = seasonAwards(s, line({ fga: 900, fta: 40, ftm: 30 }), { ...level, need: lvl - 18 });
  assert.ok(!chucker.includes("National Player of the Year"), "volume without efficiency is not a national MVP");
  const earned = seasonAwards(s, line({}), level);
  assert.ok(earned.includes("National Player of the Year"), `a dominant season got ${earned.join(", ") || "nothing"}`);
  const blank = projectedRank(s, year);
  s.seasons = [line({ key: "fr" }), line({ key: "so" }), line({ key: "jr" })].map((row) => ({ ...row, awards: ["National Player of the Year"] }));
  assert.equal(accoladeDraftValue(s), 14);
  const lifted = projectedRank(s, year);
  assert.ok(lifted <= 12 && lifted + 20 <= blank, `three national awards: pick ${lifted}, was ${blank}`);
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
  let s = drive(createLife(base(5)), 24 * 12, (x) => (x.pendingDecision!.templateId === "chapter" ? "keep" : null));
  assert.ok(canRetireNow(s), s.pendingDecision?.templateId ?? s.ended?.reason ?? "still playing");
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
      const signed = s.seasons.some((x) => x.node === "foreign-pro") || s.placement.node === "foreign-pro" || s.history.some((h) => h.text === "No club abroad bites this time." || h.text === "A club abroad answers.");
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
    let s = drive(createLife(base(seed)), 36 * 12, keepChapter);
    while (s.pendingDecision?.templateId === "playoff-game") s = resolveDecision(s, keepChapter(s) ?? autoChoice(s));
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
      if (po.bracket) {
        assert.equal(po.bracket.east.length, 8);
        assert.equal(po.bracket.west.length, 8);
        assert.equal(new Set([...po.bracket.east, ...po.bracket.west].map((t) => t.name)).size, 16);
        assert.ok(po.bracket.series.some((s) => s.yours));
      }
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
    assert.ok(s.body[k] >= untrained.body[k] + 5, `${k}: trained ${s.body[k]} vs ${untrained.body[k]}`);
    assert.ok(s.body[k] > s.growth.athleticCeiling[k] + 2, `${k}: ${s.body[k]} vs natural ${s.growth.athleticCeiling[k]}`);
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

ok("all-time rows reject a missing figure and keep the richer life", () => {
  const row = (boardId: string, earnings: number): EarningsRow => ({
    boardId,
    name: "Ada",
    earnings,
    birthCountry: "US",
    tier: "pro",
    endedAge: 34,
    finishedAt: "2026-10-16T12:00:00.000Z",
    seed: 4,
    mode: "random",
  });
  assert.equal(parseEarningsRow({ ...row("0123456789abcdef", 10), earnings: 1.5 }), null);
  assert.equal(parseEarningsRow({ ...row("0123456789abcdef", 10), birthCountry: "ZZ" }), null);
  const parsed = parseEarningsRow(row("0123456789abcdef", 10));
  assert.equal(parsed?.earnings, 10);
  const board = placeRows([row("aaaaaaaaaaaaaaaa", 40)], row("bbbbbbbbbbbbbbbb", 40));
  assert.deepEqual(board.map((r) => r.boardId), ["aaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbb"]);
  assert.equal(placeRows(board, { ...row("bbbbbbbbbbbbbbbb", 90) }).map((r) => r.earnings).join(","), "90,40");
});

ok("earnings board ranks pre-tax money and drops a life with no figure", () => {
  const row = (runId: string, earnings: number | undefined, finishedAt: string): CareerSummary => ({
    runId,
    seed: 1,
    mode: "random",
    dailyDate: null,
    name: runId,
    birthCountry: "US",
    heightCm: 190,
    tier: "pro",
    debutAge: null,
    draft: null,
    peak: null,
    endedAge: 35,
    finishedAt,
    ...(earnings !== undefined ? { earnings } : {}),
  });
  let board = placeOnBoard([], row("a", 10, "2026-01-02"));
  board = placeOnBoard(board, row("b", 50, "2026-01-03"));
  board = placeOnBoard(board, row("c", 50, "2026-01-01"));
  board = placeOnBoard(board, row("d", undefined, "2026-01-04"));
  assert.deepEqual(board.map((x) => x.runId), ["c", "b", "a"]);
  assert.equal(earningsRank(board, "a")?.rank, 3);
  board = placeOnBoard(board, row("a", 80, "2026-01-02"));
  assert.equal(board[0]!.runId, "a");
  assert.equal(board.filter((x) => x.runId === "a").length, 1);
  const many = Array.from({ length: 25 }, (_, i) => row(`n${i}`, i, `2026-03-${String((i % 28) + 1).padStart(2, "0")}`));
  const top = many.reduce((acc, next) => placeOnBoard(acc, next), [] as CareerSummary[]);
  assert.equal(top.length, 20);
  assert.equal(top[0]!.earnings, 24);
  assert.equal(top.at(-1)!.earnings, 5);
  assert.equal(ordinal(1), "1st");
  assert.equal(ordinal(11), "11th");
  assert.equal(ordinal(22), "22nd");
});

console.log(`\n${checks} ONE SHOT checks passed`);
