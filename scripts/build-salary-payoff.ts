/**
 * Salary paid off: how much of each player's yearly salary his play has covered
 * as the season goes on.
 *
 *   npx tsx scripts/build-salary-payoff.ts --record     save tonight's DRBL reading, then rebuild
 *   npx tsx scripts/build-salary-payoff.ts              rebuild the live season from saved readings
 *   npx tsx scripts/build-salary-payoff.ts --paced 2025-26
 *       bake a finished season by spreading each player's final value over his
 *       games by minutes. Needs local game logs, so it runs by hand, and later
 *       runs keep the result.
 *   --today YYYY-MM-DD  treat that date as today (for testing the live path)
 *
 * Readings live in data/salary-payoff/nightly/<season>/<date>.json, one small
 * file a night: [NBA id, NBA team id, possessions, WAR1 ×100] per player.
 * The live season is rebuilt from all of them, priced like the contract model.
 * Writes src/data/runtime/salary-payoff-snapshot.json.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { resolveCanonicalTeam } from "../src/data/identity/team-map";
import { resolveTeamBrand } from "../src/lib/nba-brand";
import type { PayoffSeasonFile, PayoffSnapshotFile } from "../src/lib/salary-payoff";
import { looseName, readJson } from "./lib/contract-value-fit";

const root = process.cwd();
const OUT = path.join(root, "src/data/runtime/salary-payoff-snapshot.json");
const NIGHTLY = path.join(root, "data/salary-payoff/nightly");

type Game = { season: string; gameDate: string; gameType: string; statusDetail?: string };
type Reading = { date: string; games: number; rows: Array<[string, string, number, number]> };

const args = process.argv.slice(2);
const record = args.includes("--record");
const pacedSeason = args.includes("--paced") ? args[args.indexOf("--paced") + 1] : null;
const today = args.includes("--today") ? args[args.indexOf("--today") + 1] : new Date().toISOString().slice(0, 10);

function log(message: string) {
  console.log(`[salary-payoff] ${message}`);
}

const games = readJson<{ games: Game[] }>("src/data/runtime/game-snapshot.json").games;
const contractModel = readJson<{ model: { pricePerWinShare: number; replacementPer1000: number; minimumShare: number } }>(
  "src/data/runtime/contract-value-snapshot.json"
).model;
const replacementPerPossession = contractModel.replacementPer1000 / 1000;

function regularSeason(season: string): { opener: string; end: string } | null {
  const dates = games.filter((g) => g.season === season && g.gameType === "regular").map((g) => g.gameDate).sort();
  return dates.length ? { opener: dates[0], end: dates[dates.length - 1] } : null;
}

function capFor(season: string): number | null {
  const start = Number(season.slice(0, 4));
  const fromSeasons = readJson<{ seasons: Array<{ seasonStartYear: number; salaryCap: number }> }>(
    "data/cba/league-cap-seasons.json"
  ).seasons.find((s) => s.seasonStartYear === start)?.salaryCap;
  if (fromSeasons) return fromSeasons;
  const row = readJson<{ bySeasonEndYear: Record<string, { salaryCapM: number }> }>("data/cba/salary-cap-by-year.json")
    .bySeasonEndYear[String(start + 1)];
  return row ? row.salaryCapM * 1e6 : null;
}

function pricing(season: string) {
  const cap = capFor(season);
  if (!cap) throw new Error(`no salary cap for ${season}`);
  return {
    cap,
    minimum: Math.round(contractModel.minimumShare * cap),
    pricePerWin: Math.round(contractModel.pricePerWinShare * cap),
  };
}

function espnTeamId(raw: string | null | undefined): string {
  if (!raw) return "";
  const canonical = resolveCanonicalTeam(raw);
  if (canonical.status === "resolved" && canonical.team.providerIds.espn) return canonical.team.providerIds.espn;
  return resolveTeamBrand(raw)?.espnTeamId ?? "";
}

function deltas(cumulative: number[]): number[] {
  let prev = 0;
  return cumulative.map((v) => {
    const cents = Math.round(v * 100);
    const d = cents - prev;
    prev = cents;
    return d;
  });
}

function currentSeason(): string {
  const seasons = [...new Set(games.filter((g) => g.gameType === "regular").map((g) => g.season))].sort();
  return seasons.filter((s) => (regularSeason(s)?.opener ?? "9") <= today).at(-1) ?? seasons.at(-1)!;
}

// ---- Record tonight's reading

function readingsDir(season: string) {
  return path.join(NIGHTLY, season);
}

function loadReadings(season: string): Reading[] {
  const dir = readingsDir(season);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
    .map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")) as Reading);
}

function recordTonight(season: string) {
  const file = path.join(root, "src/data/drbl/precomputed", `${season}.json`);
  if (!existsSync(file)) {
    log(`no DRBL season file for ${season}; nothing to record`);
    return;
  }
  const drbl = JSON.parse(readFileSync(file, "utf8")) as {
    gamesProcessed?: number;
    players?: Array<{ playerId?: string; teamId?: string; possessions?: number; r1WinEquivalents?: number }>;
  };
  const gamesProcessed = Number(drbl.gamesProcessed ?? 0);
  const range = regularSeason(season);
  if (!range || !gamesProcessed) return;
  const lastFinal = games
    .filter((g) => g.season === season && g.gameType === "regular" && /^Final/.test(g.statusDetail ?? "") && g.gameDate <= today)
    .map((g) => g.gameDate)
    .sort()
    .at(-1);
  if (!lastFinal) return;
  const previous = loadReadings(season).at(-1);
  if (previous && (previous.games >= gamesProcessed || previous.date >= lastFinal)) {
    log(`already have ${previous.date} (${previous.games} games); skipping`);
    return;
  }
  const rows: Reading["rows"] = [];
  for (const p of drbl.players ?? []) {
    if (!p.playerId || p.r1WinEquivalents == null || !Number.isFinite(p.r1WinEquivalents)) continue;
    rows.push([String(p.playerId), String(p.teamId ?? ""), Math.round(Number(p.possessions ?? 0)), Math.round(p.r1WinEquivalents * 100)]);
  }
  if (!rows.length) return;
  mkdirSync(readingsDir(season), { recursive: true });
  const reading: Reading = { date: lastFinal, games: gamesProcessed, rows };
  writeFileSync(path.join(readingsDir(season), `${lastFinal}.json`), `${JSON.stringify(reading)}\n`);
  log(`recorded ${season} through ${lastFinal}: ${rows.length} players, ${gamesProcessed} games`);
}

// ---- Live season from nightly readings

type ContractRow = { name: string; brefId: string; years: Array<{ amount: number } | null> };

function buildNightly(season: string): PayoffSeasonFile | null {
  const range = regularSeason(season);
  const readings = loadReadings(season).filter((r) => range && r.date >= range.opener && r.date <= range.end);
  if (!range || !readings.length) return null;

  const aliases = readJson<{ aliases: Array<{ nbaPlayerId?: string; brefSlug?: string }> }>(
    "src/data/runtime/player-id-aliases-snapshot.json"
  ).aliases;
  const nbaByBref = new Map<string, string>();
  for (const a of aliases) if (a.brefSlug && a.nbaPlayerId) nbaByBref.set(a.brefSlug.toLowerCase(), String(a.nbaPlayerId));
  // Few aliases carry a BRef slug, so fall back to a name only one DRBL player has.
  const idsByName = new Map<string, Set<string>>();
  const overlay = readJson<{ seasons: Record<string, unknown[][]> }>("src/data/runtime/drbl-overlay-snapshot.json").seasons;
  for (const rows of Object.values(overlay)) {
    for (const [id, name] of rows) {
      if (typeof name !== "string" || id == null) continue;
      const key = looseName(name);
      idsByName.set(key, (idsByName.get(key) ?? new Set()).add(String(id)));
    }
  }
  const contracts = readJson<{
    teams: Record<string, { seasons: string[]; rows: ContractRow[]; notes: Record<string, string> }>;
  }>("src/data/runtime/bref-team-contracts-snapshot.json").teams;

  const winsAt = (row: Reading["rows"][number]) => row[3] / 100 - replacementPerPossession * row[2];
  const byId = readings.map((r) => new Map(r.rows.map((row) => [row[0], row])));
  const prices = pricing(season);
  const players: PayoffSeasonFile["players"] = {};
  const seen = new Set<string>();
  let noValue = 0;
  let partial = 0;
  for (const [teamId, team] of Object.entries(contracts)) {
    const col = team.seasons.indexOf(season);
    if (col < 0) continue;
    for (const row of team.rows) {
      const salary = row.years[col]?.amount;
      if (!salary || !Number.isFinite(salary)) continue;
      if (/^Waived\b/.test(team.notes[row.brefId] ?? "")) continue;
      const named = idsByName.get(looseName(row.name));
      const nbaId = nbaByBref.get(row.brefId.toLowerCase()) ?? (named?.size === 1 ? [...named][0] : null);
      const key = nbaId ?? `bref:${row.brefId}`;
      if (players[key]) continue;
      if (nbaId) seen.add(nbaId);
      if (salary < prices.minimum) {
        partial += 1;
        continue;
      }
      if (!nbaId || !byId.at(-1)!.has(nbaId)) {
        noValue += 1;
        continue;
      }
      const cumulative = byId.map((m) => {
        const hit = m.get(nbaId);
        return hit ? winsAt(hit) : 0;
      });
      players[key] = [row.name, teamId, salary, deltas(cumulative), nbaId];
    }
  }
  const noSalary = new Set(readings.at(-1)!.rows.map((r) => r[0]).filter((id) => !seen.has(id))).size;
  return {
    kind: "nightly",
    ...range,
    ...prices,
    dates: readings.map((r) => r.date),
    players,
    leftOut: { noValue, noSalary, partial },
  };
}

// ---- Finished season, paced by minutes

function readSalaries(season: string): Map<string, number> {
  const endYear = String(Number(season.slice(0, 4)) + 1);
  const out = new Map<string, number>();
  for (const rel of [
    "data/salaries/player-salaries-2000-2025.csv",
    "data/salaries/player-salaries-bref-archive.csv",
    "data/salaries/player-salaries-supplement.csv",
  ]) {
    const seenHere = new Map<string, number>();
    for (const line of readFileSync(path.join(root, rel), "utf8").split("\n").slice(1)) {
      const m = line.match(/^(.*),(\d+),(\d{4})\s*$/);
      if (!m || m[3] !== endYear) continue;
      const key = looseName(m[1].replace(/^"|"$/g, ""));
      seenHere.set(key, (seenHere.get(key) ?? 0) + Number(m[2]));
    }
    for (const [key, salary] of seenHere) if (!out.has(key)) out.set(key, salary);
  }
  return out;
}

function buildPaced(season: string): PayoffSeasonFile {
  const range = regularSeason(season);
  if (!range) throw new Error(`no regular-season schedule for ${season}`);
  const dates = [
    ...new Set(games.filter((g) => g.season === season && g.gameType === "regular").map((g) => g.gameDate)),
  ].sort();
  const overlay = readJson<{ seasons: Record<string, unknown[][]> }>("src/data/runtime/drbl-overlay-snapshot.json").seasons[season];
  if (!overlay) throw new Error(`no DRBL overlay for ${season}`);
  const salaries = readSalaries(season);
  const logDir = path.join(root, "public/runtime/player-game-logs", season);
  if (!existsSync(logDir)) throw new Error(`no local game logs for ${season} in ${logDir}`);

  const prices = pricing(season);
  const players: PayoffSeasonFile["players"] = {};
  let noSalary = 0;
  const matched = new Set<string>();
  for (const row of overlay) {
    const [id, name, teamId] = row as [string, string, string];
    const possessions = Number(row[5]);
    const war1 = row[12] == null ? null : Number(row[12]);
    if (war1 == null || !Number.isFinite(war1) || !Number.isFinite(possessions)) continue;
    const salary = salaries.get(looseName(name));
    if (!salary) {
      noSalary += 1;
      continue;
    }
    if (salary < prices.minimum) continue;
    const logFile = path.join(logDir, `${id}.json`);
    const logs = existsSync(logFile)
      ? ((JSON.parse(readFileSync(logFile, "utf8")) as { games?: Array<{ date: string; minutesNum: number; teamAbbr: string }> }).games ?? []).filter(
          (g) => g.date >= range.opener && g.date <= range.end && g.minutesNum > 0
        )
      : [];
    const totalMinutes = logs.reduce((s, g) => s + g.minutesNum, 0);
    if (!totalMinutes) continue;
    matched.add(looseName(name));
    const minutesByDate = new Map<string, number>();
    for (const g of logs) minutesByDate.set(g.date, (minutesByDate.get(g.date) ?? 0) + g.minutesNum);
    const totalWins = war1 - replacementPerPossession * possessions;
    let running = 0;
    const cumulative = dates.map((date) => {
      running += minutesByDate.get(date) ?? 0;
      return (totalWins * running) / totalMinutes;
    });
    const lastTeam = [...logs].sort((a, b) => a.date.localeCompare(b.date)).reverse().find((g) => g.teamAbbr)?.teamAbbr;
    players[id] = [name, espnTeamId(lastTeam) || espnTeamId(teamId), salary, deltas(cumulative), id];
  }
  const partial = [...salaries.values()].filter((s) => s < prices.minimum).length;
  const noValue = [...salaries].filter(([k, s]) => s >= prices.minimum && !matched.has(k)).length;
  return { kind: "paced", ...range, ...prices, dates, players, leftOut: { noValue, noSalary, partial } };
}

// ---- Write

const existing: PayoffSnapshotFile = existsSync(OUT)
  ? (JSON.parse(readFileSync(OUT, "utf8")) as PayoffSnapshotFile)
  : { version: 1, generatedAt: "", seasons: {} };
const seasons = { ...existing.seasons };

if (pacedSeason) {
  seasons[pacedSeason] = buildPaced(pacedSeason);
  log(`paced ${pacedSeason}: ${Object.keys(seasons[pacedSeason].players).length} players`);
} else if (seasons[currentSeason()]?.kind === "paced") {
  // A finished season that's been paced keeps that bake; one reading from its last night would flatten it.
  log(`${currentSeason()} is already paced; waiting for the next opener`);
} else {
  const season = currentSeason();
  if (record) recordTonight(season);
  const live = buildNightly(season);
  if (live) {
    seasons[season] = live;
    log(`live ${season}: ${Object.keys(live.players).length} players over ${live.dates.length} nights`);
  } else {
    log(`no readings for ${season} yet`);
  }
}

const openers: Record<string, string> = {};
for (const season of new Set(games.filter((g) => g.gameType === "regular").map((g) => g.season))) {
  const range = regularSeason(season);
  if (range) openers[season] = range.opener;
}
const out: PayoffSnapshotFile = { version: 1, generatedAt: new Date().toISOString(), seasons, openers };
writeFileSync(OUT, `${JSON.stringify(out)}\n`);
