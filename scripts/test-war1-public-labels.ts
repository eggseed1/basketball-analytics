/**
 * Fail if retired public value labels appear as current primary UI copy
 * outside an explicit allowlist.
 *
 * Run: npx tsx scripts/test-war1-public-labels.ts
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

/** Paths (posix-ish) where old terminology may remain. */
const ALLOWLIST_PATH_PREFIXES = [
  "reports/",
  "scripts/drbl-m16",
  "scripts/drbl-war-",
  "scripts/drbl-pipeline-",
  "scripts/report-drbl-learn-expansion.ts",
  "scripts/_war1_",
  "scripts/_rewrite_",
  "scripts/_fix_",
  "scripts/test-war1-public-labels.ts",
  "scripts/test-ask-drbl.ts", // synonym fixtures intentionally mention old aliases
  "scripts/test-learn-drbl-page.ts", // asserts old labels are absent
  "scripts/test-learn-explanations.ts",
];

const ALLOWLIST_PATH_EXACT = new Set([
  "src/lib/drbl-public-labels.ts", // retired label constants
]);

/** File-local allow: explanatory Learn prose defining the WAR1 name. */
function lineAllowed(rel: string, line: string): boolean {
  if (ALLOWLIST_PATH_EXACT.has(rel.replace(/\\/g, "/"))) return true;
  const posix = rel.replace(/\\/g, "/");
  if (ALLOWLIST_PATH_PREFIXES.some((p) => posix.startsWith(p))) return true;

  // Explanatory etymology / redirect / alias comments only.
  if (
    /intended as Wins Above R1|Legacy (search )?alias|legacy label|@deprecated|redirect|synonym|retired primary/i.test(
      line
    )
  ) {
    return true;
  }
  if (
    posix.includes("drbl-guides.ts") &&
    /Wins Above R1/.test(line) &&
    /intended as|name is intended/i.test(line)
  ) {
    return true;
  }
  if (
    posix.includes("learn/drbl/page.tsx") &&
    /Wins Above R1/.test(line) &&
    /intended as|name is intended/i.test(line)
  ) {
    return true;
  }
  if (
    (posix.includes("stat-glossary.ts") ||
      posix.includes("learn-column-concepts.ts")) &&
    /"(Wins Above R1|R1 Win Eq\.|R1 Win Equivalents)"/.test(line)
  ) {
    return true; // legacy lookup keys
  }
  return false;
}

const FORBIDDEN = [
  "R1 Win Eq.",
  "R1 WinEq",
  "R1 Win Equivalents",
  "Wins Above R1",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (
      name === "node_modules" ||
      name === ".next" ||
      name === "data" ||
      name === ".git"
    ) {
      continue;
    }
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|md|json)$/.test(name)) out.push(p);
  }
  return out;
}

function main() {
  const files = [
    ...walk(path.join(ROOT, "src")),
    ...walk(path.join(ROOT, "scripts")).filter((f) =>
      /test-.*\.(ts|tsx)$/.test(path.basename(f))
    ),
  ];

  const violations: string[] = [];
  for (const abs of files) {
    const rel = path.relative(ROOT, abs).replace(/\\/g, "/");
    if (ALLOWLIST_PATH_PREFIXES.some((p) => rel.startsWith(p))) continue;
    if (ALLOWLIST_PATH_EXACT.has(rel)) continue;
    const text = readFileSync(abs, "utf8");
    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
      for (const needle of FORBIDDEN) {
        if (!line.includes(needle)) continue;
        if (lineAllowed(rel, line)) continue;
        violations.push(`${rel}:${i + 1}: ${needle} :: ${line.trim()}`);
      }
    });
  }

  assert.equal(
    violations.length,
    0,
    `Retired public WAR1 labels found outside allowlist:\n${violations.join("\n")}`
  );

  // Smoke: canonical label present in key surfaces.
  const mustHaveWar1 = [
    "src/components/explore/player-season-table.tsx",
    "src/components/players/player-core-island.tsx",
    "src/components/teams/team-roster-section.tsx",
    "src/app/learn/drbl/page.tsx",
    "src/lib/drbl-public-labels.ts",
  ];
  for (const rel of mustHaveWar1) {
    const text = readFileSync(path.join(ROOT, rel), "utf8");
    assert.ok(text.includes("WAR1"), `${rel} must contain WAR1`);
  }

  console.log("test-war1-public-labels: ok");
}

main();
