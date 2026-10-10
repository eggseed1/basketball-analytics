/**
 * Bake the Arcade games' shared league file from the bundled season stats:
 * one row per completed player-season (1996-97 on) with team(s), position,
 * minutes, BPM, VORP, per-game box score and DARKO.
 *
 *   node scripts/build-arcade-data.mjs
 *
 * Writes public/runtime/arcade/league-seasons.json, served as a static file so
 * it stays out of the Worker bundle.
 *
 * Most rows carry no ESPN id, so a player is a name plus an estimated birth
 * year (season start year minus age). Two people with one name stay apart
 * when their birth years differ by more than a year. Player entries are
 * [name, birthYear, espnId, nbaId]; the ids only pick a headshot.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const bref = JSON.parse(
  readFileSync(path.join(root, "src/data/runtime/bref-advanced-snapshot.json"), "utf8")
);
const impact = JSON.parse(
  readFileSync(path.join(root, "src/data/runtime/impact-overlay-snapshot.json"), "utf8")
);

function looseName(name) {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.']/g, "")
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const round1 = (value) =>
  typeof value === "number" && Number.isFinite(value) ? Math.round(value * 10) / 10 : null;

const players = [];
const idsByName = new Map();

function playerId(name, birthYear, espnId) {
  const candidates = idsByName.get(name) ?? [];
  const match = candidates.find((pid) => {
    const known = players[pid][1];
    return known == null || birthYear == null || Math.abs(known - birthYear) <= 1;
  });
  if (match != null) {
    if (players[match][1] == null && birthYear != null) players[match][1] = birthYear;
    if (!players[match][2] && espnId) players[match][2] = espnId;
    return match;
  }
  const pid = players.length;
  players.push([name, birthYear, espnId ?? null, null]);
  idsByName.set(name, [...candidates, pid]);
  return pid;
}

// Completed seasons only; the live year's partial lines would skew the games.
const now = new Date();
const currentStartYear = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
const seasonKeys = Object.keys(bref.seasons)
  .filter((season) => Number(season.slice(0, 4)) < currentStartYear)
  .sort();
const seasons = {};
let darkoJoined = 0;
let rows = 0;

for (const season of seasonKeys) {
  const { advanced = [], perGame = [] } = bref.seasons[season];
  const startYear = Number(season.slice(0, 4));
  const perGameByName = new Map(perGame.map((row) => [row.n, row]));

  const darkoByName = new Map();
  const darkoDupes = new Set();
  const nbaIdByName = new Map();
  for (const [nbaId, name, dpm] of impact.darko?.[season] ?? []) {
    const key = looseName(name);
    if (darkoByName.has(key)) darkoDupes.add(key);
    darkoByName.set(key, dpm);
    nbaIdByName.set(key, nbaId);
  }

  seasons[season] = advanced.map((adv) => {
    const pg = perGameByName.get(adv.n);
    const age = pg?.age ?? null;
    const pid = playerId(adv.n, age != null ? startYear - age : null, adv.e ?? pg?.e);
    const teams = adv.tm?.length ? adv.tm : adv.t;
    const key = looseName(adv.n);
    const darko = darkoDupes.has(key) ? null : round1(darkoByName.get(key));
    if (darko != null) darkoJoined += 1;
    if (!darkoDupes.has(key) && nbaIdByName.has(key) && !players[pid][3]) {
      players[pid][3] = String(nbaIdByName.get(key));
    }
    rows += 1;
    return [
      pid,
      teams,
      pg?.pos ?? null,
      adv.gp,
      Math.round(adv.mp),
      round1(adv.bpm),
      round1(adv.vorp),
      round1(pg?.pts),
      round1(pg?.trb),
      round1(pg?.ast),
      darko,
    ];
  });
}

// Fill missing ESPN ids (for headshots) by name, only where the name is unique.
const espnByName = JSON.parse(
  readFileSync(path.join(root, "src/data/runtime/espn-name-index.json"), "utf8")
).byName ?? {};
const nameCounts = new Map();
for (const [name] of players) nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
let espnFilled = 0;
for (const player of players) {
  if (player[2] || nameCounts.get(player[0]) > 1) continue;
  const plain = player[0]
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const id = espnByName[plain];
  if (id) {
    player[2] = id;
    espnFilled += 1;
  }
}

// The source sometimes gives a father and son the same ESPN id. Keep it only
// for whoever played most recently; the other falls back to his NBA id.
const lastSeasonByPid = new Map();
for (const season of seasonKeys) for (const row of seasons[season]) lastSeasonByPid.set(row[0], season);
const espnOwner = new Map();
for (const [pid, player] of players.entries()) {
  if (!player[2]) continue;
  const owner = espnOwner.get(player[2]);
  if (owner == null || (lastSeasonByPid.get(pid) ?? "") > (lastSeasonByPid.get(owner) ?? "")) {
    espnOwner.set(player[2], pid);
  }
}
let espnShared = 0;
for (const [pid, player] of players.entries()) {
  if (player[2] && espnOwner.get(player[2]) !== pid) {
    player[2] = null;
    espnShared += 1;
  }
}

const out = {
  version: 1,
  generatedAt: new Date().toISOString(),
  columns: ["player", "teams", "pos", "gp", "mp", "bpm", "vorp", "pts", "trb", "ast", "darko"],
  players,
  seasons,
};

const file = path.join(root, "public/runtime/arcade/league-seasons.json");
const withoutStamp = (json) => JSON.stringify({ ...json, generatedAt: null });
let prior = null;
try {
  prior = JSON.parse(readFileSync(file, "utf8"));
} catch {
  // first build
}
if (prior && withoutStamp(prior) === withoutStamp(out)) {
  console.log(`arcade: unchanged (${seasonKeys[0]}..${seasonKeys.at(-1)})`);
  process.exit(0);
}
mkdirSync(path.dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify(out));
console.log(
  `arcade: ${seasonKeys[0]}..${seasonKeys.at(-1)} players=${players.length} espnFilled=${espnFilled} espnShared=${espnShared} withEspn=${players.filter((p) => p[2]).length} withNba=${players.filter((p) => p[3]).length} rows=${rows} darko=${darkoJoined} bytes=${JSON.stringify(out).length}`
);
