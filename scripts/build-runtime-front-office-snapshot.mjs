/**
 * Bundle validated front-office team slices for Cloudflare Workers (no node:fs).
 * Disk data/front-office/v1 remains the provenance source locally.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "data", "front-office", "v1");
const OUT = path.join(
  ROOT,
  "src",
  "data",
  "runtime",
  "front-office-snapshot.json"
);
const OUT_PUBLIC = path.join(
  ROOT,
  "public",
  "runtime",
  "front-office-snapshot.json"
);

const manifest = JSON.parse(
  await fs.readFile(path.join(SRC, "manifest.json"), "utf8")
);
const teamDir = path.join(SRC, "teams");
const files = (await fs.readdir(teamDir)).filter((f) => f.endsWith(".json"));
const teams = {};
for (const file of files) {
  const id = file.replace(/\.json$/, "");
  teams[id] = JSON.parse(await fs.readFile(path.join(teamDir, file), "utf8"));
}

const payload = {
  version: 1,
  generatedAt: new Date().toISOString(),
  source: "data/front-office/v1",
  manifest,
  teams,
};

const body = JSON.stringify(payload);
await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.mkdir(path.dirname(OUT_PUBLIC), { recursive: true });
await fs.writeFile(OUT, body);
await fs.writeFile(OUT_PUBLIC, body);
const gz = gzipSync(Buffer.from(body)).length;
console.log(
  `[front-office-snapshot] ${Object.keys(teams).length} teams → ${OUT_PUBLIC} (gzip ${gz} B; src mirror ${OUT})`
);
