/**
 * PRODUCT.FREEZE inventory/classification (read-only).
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "product-freeze");
mkdirSync(path.join(OUT, "recovery"), { recursive: true });

function esc(s: string) {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function classify(p: string): {
  classification: string;
  productRequired: boolean;
  generated: boolean;
  regenerable: boolean;
  candidateCommitGroup: string;
} {
  const f = p.replace(/\\/g, "/");
  if (/^reports\//.test(f))
    return {
      classification: "REPORT_ONLY",
      productRequired: false,
      generated: true,
      regenerable: true,
      candidateCommitGroup: "EXCLUDE",
    };
  if (/^data\/drbl\/raw\//.test(f) || /^data\/raw\//.test(f))
    return {
      classification: "RAW_DATA",
      productRequired: false,
      generated: false,
      regenerable: false,
      candidateCommitGroup: "EXCLUDE",
    };
  if (/\.next\/|node_modules\/|^dist\/|coverage\//.test(f))
    return {
      classification: "BUILD_OUTPUT",
      productRequired: false,
      generated: true,
      regenerable: true,
      candidateCommitGroup: "EXCLUDE",
    };
  if (
    /\.env($|\.)|credentials|secrets?\./i.test(f) &&
    !/test|fixture|example/i.test(f)
  )
    return {
      classification: "SECRET_OR_CREDENTIAL_RISK",
      productRequired: false,
      generated: false,
      regenerable: false,
      candidateCommitGroup: "EXCLUDE",
    };
  if (/^data\/front-office\//.test(f) || /^data\/cba\/league-cap/.test(f))
    return {
      classification: "PRODUCT_RUNTIME_DATA",
      productRequired: true,
      generated: true,
      regenerable: true,
      candidateCommitGroup: "G_FRONT_OFFICE",
    };
  if (
    /indexes\/player-shots|player-seasons\.json|by-season\/202[45]/.test(f)
  )
    return {
      classification: "PRODUCT_RUNTIME_DATA",
      productRequired: true,
      generated: true,
      regenerable: true,
      candidateCommitGroup: "F_PLAYER_INTEGRITY",
    };
  if (/^scripts\/(merge0|merge0a|_dbg)/.test(f))
    return {
      classification: "LOCAL_ONLY",
      productRequired: false,
      generated: false,
      regenerable: true,
      candidateCommitGroup: "EXCLUDE",
    };
  if (/^scripts\/(p18|sync-team-front-office)/.test(f))
    return {
      classification: "PRODUCT_GENERATOR",
      productRequired: true,
      generated: false,
      regenerable: false,
      candidateCommitGroup: "H_INFRA",
    };
  if (/^scripts\/test-p18/.test(f))
    return {
      classification: "PRODUCT_TEST",
      productRequired: true,
      generated: false,
      regenerable: false,
      candidateCommitGroup: "H_INFRA",
    };
  if (/parse-basketball-minutes|player-season-totals|player-career-season-table|player-season-court|player-season-shots/.test(f))
    return {
      classification: "PRODUCT_SOURCE",
      productRequired: true,
      generated: false,
      regenerable: false,
      candidateCommitGroup: "F_PLAYER_INTEGRITY",
    };
  if (
    /payroll|draft-assets|format-money|front-office|team-payroll|team-draft|types\/front-office/.test(
      f
    )
  )
    return {
      classification: "PRODUCT_SOURCE",
      productRequired: true,
      generated: false,
      regenerable: false,
      candidateCommitGroup: "G_FRONT_OFFICE",
    };
  if (
    /franchise-registry|team-search|matchup|FranchiseTimeline|team-matchup|history\/\[season\]|app\/history|game-flow|game-presentation|game-unavailable|team-games-log/.test(
      f
    )
  )
    return {
      classification: "PRODUCT_SOURCE",
      productRequired: true,
      generated: false,
      regenerable: false,
      candidateCommitGroup: "D_TEAMS",
    };
  if (/web-vitals|request-cache|p18perf|next\.config/.test(f))
    return {
      classification: "PRODUCT_SOURCE",
      productRequired: true,
      generated: false,
      regenerable: false,
      candidateCommitGroup: "C_PERF",
    };
  if (/player-media|data\/media|player-media-resolve|player-headshot/.test(f))
    return {
      classification: "PRODUCT_SOURCE",
      productRequired: true,
      generated: false,
      regenerable: false,
      candidateCommitGroup: "B_MEDIA",
    };
  if (/^src\/data\/(history|identity)/.test(f) || /player-page-contract|player-game-/.test(f))
    return {
      classification: "PRODUCT_SOURCE",
      productRequired: true,
      generated: false,
      regenerable: false,
      candidateCommitGroup: "A_IDENTITY",
    };
  if (/^src\/(app|components)\/.*player|player-depth|player-stat|shots\//.test(f))
    return {
      classification: "PRODUCT_SOURCE",
      productRequired: true,
      generated: false,
      regenerable: false,
      candidateCommitGroup: "E_PLAYER_PLATFORM",
    };
  if (/^src\//.test(f))
    return {
      classification: "PRODUCT_SOURCE",
      productRequired: true,
      generated: false,
      regenerable: false,
      candidateCommitGroup: "MIXED_REVIEW",
    };
  return {
    classification: "UNKNOWN",
    productRequired: false,
    generated: false,
    regenerable: false,
    candidateCommitGroup: "REVIEW",
  };
}

const untracked = readFileSync(
  path.join(OUT, "recovery", "untracked_before.txt"),
  "utf8"
)
  .split(/\r?\n/)
  .filter(Boolean);

const utRows = [
  "path,bytes,extension,classification,productRequired,generated,regenerable,candidateCommitGroup",
];
const hashRows = ["path,sha256,bytes"];
const large: Array<{ path: string; bytes: number; classification: string }> =
  [];
const counts: Record<string, number> = {};
const commitGroups: Record<string, string[]> = {};

for (const rel of untracked) {
  const abs = path.join(ROOT, rel);
  if (!existsSync(abs)) continue;
  let st;
  try {
    st = statSync(abs);
  } catch {
    continue;
  }
  if (!st.isFile()) continue;
  const bytes = st.size;
  const c = classify(rel);
  counts[c.classification] = (counts[c.classification] ?? 0) + 1;
  (commitGroups[c.candidateCommitGroup] ??= []).push(rel);
  utRows.push(
    [
      esc(rel),
      bytes,
      path.extname(rel),
      c.classification,
      c.productRequired,
      c.generated,
      c.regenerable,
      c.candidateCommitGroup,
    ].join(",")
  );
  if (bytes >= 500_000)
    large.push({ path: rel, bytes, classification: c.classification });
  if (c.productRequired && bytes > 0 && bytes < 8_000_000) {
    try {
      const h = createHash("sha256").update(readFileSync(abs)).digest("hex");
      hashRows.push([esc(rel), h, String(bytes)].join(","));
    } catch {
      /* skip */
    }
  }
}

