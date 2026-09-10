/**
 * Copy curated sentiment snapshot onto the Worker module graph (no node:fs at runtime).
 * Prefer `npm run sentiment:build` which dual-writes; this is the deploy-time safety net.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "data", "sentiment", "v1", "snapshot.json");
const OUT = path.join(
  ROOT,
  "src",
  "data",
  "runtime",
  "sentiment-snapshot.json"
);

const raw = await fs.readFile(SRC, "utf8");
const data = JSON.parse(raw);
if (!data?.meta || !Array.isArray(data.players)) {
  throw new Error("sentiment snapshot missing meta/players");
}

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, `${JSON.stringify(data, null, 2)}\n`);
const gz = gzipSync(Buffer.from(JSON.stringify(data))).length;
console.log(
  `[sentiment-snapshot] ${data.players.length} players · season=${data.meta.season} → ${OUT} (gzip ${gz} B)`
);
