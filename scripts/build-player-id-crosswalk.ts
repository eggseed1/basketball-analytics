/**
 * Build ESPN athlete id ↔ NBA Stats PLAYER_ID crosswalk for DRBL overlays.
 *
 * Matching policy (strict):
 * - Prefer unique normalized-name matches across ESPN + DRBL corpora
 * - Never accept ambiguous name collisions into aliases.json
 * - May fall back to dual-id evidence already in-repo when ESPN board is unavailable
 *
 * Output confidence is UNIQUE_NAME_ONLY (not production-approved).
 * Run `npm run audit:player-id-crosswalk` afterward to upgrade
 * same-season+team evidence to HIGH_CONFIDENCE_MULTI_FIELD / VERIFIED_MULTI_FIELD
 * and set productionApproved (P17.1). Does not invent IDs.
 *
 * Writes:
 * - data/impact/player-id-aliases.json
 * - reports/product_completeness_v1/08_player_identity_crosswalk.csv
 *
 * Run: npx tsx scripts/build-player-id-crosswalk.ts
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { normalizePlayerName } from "../src/lib/player-name";
import { espnYearFromCanonicalSeason } from "../src/data/providers/nba/season";
import { PLAYER_ALIASES } from "../src/query-engine/entities";

type AliasOut = {
  espnPlayerId: string;
  nbaPlayerId: string;
  playerName: string;
  matchMethod: string;
  confidence: string;
  productionApproved: boolean;
};

type NameHit = { id: string; name: string };

type CrosswalkRow = {
  season: string;
  playerName: string;
  normalizedName: string;
  espnPlayerId: string;
  nbaPlayerId: string;
  matchMethod: string;
  confidence: string;
  status: "ALIAS" | "AMBIGUOUS" | "UNMATCHED_NBA" | "UNMATCHED_ESPN";
};

const SEASONS = ["2024-25", "2025-26"] as const;
const SITE_WEB = "https://site.web.api.espn.com";

function uniqueById(rows: NameHit[]): NameHit[] {
  const seen = new Set<string>();
  const out: NameHit[] = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

function nameIndex(rows: NameHit[]): {
  unique: Map<string, NameHit>;
  ambiguous: Set<string>;
} {
  const buckets = new Map<string, NameHit[]>();
  for (const r of rows) {
    const key = normalizePlayerName(r.name);
    if (!key) continue;
    const list = buckets.get(key) ?? [];
    list.push(r);
    buckets.set(key, list);
  }
  const unique = new Map<string, NameHit>();
  const ambiguous = new Set<string>();
  for (const [key, list] of buckets) {
    const ids = new Set(list.map((x) => x.id));
    if (ids.size === 1) {
      unique.set(key, list[0]!);
    } else {
      ambiguous.add(key);
    }
  }
  return { unique, ambiguous };
}

async function loadDrblNames(season: string): Promise<NameHit[]> {
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
    players?: Array<{ playerId?: string; playerName?: string }>;
  };
  return uniqueById(
    (parsed.players ?? [])
      .filter((p) => p.playerId && p.playerName)
      .map((p) => ({
        id: String(p.playerId),
        name: String(p.playerName),
      }))
  );
}

async function tryFetchEspnBoard(season: string): Promise<NameHit[]> {
  const year = espnYearFromCanonicalSeason(season);
  const url =
    `${SITE_WEB}/apis/common/v3/sports/basketball/nba/statistics/byathlete` +
    `?region=us&lang=en&contentorigin=espn&season=${year}&seasontype=2&limit=1000`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8_000),
      headers: { "User-Agent": "drbl-crosswalk/1.0" },
    });
    if (!res.ok) {
      console.warn(`[espn] ${season} HTTP ${res.status}`);
      return [];
    }
    const payload = (await res.json()) as {
      athletes?: Array<{
        athlete?: { id?: string | number; displayName?: string };
      }>;
    };
    const rows: NameHit[] = [];
    for (const row of payload.athletes ?? []) {
      const id = row.athlete?.id != null ? String(row.athlete.id) : "";
      const name = row.athlete?.displayName?.trim() ?? "";
      if (!id || !name) continue;
      rows.push({ id, name });
    }
    return uniqueById(rows);
  } catch (e) {
    console.warn(
      `[espn] ${season} fetch failed:`,
      e instanceof Error ? e.message : e
    );
    return [];
  }
}

/** Dual-id evidence already present in code (ESPN ids + display names). */
function loadAskEspnEvidence(): NameHit[] {
  const byId = new Map<string, NameHit>();
  for (const row of Object.values(PLAYER_ALIASES)) {
    byId.set(row.id, { id: row.id, name: row.name });
  }
  return [...byId.values()];
}

