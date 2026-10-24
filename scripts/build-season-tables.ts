/**
 * Season tables snapshot (per-game and advanced, one row per player-season) from
 * the NBA totals cached by scripts/build-nba-season-totals.py. Advanced metrics
 * come from scripts/lib/season-metrics.ts; offensive and defensive rating are
 * NBA's on-court team ratings.
 *
 *   npx tsx scripts/build-season-tables.ts
 *
 * Players traded mid-season get one combined row ("2TM", "3TM") listing their
 * teams in the order played, as the site's readers expect. ESPN ids come from
 * src/data/runtime/nba-espn-player-ids.json, which this script extends.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { listedPositionNumber, seasonMetrics, type Stint, type StintMetrics, type TeamSeason } from "./lib/season-metrics";

const ROOT = process.cwd();
const CACHE = (process.env.DRBL_SEASON_TOTALS_DIR ?? "~/.cache/drbl-season-totals/v1").replace(/^~/, os.homedir());
const OUT = path.join(ROOT, "src/data/runtime/season-tables-snapshot.json");
const IDS = path.join(ROOT, "src/data/runtime/nba-espn-player-ids.json");
type SeasonFile = {
  season: string;
  stints: Stint[];
  teams: TeamSeason[];
  players: Record<string, { age?: number; gs?: number; onOrtg?: number; onDrtg?: number }>;
};

const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, "utf8")) as T;

const normName = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** The site's team codes (Basketball-Reference style) where NBA's differ. */
function siteTeamCode(nba: string, seasonStart: number): string {
  if (nba === "PHX") return "PHO";
  if (nba === "BKN") return "BRK";
  if (nba === "CHA" && seasonStart >= 2014) return "CHO";
  if (nba === "WAS" && seasonStart <= 1996) return "WSB";
  return nba;
}

const POSITION_LABELS = ["PG", "SG", "SF", "PF", "C"] as const;
const LISTED_RANGE: Record<string, [number, number]> = {
  G: [1, 2],
  F: [3, 4],
  C: [5, 5],
  "G-F": [2, 3],
  "F-G": [2, 3],
  "F-C": [4, 5],
  "C-F": [4, 5],
};
/** NBA's listed family (G, F, C, G-F, F-C) bounds the box-score estimate so a guard never reads as PF. */
function positionLabel(estimate: number, listed: string | undefined): string {
  const [lo, hi] = LISTED_RANGE[listed?.trim().toUpperCase() ?? ""] ?? [1, 5];
  return POSITION_LABELS[Math.min(hi, Math.max(lo, Math.round(estimate))) - 1]!;
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);

const files = existsSync(CACHE) ? readdirSync(CACHE).filter((f) => /^\d{4}-\d{2}\.json$/.test(f)).sort() : [];
if (!files.length) {
  console.error(`no season totals in ${CACHE}; run scripts/build-nba-season-totals.py first`);
  process.exit(1);
}
const seasonFiles = files.map((f) => readJson<SeasonFile>(path.join(CACHE, f)));

