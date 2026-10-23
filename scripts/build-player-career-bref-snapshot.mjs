/**
 * Extract per-player careers from season-tables so player pages do not import
 * the full ~9MB peer-board snapshot (plus its impact/DRBL side imports).
 *
 *   node scripts/build-player-career-bref-snapshot.mjs
 *
 * Prefer running after scripts/build-season-tables.ts.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src/data/runtime/season-tables-snapshot.json");
const OUT = path.join(ROOT, "src/data/runtime/player-career-bref-snapshot.json");

function normName(name) {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const tables = JSON.parse(readFileSync(SRC, "utf8"));
const seasons = tables.seasons ?? {};
/** @type {Record<string, Array<[string, object, object|null]>>} */
const byEspn = {};
/** nameKey → espn id (avoids duplicating career rows under byName). */
/** @type {Record<string, string>} */
const nameToEspn = {};

for (const [season, block] of Object.entries(seasons)) {
  const advanced = block?.advanced ?? [];
  const perGame = block?.perGame ?? [];
  const pgByKey = new Map(
    perGame.map((r) => [`${String(r.n).toLowerCase()}|${r.t}`, r])
  );
  for (const adv of advanced) {
    const pg = pgByKey.get(`${String(adv.n).toLowerCase()}|${adv.t}`) ?? null;
    const espnId = String(adv.e ?? pg?.e ?? "").trim();
    if (!espnId) continue;
    (byEspn[espnId] ??= []).push([season, adv, pg]);
    const nameKey = normName(adv.n);
    if (nameKey) nameToEspn[nameKey] = espnId;
  }
}

const out = {
  version: 2,
  generatedAt: new Date().toISOString(),
  source: "season-tables-snapshot.json",
  byEspn,
  nameToEspn,
};

writeFileSync(OUT, `${JSON.stringify(out)}\n`);
const bytes = Buffer.byteLength(JSON.stringify(out));
console.log(
  `[player-career-bref] espn=${Object.keys(byEspn).length} nameMap=${Object.keys(nameToEspn).length} → ${path.relative(ROOT, OUT)} (${(bytes / 1024 / 1024).toFixed(2)} MiB)`
);