const modLines = readFileSync(
  path.join(OUT, "recovery", "diff_name_status_before.txt"),
  "utf8"
)
  .split(/\r?\n/)
  .filter(Boolean);
const modRows = ["path,status,classification,candidateCommitGroup"];
for (const line of modLines) {
  const tab = line.indexOf("\t");
  const status = tab >= 0 ? line.slice(0, tab) : line.slice(0, 1);
  const p = tab >= 0 ? line.slice(tab + 1) : line.replace(/^[A-Z]+\s+/, "");
  const c = classify(p);
  (commitGroups[c.candidateCommitGroup] ??= []).push(`MOD:${p}`);
  modRows.push([esc(p), status, c.classification, c.candidateCommitGroup].join(","));
}

writeFileSync(
  path.join(OUT, "recovery", "untracked_manifest.csv"),
  utRows.join("\n") + "\n"
);
writeFileSync(
  path.join(OUT, "recovery", "untracked_hashes.csv"),
  hashRows.join("\n") + "\n"
);
writeFileSync(path.join(OUT, "03_untracked_inventory.csv"), utRows.join("\n") + "\n");
writeFileSync(
  path.join(OUT, "02_tracked_diff_inventory.csv"),
  modRows.join("\n") + "\n"
);
writeFileSync(
  path.join(OUT, "05_large_file_audit.csv"),
  [
    "path,bytes,classification,decision",
    ...large
      .sort((a, b) => b.bytes - a.bytes)
      .map((x) => {
        let decision = "REVIEW";
        if (x.classification === "RAW_DATA" || x.classification === "REPORT_ONLY")
          decision = "EXCLUDE";
        else if (x.bytes > 50_000_000) decision = "EXTERNAL_OR_REGENERABLE";
        else if (x.classification === "PRODUCT_RUNTIME_DATA" && x.bytes < 20_000_000)
          decision = "COMMIT_RUNTIME_ARTIFACT";
        return [esc(x.path), x.bytes, x.classification, decision].join(",");
      }),
  ].join("\n") + "\n"
);

writeFileSync(
  path.join(OUT, "04_file_classification.csv"),
  [
    "classification,count",
    ...Object.entries(counts).map(([k, v]) => `${k},${v}`),
  ].join("\n") + "\n"
);

writeFileSync(
  path.join(OUT, "_commit_groups.json"),
  JSON.stringify(
    Object.fromEntries(
      Object.entries(commitGroups).map(([k, v]) => [k, v.length])
    ),
    null,
    2
  )
);

console.log(
  JSON.stringify(
    {
      untrackedFiles: utRows.length - 1,
      hashed: hashRows.length - 1,
      large: large.length,
      counts,
      groups: Object.fromEntries(
        Object.entries(commitGroups).map(([k, v]) => [k, v.length])
      ),
    },
    null,
    2
  )
);
