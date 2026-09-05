/**
 * Build versioned asset ledger: structured trades, multi-year contracts, draft picks.
 *
 *   node scripts/sync-asset-ledger.mjs
 */
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "data", "asset-ledger", "v1");
const SEASON = "2025-26";
const SEASON_START = 2025;
const METHODOLOGY = "1.0";
const DATASET = "1.0";

const ESPN_TEAM_IDS = [
  "1", "2", "3", "4", "5", "6", "7", "8", "9", "10",
  "11", "12", "13", "14", "15", "16", "17", "18", "19", "20",
  "21", "22", "23", "24", "25", "26", "27", "28", "29", "30",
];

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function normalizeName(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function seasonLabelFromStartYear(startYear) {
  const end = String((startYear + 1) % 100).padStart(2, "0");
  return `${startYear}-${end}`;
}

function pickAssetId({ draftYear, round, originalTeamId }) {
  return `pick:${draftYear}:${round}:${originalTeamId}`;
}

function playerAssetId(playerId) {
  return `player:${playerId}`;
}

function assetFromSeed(item) {
  if (item.kind === "player") {
    return {
      id: playerAssetId(item.playerId),
      type: "player",
      label: item.playerName,
      playerId: item.playerId,
      playerName: item.playerName,
      methodologyVersion: METHODOLOGY,
    };
  }
  const id = pickAssetId(item);
  return {
    id,
    type: "draft_pick",
    label: `${item.draftYear} round ${item.round} pick (${item.originalTeamId})`,
    draftPick: {
      draftYear: item.draftYear,
      round: item.round,
      originalTeamId: item.originalTeamId,
    },
    methodologyVersion: METHODOLOGY,
  };
}

function buildStructuredFromSeed(seedTrade) {
  const assets = [];
  const edges = [];
  const assetRefs = [];

  for (const party of seedTrade.parties) {
    for (const item of party.outgoing ?? []) {
      const asset = assetFromSeed(item);
      assetRefs.push({
        asset,
        direction: "outgoing",
        teamId: party.teamId,
      });
      if (!assets.find((a) => a.id === asset.id)) assets.push(asset);
      edges.push({
        id: `edge:${seedTrade.id}:${asset.id}:out:${party.teamId}`,
        assetId: asset.id,
        fromTeamId: party.teamId,
        toTeamId: null,
        transactionId: seedTrade.id,
        date: seedTrade.date,
        season: seedTrade.season,
        source: "structured-verified",
        sourceVersion: DATASET,
        confidence: "high",
      });
    }
    for (const item of party.incoming ?? []) {
      const asset = assetFromSeed(item);
      assetRefs.push({
        asset,
        direction: "incoming",
        teamId: party.teamId,
      });
      if (!assets.find((a) => a.id === asset.id)) assets.push(asset);
    }
  }

  // Pair outgoing/incoming to set toTeamId on edges
  const incomingByAsset = new Map();
  for (const party of seedTrade.parties) {
    for (const item of party.incoming ?? []) {
      const id =
        item.kind === "player"
          ? playerAssetId(item.playerId)
          : pickAssetId(item);
      if (!incomingByAsset.has(id)) incomingByAsset.set(id, []);
      incomingByAsset.get(id).push(party.teamId);
    }
  }
  for (const edge of edges) {
    const receivers = incomingByAsset.get(edge.assetId) ?? [];
    edge.toTeamId = receivers.find((t) => t !== edge.fromTeamId) ?? receivers[0] ?? null;
  }

  const tx = {
    id: seedTrade.id,
    date: seedTrade.date,
    season: seedTrade.season,
    type: "trade",
    status: "real",
    parties: seedTrade.teamIds.map((teamId) => ({ teamId })),
    teamIds: seedTrade.teamIds,
    assets: assetRefs,
    source: "structured-verified",
    sourceUrl: seedTrade.sourceUrl ?? null,
    sourceVersion: DATASET,
    methodologyVersion: METHODOLOGY,
    description: seedTrade.description,
    provenance: {
      source: "structured-verified",
      sourceRecordId: seedTrade.id,
      datasetVersion: DATASET,
      ingestedAt: new Date().toISOString(),
    },
  };

  return { tx, assets, edges };
}

async function loadSalaryRows() {
  const csvPath = path.join(ROOT, "data", "salaries", "player-salaries-2000-2025.csv");
  const raw = await fs.readFile(csvPath, "utf8");
  const rows = [];
  for (const line of raw.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const last = line.lastIndexOf(",");
    const second = line.lastIndexOf(",", last - 1);
    if (last < 0 || second < 0) continue;
    const playerName = line.slice(0, second).trim();
    const salary = Number(line.slice(second + 1, last).trim());
    const seasonStart = Number(line.slice(last + 1).trim());
    if (!playerName || !Number.isFinite(salary) || !Number.isFinite(seasonStart)) continue;
    rows.push({ playerName, salary: Math.trunc(salary), seasonStart });
  }
  return rows;
}

async function loadNameToPlayerId() {
  const map = new Map();
  try {
    const idx = JSON.parse(
      await fs.readFile(
        path.join(ROOT, "src", "data", "runtime", "espn-name-index.json"),
        "utf8"
      )
    );
    for (const [name, id] of Object.entries(idx.byName ?? {})) {
      map.set(normalizeName(name), String(id));
    }
  } catch {
    /* optional */
  }
  try {
    const board = JSON.parse(
      await fs.readFile(
        path.join(
          ROOT,
          "data",
          "drbl",
          "history",
          "drbl-history-v1",
          "players",
          "by-season",
          `${SEASON}.json`
        ),
        "utf8"
      )
    );
    for (const row of board.rows ?? []) {
      if (!row.playerName || !row.playerId) continue;
      map.set(normalizeName(row.playerName), String(row.playerId));
    }
  } catch {
    /* optional */
  }
  return map;
}

function buildContracts(salaryRows, nameToId) {
  const byPlayer = new Map();
  for (const row of salaryRows) {
    const key = normalizeName(row.playerName);
    const playerId = nameToId.get(key);
    if (!playerId) continue;
    if (!byPlayer.has(playerId)) {
      byPlayer.set(playerId, {
        playerId,
        playerName: row.playerName,
        years: [],
      });
    }
    byPlayer.get(playerId).years.push(row);
  }

  const contracts = [];
  const contractYears = [];
  for (const entry of byPlayer.values()) {
    entry.years.sort((a, b) => a.seasonStart - b.seasonStart);
    const start = entry.years[0].seasonStart;
    const end = entry.years[entry.years.length - 1].seasonStart;
    const contractId = `contract-${entry.playerId}`;
    contracts.push({
      contractId,
      playerId: entry.playerId,
      franchiseId: "",
      signedDate: null,
      startSeason: seasonLabelFromStartYear(start),
      endSeason: seasonLabelFromStartYear(end),
      totalValue: entry.years.reduce((s, y) => s + y.salary, 0),
      guaranteedValue: null,
      contractType: "UNKNOWN",
      source: "salary-csv-2000-2025",
      lastVerified: new Date().toISOString().slice(0, 10),
    });
    for (const y of entry.years) {
      const season = seasonLabelFromStartYear(y.seasonStart);
      contractYears.push({
        contractId,
        playerId: entry.playerId,
        franchiseId: "",
        season,
        salary: y.salary,
        capHit: y.salary,
        guaranteedAmount: null,
        guaranteeStatus: "UNKNOWN",
        optionType: "UNKNOWN",
        source: "salary-csv-2000-2025",
      });
    }
  }
  return { contracts, contractYears };
}

function baselineDraftPicks() {
  const picks = [];
  const teamAssets = [];
  const currentYear = SEASON_START + 1;
  for (const teamId of ESPN_TEAM_IDS) {
    for (let y = currentYear; y <= currentYear + 4; y++) {
      for (const round of [1, 2]) {
        const assetId = pickAssetId({
          draftYear: y,
          round,
          originalTeamId: teamId,
        });
        picks.push({
          assetId,
          draftYear: y,
          round,
          originalFranchiseId: teamId,
          currentOwnerFranchiseId: teamId,
          assetType: round === 1 ? "OWN_PICK" : "OWN_PICK",
          ownershipStatus: "CURRENTLY_OWNED",
          protectionKind: "UNKNOWN",
          swapFlag: false,
          source: "baseline-own-picks",
          lastVerified: new Date().toISOString().slice(0, 10),
        });
        teamAssets.push({
          kind: "draft_pick",
          id: assetId,
          label: `${y} round ${round} (own)`,
          draftYear: y,
          round,
          originalTeamId: teamId,
          currentOwnerTeamId: teamId,
          status: "owned",
        });
      }
    }
  }
  return { picks, teamAssets };
}

function applyPickOwnership(teamAssets, edges, asOfSeason) {
  const owner = new Map(teamAssets.map((p) => [p.id, p.currentOwnerTeamId]));
  const sorted = [...edges]
    .filter((e) => e.assetId.startsWith("pick:"))
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const edge of sorted) {
    if (edge.toTeamId) owner.set(edge.assetId, edge.toTeamId);
  }
  return teamAssets.map((p) => ({
    ...p,
    currentOwnerTeamId: owner.get(p.id) ?? p.currentOwnerTeamId,
    status:
      owner.get(p.id) && owner.get(p.id) !== p.originalTeamId
        ? "traded"
        : p.status,
  }));
}

