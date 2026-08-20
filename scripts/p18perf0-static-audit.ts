/**
 * P18PERF.0 — static audits (no server required).
 * Writes several CSV/MD report stubs from source + artifact inspection.
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "p18perf0");
mkdirSync(OUT, { recursive: true });

function walk(dir: string, acc: string[] = [], depth = 0): string[] {
  if (depth > 12 || !existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === ".git") continue;
    const p = path.join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(p, acc, depth + 1);
    else acc.push(p);
  }
  return acc;
}

function rel(p: string) {
  return path.relative(ROOT, p).replace(/\\/g, "/");
}

const srcFiles = walk(path.join(ROOT, "src")).filter((p) =>
  /\.(ts|tsx)$/.test(p)
);

const ioRe =
  /\b(readFileSync|readFile|readdirSync|readdir|statSync|stat|JSON\.parse)\s*\(/g;

const ioRows: string[] = [
  "file,symbolHits,readFileSync,readFile,readdir,JSON.parse,hotPathGuess",
];
for (const f of srcFiles) {
  const text = readFileSync(f, "utf8");
  const readFileSyncN = (text.match(/\breadFileSync\s*\(/g) ?? []).length;
  const readFileN = (text.match(/\breadFile\s*\(/g) ?? []).length;
  const readdirN = (text.match(/\breaddir(?:Sync)?\s*\(/g) ?? []).length;
  const parseN = (text.match(/\bJSON\.parse\s*\(/g) ?? []).length;
  const hits = readFileSyncN + readFileN + readdirN + parseN;
  if (!hits) continue;
  const hot =
    /page\.tsx$|layout\.tsx$|route\.ts$|player-universe|player-career|product\.ts|raw-archive|explore-players|request-cache|portrait-lookup/.test(
      rel(f)
    )
      ? "YES"
      : "maybe";
  ioRows.push(
    `${rel(f)},${hits},${readFileSyncN},${readFileN},${readdirN},${parseN},${hot}`
  );
}
writeFileSync(path.join(OUT, "07_filesystem_io_audit.csv"), ioRows.join("\n") + "\n");

const parseRows: string[] = [
  "artifact,bytes,approxRows,consumerHint,requestFrequencyGuess",
];
const artifactCandidates = [
  "data/drbl/player-history/drbl-player-history-v1/master-registry.json",
  "data/drbl/history/drbl-history-v1/2005-06/player-games.json",
  "data/drbl/history/drbl-history-v1/2023-24/player-games.json",
  "data/drbl/history/drbl-history-v1/2005-06/game-summaries.json",
  "src/data/media/portrait-lookup.json",
];
for (const a of artifactCandidates) {
  const p = path.join(ROOT, a);
  if (!existsSync(p)) continue;
  const bytes = statSync(p).size;
  const text = readFileSync(p, "utf8");
  let rows = 0;
  try {
    const j = JSON.parse(text);
    if (Array.isArray(j)) rows = j.length;
    else if (j?.players) rows = j.players.length;
    else if (j?.games) rows = j.games.length;
    else if (j?.portraits) rows = Object.keys(j.portraits).length;
    else if (j?.bySeason) rows = Object.keys(j.bySeason).length;
  } catch {
    rows = -1;
  }
  parseRows.push(
    `${a},${bytes},${rows},see_audit,hot_if_uncached`
  );
}
writeFileSync(path.join(OUT, "08_json_parse_audit.csv"), parseRows.join("\n") + "\n");

const clientRows: string[] = ["file,lineHint,notes"];
for (const f of srcFiles) {
  const text = readFileSync(f, "utf8");
  if (!/"use client"/.test(text)) continue;
  const heavy =
    /player-universe|master-registry|player-games|game-summaries|drbl-loader|portrait-lookup/.test(
      text
    );
  clientRows.push(
    `${rel(f)},use client,${heavy ? "HEAVY_IMPORT_SUSPECT" : "island"}`
  );
}
writeFileSync(
  path.join(OUT, "09_client_boundary_audit.csv"),
  clientRows.join("\n") + "\n"
);

// Prefetch / image heuristics from explore table
const tablePath = path.join(
  ROOT,
  "src/components/explore/player-season-table.tsx"
);
const table = existsSync(tablePath) ? readFileSync(tablePath, "utf8") : "";
const prefetchFalse = (table.match(/prefetch=\{false\}/g) ?? []).length;
const prefetchDefault = (table.match(/<Link|<TransitionLink/g) ?? []).length;
writeFileSync(
  path.join(OUT, "10_prefetch_audit.csv"),
  [
    "surface,linkComponents,prefetchFalseExplicit,policy",
    `player-season-table,${prefetchDefault},${prefetchFalse},${prefetchFalse ? "explicit_false" : "next_default_prefetch"}`,
  ].join("\n") + "\n"
);

writeFileSync(
  path.join(OUT, "11_image_network_audit.csv"),
  [
    "surface,priorityDefault,lazyDefault,notes",
    "PlayerHeadshot,false,browser_lazy,registryOnly_portraitUrl_from_server",
    "explore_directory,false,lazy,initial_page_size_100",
  ].join("\n") + "\n"
);

writeFileSync(
  path.join(OUT, "14_cache_architecture.md"),
  `# Cache architecture (freeze / audit)

| Mechanism | Status |
|----------|--------|
| Next \`cacheComponents\` | OFF |
| \`use cache\` | not used |
| \`unstable_cache\` | not used |
| Module caches | \`player-universe\` master + bySeason; career loaders; portrait lookup; explore board lastGood |
| Route segment config | per-page (\`force-dynamic\` on some history) |
| Historical data policy | Immutable seasons should be process-cached / revalidated by artifact version |
| Current seasons | Must not use eternal cache |

P18PERF.0 will add bounded caches + Server-Timing without enabling \`cacheComponents\` globally.
`
);

let nextVersion = "unknown";
try {
  nextVersion = require("next/package.json").version;
} catch {
  /* ignore */
}

writeFileSync(
  path.join(OUT, "audit_static_meta.json"),
  JSON.stringify(
    {
      nextVersion,
      srcTsFiles: srcFiles.length,
      clientComponents: clientRows.length - 1,
      ioHotFiles: ioRows.filter((r) => r.includes(",YES")).length,
      hash: createHash("sha256")
        .update(ioRows.join("\n"))
        .digest("hex")
        .slice(0, 16),
    },
    null,
    2
  )
);

console.log("Static audits written to reports/p18perf0/");
