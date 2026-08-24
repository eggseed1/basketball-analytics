import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const forbidden = [
  "ALLOW_STATS_NBA_ON_VERCEL",
  "ALLOW_PLAYER_LEAGUE_ROSTER_ON_VERCEL",
  "ALLOW_LIVE_FRONT_OFFICE_ON_VERCEL",
];
const failures = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) inspect(full);
  }
}

function inspect(file) {
  const text = fs.readFileSync(file, "utf8");
  const rel = path.relative(root, file);
  for (const token of forbidden) {
    if (text.includes(token)) failures.push(`${rel}: legacy Vercel-only feature flag ${token}`);
  }
  if (
    rel.startsWith("src/data/") &&
    rel !== "src/data/providers/nba/runtime-policy.ts" &&
    rel !== "src/data/diagnostics/production-provider-guard.ts" &&
    /process\.env\.VERCEL|isVercelRuntime\(\)/.test(text)
  ) {
    failures.push(`${rel}: product data semantics still branch on Vercel runtime`);
  }
}

walk(path.join(root, "src", "data"));

const required = [
  "src/data/runtime/game-snapshot.ts",
  "src/data/providers/nba/nba-cdn-box-transformer.ts",
  "data/front-office/v1/manifest.json",
];
for (const rel of required) {
  if (!fs.existsSync(path.join(root, rel))) failures.push(`${rel}: required deployable product artifact/code missing`);
}

if (failures.length) {
  console.error("[production-parity] FAILED");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log("[production-parity] source invariants passed");
