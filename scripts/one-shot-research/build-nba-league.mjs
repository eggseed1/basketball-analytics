/**
 * ONE SHOT research authoring: the real NBA season the game compares against.
 *
 * Inputs (bundled site snapshots, refreshed by their own pipelines):
 *   src/data/runtime/bref-advanced-snapshot.json  Basketball Reference per-game rows, 1996-97 on
 *   src/data/runtime/player-awards-snapshot.json  Basketball Reference award history
 *
 * Output:
 *   src/one-shot/data/nba-league.json  latest season, one row per player, plus
 *   how well the game's honor rules pick out the real winners since 1996-97
 *
 *   node scripts/one-shot-research/build-nba-league.mjs
 */
import fs from "node:fs";

const snap = JSON.parse(fs.readFileSync("src/data/runtime/bref-advanced-snapshot.json", "utf8"));
const aw = JSON.parse(fs.readFileSync("src/data/runtime/player-awards-snapshot.json", "utf8"));
const OUT = "src/one-shot/data/nba-league.json";

const norm = (n) => n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "");
const seasons = Object.keys(snap.seasons).sort();
const latest = seasons.at(-1);

/** One row per player: the combined row for players who changed teams. */
function rowsOf(season) {
  const by = new Map();
  for (const r of snap.seasons[season].perGame) {
    if (r.fga == null) continue;
    const k = norm(r.n);
    const prev = by.get(k);
    if (!prev || r.gp > prev.gp || (r.gp === prev.gp && /TM$/.test(r.t))) by.set(k, r);
  }
  return [...by.values()];
}

// Same formulas as src/one-shot/stats.ts and src/one-shot/league.ts.
const gmsc = (r) => r.pts + 0.4 * r.fgm - 0.7 * r.fga - 0.4 * (r.fta - r.ftm) + 0.4 * r.trb + r.stl + 0.7 * r.ast + 0.7 * r.blk - r.tov;
const def = (r) => r.stl + r.blk + 0.15 * r.trb;

const awardsBy = {};
for (const [id, list] of Object.entries(aw.players)) {
  const name = aw.names[id];
  if (!name) continue;
  for (const [desc, season] of list) ((awardsBy[season] ??= {})[desc] ??= []).push(name);
}

const firstSeason = new Map();
for (const s of seasons) for (const r of rowsOf(s)) if (!firstSeason.has(norm(r.n))) firstSeason.set(norm(r.n), s);

const fields = ["n", "t", "gp", "gs", "age", "mp", "pts", "trb", "ast", "stl", "blk", "tov", "fgm", "fga", "fg3m", "fg3a", "ftm", "fta", "yr"];
const prev = seasons.at(-2);
const rows = rowsOf(latest)
  .map((r) => {
    const first = firstSeason.get(norm(r.n));
    const yr = first === latest ? 1 : first === prev ? 2 : 0;
    return [r.n, r.t, r.gp, r.gs ?? 0, r.age ?? 0, r.mp, r.pts, r.trb, r.ast, r.stl, r.blk, r.tov, r.fgm, r.fga, r.fg3m ?? 0, r.fg3a ?? 0, r.ftm, r.fta, yr];
  })
  .sort((a, b) => b[6] - a[6]);

// Calibration: how often the game's rules would have named the real winners.
const cal = { seasons: 0, allNba: [0, 0], mvpTop3: [0, 0], dpoyFirst: [0, 0], allDefTop10: [0, 0], royTopRookie: [0, 0] };
for (const s of seasons.slice(1)) {
  const all = rowsOf(s);
  const games = Math.max(...all.map((r) => r.gp));
  const q = all.filter((r) => r.gp >= Math.round(games * 0.79 * 0.8));
  const rank = [...q].sort((a, b) => gmsc(b) - gmsc(a)).map((r) => norm(r.n));
  const drank = [...q].sort((a, b) => def(b) - def(a)).map((r) => norm(r.n));
  const a = awardsBy[s] ?? {};
  cal.seasons++;
  for (const n of a["All-NBA"] ?? []) {
    cal.allNba[1]++;
    const i = rank.indexOf(norm(n));
    if (i >= 0 && i < 15) cal.allNba[0]++;
  }
  for (const n of a["NBA Most Valuable Player"] ?? []) {
    cal.mvpTop3[1]++;
    const i = rank.indexOf(norm(n));
    if (i >= 0 && i < 3) cal.mvpTop3[0]++;
  }
  for (const n of a["NBA Defensive Player of the Year"] ?? []) {
    cal.dpoyFirst[1]++;
    if (drank.indexOf(norm(n)) === 0) cal.dpoyFirst[0]++;
  }
  for (const n of a["All-Defensive Team"] ?? []) {
    cal.allDefTop10[1]++;
    const i = drank.indexOf(norm(n));
    if (i >= 0 && i < 10) cal.allDefTop10[0]++;
  }
  const rookies = all.filter((r) => firstSeason.get(norm(r.n)) === s && r.gp >= 40).sort((x, y) => gmsc(y) - gmsc(x));
  for (const n of a["NBA Rookie of the Year"] ?? []) {
    cal.royTopRookie[1]++;
    if (rookies[0] && norm(rookies[0].n) === norm(n)) cal.royTopRookie[0]++;
  }
}

const a = awardsBy[latest] ?? {};
const out = {
  season: latest,
  firstSeason: seasons[0],
  source: "Basketball Reference per-game stats and award history, from drbl.io's bundled snapshots",
  generatedAt: snap.generatedAt,
  fields,
  rows,
  awards: {
    mvp: a["NBA Most Valuable Player"]?.[0] ?? null,
    dpoy: a["NBA Defensive Player of the Year"]?.[0] ?? null,
    roy: a["NBA Rookie of the Year"]?.[0] ?? null,
  },
  calibration: cal,
};
fs.writeFileSync(OUT, JSON.stringify(out) + "\n");
console.log(`${OUT}: ${latest}, ${rows.length} players, ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
console.log(JSON.stringify(cal));