// ---- ESPN ids: the NBA↔ESPN crosswalks, then earlier matches, then a name unique in
// ESPN's index. Names drop Jr./II, so one ESPN id can match a father and a son; it goes
// to the crosswalked player, else to whoever played most recently.
const crosswalk: Record<string, string> = {};
for (const file of ["src/data/runtime/player-id-aliases-snapshot.json", "src/data/runtime/legend-player-aliases.json"]) {
  const p = path.join(ROOT, file);
  if (!existsSync(p)) continue;
  for (const a of readJson<{ aliases: Array<{ nbaPlayerId?: string; espnPlayerId?: string }> }>(p).aliases) {
    if (a.nbaPlayerId && a.espnPlayerId) crosswalk[String(a.nbaPlayerId)] ??= String(a.espnPlayerId);
  }
}
const earlier = existsSync(IDS) ? readJson<{ ids: Record<string, string> }>(IDS).ids : {};
const espnByName = new Map<string, string | null>();
for (const [name, id] of Object.entries(
  readJson<{ byName: Record<string, string> }>(path.join(ROOT, "src/data/runtime/espn-name-index.json")).byName,
)) {
  const key = normName(name);
  espnByName.set(key, espnByName.has(key) && espnByName.get(key) !== id ? null : id);
}
const lastSeason = new Map<number, string>();
const nameOf = new Map<number, string>();
for (const d of seasonFiles) {
  for (const s of d.stints) {
    if ((lastSeason.get(s.pid) ?? "") < d.season) lastSeason.set(s.pid, d.season);
    nameOf.set(s.pid, s.name);
  }
}
const owner = new Map<string, number>();
const claim = (pid: number, id: string) => [crosswalk[String(pid)] === id ? 1 : 0, lastSeason.get(pid) ?? ""] as const;
for (const [pid, name] of nameOf) {
  const key = String(pid);
  const id = crosswalk[key] ?? earlier[key] ?? espnByName.get(normName(name)) ?? undefined;
  if (!id) continue;
  const other = owner.get(id);
  if (other != null) {
    const [aCross, aLast] = claim(pid, id);
    const [bCross, bLast] = claim(other, id);
    if (aCross < bCross || (aCross === bCross && aLast <= bLast)) continue;
  }
  owner.set(id, pid);
}
const ids: Record<string, string> = {};
for (const [id, pid] of owner) ids[String(pid)] = id;
const espnId = (pid: number): string | undefined => ids[String(pid)];

// ---- Seasons.
const positions = existsSync(path.join(CACHE, "positions.json"))
  ? readJson<{ positions: Record<string, string> }>(path.join(CACHE, "positions.json")).positions
  : {};

type Advanced = Record<string, unknown>;
const seasons: Record<string, { advanced: Advanced[]; perGame: Advanced[] }> = {};

