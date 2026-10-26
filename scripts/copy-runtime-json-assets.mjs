/**
 * Copy large runtime JSON snapshots into public/runtime/ so OpenNext serves
 * them as Workers Static Assets (ASSETS binding) instead of inlining them into
 * the Worker script upload.
 *
 * Source of truth stays in src/data/runtime/*.json (build scripts write there).
 * Idempotent: mkdir + copyFile overwrite.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src", "data", "runtime");
const DEST = path.join(ROOT, "public", "runtime");

const FILES = [
  "season-tables-snapshot.json",
  "game-snapshot.json",
  "transactions-snapshot.json",
  "sentiment-snapshot.json",
  "team-board-snapshot.json",
  "impact-overlay-snapshot.json",
  "asset-ledger-snapshot.json",
  "percentile-pools-snapshot.json",
  "drbl-overlay-snapshot.json",
];

fs.mkdirSync(DEST, { recursive: true });

let copied = 0;
let missing = 0;
for (const name of FILES) {
  const from = path.join(SRC, name);
  const to = path.join(DEST, name);
  if (!fs.existsSync(from)) {
    console.warn(`[copy-runtime-json] skip missing ${name}`);
    missing += 1;
    continue;
  }
  fs.copyFileSync(from, to);
  const kib = (fs.statSync(to).size / 1024).toFixed(0);
  console.log(`[copy-runtime-json] ${name} → public/runtime/ (${kib} KiB)`);
  copied += 1;
}

console.log(
  `[copy-runtime-json] done: ${copied} copied, ${missing} missing`
);
