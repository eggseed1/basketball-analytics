/**
 * Monte Carlo probe: ONE SHOT birth height, NBA entry, awards.
 * Run: node --import tsx scripts/probe-one-shot-odds.mjs
 * Optional: ONESHOT_LIFE_N=400 node --import tsx scripts/probe-one-shot-odds.mjs
 */
import {
  advanceToDecision,
  autoChoice,
  createLife,
  isUnicornSeed,
  resolveDecision,
  UNICORN_ODDS,
} from "../src/one-shot/engine.ts";
import { shareAtLeast, heightPercentile } from "../src/one-shot/body.ts";
import { outcomeTier } from "../src/one-shot/report.ts";
import { country } from "../src/one-shot/world.ts";

const BIRTH_N = 20_000;
const LIFE_N = Number(process.env.ONESHOT_LIFE_N ?? 500);
const LIFE_MONTHS = 34 * 12;

const base = (seed) => ({ seed, mode: "random", draw: "weighted", pacing: "standard" });

function pct(n, d) {
  return d ? ((100 * n) / d).toFixed(2) + "%" : "—";
}

function mean(xs) {
  return xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
}

function quantile(xs, q) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}

function bucketHeight(cm) {
  if (cm < 185) return "<6'1\"";
  if (cm < 193) return "6'1–6'3\"";
  if (cm < 201) return "6'4–6'6\"";
  if (cm < 208) return "6'7–6'9\"";
  if (cm < 216) return "6'10–7'0\"";
  return "7'1\"+";
}

/** Auto drive, but keep playing through chapter so NBA careers can stack. */
function drive(state, months) {
  let s = state;
  const stop = s.ageMonths + months;
  let guard = 0;
  while (!s.ended && s.ageMonths < stop && guard++ < months + 2000) {
    s = advanceToDecision(s, stop - s.ageMonths);
    if (!s.pendingDecision) break;
    const d = s.pendingDecision;
    let choice = null;
    if (d.templateId === "chapter") {
      choice = d.choices.find((c) => c.id === "keep" && !c.disabled)?.id ?? null;
    }
    if (d.templateId === "fanfare" || d.templateId === "hof") {
      choice = d.choices[0]?.id ?? "ok";
    }
    s = resolveDecision(s, choice ?? autoChoice(s));
  }
  return s;
}

console.log("=== ONE SHOT probability probe ===\n");

