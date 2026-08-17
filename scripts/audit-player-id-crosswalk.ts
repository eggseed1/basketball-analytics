/**
 * P17.1 identity hardening — audit + reclassify ESPN↔NBA player aliases.
 *
 * Does NOT invent new id mappings or fame-match. Does NOT touch DRBL model math.
 *
 * Evidence hierarchy (production auto-join):
 *   APPROVED: EXACT_PROVIDER_MAPPING | VERIFIED_MULTI_FIELD | HIGH_CONFIDENCE_MULTI_FIELD
 *   NOT approved (kept in file, flagged): UNIQUE_NAME_ONLY | AMBIGUOUS | UNRESOLVED
 *
 * Writes:
 *   - data/impact/player-id-aliases.json (confidence/matchMethod/productionApproved)
 *   - reports/product_completeness_v1_1/01_player_alias_evidence.csv
 *   - reports/product_completeness_v1_1/02_player_crosswalk_freeze.json
 *   - reports/product_completeness_v1_1/03_static_join_coverage.csv
 *   - reports/product_completeness_v1_1/04_live_join_coverage.json
 *
 * Run: npx tsx scripts/audit-player-id-crosswalk.ts
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { NBA_TEAM_META } from "../src/data/providers/nba/nba-team-meta";
import { espnYearFromCanonicalSeason } from "../src/data/providers/nba/season";
import { TEAM_BRANDS } from "../src/lib/nba-brand";
import { normalizePlayerName } from "../src/lib/player-name";

const DRBL_SEASONS = [
  "2020-21",
  "2021-22",
  "2022-23",
  "2023-24",
  "2024-25",
  "2025-26",
] as const;

const ESPN_BOARD_SEASONS = ["2024-25", "2025-26"] as const;
const SITE_WEB = "https://site.web.api.espn.com";
const CROSSWALK_VERSION = "player-crosswalk-v1.1";
const TARGET_NBA_ID = "1642935";

const APPROVED_CLASSES = new Set([
  "EXACT_PROVIDER_MAPPING",
  "VERIFIED_MULTI_FIELD",
  "HIGH_CONFIDENCE_MULTI_FIELD",
]);

type AliasIn = {
  espnPlayerId: string;
  nbaPlayerId: string;
  playerName?: string;
  matchMethod?: string;
  confidence?: string;
  productionApproved?: boolean;
};

type SeasonTeamHit = {
  id: string;
  season: string;
  name: string;
  teamCanon: string | null;
  possessions: number | null;
};

type EvidenceClass =
  | "EXACT_PROVIDER_MAPPING"
  | "VERIFIED_MULTI_FIELD"
  | "HIGH_CONFIDENCE_MULTI_FIELD"
  | "UNIQUE_NAME_ONLY"
  | "AMBIGUOUS"
  | "UNRESOLVED";

type EvidenceRow = {
  espnPlayerId: string;
  nbaPlayerId: string;
  playerName: string;
  normalizedName: string;
  priorConfidence: string;
  priorMatchMethod: string;
  evidenceClass: EvidenceClass;
  confidence: EvidenceClass;
  matchMethod: string;
  productionApproved: boolean;
  drblSeasons: string;
  espnSeasons: string;
  teamOverlapSeasons: string;
  teamOverlapCount: number;
  uniqueNameInDrbl: boolean;
  uniqueNameInEspn: boolean;
  birthDateEspn: string;
  birthDateNba: string;
  birthDateMatch: string;
  notes: string;
};

function buildNbaStatsToEspnTeamId(): Map<string, string> {
  const byAbbr = new Map<string, string>();
  for (const brand of Object.values(TEAM_BRANDS)) {
    byAbbr.set(brand.abbr.toUpperCase(), brand.espnTeamId);
  }
  const out = new Map<string, string>();
  for (const [nbaId, meta] of Object.entries(NBA_TEAM_META)) {
    const espn = byAbbr.get(meta.abbreviation.toUpperCase());
    if (espn) out.set(nbaId, espn);
  }
  return out;
}

function csvEscape(value: string | number | boolean): string {
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function loadDrblByNba(
  nbaToEspn: Map<string, string>
): Promise<Map<string, SeasonTeamHit[]>> {
  const byNba = new Map<string, SeasonTeamHit[]>();
  for (const season of DRBL_SEASONS) {
    const file = path.join(
      process.cwd(),
      "src",
      "data",
      "drbl",
      "precomputed",
      `${season}.json`
    );
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw) as {
      players?: Array<{
        playerId?: string;
        playerName?: string;
        teamId?: string;
        possessions?: number;
        actualPossessions?: number;
      }>;
    };
    for (const p of parsed.players ?? []) {
      if (!p.playerId || !p.playerName) continue;
      const id = String(p.playerId);
      const teamRaw = p.teamId != null ? String(p.teamId) : "";
      const list = byNba.get(id) ?? [];
      list.push({
        id,
        season,
        name: String(p.playerName),
        teamCanon: teamRaw ? nbaToEspn.get(teamRaw) ?? null : null,
        possessions:
          typeof p.actualPossessions === "number"
            ? p.actualPossessions
            : typeof p.possessions === "number"
              ? p.possessions
              : null,
      });
      byNba.set(id, list);
    }
  }
  return byNba;
}

async function fetchEspnBoards(): Promise<{
  byAthlete: Map<string, SeasonTeamHit[]>;
  nameHits: Array<{ id: string; name: string }>;
  ok: boolean;
  rowCount: number;
  errors: string[];
}> {
  const byAthlete = new Map<string, SeasonTeamHit[]>();
  const nameHits: Array<{ id: string; name: string }> = [];
  const errors: string[] = [];
  let ok = false;
  let rowCount = 0;

  for (const season of ESPN_BOARD_SEASONS) {
    const year = espnYearFromCanonicalSeason(season);
    const url =
      `${SITE_WEB}/apis/common/v3/sports/basketball/nba/statistics/byathlete` +
      `?region=us&lang=en&contentorigin=espn&season=${year}&seasontype=2&limit=1000`;
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(12_000),
        headers: { "User-Agent": "drbl-crosswalk-audit/1.1" },
      });
      if (!res.ok) {
        errors.push(`${season}: HTTP ${res.status}`);
        continue;
      }
      const payload = (await res.json()) as {
        athletes?: Array<{
          athlete?: {
            id?: string | number;
            displayName?: string;
            teamId?: string | number;
          };
        }>;
      };
      ok = true;
      for (const row of payload.athletes ?? []) {
        const a = row.athlete;
        const id = a?.id != null ? String(a.id) : "";
        const name = a?.displayName?.trim() ?? "";
        if (!id || !name) continue;
        rowCount++;
        const hit: SeasonTeamHit = {
          id,
          season,
          name,
          teamCanon: a?.teamId != null ? String(a.teamId) : null,
          possessions: null,
        };
        const list = byAthlete.get(id) ?? [];
        list.push(hit);
        byAthlete.set(id, list);
        nameHits.push({ id, name });
      }
    } catch (e) {
      errors.push(`${season}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { byAthlete, nameHits, ok, rowCount, errors };
}

function nameUniqueness(hits: Array<{ id: string; name: string }>): {
  unique: Set<string>;
  ambiguous: Set<string>;
} {
  const buckets = new Map<string, Set<string>>();
  for (const h of hits) {
    const key = normalizePlayerName(h.name);
    if (!key) continue;
    const set = buckets.get(key) ?? new Set<string>();
    set.add(h.id);
    buckets.set(key, set);
  }
  const unique = new Set<string>();
  const ambiguous = new Set<string>();
  for (const [key, ids] of buckets) {
    if (ids.size === 1) unique.add(key);
    else ambiguous.add(key);
  }
  return { unique, ambiguous };
}

function classify(args: {
  priorConfidence: string;
  uniqueName: boolean;
  teamOverlapCount: number;
  birthDateMatch: boolean | null;
}): { evidenceClass: EvidenceClass; matchMethod: string; notes: string } {
  if (args.priorConfidence === "EXACT_PROVIDER_MAPPING") {
    return {
      evidenceClass: "EXACT_PROVIDER_MAPPING",
      matchMethod: "exact_provider_mapping",
      notes: "Preserved exact provider mapping",
    };
  }
  if (!args.uniqueName) {
    return {
      evidenceClass: "AMBIGUOUS",
      matchMethod: "name_collision",
      notes: "Normalized name not unique in DRBL or ESPN corpus",
    };
  }
  if (
    args.teamOverlapCount >= 2 ||
    (args.teamOverlapCount >= 1 && args.birthDateMatch === true)
  ) {
    return {
      evidenceClass: "VERIFIED_MULTI_FIELD",
      matchMethod:
        args.birthDateMatch === true
          ? "unique_name_team_overlap_birth"
          : "unique_name_multi_season_team_overlap",
      notes:
        args.birthDateMatch === true
          ? "Unique name + team overlap + birth date match"
          : "Unique name + team overlap in 2+ seasons",
    };
  }
  if (args.teamOverlapCount >= 1) {
    return {
      evidenceClass: "HIGH_CONFIDENCE_MULTI_FIELD",
      matchMethod: "unique_name_same_season_team",
      notes:
        "Unique name + same canonical team in at least one shared season",
    };
  }
  return {
    evidenceClass: "UNIQUE_NAME_ONLY",
    matchMethod: "unique_name_only",
    notes:
      "Unique normalized name only; no same-season team overlap evidence",
  };
}

async function measureLiveJoinCoverage(args: {
  aliasPath: string;
  espnBoardOk: boolean;
  espnBoardErrors: string[];
}): Promise<Record<string, unknown>> {
  const report: Record<string, unknown> = {
    season: "2025-26",
    measuredAt: new Date().toISOString(),
    note: "Counts hasValidDrblEstimate after overlay; never fabricated",
  };

  try {
    process.env.DATA_PROVIDER = "nba";
    const { resetDataProvider } = await import("../src/data/providers/index");
    resetDataProvider();
    const { clearPlayerIdAliasCache } = await import(
      "../src/data/identity/player-identity"
    );
    clearPlayerIdAliasCache();
    const { getFilteredPlayerSeasonsDetailed } = await import(
      "../src/data/queries/players"
    );
    const { hasValidDrblEstimate } = await import(
      "../src/data/queries/percentiles"
    );
    const { rows, error } = await getFilteredPlayerSeasonsDetailed({
      season: "2025-26",
    });
    const withDrbl = rows.filter(hasValidDrblEstimate).length;
    report.nbaIdBoardPath = {
      status: error && rows.length === 0 ? "ERROR" : "OK",
      boardRows: rows.length,
      hasValidDrblEstimate: withDrbl,
      joinRate: rows.length ? withDrbl / rows.length : null,
      error:
        error instanceof Error ? error.message : error ? String(error) : null,
      note: "NBA Stats PLAYER_ID board joins DRBL by direct id; alias gate mainly affects ESPN→NBA",
    };
  } catch (e) {
    report.nbaIdBoardPath = {
      status: "ERROR",
      error: e instanceof Error ? e.message : String(e),
    };
  }

  if (!args.espnBoardOk) {
    report.espnBoardPath = {
      status: "LIVE_ESPN_SEPARATE",
      measured: false,
      reason: args.espnBoardErrors.join("; ") || "ESPN byathlete unavailable",
    };
    report.mode = "LIVE_ESPN_SEPARATE";
    return report;
  }

  try {
    const aliases = JSON.parse(await readFile(args.aliasPath, "utf8")) as {
      aliases: AliasIn[];
    };
    const espnToNba = new Map(
      (aliases.aliases ?? [])
        .filter(
          (a) =>
            a.productionApproved === true ||
            APPROVED_CLASSES.has(String(a.confidence ?? ""))
        )
        .map((a) => [String(a.espnPlayerId), String(a.nbaPlayerId)] as const)
    );
    const approvedEspn = new Set(espnToNba.keys());
    const year = espnYearFromCanonicalSeason("2025-26");
    const url =
      `${SITE_WEB}/apis/common/v3/sports/basketball/nba/statistics/byathlete` +
      `?region=us&lang=en&contentorigin=espn&season=${year}&seasontype=2&limit=1000`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(12_000),
      headers: { "User-Agent": "drbl-crosswalk-audit/1.1" },
    });
    if (!res.ok) {
      report.espnBoardPath = {
        status: "LIVE_ESPN_SEPARATE",
        measured: false,
        reason: `HTTP ${res.status}`,
      };
      report.mode = "LIVE_ESPN_SEPARATE";
      return report;
    }
    const payload = (await res.json()) as {
      athletes?: Array<{ athlete?: { id?: string | number } }>;
    };
    const espnIds = (payload.athletes ?? [])
      .map((r) => (r.athlete?.id != null ? String(r.athlete.id) : ""))
      .filter(Boolean);
    const drbl = JSON.parse(
      await readFile(
        path.join(process.cwd(), "src/data/drbl/precomputed/2025-26.json"),
        "utf8"
      )
    ) as { players?: Array<{ playerId?: string }> };
    const drblIds = new Set(
      (drbl.players ?? []).map((p) => String(p.playerId)).filter(Boolean)
    );
    let joinable = 0;
    for (const espnId of espnIds) {
      const nba = espnToNba.get(espnId);
      if (nba && drblIds.has(nba)) joinable++;
    }
    report.espnBoardPath = {
      status: "OK",
      boardRows: espnIds.length,
      productionApprovedAliasesOnBoard: espnIds.filter((id) =>
        approvedEspn.has(id)
      ).length,
      estimatedDrblJoinViaApprovedAlias: joinable,
      joinRate: espnIds.length ? joinable / espnIds.length : null,
      methodology:
        "ESPN byathlete ids ∩ productionApproved aliases ∩ DRBL precomputed nba ids (static estimate; not fabricated)",
    };
    report.mode = "ESPN_AND_NBA_MEASURED";
  } catch (e) {
    report.espnBoardPath = {
      status: "LIVE_ESPN_SEPARATE",
      measured: false,
      reason: e instanceof Error ? e.message : String(e),
    };
    report.mode = "LIVE_ESPN_SEPARATE";
  }

  return report;
}

async function main() {
  const reportDir = path.join(
    process.cwd(),
    "reports",
    "product_completeness_v1_1"
  );
  await mkdir(reportDir, { recursive: true });

  const aliasPath = path.join(
    process.cwd(),
    "data",
    "impact",
    "player-id-aliases.json"
  );
  const aliasRawText = await readFile(aliasPath, "utf8");
  const aliasShaBefore = createHash("sha256")
    .update(aliasRawText)
    .digest("hex");
  const aliasFile = JSON.parse(aliasRawText) as {
    generatedAt?: string;
    source?: string;
    seasons?: string[];
    policy?: string;
    aliases?: AliasIn[];
  };
  const aliasesIn = Array.isArray(aliasFile.aliases) ? aliasFile.aliases : [];

  const nbaToEspn = buildNbaStatsToEspnTeamId();
  const drblByNba = await loadDrblByNba(nbaToEspn);
  const espnBoard = await fetchEspnBoards();

  const drblNameHits: Array<{ id: string; name: string }> = [];
  for (const [id, seasons] of drblByNba) {
    for (const s of seasons) drblNameHits.push({ id, name: s.name });
  }
  const drblNameIdx = nameUniqueness(drblNameHits);
  const espnNameIdx = nameUniqueness(espnBoard.nameHits);

  const evidenceRows: EvidenceRow[] = [];
  const aliasesOut: Array<AliasIn & { productionApproved: boolean }> = [];

  for (const a of aliasesIn) {
    const espnId = String(a.espnPlayerId).trim();
    const nbaId = String(a.nbaPlayerId).trim();
    const playerName = (a.playerName ?? "").trim() || espnId;
    const normalized = normalizePlayerName(playerName);
    const drblSeasons = drblByNba.get(nbaId) ?? [];
    const espnSeasons = espnBoard.byAthlete.get(espnId) ?? [];

    const overlap: string[] = [];
    for (const e of espnSeasons) {
      const d = drblSeasons.find((x) => x.season === e.season);
      if (d && e.teamCanon && d.teamCanon && e.teamCanon === d.teamCanon) {
        overlap.push(e.season);
      }
    }

    const uniqueNameEffective =
      espnBoard.ok && espnBoard.nameHits.length > 0
        ? Boolean(normalized) &&
          drblNameIdx.unique.has(normalized) &&
          espnNameIdx.unique.has(normalized)
        : Boolean(normalized) &&
          (drblNameIdx.unique.has(normalized) ||
            a.confidence === "HIGH_CONFIDENCE_UNIQUE_NAME" ||
            Boolean(a.matchMethod?.includes("unique_name")));

    const classified = classify({
      priorConfidence: a.confidence ?? "",
      uniqueName: uniqueNameEffective,
      teamOverlapCount: overlap.length,
      birthDateMatch: null,
    });

    const productionApproved = APPROVED_CLASSES.has(classified.evidenceClass);
    const notesExtra: string[] = [classified.notes];
    if (!espnBoard.ok) {
      notesExtra.push("ESPN_BOARD_UNAVAILABLE_FOR_TEAM_EVIDENCE");
    } else if (espnSeasons.length === 0) {
      notesExtra.push("espn_id_not_on_fetched_boards");
    }
    if (drblSeasons.length === 0) {
      notesExtra.push("nba_id_not_in_drbl_precomputed");
    }

    evidenceRows.push({
      espnPlayerId: espnId,
      nbaPlayerId: nbaId,
      playerName,
      normalizedName: normalized,
      priorConfidence: a.confidence ?? "",
      priorMatchMethod: a.matchMethod ?? "",
      evidenceClass: classified.evidenceClass,
      confidence: classified.evidenceClass,
      matchMethod: classified.matchMethod,
      productionApproved,
      drblSeasons: drblSeasons.map((s) => s.season).join("|"),
      espnSeasons: espnSeasons.map((s) => s.season).join("|"),
      teamOverlapSeasons: overlap.join("|"),
      teamOverlapCount: overlap.length,
      uniqueNameInDrbl: drblNameIdx.unique.has(normalized),
      uniqueNameInEspn:
        espnBoard.nameHits.length === 0
          ? false
          : espnNameIdx.unique.has(normalized),
      birthDateEspn: "",
      birthDateNba: "",
      birthDateMatch: "unavailable",
      notes: notesExtra.join("; "),
    });

    aliasesOut.push({
      espnPlayerId: espnId,
      nbaPlayerId: nbaId,
      playerName,
      matchMethod: classified.matchMethod,
      confidence: classified.evidenceClass,
      productionApproved,
    });
  }

  aliasesOut.sort((a, b) =>
    (a.playerName ?? "").localeCompare(b.playerName ?? "")
  );
  evidenceRows.sort((a, b) => a.playerName.localeCompare(b.playerName));

  const countsByClass: Record<string, number> = {};
  for (const r of evidenceRows) {
    countsByClass[r.evidenceClass] = (countsByClass[r.evidenceClass] ?? 0) + 1;
  }
  const productionApprovedCount = evidenceRows.filter(
    (r) => r.productionApproved
  ).length;

  const hepburnDrbl = drblByNba.get(TARGET_NBA_ID) ?? [];
  const hepburnAlias = aliasesIn.find(
    (a) => String(a.nbaPlayerId) === TARGET_NBA_ID
  );
  const hepburnName = hepburnDrbl[0]?.name ?? "Chucky Hepburn";
  const hepburnNorm = normalizePlayerName(hepburnName);
  const hepburnEspnHits: SeasonTeamHit[] = [];
  for (const hits of espnBoard.byAthlete.values()) {
    for (const h of hits) {
      if (normalizePlayerName(h.name) === hepburnNorm) hepburnEspnHits.push(h);
    }
  }
  const hepburnEspnIds = [...new Set(hepburnEspnHits.map((h) => h.id))];
  let targetStatus: "RESOLVED" | "UNRESOLVED" | "AMBIGUOUS" = "UNRESOLVED";
  if (hepburnEspnIds.length > 1) targetStatus = "AMBIGUOUS";
  else if (hepburnEspnIds.length === 1 && hepburnAlias) targetStatus = "RESOLVED";
  else targetStatus = "UNRESOLVED";

  const targetInvestigation = {
    nbaPlayerId: TARGET_NBA_ID,
    playerName: hepburnName,
    normalizedName: hepburnNorm,
    drblSeasons: hepburnDrbl.map((s) => ({
      season: s.season,
      teamCanon: s.teamCanon,
      possessions: s.possessions,
    })),
    espnBoardNameHits: hepburnEspnHits.map((h) => ({
      espnPlayerId: h.id,
      season: h.season,
      teamCanon: h.teamCanon,
    })),
    aliasPresent: Boolean(hepburnAlias),
    status: targetStatus,
    rationale:
      hepburnEspnIds.length === 0
        ? "Present in DRBL 2025-26; no ESPN byathlete board row with matching unique name; no alias invented"
        : hepburnEspnIds.length > 1
          ? "Multiple ESPN athlete ids share the normalized name"
          : "Unique ESPN name hit exists but alias file has no mapping; P17.1 does not invent IDs",
  };

  const aliasesPayload = {
    generatedAt: new Date().toISOString(),
    source: aliasFile.source ?? (espnBoard.ok ? "byathlete" : "prior_alias_file"),
    seasons: [...DRBL_SEASONS],
    crosswalkVersion: CROSSWALK_VERSION,
    policy:
      "P17.1: productionApproved only for EXACT_PROVIDER_MAPPING | VERIFIED_MULTI_FIELD | HIGH_CONFIDENCE_MULTI_FIELD. UNIQUE_NAME_ONLY retained but not used for silent production joins. No invented IDs.",
    priorSha256: aliasShaBefore,
    aliases: aliasesOut,
  };
  const aliasesText = JSON.stringify(aliasesPayload, null, 2) + "\n";
  await writeFile(aliasPath, aliasesText, "utf8");
  const aliasShaAfter = createHash("sha256").update(aliasesText).digest("hex");

  const evidenceHeader = [
    "espnPlayerId",
    "nbaPlayerId",
    "playerName",
    "normalizedName",
    "priorConfidence",
    "priorMatchMethod",
    "evidenceClass",
    "confidence",
    "matchMethod",
    "productionApproved",
    "drblSeasons",
    "espnSeasons",
    "teamOverlapSeasons",
    "teamOverlapCount",
    "uniqueNameInDrbl",
    "uniqueNameInEspn",
    "birthDateEspn",
    "birthDateNba",
    "birthDateMatch",
    "notes",
  ].join(",");
  const evidenceLines = evidenceRows.map((r) =>
    [
      r.espnPlayerId,
      r.nbaPlayerId,
      csvEscape(r.playerName),
      r.normalizedName,
      r.priorConfidence,
      r.priorMatchMethod,
      r.evidenceClass,
      r.confidence,
      r.matchMethod,
      r.productionApproved,
      csvEscape(r.drblSeasons),
      csvEscape(r.espnSeasons),
      csvEscape(r.teamOverlapSeasons),
      r.teamOverlapCount,
      r.uniqueNameInDrbl,
      r.uniqueNameInEspn,
      r.birthDateEspn,
      r.birthDateNba,
      r.birthDateMatch,
      csvEscape(r.notes),
    ].join(",")
  );
  const evidencePath = path.join(reportDir, "01_player_alias_evidence.csv");
  await writeFile(
    evidencePath,
    [evidenceHeader, ...evidenceLines].join("\n") + "\n",
    "utf8"
  );

  const approvedNba = new Set(
    aliasesOut.filter((a) => a.productionApproved).map((a) => a.nbaPlayerId)
  );
  const uniqueOnlyNba = new Set(
    aliasesOut
      .filter((a) => a.confidence === "UNIQUE_NAME_ONLY")
      .map((a) => a.nbaPlayerId)
  );
  const anyAliasNba = new Set(aliasesOut.map((a) => a.nbaPlayerId));

  const coverageLines: string[] = ["season,metric,value,rate,notes"];
  for (const season of DRBL_SEASONS) {
    const file = path.join(
      process.cwd(),
      "src/data/drbl/precomputed",
      `${season}.json`
    );
    const parsed = JSON.parse(await readFile(file, "utf8")) as {
      players?: Array<{
        playerId?: string;
        possessions?: number;
        actualPossessions?: number;
      }>;
    };
    const players = parsed.players ?? [];
    const rows = players.length;
    let approvedJoin = 0;
    let uniqueOnlyJoin = 0;
    let anyAliasJoin = 0;
    let possTotal = 0;
    let possApproved = 0;
    let possUniqueOnlyExcluded = 0;
    for (const p of players) {
      const id = String(p.playerId ?? "");
      const poss =
        typeof p.actualPossessions === "number"
          ? p.actualPossessions
          : typeof p.possessions === "number"
            ? p.possessions
            : 0;
      possTotal += poss;
      if (approvedNba.has(id)) {
        approvedJoin++;
        possApproved += poss;
      }
      if (uniqueOnlyNba.has(id)) {
        uniqueOnlyJoin++;
        possUniqueOnlyExcluded += poss;
      }
      if (anyAliasNba.has(id)) anyAliasJoin++;
    }
    const push = (
      metric: string,
      value: number | string,
      rate: number | "",
      notes: string
    ) => {
      coverageLines.push(
        [
          season,
          metric,
          value,
          rate === "" ? "" : Number(rate).toFixed(6),
          csvEscape(notes),
        ].join(",")
      );
    };
    push("precomputed_rows", rows, "", "DRBL precomputed players");
    push(
      "verified_join_approved_class",
      approvedJoin,
      rows ? approvedJoin / rows : 0,
      "productionApproved aliases only (UNIQUE_NAME_ONLY excluded)"
    );
    push(
      "unique_name_only_aliases",
      uniqueOnlyJoin,
      rows ? uniqueOnlyJoin / rows : 0,
      "Present in alias file but excluded from verified join"
    );
    push(
      "any_alias_file_join",
      anyAliasJoin,
      rows ? anyAliasJoin / rows : 0,
      "All alias classes including UNIQUE_NAME_ONLY"
    );
    push(
      "possession_exposure_total",
      Math.round(possTotal),
      "",
      "Sum actualPossessions/possessions"
    );
    push(
      "possession_exposure_verified_join",
      Math.round(possApproved),
      possTotal ? possApproved / possTotal : 0,
      "Possessions on approved-class aliased players"
    );
    push(
      "possession_exposure_unique_name_only_excluded",
      Math.round(possUniqueOnlyExcluded),
      possTotal ? possUniqueOnlyExcluded / possTotal : 0,
      "Possessions on UNIQUE_NAME_ONLY aliased players (not verified join)"
    );
  }
  coverageLines.push(
    [
      "2025-26",
      "target_nba_id_1642935",
      targetStatus,
      "",
      csvEscape(targetInvestigation.rationale),
    ].join(",")
  );
  const coveragePath = path.join(reportDir, "03_static_join_coverage.csv");
  await writeFile(coveragePath, coverageLines.join("\n") + "\n", "utf8");

  const live = await measureLiveJoinCoverage({
    aliasPath,
    espnBoardOk: espnBoard.ok,
    espnBoardErrors: espnBoard.errors,
  });
  const livePath = path.join(reportDir, "04_live_join_coverage.json");
  await writeFile(livePath, JSON.stringify(live, null, 2) + "\n", "utf8");

  const freeze = {
    version: CROSSWALK_VERSION,
    generatedAt: aliasesPayload.generatedAt,
    aliasFile: "data/impact/player-id-aliases.json",
    aliasCount: aliasesOut.length,
    countsByClass,
    productionApprovedCount,
    productionApprovedRate: aliasesOut.length
      ? productionApprovedCount / aliasesOut.length
      : 0,
    sha256: {
      before: aliasShaBefore,
      after: aliasShaAfter,
    },
    provenance: {
      drblSeasons: [...DRBL_SEASONS],
      espnBoardSeasonsAttempted: [...ESPN_BOARD_SEASONS],
      espnBoardOk: espnBoard.ok,
      espnBoardRowCount: espnBoard.rowCount,
      espnBoardErrors: espnBoard.errors,
      priorSource: aliasFile.source ?? null,
      priorGeneratedAt: aliasFile.generatedAt ?? null,
      birthDates: "not_fetched_bulk_unavailable",
      policy: aliasesPayload.policy,
      targetNbaId1642935: targetInvestigation,
    },
    outputs: {
      evidenceCsv:
        "reports/product_completeness_v1_1/01_player_alias_evidence.csv",
      freezeJson:
        "reports/product_completeness_v1_1/02_player_crosswalk_freeze.json",
      staticCoverageCsv:
        "reports/product_completeness_v1_1/03_static_join_coverage.csv",
      liveCoverageJson:
        "reports/product_completeness_v1_1/04_live_join_coverage.json",
    },
    firewall: {
      MODEL_PARAMETER_CHANGED: "NO",
      DRBL_MATH_CHANGED: "NO",
    },
  };
  const freezePath = path.join(reportDir, "02_player_crosswalk_freeze.json");
  await writeFile(freezePath, JSON.stringify(freeze, null, 2) + "\n", "utf8");

  console.log(
    JSON.stringify(
      {
        aliasCount: aliasesOut.length,
        countsByClass,
        productionApprovedCount,
        espnBoardOk: espnBoard.ok,
        espnBoardRowCount: espnBoard.rowCount,
        targetNbaId1642935: targetStatus,
        evidencePath,
        freezePath,
        coveragePath,
        livePath,
        aliasPath,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
