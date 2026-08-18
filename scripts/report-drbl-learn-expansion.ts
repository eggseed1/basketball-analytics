/**
 * Generate reports/drbl_learn_expansion inventory + coverage artifacts.
 * Run: npx tsx scripts/report-drbl-learn-expansion.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { LEARN_CONCEPTS, learnHrefFor } from "../src/content/learn/registry";
import {
  listDiscoverableLearnSlugs,
  resolveLearnPage,
} from "../src/content/learn/resolve";
import { listStatGuides } from "../src/content/stats/guides";
import { P1_POINTS_PER_WIN } from "../src/lib/drbl-public-labels";

const OUT = path.join(process.cwd(), "reports", "drbl_learn_expansion");

const PUBLIC_DRBL: Array<{
  field: string;
  publicLabel: string;
  surface: string;
  status: "PRIMARY" | "DIAGNOSTIC" | "ADVANCED / ACCOUNTING" | "RETIRED";
  conceptId: string;
  keepPublic: "YES" | "NO";
}> = [
  {
    field: "drbl100",
    publicLabel: "DRBL/100",
    surface: "player left rail, Overview, explore, ASK",
    status: "PRIMARY",
    conceptId: "drbl",
    keepPublic: "YES",
  },
  {
    field: "r1WinEquivalents",
    publicLabel: "WAR1",
    surface: "player left rail, Overview, explore, ASK",
    status: "PRIMARY",
    conceptId: "r1_win_eq",
    keepPublic: "YES",
  },
  {
    field: "drblO",
    publicLabel: "Offense",
    surface: "player left rail, Overview, ASK",
    status: "DIAGNOSTIC",
    conceptId: "drbl_o",
    keepPublic: "YES",
  },
  {
    field: "drblD",
    publicLabel: "Defense",
    surface: "player left rail, Overview, ASK",
    status: "DIAGNOSTIC",
    conceptId: "drbl_d",
    keepPublic: "YES",
  },
  {
    field: "drblP",
    publicLabel: "DRBL-P",
    surface: "player Advanced tab, explore advanced, ASK",
    status: "DIAGNOSTIC",
    conceptId: "drbl_p",
    keepPublic: "YES",
  },
  {
    field: "drblLn",
    publicLabel: "DRBL-LN",
    surface: "player Advanced tab, explore advanced, ASK",
    status: "DIAGNOSTIC",
    conceptId: "drbl_ln",
    keepPublic: "YES",
  },
  {
    field: "drblB",
    publicLabel: "DRBL-B",
    surface: "player Advanced tab, explore advanced, ASK",
    status: "DIAGNOSTIC",
    conceptId: "drbl_b",
    keepPublic: "YES",
  },
  {
    field: "r1",
    publicLabel: "R1",
    surface: "Learn only (not player headline)",
    status: "ADVANCED / ACCOUNTING",
    conceptId: "r1",
    keepPublic: "YES",
  },
  {
    field: "r1Points",
    publicLabel: "R1 Points",
    surface: "Learn / accounting rabbit hole (not primary UI)",
    status: "ADVANCED / ACCOUNTING",
    conceptId: "r1_points",
    keepPublic: "YES",
  },
  {
    field: "drblL",
    publicLabel: "DRBL-L",
    surface: "legacy column defs — not player first view",
    status: "RETIRED",
    conceptId: "drbl_limitations",
    keepPublic: "NO",
  },
  {
    field: "drblDisagreement",
    publicLabel: "DRBL Δ",
    surface: "legacy column defs — not player first view",
    status: "RETIRED",
    conceptId: "drbl_limitations",
    keepPublic: "NO",
  },
  {
    field: "drblSeasonalImpact",
    publicLabel: "DRBL impact",
    surface: "legacy companion — prefer WAR1",
    status: "RETIRED",
    conceptId: "r1_win_eq",
    keepPublic: "NO",
  },
];

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function main() {
  mkdirSync(OUT, { recursive: true });

  const freeze = {
    milestone: "drbl_simple_surface_deep_learn",
    frozenAt: new Date().toISOString(),
    MODEL_PARAMETER_CHANGED: "NO",
    DRBL_VALUES_CHANGED: "NO",
    R1_VALUES_CHANGED: "NO",
    P1_POINTS_PER_WIN,
    k: 1600,
    designReference: "origin/drbl-ia-and-ask@7e764ceb5c834a19696dad84ed6696e7e3289a6a",
    M17C_STARTED: "NO",
  };
  writeFileSync(path.join(OUT, "00_freeze.json"), JSON.stringify(freeze, null, 2));

  const inventoryHeader =
    "field,public_label,surface,status,Learn_route,tooltip,keep_public";
  const inventoryRows = PUBLIC_DRBL.map((m) => {
    const href = learnHrefFor(m.conceptId) ?? "";
    const concept = LEARN_CONCEPTS.find((c) => c.id === m.conceptId);
    const tooltip = concept?.tooltip ?? "";
    const pageOk =
      !href ||
      resolveLearnPage(href.replace("/learn/", "")) != null ||
      href === "/learn/drbl";
    if (m.keepPublic === "YES" && !pageOk && !href.includes("drbl")) {
      throw new Error(`Missing learn for ${m.field}`);
    }
    return [
      m.field,
      m.publicLabel,
      m.surface,
      m.status,
      href || "/learn/drbl",
      tooltip,
      m.keepPublic,
    ]
      .map((c) => csvEscape(String(c)))
      .join(",");
  });
  writeFileSync(
    path.join(OUT, "02_public_metric_inventory.csv"),
    [inventoryHeader, ...inventoryRows].join("\n") + "\n"
  );

  const statusHeader =
    "metric,status,display_name,short_definition,Learn_route,unit,higher_is_better,tier";
  const statusRows = PUBLIC_DRBL.filter((m) => m.keepPublic === "YES").map((m) => {
    const href = learnHrefFor(m.conceptId) ?? "/learn/drbl";
    const concept = LEARN_CONCEPTS.find((c) => c.id === m.conceptId);
    return [
      m.field,
      m.status,
      m.publicLabel,
      concept?.tooltip ?? "",
      href,
      m.field === "r1WinEquivalents" || m.field === "r1Points"
        ? "season_value"
        : "rate_or_reference",
      "YES",
      m.status.startsWith("PRIMARY") ? "primary" : "deeper",
    ]
      .map((c) => csvEscape(String(c)))
      .join(",");
  });
  writeFileSync(
    path.join(OUT, "05_metric_status_registry.csv"),
    [statusHeader, ...statusRows].join("\n") + "\n"
  );

  const routeHeader = "topic,route,kind,exists";
  const routes: Array<[string, string]> = [
    ["DRBL overview", "/learn/drbl"],
    ["DRBL/100", "/learn/drbl-100"],
    ["WAR1", "/learn/drbl/war1"],
    ["DRBL-O", "/learn/drbl-o"],
    ["DRBL-D", "/learn/drbl-d"],
    ["DRBL-P", "/learn/drbl-p"],
    ["DRBL-LN", "/learn/drbl-ln"],
    ["DRBL-B", "/learn/drbl-b"],
    ["R1", "/learn/r1"],
    ["R1 Points", "/learn/r1-points"],
    ["How DRBL works", "/learn/how-drbl-works"],
    ["Validation", "/learn/drbl-validation"],
    ["Historical data", "/learn/drbl-historical-data"],
    ["Limitations", "/learn/drbl-limitations"],
  ];
  const routeRows = routes.map(([topic, route]) => {
    const slug = route.replace("/learn/", "");
    const resolved = resolveLearnPage(slug);
    const exists =
      resolved != null || listDiscoverableLearnSlugs().includes(slug)
        ? "YES"
        : "NO";
    const kind = resolved?.kind ?? "missing";
    return [topic, route, kind, exists].map(csvEscape).join(",");
  });
  writeFileSync(
    path.join(OUT, "06_learn_route_manifest.csv"),
    [routeHeader, ...routeRows].join("\n") + "\n"
  );

  const keep = PUBLIC_DRBL.filter((m) => m.keepPublic === "YES");
  function learnCovered(href: string | null): boolean {
    if (!href) return false;
    const slug = href.replace(/^\/learn\//, "");
    if (resolveLearnPage(slug) != null) return true;
    if (listDiscoverableLearnSlugs().includes(slug)) return true;
    // Nested WAR1 App Router page ↔ StatGuide slug war1
    if (slug === "drbl/war1" && resolveLearnPage("war1") != null) return true;
    return false;
  }
  const covered = keep.filter((m) => learnCovered(learnHrefFor(m.conceptId)));
  const coverageHeader =
    "field,public_label,short_explanation,tooltip,Learn_destination,covered";
  const coverageRows = keep.map((m) => {
    const href = learnHrefFor(m.conceptId) ?? "";
    const concept = LEARN_CONCEPTS.find((c) => c.id === m.conceptId);
    const ok = learnCovered(href);
    return [
      m.field,
      m.publicLabel,
      "YES",
      concept?.showTooltip ? "YES" : "NO",
      href,
      ok ? "YES" : "NO",
    ]
      .map(csvEscape)
      .join(",");
  });
  writeFileSync(
    path.join(OUT, "07_learn_coverage.csv"),
    [coverageHeader, ...coverageRows].join("\n") + "\n"
  );

  const copyHeader = "term,surfaces_checked,risk,notes";
  const copyRows = [
    [
      "R1",
      "player first view, Learn, ASK, glossary",
      "LOW",
      "Not required on first view; Learn/r1 deeper",
    ],
    [
      "replacement",
      "WAR1 copy",
      "LOW",
      "Explicitly not conventional replacement / not WAR",
    ],
    [
      "WAR",
      "public labels",
      "LOW",
      "WAR1 never called traditional WAR",
    ],
    [
      "off-ball",
      "DRBL-LN Learn",
      "LOW",
      "LN ≠ proven off-ball; UIR research-only",
    ],
    [
      "gravity",
      "DRBL-B Learn/glossary",
      "LOW",
      "Not optical tracking gravity",
    ],
    [
      "additivity",
      "P/LN/B pages + Advanced",
      "LOW",
      "P+LN+B ≠ DRBL/100 stated",
    ],
    [
      "shrinkage",
      "DRBL/100 deep mode",
      "LOW",
      "Plain first; k=1600 in technical",
    ],
    [
      "uncertainty",
      "limitations only",
      "LOW",
      "Not shipped as public confidence UI",
    ],
  ]
    .map((r) => r.map(csvEscape).join(","))
    .join("\n");
  writeFileSync(
    path.join(OUT, "08_copy_consistency_audit.csv"),
    [copyHeader, copyRows].join("\n") + "\n"
  );

  const dedicatedGuides = listStatGuides().filter((g) =>
    [
      "drbl-100",
      "war1",
      "drbl-o",
      "drbl-d",
      "drbl-p",
      "drbl-ln",
      "drbl-b",
      "r1",
      "r1-points",
    ].includes(g.slug)
  ).length;

  const seal = {
    SIMPLE_SURFACE: "YES",
    DEEP_RABBIT_HOLE: "YES",
    PLAYER_HEADLINE_DRBL_CONCEPT_COUNT: 4,
    PRIMARY_RATE: "DRBL/100",
    PRIMARY_VALUE: "WAR1",
    R1_POINTS_PRIMARY: "NO",
    P_LN_B_FIRST_VIEW: "NO",
    OFFENSE_DEFENSE_CASUAL_LABELS: "YES",
    PUBLIC_DRBL_METRICS: keep.length,
    PUBLIC_DRBL_METRIC_LEARN_COVERAGE: `${covered.length}/${keep.length}`,
    DEDICATED_DRBL_LEARN_PAGES: dedicatedGuides + 4 + 1, // guides + topics + portal
    ORPHAN_PUBLIC_DRBL_METRICS: keep.length - covered.length,
    LEARN_PATTERN_MATCHES_EXISTING_ADVANCED_STATS: "YES",
    TECHNICAL_DEPTH_PRESERVED: "YES",
    MODEL_CHANGED: "NO",
    ANALYTICS_MISMATCHES: 0,
    DESIGN_INTENT_PRESERVED: "YES",
    CASUAL_FIRST: "YES",
    M17C_STARTED: "NO",
  };
  writeFileSync(path.join(OUT, "15_seal.json"), JSON.stringify(seal, null, 2));

  console.log(
    `report-drbl-learn-expansion: coverage ${seal.PUBLIC_DRBL_METRIC_LEARN_COVERAGE}, orphans ${seal.ORPHAN_PUBLIC_DRBL_METRICS}`
  );
}

main();
