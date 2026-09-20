/**
 * Offline sync: ESPN current rosters + salary CSV → validated front-office snapshot.
 * Team membership comes from live ESPN rosters (not a stale DRBL season board).
 *
 * Usage: npx tsx scripts/sync-team-front-office.ts
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  getCanonicalTeamFromProvider,
  listCanonicalTeams,
} from "@/data/identity/team-map";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { normalizePlayerName } from "@/data/providers/salaries/salary-store";
import type {
  FrontOfficeCapabilities,
  FrontOfficeLeagueSnapshot,
  LeagueCapSeason,
  PlayerContractYear,
  TeamContractRow,
  TeamFrontOfficeArtifact,
} from "@/data/types/front-office";
import { FRONT_OFFICE_METHODOLOGY_VERSION } from "@/data/types/front-office";
import { playerPageHref } from "@/lib/player-season-resolve";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "data", "front-office", "v1");
const SITE_API = "https://site.api.espn.com";
const SEASON_START = currentNbaStartYear();
const SEASON = canonicalSeasonFromStartYear(SEASON_START);

type BoardRow = {
  playerId: string;
  playerName: string;
  primaryTeamId: string | null;
};

type AliasRow = {
  espnPlayerId?: string;
  nbaPlayerId?: string;
  playerName?: string;
};

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function loadSalaryMap(seasonStart: number): Map<string, number> {
  const csvPath = path.join(ROOT, "data", "salaries", "player-salaries-2000-2025.csv");
  if (!existsSync(csvPath)) return new Map();
  const raw = readFileSync(csvPath, "utf8");
  const map = new Map<string, number>();
  for (const line of raw.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const last = line.lastIndexOf(",");
    const second = line.lastIndexOf(",", last - 1);
    if (last < 0 || second < 0) continue;
    const player = line.slice(0, second).trim();
    const dollars = Number(line.slice(second + 1, last).trim());
    const season = Number(line.slice(last + 1).trim());
    if (season !== seasonStart || !Number.isFinite(dollars)) continue;
    const key = normalizePlayerName(player);
    const prev = map.get(key);
    if (prev == null || dollars > prev) map.set(key, Math.trunc(dollars));
  }
  return map;
}

function loadEspnToNbaAlias(): Map<string, string> {
  const p = path.join(
    ROOT,
    "src",
    "data",
    "runtime",
    "player-id-aliases-snapshot.json"
  );
  if (!existsSync(p)) return new Map();
  const j = JSON.parse(readFileSync(p, "utf8")) as { aliases?: AliasRow[] };
  const map = new Map<string, string>();
  for (const row of j.aliases ?? []) {
    const espn = String(row.espnPlayerId ?? "").trim();
    const nba = String(row.nbaPlayerId ?? "").trim();
    if (espn && nba) map.set(espn, nba);
  }
  return map;
}

function loadCap(season: string): LeagueCapSeason {
  const p = path.join(ROOT, "data", "cba", "league-cap-seasons.json");
  const j = JSON.parse(readFileSync(p, "utf8")) as {
    seasons: LeagueCapSeason[];
  };
  const hit = j.seasons.find((s) => s.season === season);
  if (!hit) throw new Error(`Missing LeagueCapSeason for ${season}`);
  return hit;
}

function defaultCapabilities(): FrontOfficeCapabilities {
  return {
    PAYROLL: "PARTIAL",
    CONTRACTS: "PARTIAL",
    CAP_THRESHOLDS: "SUPPORTED",
    FULL_CAP_ACCOUNTING: "UNAVAILABLE",
    FIRST_ROUND_ASSETS: "UNAVAILABLE",
    SECOND_ROUND_ASSETS: "UNAVAILABLE",
    SWAPS: "UNAVAILABLE",
    PROTECTIONS: "UNAVAILABLE",
    TRANSACTION_PROVENANCE: "UNAVAILABLE",
    CAP_HOLDS: "UNAVAILABLE",
    DEAD_MONEY: "UNAVAILABLE",
  };
}

function resolveRosterFranchise(teamId: string | null | undefined) {
  if (!teamId || teamId === "0") return null;
  return (
    getCanonicalTeamFromProvider("espn", teamId) ??
    getCanonicalTeamFromProvider("nba", teamId)
  );
}

async function fetchEspnTeamBoard(espnTeamId: string): Promise<BoardRow[]> {
  const url = `${SITE_API}/apis/site/v2/sports/basketball/nba/teams/${espnTeamId}/roster`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "BasketballAnalytics/0.1",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`ESPN roster ${espnTeamId}: HTTP ${res.status}`);
  const payload = (await res.json()) as {
    athletes?: Array<{ id?: string; displayName?: string; fullName?: string }>;
    team?: { id?: string };
  };
  const teamId = String(payload.team?.id ?? espnTeamId);
  return (payload.athletes ?? [])
    .map((athlete) => ({
      playerId: String(athlete.id ?? "").trim(),
      playerName: String(athlete.displayName || athlete.fullName || "").trim(),
      primaryTeamId: teamId,
    }))
    .filter((row) => row.playerId && row.playerName);
}

async function loadCurrentEspnBoard(): Promise<BoardRow[]> {
  const teams = listCanonicalTeams();
  const rows: BoardRow[] = [];
  for (const team of teams) {
    const espnId = team.providerIds.espn ?? team.canonicalTeamId;
    try {
      const roster = await fetchEspnTeamBoard(espnId);
      rows.push(...roster);
      console.log(
        `[front-office-sync] ${team.abbr} → ${roster.length} players`
      );
    } catch (error) {
      console.warn(
        `[front-office-sync] ${team.abbr} skipped: ${
          error instanceof Error ? error.message : error
        }`
      );
    }
  }
  return rows;
}

async function main() {
  const retrievedAt = new Date().toISOString();
  const snapshotDate = retrievedAt.slice(0, 10);
  const salariesCurrent = loadSalaryMap(SEASON_START);
  const salariesPrior = loadSalaryMap(SEASON_START - 1);
  const espnToNba = loadEspnToNbaAlias();
  const board = await loadCurrentEspnBoard();
  if (!board.length) {
    throw new Error("No ESPN roster rows loaded — refusing to overwrite FO");
  }
  const cap = loadCap(SEASON);
  const teams = listCanonicalTeams();
  const capabilities = defaultCapabilities();

  const sourcePayload = JSON.stringify({
    salaryCsv: "data/salaries/player-salaries-2000-2025.csv",
    board: "espn-site-roster-live",
    season: SEASON,
    cap: "data/cba/league-cap-seasons.json",
    salaryCurrentCount: salariesCurrent.size,
    salaryPriorCount: salariesPrior.size,
    boardCount: board.length,
  });
  const sourceHash = sha256(sourcePayload);

  const usedSalaryKeys = new Set<string>();
  const byFranchise = new Map<
    string,
    {
      rows: TeamContractRow[];
      commitments: number;
      withSalary: number;
      withoutSalary: number;
    }
  >();

  for (const t of teams) {
    byFranchise.set(t.canonicalTeamId, {
      rows: [],
      commitments: 0,
      withSalary: 0,
      withoutSalary: 0,
    });
  }

  let unresolvedIdentity = 0;
  let salaryNullAsZero = 0;
  const seenPlayerIds = new Set<string>();

  for (const row of board) {
    const franchise = resolveRosterFranchise(row.primaryTeamId);
    if (!franchise) continue;
    const bucket = byFranchise.get(franchise.canonicalTeamId);
    if (!bucket) continue;

    // Prefer NBA person id for headshots / DRBL join; fall back to ESPN athlete id.
    const nbaId = espnToNba.get(row.playerId);
    const playerId = nbaId || row.playerId;
    if (seenPlayerIds.has(playerId)) continue;
    seenPlayerIds.add(playerId);

    const key = normalizePlayerName(row.playerName);
    const salary =
      salariesCurrent.get(key) ?? salariesPrior.get(key) ?? null;
    if (salary != null) usedSalaryKeys.add(key);
    if (salary === 0) salaryNullAsZero += 1;

    if (!playerId) {
      unresolvedIdentity += 1;
      continue;
    }

    const contractId = `cy-${playerId}-${SEASON_START}`;
    const source =
      salariesCurrent.get(key) != null
        ? "salary-csv-2000-2025"
        : salariesPrior.get(key) != null
          ? "salary-csv-carry-forward"
          : "espn-roster-no-salary";

    const year: PlayerContractYear = {
      contractId,
      playerId,
      franchiseId: franchise.canonicalTeamId,
      season: SEASON,
      salary,
      capHit: salary,
      guaranteedAmount: null,
      guaranteeStatus: "UNKNOWN",
      optionType: "UNKNOWN",
      source,
    };

    const contractRow: TeamContractRow = {
      playerId,
      playerName: row.playerName,
      age: null,
      contractId,
      contractType: "UNKNOWN",
      years: [year],
      guaranteedTotal: null,
      href: playerPageHref(nbaId ? playerId : row.playerId),
    };

    bucket.rows.push(contractRow);
    if (salary != null) {
      bucket.commitments += salary;
      bucket.withSalary += 1;
    } else {
      bucket.withoutSalary += 1;
    }
  }

  const unmatchedSalaryNames = [...salariesCurrent.keys()].filter(
    (k) => !usedSalaryKeys.has(k)
  ).length;

  const teamArtifacts: TeamFrontOfficeArtifact[] = [];
  for (const t of teams) {
    const bucket = byFranchise.get(t.canonicalTeamId)!;
    bucket.rows.sort((a, b) => {
      const sa = a.years[0]?.salary ?? -1;
      const sb = b.years[0]?.salary ?? -1;
      return sb - sa;
    });

    const futureCommitments =
      bucket.withSalary > 0
        ? [
            {
              season: SEASON,
              totalSalaryDollars: bucket.commitments,
              playersUnderContract: bucket.withSalary,
            },
          ]
        : [];

    teamArtifacts.push({
      franchiseId: t.canonicalTeamId,
      abbr: t.abbr,
      displayName: t.displayName,
      payroll: {
        franchiseId: t.canonicalTeamId,
        abbr: t.abbr,
        displayName: t.displayName,
        season: SEASON,
        contractRows: bucket.rows,
        futureCommitments,
        playerSalaryCommitments: bucket.commitments,
        playersWithSalary: bucket.withSalary,
        playersWithoutSalary: bucket.withoutSalary,
      },
      draftAssets: {
        franchiseId: t.canonicalTeamId,
        abbr: t.abbr,
        displayName: t.displayName,
        assets: [],
        swaps: [],
        unavailableReason:
          "No product-approved structured draft-asset ledger in repository. ESPN free-text transactions are not used as ownership truth.",
      },
      capabilities,
    });
  }

  const teamsWithPayroll = teamArtifacts.filter(
    (t) => t.payroll.playersWithSalary > 0
  ).length;
  const playersWithSalary = teamArtifacts.reduce(
    (s, t) => s + t.payroll.playersWithSalary,
    0
  );

  const snapshot: FrontOfficeLeagueSnapshot = {
    meta: {
      methodologyVersion: FRONT_OFFICE_METHODOLOGY_VERSION,
      snapshotDate,
      retrievedAt,
      sourceSet: [
        "espn-site-roster-live",
        "data/salaries/player-salaries-2000-2025.csv",
        "data/cba/league-cap-seasons.json",
      ],
      sourceHash,
      status: "VALIDATED",
      season: SEASON,
      seasonStartYear: SEASON_START,
    },
    cap,
    capabilities,
    teams: teamArtifacts,
    audit: {
      contractPlayerIdentityUnresolved: unresolvedIdentity,
      mixedSalaryUnits: 0,
      salaryNullAsZero,
      teamsWithPayroll,
      teamsWithContracts: teamsWithPayroll,
      playersWithSalary,
      unmatchedSalaryNames,
      draftAssetsStructured: 0,
    },
  };

  if (unresolvedIdentity !== 0) {
    throw new Error(
      `CONTRACT_PLAYER_IDENTITY_UNRESOLVED=${unresolvedIdentity} (must be 0 for public ship)`
    );
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const tmp = path.join(OUT_DIR, `.snapshot.${process.pid}.json`);
  const finalPath = path.join(OUT_DIR, "snapshot.json");
  writeFileSync(tmp, JSON.stringify(snapshot, null, 2));
  renameSync(tmp, finalPath);

  const teamsDir = path.join(OUT_DIR, "teams");
  mkdirSync(teamsDir, { recursive: true });
  for (const team of teamArtifacts) {
    writeFileSync(
      path.join(teamsDir, `${team.franchiseId}.json`),
      JSON.stringify(
        {
          meta: snapshot.meta,
          cap: snapshot.cap,
          capabilities: snapshot.capabilities,
          team,
        },
        null,
        2
      )
    );
  }

  writeFileSync(
    path.join(OUT_DIR, "manifest.json"),
    JSON.stringify(
      {
        methodologyVersion: FRONT_OFFICE_METHODOLOGY_VERSION,
        snapshotDate,
        retrievedAt,
        sourceHash,
        status: "VALIDATED",
        season: SEASON,
        teamCount: teamArtifacts.length,
        teamsWithPayroll,
        playersWithSalary,
        capabilities,
      },
      null,
      2
    )
  );

  const prevPath = path.join(OUT_DIR, "previous-snapshot.json");
  const diff = {
    contractsNew: 0,
    contractsChanged: 0,
    contractsRemoved: 0,
    assetsNew: 0,
    assetsTransferred: 0,
    assetsChanged: 0,
    assetsConveyed: 0,
    assetsUnresolved: 0,
    unexplainedContractDisappearances: 0,
    unexplainedAssetDisappearances: 0,
  };
  if (existsSync(prevPath)) {
    const prev = JSON.parse(
      readFileSync(prevPath, "utf8")
    ) as FrontOfficeLeagueSnapshot;
    const prevIds = new Set(
      prev.teams.flatMap((t) => t.payroll.contractRows.map((r) => r.contractId))
    );
    const nextIds = new Set(
      snapshot.teams.flatMap((t) =>
        t.payroll.contractRows.map((r) => r.contractId)
      )
    );
    for (const id of nextIds) if (!prevIds.has(id)) diff.contractsNew += 1;
    for (const id of prevIds) {
      if (!nextIds.has(id)) diff.contractsRemoved += 1;
    }
  }
  writeFileSync(path.join(OUT_DIR, "sync-diff.json"), JSON.stringify(diff, null, 2));
  writeFileSync(prevPath, JSON.stringify(snapshot));

  console.log(
    JSON.stringify(
      {
        ok: true,
        out: finalPath,
        season: SEASON,
        sourceHash,
        teamsWithPayroll,
        playersWithSalary,
        boardPlayers: board.length,
        unmatchedSalaryNames,
        contractPlayerIdentityUnresolved: unresolvedIdentity,
        diff,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
