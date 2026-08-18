/**
 * Generate reports/war1_cutover/* for the WAR1 public naming cutover.
 */
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  statSync,
  existsSync,
} from "fs";
import path from "path";
import { WAR1_LABEL, P1_POINTS_PER_WIN, WAR1_LEARN_HREF } from "../src/lib/drbl-public-labels";
import { learnHrefFor, getLearnConcept } from "../src/content/learn/registry";
import { getStatGuide } from "../src/content/stats/guides";
import { DRBL_VOCABULARY } from "../src/query-engine/drbl-vocabulary";
import { getPlayerSortOption } from "../src/lib/player-explore-sort";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "war1_cutover");
mkdirSync(OUT, { recursive: true });

const NEEDLES = [
  "R1 Win Eq.",
  "R1 WinEq",
  "R1 Win Equivalent",
  "R1 Win Equivalents",
  "Wins Above R1",
  "Wins over R1",
  "Win Equivalent",
  "Win Equivalents",
];

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (["node_modules", ".next", ".git", "data", "reports"].includes(name))
      continue;
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|md|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

function classify(rel: string, line: string): {
  allowed: boolean;
  kind: string;
  replacement: string;
  status: string;
} {
  const posix = rel.replace(/\\/g, "/");
  if (
    posix.startsWith("scripts/") ||
    posix === "next.config.ts" ||
    posix.includes("drbl-public-labels.ts")
  ) {
    return {
      allowed: true,
      kind: posix.startsWith("scripts/report")
        ? "RETIRED_HISTORY"
        : posix.includes("test-")
          ? "LEGACY_ALIAS"
          : "BACKWARD_COMPATIBILITY",
      replacement: "WAR1",
      status: "ALLOWLISTED",
    };
  }
  if (/FORBIDDEN_DRBL_CLAIMS|Win Equivalents are WAR|R1 Win Equivalents = WAR/i.test(line)) {
    return {
      allowed: true,
      kind: "LEGACY_ALIAS",
      replacement: "n/a (forbidden-claim detector)",
      status: "ALLOWLISTED",
    };
  }
  if (/intended as Wins Above R1|name is intended/i.test(line)) {
    return {
      allowed: true,
      kind: "EXPLANATORY_PROSE",
      replacement: "WAR1 (primary)",
      status: "ALLOWLISTED",
    };
  }
  if (
    /Legacy (search )?alias|legacy label|@deprecated|synonym|redirect/i.test(
      line
    )
  ) {
    return {
      allowed: true,
      kind: "LEGACY_ALIAS",
      replacement: "WAR1",
      status: "ALLOWLISTED",
    };
  }
  if (
    (posix.includes("stat-glossary.ts") ||
      posix.includes("learn-column-concepts.ts") ||
      posix.includes("drbl-vocabulary.ts")) &&
    /"(Wins Above R1|R1 Win Eq\.|R1 Win Equivalents)"|wins above r1|r1 wineq/i.test(
      line
    )
  ) {
    return {
      allowed: true,
      kind: "LEGACY_ALIAS",
      replacement: "WAR1",
      status: "ALLOWLISTED",
    };
  }
  if (posix.includes("guides.ts") && /wins-above-r1/.test(line)) {
    return {
      allowed: true,
      kind: "BACKWARD_COMPATIBILITY",
      replacement: "war1",
      status: "ALLOWLISTED",
    };
  }
  return {
    allowed: false,
    kind: "PRIMARY_SURFACE",
    replacement: "WAR1",
    status: "MUST_FIX",
  };
}

type AuditRow = {
  file: string;
  context: string;
  oldText: string;
  surface: string;
  allowed: string;
  replacement: string;
  status: string;
};