for (const data of seasonFiles) {
  const seasonStart = Number(data.season.slice(0, 4));
  const metrics = seasonMetrics(data.stints, data.teams, (pid) => listedPositionNumber(positions[String(pid)]));
  const byPlayer = new Map<number, Stint[]>();
  for (const s of data.stints) byPlayer.set(s.pid, [...(byPlayer.get(s.pid) ?? []), s]);

  const advanced: Advanced[] = [];
  const perGame: Advanced[] = [];
  for (const [pid, stints] of byPlayer) {
    stints.sort((a, b) => a.first.localeCompare(b.first));
    const rated = stints
      .map((s) => ({ s, m: metrics.get(`${s.pid}|${s.teamId}`) }))
      .filter((x): x is { s: Stint; m: StintMetrics } => x.m != null);
    const tot = stints.reduce(
      (acc, s) => {
        for (const k of Object.keys(acc) as (keyof typeof acc)[]) acc[k] += s[k];
        return acc;
      },
      { gp: 0, min: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, oreb: 0, dreb: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, pts: 0 },
    );
    if (tot.gp <= 0) continue;
    const ratedMin = rated.reduce((s, x) => s + x.s.min, 0);
    const wavg = (k: keyof StintMetrics) => ratio(rated.reduce((s, x) => s + x.m[k] * x.s.min, 0), ratedMin);
    const total = (k: keyof StintMetrics) => rated.reduce((s, x) => s + x.m[k], 0);
    const extras = data.players[String(pid)] ?? {};
    const name = stints[0]!.name;
    const team = stints.length > 1 ? `${stints.length}TM` : siteTeamCode(stints[0]!.team, seasonStart);
    const e = espnId(pid);
    const ws = total("ws");
    const ortg = Number(extras.onOrtg);
    const drtg = Number(extras.onDrtg);

    advanced.push({
      n: name,
      p: pid,
      t: team,
      gp: tot.gp,
      mp: Math.round(tot.min),
      per: r1(wavg("per")),
      ts: r3(ratio(tot.pts, 2 * (tot.fga + 0.44 * tot.fta))),
      usg: r1(wavg("usg")),
      ows: r1(total("ows")),
      dws: r1(total("dws")),
      ws: r1(ws),
      ws48: r3(ratio(ws * 48, tot.min)),
      obpm: r1(wavg("obpm")),
      dbpm: r1(wavg("dbpm")),
      bpm: r1(wavg("bpm")),
      vorp: r1(total("vorp")),
      fg3Ar: r3(ratio(tot.fg3a, tot.fga)),
      ftr: r3(ratio(tot.fta, tot.fga)),
      orbPct: r1(wavg("orbPct")),
      drbPct: r1(wavg("drbPct")),
      trbPct: r1(wavg("trbPct")),
      astPct: r1(wavg("astPct")),
      stlPct: r1(wavg("stlPct")),
      blkPct: r1(wavg("blkPct")),
      tovPct: r1(ratio(100 * tot.tov, tot.fga + 0.44 * tot.fta + tot.tov)),
      ...(stints.length > 1 ? { tm: stints.map((s) => siteTeamCode(s.team, seasonStart)) } : {}),
      ...(Number.isFinite(ortg) && ortg > 0 ? { ortg: r1(ortg) } : {}),
      ...(Number.isFinite(drtg) && drtg > 0 ? { drtg: r1(drtg) } : {}),
      ...(e ? { e } : {}),
    });

    const pg = (v: number) => r1(v / tot.gp);
    const fg2m = tot.fgm - tot.fg3m;
    const fg2a = tot.fga - tot.fg3a;
    perGame.push({
      n: name,
      t: team,
      gp: tot.gp,
      ...(extras.gs != null || extras.age != null ? { gs: extras.gs ?? 0 } : {}),
      ...(extras.age != null ? { age: Math.floor(Number(extras.age)) } : {}),
      ...(rated.length ? { pos: positionLabel(wavg("position"), positions[String(pid)]) } : {}),
      mp: pg(tot.min),
      pts: pg(tot.pts),
      trb: pg(tot.reb),
      orb: pg(tot.oreb),
      drb: pg(tot.dreb),
      ast: pg(tot.ast),
      stl: pg(tot.stl),
      blk: pg(tot.blk),
      tov: pg(tot.tov),
      pf: pg(tot.pf),
      fgm: pg(tot.fgm),
      fga: pg(tot.fga),
      fg3m: pg(tot.fg3m),
      fg3a: pg(tot.fg3a),
      fg2m: pg(fg2m),
      fg2a: pg(fg2a),
      ftm: pg(tot.ftm),
      fta: pg(tot.fta),
      fgPct: r3(ratio(tot.fgm, tot.fga)),
      fg3Pct: r3(ratio(tot.fg3m, tot.fg3a)),
      fg2Pct: r3(ratio(fg2m, fg2a)),
      efgPct: r3(ratio(tot.fgm + 0.5 * tot.fg3m, tot.fga)),
      ftPct: r3(ratio(tot.ftm, tot.fta)),
      ...(e ? { e } : {}),
    });
  }
  const byMinutes = (a: Advanced, b: Advanced) => Number(b.mp) - Number(a.mp);
  advanced.sort(byMinutes);
  const order = new Map(advanced.map((r, i) => [`${r.n}|${r.t}`, i]));
  perGame.sort((a, b) => (order.get(`${a.n}|${a.t}`) ?? 0) - (order.get(`${b.n}|${b.t}`) ?? 0));
  seasons[data.season] = { advanced, perGame };
}

const generatedAt = new Date().toISOString();
writeFileSync(
  OUT,
  JSON.stringify({ version: 1, generatedAt, source: "stats.nba.com", seasons }),
);
const metaOut = path.join(ROOT, "src/data/runtime/season-tables-meta.json");
const metaPublic = path.join(ROOT, "public/runtime/season-tables-meta.json");
const metaBody = `${JSON.stringify({ generatedAt, source: "stats.nba.com" })}\n`;
writeFileSync(metaOut, metaBody);
mkdirSync(path.dirname(metaPublic), { recursive: true });
writeFileSync(metaPublic, metaBody);
writeFileSync(
  IDS,
  `${JSON.stringify({ note: "NBA person id to ESPN athlete id", ids: Object.fromEntries(Object.entries(ids).sort(([a], [b]) => Number(a) - Number(b))) }, null, 0)}\n`,
);
const rows = Object.values(seasons).reduce((s, x) => s + x.advanced.length, 0);
const withEspn = Object.values(seasons).reduce((s, x) => s + x.advanced.filter((r) => r.e).length, 0);
console.log(`season tables: ${Object.keys(seasons).length} seasons, ${rows} player-seasons, ${withEspn} with ESPN ids`);