/* ------------------------------------------------------------ births */
{
  const heights = [];
  const byCountry = new Map();
  let unicorns = 0;
  let usBirths = 0;
  let tallUsParents = 0;
  for (let seed = 1; seed <= BIRTH_N; seed++) {
    const s = createLife(base(seed));
    heights.push(s.growth.adultHeightCm);
    if (isUnicornSeed(seed)) unicorns++;
    const c = s.birthplace.countryId;
    byCountry.set(c, (byCountry.get(c) ?? 0) + 1);
    if (c === "US") {
      usBirths++;
      if (heightPercentile(s.family.fatherHeightCm, "male", "US") >= 90) tallUsParents++;
    }
  }
  const topCountries = [...byCountry.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log(`Births (N=${BIRTH_N}, weighted draw)`);
  console.log(
    `  adult height mean ${mean(heights).toFixed(1)} cm  p10 ${quantile(heights, 0.1).toFixed(1)}  p50 ${quantile(heights, 0.5).toFixed(1)}  p90 ${quantile(heights, 0.9).toFixed(1)}  p99 ${quantile(heights, 0.99).toFixed(1)}`
  );
  console.log(`  share ≥198 cm (≈6'6"): ${pct(heights.filter((h) => h >= 198).length, BIRTH_N)}`);
  console.log(`  share ≥206 cm (≈6'9"): ${pct(heights.filter((h) => h >= 206).length, BIRTH_N)}`);
  console.log(`  share ≥213 cm (≈7'0"): ${pct(heights.filter((h) => h >= 213).length, BIRTH_N)}`);
  console.log(`  unicorn seeds: ${unicorns} (${pct(unicorns, BIRTH_N)}; target ${pct(UNICORN_ODDS, 1)})`);
  console.log(
    `  US births: ${pct(usBirths, BIRTH_N)}; among them fathers ≥90th pctile: ${pct(tallUsParents, usBirths)}`
  );
  console.log(
    `  top birth countries: ${topCountries.map(([id, n]) => `${id} ${pct(n, BIRTH_N)}`).join(", ")}`
  );
  console.log(
    `  US male national share ≥198 cm (no basketball bias): ${pct(shareAtLeast(198, "male", "US"), 1)}`
  );
  console.log(`  US male national share ≥206 cm: ${pct(shareAtLeast(206, "male", "US"), 1)}`);
  console.log();
}

/* ------------------------------------------------------------ careers */
{
  const t0 = Date.now();
  const rows = [];
  for (let seed = 1; seed <= LIFE_N; seed++) {
    const born = createLife(base(seed));
    const s = drive(born, LIFE_MONTHS);
    const awards = s.seasons.flatMap((x) => x.awards ?? []);
    const nbaAwards = s.seasons.filter((x) => x.node === "nba").flatMap((x) => x.awards ?? []);
    rows.push({
      seed,
      unicorn: Boolean(s.unicorn),
      countryId: s.birthplace.countryId,
      birthH: born.growth.adultHeightCm,
      tier: outcomeTier(s),
      drafted: Boolean(s.achievements.drafted),
      draftPick: s.achievements.drafted?.pick ?? null,
      debut: s.achievements.nbaDebut !== null,
      nbaGames: s.nbaGames ?? 0,
      mvp: nbaAwards.filter((a) => a === "NBA Most Valuable Player").length,
      allNba: nbaAwards.filter((a) => a.startsWith("All-NBA")).length,
      allStar: nbaAwards.filter((a) => a === "NBA All-Star").length,
      champ: nbaAwards.filter((a) => a === "NBA champion").length,
      finalsMvp: nbaAwards.filter((a) => a === "Finals MVP").length,
      collegeNat: awards.filter((a) => a === "National Player of the Year").length,
    });
    if (seed % 25 === 0) {
      const rate = seed / ((Date.now() - t0) / 1000);
      process.stderr.write(`  careers ${seed}/${LIFE_N} (${rate.toFixed(2)}/s)\n`);
    }
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`Careers to ~${LIFE_MONTHS / 12}y (N=${LIFE_N}, ${secs}s, auto + keep-chapter)`);

  const count = (fn) => rows.filter(fn).length;
  const nba = rows.filter((r) => r.debut);
  const unicornRows = rows.filter((r) => r.unicorn);
  const normalRows = rows.filter((r) => !r.unicorn);

  console.log(`  made NBA: ${pct(count((r) => r.debut), LIFE_N)} (${count((r) => r.debut)})`);
  console.log(`  drafted: ${pct(count((r) => r.drafted), LIFE_N)}`);
  console.log(`  drafted & never debuted: ${pct(count((r) => r.drafted && !r.debut), LIFE_N)}`);
  console.log(`  NBA career (≥100 GP): ${pct(count((r) => r.tier === "nba-career"), LIFE_N)}`);
  console.log(
    `  tiers: ${["nba-career", "nba-debut", "drafted", "top-pro", "pro", "semi-pro", "youth"]
      .map((t) => `${t} ${pct(count((r) => r.tier === t), LIFE_N)}`)
      .join(", ")}`
  );

  console.log(`\n  among NBA debuts (n=${nba.length}):`);
  if (nba.length) {
    console.log(
      `    mean adult height ${mean(nba.map((r) => r.birthH)).toFixed(1)} cm vs all ${mean(rows.map((r) => r.birthH)).toFixed(1)}`
    );
    console.log(
      `    ≥1 MVP season: ${pct(count((r) => r.mvp > 0), nba.length)} of debuts; ${pct(count((r) => r.mvp > 0), LIFE_N)} of all lives`
    );
    console.log(`    ≥1 All-NBA: ${pct(count((r) => r.allNba > 0), nba.length)} of debuts`);
    console.log(`    ≥1 All-Star: ${pct(count((r) => r.allStar > 0), nba.length)} of debuts`);
    console.log(`    ≥1 title: ${pct(count((r) => r.champ > 0), nba.length)} of debuts`);
    console.log(`    Finals MVP: ${pct(count((r) => r.finalsMvp > 0), nba.length)} of debuts`);
    console.log(`    mean NBA games ${mean(nba.map((r) => r.nbaGames)).toFixed(0)}`);
  }

  console.log(`\n  unicorns in sample: ${unicornRows.length} (${pct(unicornRows.length, LIFE_N)})`);
  if (unicornRows.length) {
    console.log(
      `    unicorn NBA rate: ${pct(count((r) => r.unicorn && r.debut), unicornRows.length)}`
    );
    console.log(
      `    normal NBA rate: ${pct(count((r) => !r.unicorn && r.debut), normalRows.length)}`
    );
    console.log(
      `    unicorn any-MVP rate: ${pct(count((r) => r.unicorn && r.mvp > 0), unicornRows.length)}`
    );
  }

  console.log(`\n  NBA / MVP rate by adult height bucket:`);
  for (const label of ["<6'1\"", "6'1–6'3\"", "6'4–6'6\"", "6'7–6'9\"", "6'10–7'0\"", "7'1\"+"]) {
    const g = rows.filter((r) => bucketHeight(r.birthH) === label);
    console.log(
      `    ${label.padEnd(10)} n=${String(g.length).padStart(4)}  NBA ${pct(g.filter((r) => r.debut).length, g.length)}  MVP ${pct(g.filter((r) => r.mvp > 0).length, g.length)}`
    );
  }

  const lottery = rows.filter((r) => r.draftPick != null && r.draftPick <= 14);
  const first = rows.filter((r) => r.draftPick != null && r.draftPick <= 30);
  console.log(`\n  lottery picks (1–14): ${pct(lottery.length, LIFE_N)}; first round: ${pct(first.length, LIFE_N)}`);
  console.log(`  National POY (college) at least once: ${pct(count((r) => r.collegeNat > 0), LIFE_N)}`);

  const byC = new Map();
  for (const r of rows) {
    const cur = byC.get(r.countryId) ?? { n: 0, nba: 0 };
    cur.n++;
    if (r.debut) cur.nba++;
    byC.set(r.countryId, cur);
  }
  const countryRates = [...byC.entries()]
    .filter(([, v]) => v.n >= 6)
    .map(([id, v]) => ({ id, name: country(id).name, ...v, rate: v.nba / v.n }))
    .sort((a, b) => b.rate - a.rate || b.n - a.n)
    .slice(0, 10);
  console.log(`\n  highest NBA rates among birth countries with ≥6 lives:`);
  for (const c of countryRates) {
    console.log(`    ${c.name} (${c.id}): ${pct(c.nba, c.n)}  n=${c.n}`);
  }
}