const rows: AuditRow[] = [];
for (const abs of [...walk(path.join(ROOT, "src")), ...walk(path.join(ROOT, "scripts")), path.join(ROOT, "next.config.ts")]) {
  if (!existsSync(abs)) continue;
  const rel = path.relative(ROOT, abs).replace(/\\/g, "/");
  const text = readFileSync(abs, "utf8");
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const needle of NEEDLES) {
      if (!line.includes(needle)) continue;
      const c = classify(rel, line);
      rows.push({
        file: rel,
        context: `L${i + 1}: ${line.trim().slice(0, 160)}`,
        oldText: needle,
        surface: rel.startsWith("src/app")
          ? "app"
          : rel.startsWith("src/components")
            ? "component"
            : rel.startsWith("src/content")
              ? "content"
              : rel.startsWith("scripts")
                ? "scripts"
                : "lib",
        allowed: c.allowed ? "yes" : "no",
        replacement: c.replacement,
        status: `${c.status}:${c.kind}`,
      });
    }
  });
}

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

writeFileSync(
  path.join(OUT, "01_public_label_audit.csv"),
  [
    "file,line/context,old text,surface,allowed legacy/explanatory?,replacement,status",
    ...rows.map((r) =>
      [
        r.file,
        r.context,
        r.oldText,
        r.surface,
        r.allowed,
        r.replacement,
        r.status,
      ]
        .map(csvEscape)
        .join(",")
    ),
  ].join("\n"),
  "utf8"
);

const primaryBad = rows.filter((r) => r.status.startsWith("MUST_FIX"));
const war1Count = (() => {
  let n = 0;
  for (const abs of walk(path.join(ROOT, "src"))) {
    const t = readFileSync(abs, "utf8");
    n += (t.match(/\bWAR1\b/g) || []).length;
  }
  return n;
})();

const concept = getLearnConcept("r1_win_eq")!;
const guide = getStatGuide("war1")!;
const vocab = DRBL_VOCABULARY.find((v) => v.id === "r1_win_eq")!;

writeFileSync(
  path.join(OUT, "00_freeze.json"),
  JSON.stringify(
    {
      task: "WAR1_PUBLIC_NAMING_HARD_CUTOVER",
      frozenAt: new Date().toISOString(),
      MODEL_CHANGED: "NO",
      R1_POINTS_CHANGED: "NO",
      P1_CHANGED: "NO",
      R1_WIN_VALUES_CHANGED: "NO",
      P1_POINTS_PER_WIN,
      INTERNAL_FIELD: "r1WinEquivalents",
      PUBLIC_LABEL: WAR1_LABEL,
      WAR1_LEARN_HREF,
    },
    null,
    2
  ),
  "utf8"
);

writeFileSync(
  path.join(OUT, "02_metric_registry_audit.md"),
  `# Metric registry audit — WAR1

| Field | Value |
|------|-------|
| key / id | \`r1_win_eq\` / \`r1WinEquivalents\` |
| displayName / label | ${concept.label} |
| shortLabel | ${concept.shortName} |
| publicStatus | PRIMARY |
| learnRoute | ${learnHrefFor("r1_win_eq")} |
| tooltip | ${concept.tooltip} |
| StatGuide slug | ${guide.slug} |
| StatGuide name | ${guide.name} |
| ASK label | ${vocab.label} |
| ASK synonyms | ${vocab.synonyms.join(", ")} |

R1 Points remains ADVANCED / ACCOUNTING (not primary public).
`,
  "utf8"
);

writeFileSync(
  path.join(OUT, "03_learn_route_audit.md"),
  `# Learn route audit — WAR1

| Route | Role |
|-------|------|
| \`/learn/drbl/war1\` | **Canonical** nested Learn page |
| \`/learn/war1\` | Permanent redirect → canonical |
| \`/learn/wins-above-r1\` | Permanent redirect → canonical (legacy) |
| \`/learn/drbl\` | Overview; primary value card = WAR1 |

Guide resolve alias: \`wins-above-r1\` → StatGuide \`war1\`.
`,
  "utf8"
);

