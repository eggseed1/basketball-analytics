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
const OUT_PUBLIC = path.join(
  ROOT,
  "public",
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

const body = JSON.stringify(payload);
await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.mkdir(path.dirname(OUT_PUBLIC), { recursive: true });
await fs.writeFile(OUT, body);
await fs.writeFile(OUT_PUBLIC, body);
const gz = gzipSync(Buffer.from(body)).length;
console.log(
  `[movement-snapshot] clusters=${Array.isArray(data?.clusters) ? data.clusters.length : 0} → ${OUT_PUBLIC} (gzip ${gz} B; src mirror ${OUT})`
);
