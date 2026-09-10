/**
 * Slim ESPN transaction archive for Cloudflare Workers (no node:fs).
 * Full jsonl stays on disk for local rebuilds; CF imports this snapshot.
 *
 * Compact row:
 * [id, date, season, teamId, teamAbbr, description, type, source, sourceUrl, espnYear]
 */
import fs from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

const ROOT = process.cwd();
const SRC = path.join(
  ROOT,
  "data",
  "transactions",
  "espn-site-v2",
  "v1",
  "transactions.jsonl"
);
const CURATED = path.join(
  ROOT,
  "data",
  "transactions",
  "curated",
  "v1",
  "transactions.jsonl"
);
const MANIFEST = path.join(
  ROOT,
  "data",
  "transactions",
  "espn-site-v2",
  "v1",
  "manifest.json"
);
const OUT = path.join(
  ROOT,
  "src",
  "data",
  "runtime",
  "transactions-snapshot.json"
);

async function readJsonl(filePath) {
  const rows = [];
  try {
    const rl = createInterface({
      input: createReadStream(filePath, { encoding: "utf8" }),
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      rows.push(JSON.parse(trimmed));
    }
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
  return rows;
}

function slim(tx) {
  const party = Array.isArray(tx.parties) ? tx.parties[0] : null;
  const teamId =
    (Array.isArray(tx.teamIds) && tx.teamIds[0]) ||
    party?.teamId ||
    null;
  const description = String(tx.description ?? "").trim();
  if (!tx.id || !tx.date || !teamId || !description) return null;
  return [
    String(tx.id),
    String(tx.date),
    String(tx.season ?? ""),
    String(teamId),
    party?.teamAbbr ? String(party.teamAbbr) : null,
    description,
    String(tx.type ?? "other"),
    tx.source ? String(tx.source) : null,
    tx.sourceUrl ? String(tx.sourceUrl) : null,
    tx.provenance?.espnCalendarYear ?? null,
  ];
}

const disk = await readJsonl(SRC);
const curated = await readJsonl(CURATED);
const byId = new Map();
for (const tx of disk) byId.set(tx.id, tx);
for (const tx of curated) byId.set(tx.id, tx);

const events = [...byId.values()]
  .map(slim)
  .filter(Boolean)
  .sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]));

let manifestMeta = null;
try {
  manifestMeta = JSON.parse(await fs.readFile(MANIFEST, "utf8"));
} catch {
  manifestMeta = null;
}

const payload = {
  version: 1,
  generatedAt: new Date().toISOString(),
  source: manifestMeta?.source ?? "espn-site-v2-transactions",
  datasetVersion: manifestMeta?.datasetVersion ?? "bundled-v1",
  contentHash: createHash("sha1")
    .update(JSON.stringify(events))
    .digest("hex")
    .slice(0, 16),
  earliestDate: events[0]?.[1] ?? null,
  latestDate: events.at(-1)?.[1] ?? null,
  events,
};

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, JSON.stringify(payload));
const gz = gzipSync(Buffer.from(JSON.stringify(payload))).length;
console.log(
  `[transactions-snapshot] wrote ${events.length} events → ${OUT} (gzip ~${gz} bytes)`
);
