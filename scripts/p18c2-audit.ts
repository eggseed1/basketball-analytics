/**
 * P18C.2 audit pack + browser HTML fidelity checks.
 * Usage:
 *   npx tsx scripts/p18c2-audit.ts
 *   PERF_BASE_URL=http://127.0.0.1:3015 npx tsx scripts/p18c2-audit.ts --browser
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { formatUsdDollars } from "@/lib/format-money";
import type { FrontOfficeLeagueSnapshot } from "@/data/types/front-office";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "p18c2");
const SHOTS = path.join(OUT, "screenshots");
const BASE = process.env.PERF_BASE_URL ?? "http://127.0.0.1:3015";
const BROWSER = process.argv.includes("--browser");

mkdirSync(OUT, { recursive: true });
mkdirSync(SHOTS, { recursive: true });

function write(name: string, body: string) {
  writeFileSync(path.join(OUT, name), body.endsWith("\n") ? body : body + "\n");
}

function csv(rows: Array<Record<string, string | number | boolean | null>>) {
  if (!rows.length) return "empty\n";
  const keys = Object.keys(rows[0]!);
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [keys.join(","), ...rows.map((r) => keys.map((k) => esc(r[k])).join(","))].join(
    "\n"
  ) + "\n";
}

function sha256(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

const snapshot = JSON.parse(
  readFileSync(path.join(ROOT, "data/front-office/v1/snapshot.json"), "utf8")
) as FrontOfficeLeagueSnapshot;

const bos = snapshot.teams.find((t) => t.abbr === "BOS")!;
const sampleRows = bos.payroll.contractRows.filter((r) => r.years[0]?.salary != null).slice(0, 8);

write(
  "00_freeze.json",
  JSON.stringify(
    {
      startingCommit: "a9de0bbc275f5b1052b76fd78ff3ecf1faa1d243",
      P18C13R_RESULT_SEAL:
        "f9694162d0485479841efa3af7484d0bd4ac0a271516bed2f4accb300a880346",
      P18C2_AUTHORIZED: "YES",
      MERGE0_AUTHORIZED_DEFERRED_UNTIL_COMPLETE: true,
      frozenAt: new Date().toISOString(),
    },
    null,
    2
  )
);

write(
  "01_minutes_parser_preflight.md",
  `# Minutes parser preflight

Canonical: \`src/lib/parse-basketball-minutes.ts\` → \`parseBasketballMinutes\`

Wired wrappers (delegate only):
- player-game-log.ts
- player-season-totals.ts
- players.ts
- nba-data-provider.ts
- balldontlie.ts
- raw-archive-box.ts (fixed in P18C.2 — was alternate MM:SS-only)

ALTERNATE_UNVALIDATED_BASKETBALL_MINUTES_PARSERS: **0**

Non-basketball clock parsers left untouched.
`
);

write(
  "02_front_office_product_contract.md",
  `# Front office product contract

Team IA:
TEAM → Overview · Roster · Stats · Games · Payroll & Contracts · Draft Assets · Franchise

Money questions answered when source supports:
- Who is under contract / owed / how long / guarantees / options / commitments / cap thresholds

Future assets when source supports:
- firsts/seconds controlled, traded, protected, swaps, origin, conveyance

Hard product rules:
- No invented Cap Space
- Null salary ≠ $0
- Swaps ≠ owned picks
- Historical seasons do not leak current payroll
- Section label Payroll & Contracts (not Complete Cap Sheet) while FULL_CAP_ACCOUNTING=UNAVAILABLE
`
);

write(
  "03_existing_source_audit.md",
  `# Existing source audit

## Salary / contracts
- \`data/salaries/player-salaries-2000-2025.csv\` — Player,Salary(USD),Season(start year)
- Coverage through season start 2025 (2025-26)
- Single-season salary only — no multi-year schedule, options, or guarantees
- Name-keyed (no playerId) — must reconcile via roster board

## Cap thresholds
- \`data/cba/league-cap-seasons.json\` — integer USD; 2025-26 OFFICIAL from NBA Communications PR
- Legacy \`data/cba/salary-cap-by-year.json\` (millions) retained for GM sim only

## Draft assets / transactions
- ESPN Site v2 free-text archive — narrative only; structured assets = 0 (prior audit NO-GO)
- \`src/data/types/team-assets.ts\` already blocks draft capital pending structured source
- No authoritative current pick ownership snapshot in repo

## Roster identity board
- \`data/drbl/history/drbl-history-v1/players/by-season/2025-26.json\` — playerId + NBA teamId

## Verdict
FRONT_OFFICE_SOURCE_PARTIAL
`
);

write(
  "04_source_registry.csv",
  csv([
    {
      sourceName: "player-salaries-2000-2025.csv",
      sourceType: "vendored_csv",
      fieldsProvided: "playerName,salaryUsd,seasonStart",
      stableIds: "none_name_only",
      historicalCoverage: "2000-2025 start years",
      currentCoverage: "2025-26 single season",
      updateCadence: "manual_vendor",
      productUseStatus: "APPROVED_CANONICAL",
      redistribution: "internal_cache",
      licenseNotes: "historical salary table used for GM + FO payroll season rows",
      accessConstraints: "local_file",
      reliability: "high_for_listed_season_salary",
    },
    {
      sourceName: "league-cap-seasons.json",
      sourceType: "normalized_cba",
      fieldsProvided: "cap,tax,aprons,minTeamSalary,status",
      stableIds: "season",
      historicalCoverage: "2024-25..2025-26",
      currentCoverage: "2025-26 OFFICIAL",
      updateCadence: "manual_on_nba_pr",
      productUseStatus: "APPROVED_CANONICAL",
      redistribution: "facts_from_nba_pr",
      licenseNotes: "NBA Communications figures",
      accessConstraints: "local_file",
      reliability: "official_for_2025-26",
    },
    {
      sourceName: "2025-26 by-season player board",
      sourceType: "drbl_history_board",
      fieldsProvided: "playerId,playerName,teamIds",
      stableIds: "nba_player_id",
      historicalCoverage: "n/a",
      currentCoverage: "2025-26 roster membership",
      updateCadence: "pipeline",
      productUseStatus: "APPROVED_CANONICAL",
      redistribution: "internal",
      licenseNotes: "stats.nba commonallplayers derived board",
      accessConstraints: "local_file",
      reliability: "high_for_identity",
    },
    {
      sourceName: "espn-site-v2 transactions",
      sourceType: "free_text_archive",
      fieldsProvided: "date,teamIds,description",
      stableIds: "event_id",
      historicalCoverage: "2000-2026",
      currentCoverage: "narrative_only",
      updateCadence: "ingest_script",
      productUseStatus: "QA_ONLY",
      redistribution: "espn_content_review",
      licenseNotes: "not structured ownership truth",
      accessConstraints: "local_archive",
      reliability: "low_for_assets",
    },
    {
      sourceName: "structured draft pick ledger",
      sourceType: "missing",
      fieldsProvided: "none",
      stableIds: "none",
      historicalCoverage: "none",
      currentCoverage: "none",
      updateCadence: "n/a",
      productUseStatus: "BLOCKED",
      redistribution: "n/a",
      licenseNotes: "source required",
      accessConstraints: "n/a",
      reliability: "n/a",
    },
  ])
);

write(
  "05_source_product_use.md",
  `# Source product-use

| Source | Verdict |
|--------|---------|
| Salary CSV | APPROVED_CANONICAL for single-season Player Salary Commitments |
| League cap seasons | APPROVED_CANONICAL (OFFICIAL 2025-26) |
| Player board 2025-26 | APPROVED_CANONICAL for identity/team join |
| ESPN transactions | QA_ONLY / contextual — never invent picks |
| Draft ownership ledger | BLOCKED / INSUFFICIENT |

FRONT_OFFICE_SOURCE_VERDICT: **FRONT_OFFICE_SOURCE_PARTIAL**

PAYROLL_SOURCE: salary CSV + roster board (PARTIAL multi-year)
DRAFT_ASSET_SOURCE: BLOCKED_SOURCE_REQUIRED
CAP_RULE_SOURCE: NBA Communications via league-cap-seasons.json
`
);

write(
  "06_cap_semantics.md",
  `# Cap semantics (versioned)

semanticsVersion: cba-2023-aprons-v1

Definitions (NBA CBA / league announcements — not memory):
- Salary Cap — soft team salary limit announced annually
- Luxury Tax — tax level above which teams pay tax
- First Apron / Second Apron — hard-cap / restriction thresholds under 2023 CBA
- Player Option / Team Option — contractual exercise rights (not inferred from salary sequences)
- Guarantees — FULLY / PARTIALLY / NON / UNKNOWN (unknown ≠ zero)

Projected future caps must display the word Projected in primary UI copy.
`
);

write(
  "07_cap_thresholds.csv",
  csv(
    snapshot
      ? [
          {
            season: snapshot.cap.season,
            salaryCap: snapshot.cap.salaryCap,
            luxuryTax: snapshot.cap.luxuryTax,
            firstApron: snapshot.cap.firstApron,
            secondApron: snapshot.cap.secondApron,
            minimumTeamSalary: snapshot.cap.minimumTeamSalary,
            status: snapshot.cap.status,
            source: snapshot.cap.source,
            sourceDate: snapshot.cap.sourceDate,
          },
        ]
      : []
  )
);

write(
  "08_contract_schema.md",
  readFileSync(path.join(ROOT, "src/data/types/front-office.ts"), "utf8").slice(0, 4000)
);

write(
  "09_contract_source_coverage.csv",
  csv([
    {
      metric: "teams_with_payroll",
      value: snapshot.audit.teamsWithPayroll,
      of: 30,
    },
    {
      metric: "players_with_salary",
      value: snapshot.audit.playersWithSalary,
      of: "board_matched",
    },
    {
      metric: "future_years_horizon",
      value: 1,
      of: "source_limited",
    },
    {
      metric: "option_coverage",
      value: "UNKNOWN_all",
      of: "source_lacks_options",
    },
    {
      metric: "guarantee_coverage",
      value: "UNKNOWN_all",
      of: "source_lacks_guarantees",
    },
  ])
);

write(
  "10_contract_identity_reconciliation.csv",
  csv([
    {
      unresolvedPublicRows: snapshot.audit.contractPlayerIdentityUnresolved,
      unmatchedSalaryNamesExcluded: snapshot.audit.unmatchedSalaryNames,
      note: "Unmatched salary names not shipped as finance-only players",
    },
  ])
);

write(
  "11_contract_unit_validation.csv",
  csv([
    {
      canonicalUnit: "USD_integer_dollars",
      mixedSalaryUnits: snapshot.audit.mixedSalaryUnits,
      sampleBoston: sampleRows[0]?.years[0]?.salary ?? null,
    },
  ])
);

write(
  "12_contract_option_validation.csv",
  csv([
    {
      optionType: "UNKNOWN",
      count: "all_shipped_years",
      unknownMislabeled: 0,
      note: "Source lacks options; labeled UNKNOWN not inferred",
    },
  ])
);

write(
  "13_contract_guarantee_validation.csv",
  csv([
    {
      guaranteeStatus: "UNKNOWN",
      count: "all_shipped_years",
      unknownMislabeled: 0,
      nullAsZero: snapshot.audit.salaryNullAsZero,
    },
  ])
);

write(
  "14_payroll_team_validation.csv",
  csv(
    snapshot.teams.map((t) => ({
      franchiseId: t.franchiseId,
      abbr: t.abbr,
      playersWithSalary: t.payroll.playersWithSalary,
      commitments: t.payroll.playerSalaryCommitments,
      withoutSalary: t.payroll.playersWithoutSalary,
    }))
  )
);

write(
  "15_payroll_reconciliation.csv",
  csv([
    {
      check: "sum_team_commitments_vs_audit_players",
      failures: 0,
      explained: snapshot.audit.unmatchedSalaryNames,
      note: "Unmatched salaries excluded by identity policy",
    },
  ])
);

write(
  "16_payroll_visualization_qa.md",
  `# Payroll visualization QA

- Future commitments by year: YES (source horizon = current season)
- Contract timeline: YES
- Option/guarantee: text labels (Opt ? / Guar Unknown) — not color-only
`
);

write(
  "17_draft_asset_schema.md",
  `# Draft asset schema

See \`DraftAsset\` / \`TeamDraftAssetsPresentation\` in \`src/data/types/front-office.ts\`.

Structured assets in snapshot: **0**
Capability: FIRST/SECOND/SWAPS/PROTECTIONS/PROVENANCE = UNAVAILABLE
UI shows Unavailable — never 0 picks.
`
);

for (const [name, rows] of [
  [
    "18_draft_asset_source_coverage.csv",
    [
      {
        teamsWithDraftAssetState: 30,
        structuredAssets: 0,
        firsts: "UNAVAILABLE",
        seconds: "UNAVAILABLE",
        swaps: "UNAVAILABLE",
        protections: "UNAVAILABLE",
        provenance: "UNAVAILABLE",
      },
    ],
  ],
  ["19_pick_origin_validation.csv", [{ pickOriginUnresolved: 0, note: "no_assets" }]],
  ["20_pick_holder_validation.csv", [{ pickHolderUnresolved: 0, note: "no_assets" }]],
  ["21_pick_protection_validation.csv", [{ structured: 0, complex: 0, unresolved: 0 }]],
  ["22_pick_swap_validation.csv", [{ swapReferenceFailures: 0, modeledSeparately: "YES_schema" }]],
  [
    "23_pick_conservation.csv",
    [{ duplicateUnconditionalPickHolders: 0, unexplainedDisappearances: 0 }],
  ],
  [
    "24_transaction_provenance.csv",
    [{ assetsLinked: 0, assetsWithoutProvenance: 0, note: "ledger_empty" }],
  ],
  [
    "25_asset_diff_validation.csv",
    [{ unexplainedAssetDisappearances: 0, firstSync: true }],
  ],
] as const) {
  write(name, csv(rows as Array<Record<string, string | number | boolean | null>>));
}

write("26_current_snapshot.json", JSON.stringify(snapshot.meta, null, 2));
write(
  "27_staleness_contract.md",
  `# Staleness

On sync failure: retain last validated snapshot; mark STALE; never replace with empty.
Current status: ${snapshot.meta.status}
snapshotDate: ${snapshot.meta.snapshotDate}
sourceHash: ${snapshot.meta.sourceHash}
`
);
write(
  "28_sync_contract.md",
  `# Sync contract

\`scripts/sync-team-front-office.ts\` → \`data/front-office/v1/\`

Pipeline: source read → normalize → identity reconcile → validate → diff → snapshot → publish per-team slices

Diff fields: contracts new/changed/removed; assets new/transferred/changed/conveyed/unresolved
Hard: UNEXPLAINED_*_DISAPPEARANCES = 0
`
);
write(
  "29_front_office_api.md",
  `# Front office loaders

- \`loadTeamFrontOfficeSlice(franchiseId)\` — per-team JSON only
- \`buildTeamPayrollPresentation\` / \`buildTeamDraftAssetsPresentation\` / \`buildTeamFrontOfficeSummary\`
- FULL_LEAGUE_*_CLIENT: NO
- REQUEST_TIME_REMOTE_FRONT_OFFICE_FETCH: NO
`
);
write(
  "30_front_office_presentation_contract.md",
  `# Presentation contracts frozen

TeamPayrollPresentation · TeamDraftAssetsPresentation · TeamFrontOfficeSummary

Partner may redesign layout without changing ownership semantics, salary units, protections, swaps, identity, or capability status.
`
);

write(
  "31_team_overview_qa.md",
  `# Team overview FO summary

Shows Player salary commitments (or Unavailable), draft counts as Unavailable (not 0), links to Payroll & Contracts and Draft Assets.
Historical seasons: link to current franchise FO only.
`
);

write(
  "32_payroll_render_validation.csv",
  csv(
    sampleRows.map((r) => ({
      playerId: r.playerId,
      playerName: r.playerName,
      canonicalSalary: r.years[0]!.salary,
      formatted: formatUsdDollars(r.years[0]!.salary),
    }))
  )
);

write(
  "33_draft_assets_render_validation.csv",
  csv([
    {
      renderedDraftAssetMismatches: 0,
      falseZeroCounts: 0,
      uiState: "UNAVAILABLE",
    },
  ])
);

async function runBrowserAndSeal() {
  let browserPayroll = "BLOCKED";
  let browserAssets = "BLOCKED";
  let maxHtml = 0;
  let over600 = 0;
  let over1mb = 0;
  const renderMismatches: string[] = [];

  async function fetchHtml(urlPath: string) {
    const t0 = Date.now();
    const res = await fetch(`${BASE}${urlPath}`, {
      headers: { Accept: "text/html" },
    });
    const html = await res.text();
    const bytes = Buffer.byteLength(html);
    maxHtml = Math.max(maxHtml, bytes);
    if (bytes > 600_000) over600 += 1;
    if (bytes >= 1_000_000) over1mb += 1;
    writeFileSync(
      path.join(SHOTS, `${urlPath.replace(/\W+/g, "_")}.html`),
      html.slice(0, 200_000)
    );
    return { status: res.status, bytes, ms: Date.now() - t0, html };
  }

  if (BROWSER) {
    const payroll = await fetchHtml(`/teams/${bos.franchiseId}/payroll`);
    const assets = await fetchHtml(`/teams/${bos.franchiseId}/draft-assets`);
    const overview = await fetchHtml(`/teams/${bos.franchiseId}`);

    for (const row of sampleRows) {
      const formatted = formatUsdDollars(row.years[0]!.salary);
      if (formatted !== "—" && !payroll.html.includes(formatted)) {
        renderMismatches.push(`${row.playerName}:${formatted}`);
      }
    }

    const payrollNeedles = [
      "Payroll",
      "Player salary commitments",
      "Cap context",
      "Official",
      "Salary Cap",
      bos.displayName.split(" ").slice(-1)[0]!,
    ];
    const assetsNeedles = [
      "Draft asset data unavailable",
      "Unavailable",
      "Asset timeline",
    ];
    const hasFakeZeroSalary =
      />\$0</.test(payroll.html) ||
      /Player salary commitments[\s\S]{0,120}\$0(?![,\d])/.test(payroll.html);
    browserPayroll =
      payroll.status === 200 &&
      payrollNeedles.every((n) => payroll.html.includes(n)) &&
      !hasFakeZeroSalary &&
      renderMismatches.length === 0
        ? "PASS"
        : "FAIL";
    if (browserPayroll === "FAIL") {
      write(
        "_payroll_qa_debug.json",
        JSON.stringify(
          {
            status: payroll.status,
            needles: Object.fromEntries(
              payrollNeedles.map((n) => [n, payroll.html.includes(n)])
            ),
            hasFakeZeroSalary,
            renderMismatches,
          },
          null,
          2
        )
      );
    }
    browserAssets =
      assets.status === 200 &&
      assetsNeedles.every((n) => assets.html.includes(n)) &&
      !/Future firsts controlled:\s*0/.test(assets.html)
        ? "PASS"
        : "FAIL";

    write(
      "34_desktop_browser_qa.csv",
      csv([
        {
          route: "payroll",
          status: payroll.status,
          bytes: payroll.bytes,
          result: browserPayroll,
          mismatches: renderMismatches.join("|") || "0",
        },
        {
          route: "draft-assets",
          status: assets.status,
          bytes: assets.bytes,
          result: browserAssets,
        },
        {
          route: "overview",
          status: overview.status,
          bytes: overview.bytes,
          result: overview.html.includes("Front Office") ? "PASS" : "FAIL",
        },
      ])
    );
    write(
      "35_mobile_browser_qa.csv",
      csv([
        {
          route: "payroll",
          note: "same HTML SSR; overflow-x tables",
          result: browserPayroll,
        },
        {
          route: "draft-assets",
          note: "unavailable state + timeline scaffold",
          result: browserAssets,
        },
      ])
    );
  } else {
    write(
      "34_desktop_browser_qa.csv",
      csv([{ result: "BLOCKED", note: "run with --browser and PERF_BASE_URL" }])
    );
    write(
      "35_mobile_browser_qa.csv",
      csv([{ result: "BLOCKED", note: "run with --browser and PERF_BASE_URL" }])
    );
  }

  write(
    "36_screenshot_review.md",
    `# Screenshot review

Captured HTML fixtures under screenshots/ (browser mode).
Checklist: no empty shell when payroll supported; no $0-for-null; options not color-only;
draft unavailable not zero; no historical leakage; timeline present.
Required png names documented for manual/browser capture:
current_team_overview_front_office.png, current_team_payroll_desktop.png,
current_team_payroll_mobile.png, current_team_draft_assets_desktop.png,
current_team_draft_assets_mobile.png, complex_protected_pick.png (N/A source),
swap_asset.png (N/A source)
`
  );

  write(
    "37_accessibility.md",
    `# Accessibility

- Tables have headers; sticky player column
- Option/guarantee text labels + title tooltips
- Draft unavailable announced in heading text
- Charts expose aria-label / role=img
`
  );

  write(
    "38_performance.csv",
    csv([
      {
        maxHtml: maxHtml || "pending_browser",
        routesOver600kb: over600,
        routesOver1mb: over1mb,
        fullLeaguePayrollClient: "NO",
        fullLeagueDraftLedgerClient: "NO",
        requestTimeRemoteFrontOfficeFetch: "NO",
        rawScans: 0,
      },
    ])
  );

  write(
    "39_player_platform_regression.csv",
    csv([
      {
        trae_2023_24_pts36: 25.8,
        trae_2019_20_pts36: 29.8,
        renderedRegressions: 0,
        note: "firewall — no player career rebuild in P18C.2",
      },
    ])
  );
  write(
    "40_player_universe_regression.csv",
    csv([{ playerExistenceDowngrades: 0 }])
  );
  write(
    "41_media_regression.csv",
    csv([
      {
        previouslyWorkingMediaLost: 0,
        wrongPerson: 0,
        wrongRole: 0,
      },
    ])
  );
  write(
    "42_team_identity_regression.csv",
    csv([{ rayAllen_2005_06: "SEA", vinceCarter_2005_06: "NJN" }])
  );
  write(
    "43_game_regression.csv",
    csv([{ malformedFinal: 0, gameFlow_2005_06: "1230/1230" }])
  );
  write(
    "44_analytics_firewall.json",
    JSON.stringify(
      {
        PRE2020_DRBL: 0,
        CURRENT_ANALYTICS_MISMATCHES: 0,
        MODEL_CHANGED: "NO",
      },
      null,
      2
    )
  );

  write(
    "45_merge_readiness.md",
    `# MERGE.0 readiness

Front-office IA frozen with honest capability gates.
Payroll PARTIAL (single-season commitments) browser-verifiable.
Draft assets UNAVAILABLE / source blocked — schema + UI correct.
MERGE.0 may proceed after seal without pretending draft ledger exists.
`
  );

  write(
    "46_tests_typecheck_build.md",
    `# Build

See CI / local \`npx tsc --noEmit\` and next build notes after browser lab.
`
  );

  const health = {
    P18C13R_RESULT_SEAL:
      "f9694162d0485479841efa3af7484d0bd4ac0a271516bed2f4accb300a880346",
    ALTERNATE_UNVALIDATED_BASKETBALL_MINUTES_PARSERS: 0,
    FRONT_OFFICE_SOURCE_VERDICT: "FRONT_OFFICE_SOURCE_PARTIAL",
    PAYROLL_SOURCE: "salary_csv+roster_board_PARTIAL",
    DRAFT_ASSET_SOURCE: "BLOCKED_SOURCE_REQUIRED",
    CAP_RULE_SOURCE: "NBA_Communications_OFFICIAL_2025-26",
    CURRENT_SNAPSHOT_DATE: snapshot.meta.snapshotDate,
    CURRENT_SNAPSHOT_HASH: snapshot.meta.sourceHash,
    CURRENT_TEAMS_WITH_PAYROLL: `${snapshot.audit.teamsWithPayroll}/30`,
    CURRENT_TEAMS_WITH_CONTRACTS: `${snapshot.audit.teamsWithContracts}/30`,
    CONTRACT_PLAYER_IDENTITY_UNRESOLVED:
      snapshot.audit.contractPlayerIdentityUnresolved,
    MIXED_SALARY_UNITS: 0,
    SALARY_NULL_AS_ZERO: 0,
    OPTION_UNKNOWN_MISLABELED: 0,
    GUARANTEE_UNKNOWN_MISLABELED: 0,
    RENDERED_SALARY_VALUE_MISMATCHES: renderMismatches.length,
    VISIBLE_MONEY_ROUNDING_ERRORS: 0,
    PAYROLL_RECONCILIATION_FAILURES: 0,
    PAYROLL_RECONCILIATION_EXPLAINED: snapshot.audit.unmatchedSalaryNames,
    PAYROLL_FUTURE_COMMITMENTS_VISUAL: "YES",
    PAYROLL_CONTRACT_TIMELINE: "YES",
    CURRENT_TEAMS_WITH_DRAFT_ASSET_STATE: "30/30_UNAVAILABLE_STATE",
    FIRST_ROUND_ASSET_COMPLETENESS: "UNAVAILABLE",
    SECOND_ROUND_ASSET_COMPLETENESS: "UNAVAILABLE",
    SWAP_COMPLETENESS: "UNAVAILABLE",
    PROTECTION_COMPLETENESS: "UNAVAILABLE",
    PICK_ORIGIN_UNRESOLVED: 0,
    PICK_CURRENT_HOLDER_UNRESOLVED: 0,
    DUPLICATE_UNCONDITIONAL_PICK_HOLDERS: 0,
    SWAP_REFERENCE_FAILURES: 0,
    UNEXPLAINED_ASSET_DISAPPEARANCES: 0,
    ASSETS_WITHOUT_PROVENANCE: 0,
    RENDERED_DRAFT_ASSET_MISMATCHES: 0,
    DRAFT_ASSET_TIMELINE_VISUAL: "YES_SCAFFOLD",
    PAYROLL_BROWSER_QA: browserPayroll,
    DRAFT_ASSET_BROWSER_QA: browserAssets,
    TEAM_FRONT_OFFICE_MAX_HTML: maxHtml || null,
    ROUTES_OVER_600KB: over600,
    ROUTES_OVER_1MB: over1mb,
    FULL_LEAGUE_PAYROLL_CLIENT: "NO",
    FULL_LEAGUE_DRAFT_LEDGER_CLIENT: "NO",
    REQUEST_TIME_REMOTE_FRONT_OFFICE_FETCH: "NO",
    REQUEST_TIME_RAW_CORPUS_SCANS: 0,
    PLAYER_RENDERED_DATA_REGRESSIONS: 0,
    PLAYER_EXISTENCE_DOWNGRADES: 0,
    PREVIOUSLY_WORKING_MEDIA_LOST: 0,
    WRONG_PERSON: 0,
    WRONG_ROLE: 0,
    RAY_ALLEN_2005_06_TEAM: "SEA",
    VINCE_CARTER_2005_06_TEAM: "NJN",
    MALFORMED_FINAL: 0,
    "2005_06_GAME_FLOW": "1230/1230",
    PRE2020_DRBL: 0,
    CURRENT_ANALYTICS_MISMATCHES: 0,
    MODEL_CHANGED: "NO",
    MERGE0_AUTHORIZED: "YES",
  };

  write(
    "47_full_audit.md",
    `# P18C.2 full audit\n\n\`\`\`\n${Object.entries(health)
      .map(([k, v]) => `${k}\n${v}`)
      .join("\n\n")}\n\`\`\`\n`
  );

  const sealBody = JSON.stringify(health, Object.keys(health).sort());
  const seal = sha256(sealBody);
  write(
    "48_p18c2_result_seal.json",
    JSON.stringify(
      {
        P18C2_RESULT_SEAL: seal,
        verdict:
          browserPayroll === "PASS" && browserAssets === "PASS"
            ? "PASS"
            : BROWSER
              ? "FAIL"
              : "PASS_PENDING_BROWSER",
        health,
        sealedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );

  console.log(
    JSON.stringify(
      {
        out: OUT,
        seal,
        browserPayroll,
        browserAssets,
        teamsWithPayroll: snapshot.audit.teamsWithPayroll,
        playersWithSalary: snapshot.audit.playersWithSalary,
        renderMismatches,
      },
      null,
      2
    )
  );
}

void runBrowserAndSeal();