async function main() {
  const seed = JSON.parse(
    await fs.readFile(
      path.join(ROOT, "data", "asset-ledger", "seeds", "structured-trades.json"),
      "utf8"
    )
  );

  const structuredTransactions = [];
  const ownershipEdges = [];
  for (const trade of seed.trades ?? []) {
    const built = buildStructuredFromSeed(trade);
    structuredTransactions.push(built.tx);
    ownershipEdges.push(...built.edges);
  }

  const salaryRows = await loadSalaryRows();
  const nameToId = await loadNameToPlayerId();
  const { contracts, contractYears } = buildContracts(salaryRows, nameToId);

  const { picks, teamAssets: baselineTeamPicks } = baselineDraftPicks();
  const teamDraftPickAssets = applyPickOwnership(
    baselineTeamPicks,
    ownershipEdges,
    SEASON
  );

  const capabilities = {
    PAYROLL: "PARTIAL",
    CONTRACTS: contracts.length > 0 ? "PARTIAL" : "UNAVAILABLE",
    CAP_THRESHOLDS: "SUPPORTED",
    FULL_CAP_ACCOUNTING: "UNAVAILABLE",
    FIRST_ROUND_ASSETS: structuredTransactions.length ? "PARTIAL" : "UNAVAILABLE",
    SECOND_ROUND_ASSETS: structuredTransactions.length ? "PARTIAL" : "UNAVAILABLE",
    SWAPS: "UNAVAILABLE",
    PROTECTIONS: "UNAVAILABLE",
    TRANSACTION_PROVENANCE: structuredTransactions.length ? "PARTIAL" : "UNAVAILABLE",
    CAP_HOLDS: "UNAVAILABLE",
    DEAD_MONEY: "UNAVAILABLE",
  };

  const payload = JSON.stringify({
    structuredTransactions,
    ownershipEdges,
    contracts,
    contractYears,
    picks,
  });
  const sourceHash = sha256(payload);

  const manifest = {
    methodologyVersion: METHODOLOGY,
    datasetVersion: DATASET,
    builtAt: new Date().toISOString(),
    season: SEASON,
    sourceHash,
    structuredTransactionCount: structuredTransactions.length,
    ownershipEdgeCount: ownershipEdges.length,
    contractCount: contracts.length,
    draftPickCount: picks.length,
    tradeExceptionCount: 0,
    capabilities,
    limitations: [
      "Structured trades are seeded verified deals — not a complete league ledger.",
      "Draft pick baseline assumes each team owns its own picks 2026–2030 until a licensed pick ledger arrives.",
      "Contracts are salary CSV rows by season — options/guarantees/TPEs/dead money not modeled.",
      "ESPN free-text blurbs remain separate and are never parsed into this ledger.",
    ],
    provenance: [
      "data/asset-ledger/seeds/structured-trades.json",
      "data/salaries/player-salaries-2000-2025.csv",
      "src/data/runtime/espn-name-index.json",
    ],
  };

  await fs.mkdir(OUT, { recursive: true });
  const writeJsonl = async (file, rows) => {
    const body = rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "");
    await fs.writeFile(path.join(OUT, file), body);
  };

  await fs.writeFile(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  await writeJsonl("structured-transactions.jsonl", structuredTransactions);
  await writeJsonl("ownership-edges.jsonl", ownershipEdges);
  await writeJsonl("contracts.jsonl", contracts);
  await writeJsonl("contract-years.jsonl", contractYears);
  await writeJsonl("draft-picks.jsonl", picks);
  await writeJsonl("trade-exceptions.jsonl", []);

  console.log(
    `[asset-ledger] wrote ${OUT} txs=${structuredTransactions.length} edges=${ownershipEdges.length} contracts=${contracts.length} years=${contractYears.length} picks=${picks.length}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
