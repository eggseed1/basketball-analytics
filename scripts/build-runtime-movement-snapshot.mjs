/**
 * Bundle Movement Center curated snapshot for Cloudflare Workers (no node:fs).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "data", "movement-center", "v1", "snapshot.json");
const OUT = path.join(
  ROOT,
  "src",
  "data",
  "runtime",
  "movement-snapshot.json"
);

const raw = await fs.readFile(SRC, "utf8");
const data = JSON.parse(raw);
const payload = {
  version: 1,
  generatedAt: new Date().toISOString(),
  source: "data/movement-center/v1/snapshot.json",
  snapshot: data,
};

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, JSON.stringify(payload));
const gz = gzipSync(Buffer.from(JSON.stringify(payload))).length;
console.log(
  `[movement-snapshot] clusters=${Array.isArray(data?.clusters) ? data.clusters.length : 0} → ${OUT} (gzip ${gz} B)`
);