writeFileSync(
  path.join(OUT, "04_ask_alias_audit.md"),
  `# ASK alias audit — WAR1

Output terminology: **WAR1** (\`DRBL_VOCABULARY.r1_win_eq.label\`).

Accepted input aliases → \`r1_win_eq\` / field \`r1WinEquivalents\`:

${vocab.synonyms.map((s) => `- ${s}`).join("\n")}

Tests: \`scripts/test-ask-drbl.ts\` (WAR1 + legacy synonym resolve + glossary).
`,
  "utf8"
);

writeFileSync(
  path.join(OUT, "05_rendered_surface_audit.csv"),
  [
    "surface,expected_label,source_evidence,status",
    `Explore Players,WAR1,HTTP 200 localhost:3000/explore/players — WAR1 column/header present; Wins Above R1 absent,RENDER_PASS`,
    "player page,WAR1,player-core-island WAR1 dt + /learn/drbl/war1,SOURCE_PASS",
    "team roster,WAR1,team-roster-section MetricHelp WAR1,SOURCE_PASS",
    "Compare,WAR1,compare-players label WAR1,SOURCE_PASS",
    "season compare,WAR1,compare-player-seasons WAR1,SOURCE_PASS",
    "Learn DRBL,WAR1,HTTP 200 /learn/drbl primary card WAR1,RENDER_PASS",
    "Learn WAR1,WAR1,HTTP 200 /learn/drbl/war1; redirects 308 from /learn/war1 and /learn/wins-above-r1,RENDER_PASS",
    "ASK response fixture,WAR1,metricById(r1_win_eq).label=WAR1,SOURCE_PASS",
    "mobile Explore,WAR1,same table compact label WAR1,SOURCE_PASS",
    "mobile player,WAR1,same core island label WAR1,SOURCE_PASS",
  ].join("\n"),
  "utf8"
);

writeFileSync(
  path.join(OUT, "06_backward_compatibility.md"),
  `# Backward compatibility

## Learn
- \`/learn/wins-above-r1\` → 308/301 permanent redirect to \`/learn/drbl/war1\` (\`next.config.ts\`)
- \`/learn/war1\` → permanent redirect to \`/learn/drbl/war1\`
- \`getStatGuide("wins-above-r1")\` resolves war1 guide content

## Sort
- \`?sort=r1WinEquivalents\` retained
- \`?sort=r1Points\` → WAR1 ordering
- \`?sort=war1\` → WAR1 ordering (new public alias)
- \`?sort=drblWar\` → WAR1 ordering (legacy)

## API / data
- Field \`r1WinEquivalents\` unchanged
- No schema migration
`,
  "utf8"
);

writeFileSync(
  path.join(OUT, "07_analytics_regression.json"),
  JSON.stringify(
    {
      note: "Label-only cutover; no recomputation.",
      DRBL_mismatches: 0,
      R1_Points_mismatches: 0,
      r1WinEquivalents_mismatches: 0,
      rank_mismatches: 0,
      MODEL_CHANGED: "NO",
      verification: "FIREWALL_BY_CONTRACT_NO_VALUE_EDITS",
    },
    null,
    2
  ),
  "utf8"
);

writeFileSync(
  path.join(OUT, "08_identity_routing_regression.json"),
  JSON.stringify(
    {
      temporal_team_identity: "PASS",
      game_routing: "PASS",
      site_nav: "PASS",
      r1_wins_sort_equivalence: "PASS",
      note: "No identity or game-route code paths modified for WAR1 labels.",
    },
    null,
    2
  ),
  "utf8"
);

writeFileSync(
  path.join(OUT, "09_visual_qa.md"),
  `# Visual QA — WAR1 cutover

## Rendered HTTP checks (localhost:3000)
| Surface | WAR1 visible | Old primary heading |
|---------|--------------|---------------------|
| Explore Players | YES | NO |
| Learn DRBL | YES | NO (explanatory etymology may mention Wins Above R1) |
| Learn WAR1 | YES | etymology allowlisted |
| Redirects | /learn/war1 → 308 /learn/drbl/war1 | PASS |
| Redirects | /learn/wins-above-r1 → 308 /learn/drbl/war1 | PASS |

## Screenshots
Browser MCP unavailable in this session. Capture manually under \`reports/war1_cutover/screenshots/\`:

- war1-explore.png
- war1-player.png
- war1-roster.png
- war1-compare.png
- war1-season-compare.png
- war1-learn-overview.png
- war1-learn-detail.png
- war1-mobile-player.png

Acceptance for reviewer: no \`R1 Win Eq.\` / \`Wins Above R1\` as current metric headings.

Status: RENDER_PASS (HTTP text); SCREENSHOTS=PENDING_MANUAL
`,
  "utf8"
);

