/**
 * Learn / explanation coverage diagnostic.
 * Run: npx tsx scripts/report-learn-coverage.ts
 *
 * Optional: --ui prints a lightweight, hand-maintained map of where
 * MetricHelp / PlayerIdentity are expected (not fragile AST analysis).
 */
import {
  LEARN_CONCEPTS,
  getLearnConcept,
  learnHrefFor,
} from "../src/content/learn/registry";
import { resolveLearnPage } from "../src/content/learn/resolve";
import { explainMetric } from "../src/analytics/explanations";
import {
  conceptIdForAskMetric,
  conceptIdForAskStatus,
  conceptIdForColumnLabel,
  conceptIdForFactorId,
} from "../src/lib/learn-column-concepts";

const CORE_IDS = [
  "ts",
  "efg",
  "usg",
  "darko",
  "lebron",
  "cpi",
  "ortg",
  "drtg",
  "net",
  "diff",
  "percentiles",
  "copeland",
  "essentially_even",
  "unavailable",
  "not_eligible",
  "incomplete_season",
  "contested",
  "close_top",
  "career_resume",
  "career_peak",
  "career_prime",
  "career_longevity",
  "longevity_only",
  "prime_contiguity",
  "career_development",
  "career_arc",
  "career_self_comparison",
  "rank_my_seasons",
  "team_rank_seasons",
  "game_lab",
  "season_evidence",
  "ask_drbl",
  "source_event",
  "structured_transaction",
] as const;

/** Surfaces audited for universal explanation / PlayerIdentity wiring. */
const UI_SURFACES: Array<{
  page: string;
  metricHelp: string;
  playerIdentity: string;
}> = [
  {
    page: "Game Lab /games/[id]",
    metricHelp: "winning factors, hero metrics, status, +/- leaders",
    playerIdentity: "highlights, scoring / all-around / +/- leaders",
  },
  {
    page: "Box score tables",
    metricHelp: "header-level for TS%, eFG%, +/-, USG%, ORtg, etc.",
    playerIdentity: "traditional + advanced rows",
  },
  {
    page: "ASK DRBL /ask",
    metricHelp: "metric chip, insufficient evidence, ASK title",
    playerIdentity: "result entities + ambiguity candidates",
  },
  {
    page: "Compare picker",
    metricHelp: "-",
    playerIdentity: "selected player chips (not dropdown rows)",
  },
  {
    page: "Player Compare",
    metricHelp: "dimension labels, Even, percentiles",
    playerIdentity: "A/B headers",
  },
  {
    page: "Player / Team Rank",
    metricHelp: "Copeland, contested, close top, status",
    playerIdentity: "rank header player",
  },
  {
    page: "Player leaderboard",
    metricHelp: "sortable headers (TS%, eFG%, USG%, ratings, impact)",
    playerIdentity: "player column",
  },
  {
    page: "Home Impact / Top performers / Efficiency",
    metricHelp: "DARKO, TS%, USG headers",
    playerIdentity: "leader rows",
  },
  {
    page: "Team roster",
    metricHelp: "DARKO in value bucket hint",
    playerIdentity: "roster rows",
  },
  {
    page: "Player context strip",
    metricHelp: "-",
    playerIdentity: "similar-player comps",
  },
  {
    page: "Career Resume (player page)",
    metricHelp:
      "Peak, Prime, Longevity, Career Arc, career-self, longevity-only, Development",
    playerIdentity: "- (season links only)",
  },
  {
    page: "Offseason / Transactions",
    metricHelp: "source-event / cluster labels only",
    playerIdentity: "none (no free-text ID inference)",
  },
];

function main() {
  const wantUi = process.argv.includes("--ui");

  console.log("Learn coverage diagnostic\n");
  console.log(
    [
      "id".padEnd(24),
      "tooltip",
      "learn",
      "pageOK",
      "explain",
      "label",
    ].join(" | ")
  );
  console.log("-".repeat(90));

  let missingLearn = 0;
  let brokenPage = 0;
  let missingExplain = 0;

  for (const id of CORE_IDS) {
    const c = getLearnConcept(id);
    const href = learnHrefFor(id);
    const page = href ? resolveLearnPage(href.replace("/learn/", "")) : null;
    const ex = explainMetric(id);
    const tip = c?.showTooltip ? "✓" : "-";
    const learn = href ? "✓" : "-";
    const pageOK = !href ? "-" : page ? "✓" : "✗";
    const explain = ex ? "✓" : "✗";
    if (c?.showTooltip && !href) missingLearn += 1;
    if (href && !page) brokenPage += 1;
    if (!ex) missingExplain += 1;
    console.log(
      [
        id.padEnd(24),
        tip.padEnd(7),
        learn.padEnd(5),
        pageOK.padEnd(6),
        explain.padEnd(7),
        c?.shortName ?? "MISSING",
      ].join(" | ")
    );
  }

  console.log("\nRegistry size:", LEARN_CONCEPTS.length);
  console.log(
    "With Learn pages:",
    LEARN_CONCEPTS.filter((c) => c.learnSlug).length
  );
  console.log(
    "Tooltip-enabled:",
    LEARN_CONCEPTS.filter((c) => c.showTooltip).length
  );
  console.log("Core missing explain:", missingExplain);
  console.log("Core broken Learn pages:", brokenPage);
  console.log("Core tooltip without Learn:", missingLearn);

  // Smoke-check column / ASK helpers (detectable wiring, not fragile AST)
  const columnChecks = ["TS%", "eFG%", "+/-", "USG%", "DARKO", "ORtg"];
  const columnOk = columnChecks.every((l) => conceptIdForColumnLabel(l));
  const factorOk = Boolean(conceptIdForFactorId("efg"));
  const askMetricOk = Boolean(conceptIdForAskMetric("ts_pct"));
  const askStatusOk = Boolean(conceptIdForAskStatus("insufficient_data"));
  console.log("\nHelper smoke:");
  console.log("  column labels → concepts:", columnOk ? "✓" : "✗");
  console.log("  factor id → concept:", factorOk ? "✓" : "✗");
  console.log("  ASK metricId → concept:", askMetricOk ? "✓" : "✗");
  console.log("  ASK status → concept:", askStatusOk ? "✓" : "✗");

  if (wantUi) {
    console.log("\nUI surfaces audited (hand-maintained):\n");
    for (const s of UI_SURFACES) {
      console.log(`· ${s.page}`);
      console.log(`    MetricHelp: ${s.metricHelp}`);
      console.log(`    PlayerIdentity: ${s.playerIdentity}`);
    }
  } else {
    console.log("\n(Tip: pass --ui for audited surface checklist)");
  }

  if (missingExplain || brokenPage || !columnOk || !factorOk || !askMetricOk || !askStatusOk) {
    process.exitCode = 1;
  } else {
    console.log("\nreport-learn-coverage: OK");
  }
}

main();
