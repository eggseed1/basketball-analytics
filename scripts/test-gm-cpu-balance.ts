/**
 * Paired 10-year generated-player stock: old positional CPU default vs
 * roster-aware automatic priorities. Every prospect ID, team, RNG stream,
 * season and turnover decision is matched between worlds.
 *
 * Uses ratings-conditioned synthetic season lines (NOT 12,300 simulated
 * games, a salary-cap or free agency audit). Full league continuity runs
 * separately in franchise-five-year.yml.
 */
import assert from "node:assert/strict";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import { createDraftClass } from "../src/gm/seed/prospect-identities";
import { ensurePlayerSheet } from "../src/gm/engine/attributes";
import { createRng, clamp } from "../src/gm/engine/rng";
import { advanceDynamicProgression, reviewDevelopmentTrait } from "../src/gm/engine/dynamic-progression";
import { cpuDevelopmentFocus, developmentFocusSkill } from "../src/gm/engine/development-profile";
import type { GmLeagueState, GmPlayer } from "../src/gm/types";

const START = 2027, YEARS = 10, STOCK = 450, ANNUAL = 45;
const SEEDS = [131, 907];
const hash = (id: string) => Array.from(id).reduce(
  (n, ch) => Math.imul(n ^ ch.charCodeAt(0), 16777619) >>> 0, 2166136261
) >>> 0;
const mean = (a: number[]) => a.reduce((n, v) => n + v, 0) / Math.max(1, a.length);
type Metrics = { year: number; mean: number; star85: number; elite90: number; elite95: number; max: number; offense: number; defense: number };
type YearRow = { seed: number; baseline: Metrics; specialized: Metrics; chosenDifferent: number; eligible: number };
const rows: YearRow[] = [];

function draft(seed: number, year: number, count: number, teams: string[], index: number): GmPlayer[] {
  return createDraftClass({
    count, seasonEndYear: year, scoutLevel: 3,
    rng: createRng(seed * 1709 + year * 131 + index * 37), seal: p => p,
  }).map((player, i) => ensurePlayerSheet({
    ...player, teamId: teams[(i + index * count) % teams.length]!,
    age: player.age + (index < 10 ? index : 0), contract: null, injury: null,
    identityRevealed: true, developmentFocus: "balanced" as const,
  }));
}

function seasonLine(player: GmPlayer, season: number) {
  const r = createRng(hash(player.id + ":" + season + ":box"));
  const ovr = player.sheet?.overall ?? 68;
  const gp = Math.round(clamp(68 + (r() - 0.5) * 36 - Math.max(0, player.age - 32) * 2, 18, 82));
  const mpg = clamp(12 + (ovr - 64) * 0.68 + (r() - 0.5) * 8, 5, 37);
  const ppg = clamp(4 + (ovr - 64) * 0.74 + (r() - 0.5) * 5, 1, 32);
  const apg = clamp(1 + (ovr - 64) * 0.11 + (r() - 0.5), 0.2, 10);
  const rpg = clamp(2 + (ovr - 64) * 0.16 + (r() - 0.5) * 2, 0.5, 14);
  const ts = clamp(0.53 + (ovr - 73) * 0.003 + (r() - 0.5) * 0.08, 0.43, 0.67);
  const pts = Math.round(gp * ppg);
  const fta = Math.round(pts * 0.27), ftm = Math.round(fta * 0.78);
  const fga = Math.max(1, Math.round(pts / (2 * ts) - 0.44 * fta));
  const tpa = Math.round(fga * 0.37), tpm = Math.round(tpa * 0.35);
  return {
    season: String(season), team: (player.teamId ?? "FA").toUpperCase(), gp,
    min: Math.round(gp * mpg), pts, ast: Math.round(gp * apg),
    reb: Math.round(gp * rpg), stl: Math.round(gp * 1.1), blk: Math.round(gp * 0.6),
    tov: Math.round(gp * 2), fga, fgm: Math.round((pts - ftm - 3 * tpm) / 2) + tpm,
    tpa, tpm, fta, ftm,
  };
}

function metrics(players: GmPlayer[], year: number): Metrics {
  const ratings = players.map(p => p.sheet!.overall);
  return {
    year, mean: +mean(ratings).toFixed(2),
    star85: ratings.filter(x => x >= 85).length,
    elite90: ratings.filter(x => x >= 90).length,
    elite95: ratings.filter(x => x >= 95).length,
    max: Math.max(...ratings),
    offense: +mean(players.map(p => p.ratings.offense)).toFixed(3),
    defense: +mean(players.map(p => p.ratings.defense)).toFixed(3),
  };
}