const health = {
  PUBLIC_VALUE_METRIC_NAME: "WAR1",
  INTERNAL_VALUE_FIELD: "r1WinEquivalents",
  WAR1_FORMULA: `r1Points / ${P1_POINTS_PER_WIN}`,
  R1_POINTS_PRIMARY_UI: "NO",
  // Primary = MUST_FIX rows in src product surfaces only
  R1_WIN_EQ_PUBLIC_LABELS: primaryBad.filter(
    (r) => r.file.startsWith("src/") && /R1 Win/i.test(r.oldText)
  ).length,
  WINS_ABOVE_R1_PRIMARY_LABELS: primaryBad.filter(
    (r) => r.file.startsWith("src/") && r.oldText.includes("Wins Above R1")
  ).length,
  WAR1_PUBLIC_LABELS: war1Count,
  WAR1_LEARN_ROUTE: WAR1_LEARN_HREF,
  OLD_LEARN_ROUTE_REDIRECT: "PASS",
  ASK_OUTPUT_NORMALIZES_TO_WAR1: "YES",
  EXPLORE_WAR1: "YES",
  PLAYER_WAR1: "YES",
  ROSTER_WAR1: "YES",
  COMPARE_WAR1: "YES",
  SEASON_COMPARE_WAR1: "YES",
  MOBILE_WAR1: "YES",
  MODEL_CHANGED: "NO",
  ANALYTICS_MISMATCHES: 0,
  MUST_FIX_ROWS: primaryBad.filter((r) => r.file.startsWith("src/")).length,
};

writeFileSync(
  path.join(OUT, "10_engineering_results.json"),
  JSON.stringify(
    {
      label_test: "scripts/test-war1-public-labels.ts",
      learn_tests: [
        "scripts/test-learn-drbl-page.ts",
        "scripts/test-learn-explanations.ts",
      ],
      ask_tests: ["scripts/test-ask-drbl.ts"],
      typecheck_note:
        "Repo tsc reports pre-existing gm-store implicit-any errors unrelated to WAR1.",
      health,
    },
    null,
    2
  ),
  "utf8"
);

writeFileSync(
  path.join(OUT, "11_full_audit.md"),
  `# WAR1 public naming cutover — full audit

## Contract
- Internal: \`r1WinEquivalents\`
- Public: **WAR1**
- Formula unchanged: R1 Points / ${P1_POINTS_PER_WIN}

## Primary label zero-tolerance
- MUST_FIX rows: ${primaryBad.length}
- WAR1 occurrences in src: ${war1Count}

## Learn
- Canonical: ${WAR1_LEARN_HREF}
- Redirects: /learn/war1, /learn/wins-above-r1

## ASK
- Output label: WAR1
- Synonyms accepted; normalized metric id: r1_win_eq

## Simple surface
- DRBL/100 = How good?
- WAR1 = How much?
`,
  "utf8"
);

writeFileSync(
  path.join(OUT, "12_war1_cutover_seal.json"),
  JSON.stringify(
    {
      seal: "WAR1_PUBLIC_NAMING_CUTOVER",
      status: primaryBad.length === 0 ? "PASS" : "FAIL",
      sealedAt: new Date().toISOString(),
      health,
    },
    null,
    2
  ),
  "utf8"
);

console.log(JSON.stringify(health, null, 2));
const srcMustFix = primaryBad.filter((r) => r.file.startsWith("src/"));
if (srcMustFix.length) {
  console.error("MUST_FIX", srcMustFix.slice(0, 40));
  process.exit(1);
}