async function main() {
  const reportRows: CrosswalkRow[] = [];
  const aliasByEspn = new Map<string, AliasOut>();
  let espnBoardCount = 0;
  let espnSource: "byathlete" | "ask_aliases_fallback" = "ask_aliases_fallback";

  for (const season of SEASONS) {
    const nbaPlayers = await loadDrblNames(season);
    const nbaIdx = nameIndex(nbaPlayers);

    let espnPlayers = await tryFetchEspnBoard(season);
    if (espnPlayers.length > 0) {
      espnBoardCount += espnPlayers.length;
      espnSource = "byathlete";
    } else {
      espnPlayers = loadAskEspnEvidence();
    }
    const espnIdx = nameIndex(espnPlayers);

    const matchedKeys = new Set<string>();

    for (const [key, espn] of espnIdx.unique) {
      if (nbaIdx.ambiguous.has(key) || espnIdx.ambiguous.has(key)) {
        reportRows.push({
          season,
          playerName: espn.name,
          normalizedName: key,
          espnPlayerId: espn.id,
          nbaPlayerId: nbaIdx.unique.get(key)?.id ?? "",
          matchMethod: "name_collision",
          confidence: "AMBIGUOUS",
          status: "AMBIGUOUS",
        });
        continue;
      }
      const nba = nbaIdx.unique.get(key);
      if (!nba) {
        reportRows.push({
          season,
          playerName: espn.name,
          normalizedName: key,
          espnPlayerId: espn.id,
          nbaPlayerId: "",
          matchMethod: "none",
          confidence: "UNRESOLVED",
          status: "UNMATCHED_ESPN",
        });
        continue;
      }
      matchedKeys.add(key);
      // Name-only evidence - not production-approved until audit upgrades.
      const confidence = "UNIQUE_NAME_ONLY";
      const matchMethod =
        espnSource === "byathlete"
          ? "unique_name_espn_board_drbl"
          : "unique_name_ask_alias_drbl";
      aliasByEspn.set(espn.id, {
        espnPlayerId: espn.id,
        nbaPlayerId: nba.id,
        playerName: espn.name,
        matchMethod,
        confidence,
        productionApproved: false,
      });
      reportRows.push({
        season,
        playerName: espn.name,
        normalizedName: key,
        espnPlayerId: espn.id,
        nbaPlayerId: nba.id,
        matchMethod,
        confidence,
        status: "ALIAS",
      });
    }

    for (const key of nbaIdx.ambiguous) {
      const sample = nbaPlayers.find(
        (p) => normalizePlayerName(p.name) === key
      );
      reportRows.push({
        season,
        playerName: sample?.name ?? key,
        normalizedName: key,
        espnPlayerId: "",
        nbaPlayerId: sample?.id ?? "",
        matchMethod: "name_collision",
        confidence: "AMBIGUOUS",
        status: "AMBIGUOUS",
      });
    }

    for (const [key, nba] of nbaIdx.unique) {
      if (matchedKeys.has(key)) continue;
      if (espnIdx.ambiguous.has(key)) continue;
      reportRows.push({
        season,
        playerName: nba.name,
        normalizedName: key,
        espnPlayerId: "",
        nbaPlayerId: nba.id,
        matchMethod: "none",
        confidence: "UNRESOLVED",
        status: "UNMATCHED_NBA",
      });
    }
  }

  const aliases = [...aliasByEspn.values()].sort((a, b) =>
    a.playerName.localeCompare(b.playerName)
  );

  const aliasPath = path.join(
    process.cwd(),
    "data",
    "impact",
    "player-id-aliases.json"
  );
  await writeFile(
    aliasPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: espnSource,
        seasons: [...SEASONS],
        policy:
          "Unique normalized-name matches only (UNIQUE_NAME_ONLY, productionApproved=false). Ambiguous collisions excluded. Run audit:player-id-crosswalk for multi-field upgrade (P17.1).",
        aliases,
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  const reportDir = path.join(
    process.cwd(),
    "reports",
    "product_completeness_v1"
  );
  await mkdir(reportDir, { recursive: true });
  const csvPath = path.join(reportDir, "08_player_identity_crosswalk.csv");
  const header =
    "season,playerName,normalizedName,espnPlayerId,nbaPlayerId,matchMethod,confidence,status";
  const lines = reportRows.map((r) =>
    [
      r.season,
      csvEscape(r.playerName),
      r.normalizedName,
      r.espnPlayerId,
      r.nbaPlayerId,
      r.matchMethod,
      r.confidence,
      r.status,
    ].join(",")
  );
  await writeFile(csvPath, [header, ...lines].join("\n") + "\n", "utf8");

  const aliasCount = aliases.length;
  const ambiguous = reportRows.filter((r) => r.status === "AMBIGUOUS").length;
  const unmatchedNba = reportRows.filter(
    (r) => r.status === "UNMATCHED_NBA"
  ).length;
  const unmatchedEspn = reportRows.filter(
    (r) => r.status === "UNMATCHED_ESPN"
  ).length;

  console.log(
    JSON.stringify(
      {
        aliasCount,
        espnSource,
        espnBoardCount,
        ambiguousRows: ambiguous,
        unmatchedNbaRows: unmatchedNba,
        unmatchedEspnRows: unmatchedEspn,
        aliasPath,
        csvPath,
      },
      null,
      2
    )
  );
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