for (const seed of SEEDS) {
  const base = createGeneratedLeague({ userTeamId: "bos", season: START, seed });
  const teams = base.teams.map(t => t.id);
  const initial = Array.from({ length: 10 }, (_, i) =>
    draft(seed, START - i, ANNUAL, teams, i)
  ).flat();
  assert.equal(initial.length, STOCK);
  const positional = (p: GmPlayer) => developmentFocusSkill({ ...p, developmentFocus: "balanced" });
  let oldWorld: GmLeagueState = { ...base, players: initial.map(p => ({
    ...p, developmentFocus: positional(p),
  })), draftPool: [], seasonFlow: undefined, phase: "regular" };
  let newWorld: GmLeagueState = { ...base, players: initial, draftPool: [], seasonFlow: undefined, phase: "regular" };
  for (let offset = 0; offset < YEARS; offset++) {
    const season = START + offset;
    let changed = 0, eligible = 0;
    const prepare = (state: GmLeagueState): GmLeagueState => ({
      ...state, season, phase: "regular", players: state.players.map(p => ({
        ...p, developmentBaseline: { season, overall: p.sheet!.overall },
        seasonLine: seasonLine(p, season),
      })),
    });
    oldWorld = prepare(oldWorld);
    newWorld = prepare(newWorld);
    for (const p of newWorld.players) {
      if (p.teamId !== newWorld.userTeamId) {
        eligible++;
        if (cpuDevelopmentFocus(p, newWorld) !== positional(p)) changed++;
      }
    }
    for (const checkpoint of ["quarter1", "january", "quarter3", "finale", "summer"] as const) {
      const run = (world: GmLeagueState): GmLeagueState => ({
        ...world,
        players: world.players.map(player => advanceDynamicProgression(
          checkpoint === "summer" ? { ...player, age: player.age + 1 } : player,
          { league: world, checkpoint, coach: 0.45, staff: 1.04 }
        )),
      });
      oldWorld = run(oldWorld);
      newWorld = run(newWorld);
    }
    oldWorld = { ...oldWorld, players: oldWorld.players.map(p => reviewDevelopmentTrait(oldWorld, p)) };
    newWorld = { ...newWorld, players: newWorld.players.map(p => reviewDevelopmentTrait(newWorld, p)) };
    assert.equal(oldWorld.players.length, STOCK);
    assert.equal(newWorld.players.length, STOCK);
    rows.push({
      seed, baseline: metrics(oldWorld.players, season),
      specialized: metrics(newWorld.players, season), changed, eligible,
    });
    if (offset === YEARS - 1) break;
    // Identical age-weighted turnover, independent of resulting OVR, keeps
    // identities matched and does not disguise an inflation signal by
    // selectively cutting more poorly developed players in one world.
    const risk = (p: GmPlayer) =>
      p.age >= 39 ? 70 : p.age >= 35 ? 10 + (p.age - 35) * 5 :
      p.age >= 31 ? (p.age - 30) * 1.8 : 0;
    const leaving = new Set([...oldWorld.players]
      .sort((a, b) => (risk(b) + hash(b.id + ":" + season) % 13) -
                       (risk(a) + hash(a.id + ":" + season) % 13))
      .slice(0, ANNUAL).map(p => p.id));
    const newcomers = draft(seed, season + 1, ANNUAL, teams, 10 + offset);
    oldWorld = { ...oldWorld, players: [...oldWorld.players.filter(p => !leaving.has(p.id)),
      ...newcomers.map(p => ({ ...p, developmentFocus: positional(p) }))] };
    newWorld = { ...newWorld, players: [...newWorld.players.filter(p => !leaving.has(p.id)), ...newcomers] };
    assert.deepEqual(oldWorld.players.map(p => p.id).sort(), newWorld.players.map(p => p.id).sort(),
      "A/B comparison must retain the exact same prospects");
  }
}
const last = rows.filter(r => r.baseline.year === START + YEARS - 1);
const initial = rows.filter(r => r.baseline.year === START);
const choiceRate = rows.reduce((s, r) => s + r.changed, 0) /
  rows.reduce((s, r) => s + r.eligible, 0);
const diffs = last.map(r => ({
  seed: r.seed,
  mean: +(r.specialized.mean - r.baseline.mean).toFixed(2),
  star85: r.specialized.star85 - r.baseline.star85,
  elite90: r.specialized.elite90 - r.baseline.elite90,
  elite95: r.specialized.elite95 - r.baseline.elite95,
  offense: +(r.specialized.offense - r.baseline.offense).toFixed(3),
  defense: +(r.specialized.defense - r.baseline.defense).toFixed(3),
}));
console.log("Paired CPU development decade:", JSON.stringify({
  model: "Synthetic performance; 450 generated rostered players per seed, 45 annual entrants and age-based exits",
  seasons: YEARS, seeds: SEEDS, choiceRate: +choiceRate.toFixed(3),
  first: initial.map(r => ({ seed: r.seed, baseline: r.baseline, specialized: r.specialized })),
  last: last.map(r => ({ seed: r.seed, baseline: r.baseline, specialized: r.specialized })),
  diffs,
}));
assert.ok(choiceRate > 0.1, "automatic coaching must actually choose different skills for some CPU players");
for (const d of diffs) {
  assert.ok(Math.abs(d.mean) <= 1.5, "roster-aware focus must not materially inflate average OVR");
  assert.ok(d.star85 <= 12, "CPU specialization must not flood the 85+ talent tier");
  assert.ok(d.elite90 <= 5, "CPU specialization must not inflate 90+ superstars");
  assert.ok(d.elite95 <= 3, "CPU specialization must not inflate generational superstars");
  assert.ok(Math.abs(d.offense) <= 0.35 && Math.abs(d.defense) <= 0.35,
    "CPU specialization must not cause systemic offensive/defensive power drift");
}
for (const r of rows) {
  assert.ok(r.specialized.elite90 <= 35, "90+ league talent must remain rare");
  assert.ok(r.specialized.elite95 <= 8, "95+ league talent must remain extremely rare");
}
console.log("Paired CPU development balance gate passed");
