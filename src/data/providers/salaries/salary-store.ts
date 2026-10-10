/**
 * Player salary lookup by season start year.
 *
 * Sources, later ones filling gaps or taking over:
 *   data/salaries/player-salaries-2000-2025.csv     history
 *   data/salaries/player-salaries-bref-archive.csv  2026-27 on, kept nightly
 *     from the contracts snapshot so finished seasons survive BRef's rollover
 *   data/salaries/player-salaries-supplement.csv    2025-26, scaled from DARKO
 *   src/data/runtime/bref-team-contracts-snapshot.json  current and future
 *     seasons from Basketball-Reference team contracts, refreshed nightly
 *
 * The CSVs label rows by season END year (2025 = 2024-25).
 */

import { readFileSync } from "node:fs";
import path from "node:path";

export type SalaryHit = {
  playerName: string;
  seasonStart: number;
  salaryDollars: number;
  salaryM: number;
  source: "csv";
};

type Index = Map<string, number>; // `${seasonStart}|${normalizedName}` → dollars

let cached: Index | null = null;

export function normalizePlayerName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/'/g, "")
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function readCsv(file: string): Index {
  const index: Index = new Map();
  let raw: string;
  try {
    raw = readFileSync(path.join(process.cwd(), "data", "salaries", file), "utf8");
  } catch {
    return index;
  }

  const lines = raw.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;
    // Player names may contain commas rarely - CSV is simple Player,Salary,Season
    const lastComma = line.lastIndexOf(",");
    const secondLast = line.lastIndexOf(",", lastComma - 1);
    if (lastComma < 0 || secondLast < 0) continue;
    const player = line.slice(0, secondLast).trim();
    const salaryStr = line.slice(secondLast + 1, lastComma).trim();
    const seasonStr = line.slice(lastComma + 1).trim();
    const dollars = Number(salaryStr);
    const seasonEnd = Number(seasonStr);
    if (!player || !Number.isFinite(dollars) || !Number.isFinite(seasonEnd)) {
      continue;
    }
    const key = `${seasonEnd - 1}|${normalizePlayerName(player)}`;
    const prev = index.get(key);
    // Keep highest if duplicates
    if (prev == null || dollars > prev) index.set(key, dollars);
  }
  return index;
}

type BrefContractsFile = {
  teams?: Record<
    string,
    {
      capSeason?: string;
      rows?: Array<{ name?: string; years?: Array<{ amount?: number } | null> }>;
    }
  >;
};

/** Each team's contract table, first column = its cap season. */
function readBrefContracts(): Index {
  const index: Index = new Map();
  let file: BrefContractsFile;
  try {
    file = JSON.parse(
      readFileSync(
        path.join(process.cwd(), "src", "data", "runtime", "bref-team-contracts-snapshot.json"),
        "utf8"
      )
    ) as BrefContractsFile;
  } catch {
    return index;
  }
  for (const team of Object.values(file.teams ?? {})) {
    const firstStart = Number(team.capSeason?.slice(0, 4));
    if (!Number.isFinite(firstStart)) continue;
    for (const row of team.rows ?? []) {
      if (!row.name) continue;
      const name = normalizePlayerName(row.name);
      (row.years ?? []).forEach((year, i) => {
        const dollars = Number(year?.amount);
        if (!Number.isFinite(dollars) || dollars <= 0) return;
        const key = `${firstStart + i}|${name}`;
        // A traded or waived player can sit on two teams' tables; count the larger.
        const prev = index.get(key);
        if (prev == null || dollars > prev) index.set(key, dollars);
      });
    }
  }
  return index;
}

function loadIndex(): Index {
  if (cached) return cached;
  const index = readCsv("player-salaries-2000-2025.csv");
  for (const file of ["player-salaries-bref-archive.csv", "player-salaries-supplement.csv"]) {
    for (const [key, dollars] of readCsv(file)) {
      if (!index.has(key)) index.set(key, dollars);
    }
  }
  for (const [key, dollars] of readBrefContracts()) index.set(key, dollars);
  cached = index;
  return index;
}

export function lookupPlayerSalary(
  seasonStartYear: number,
  playerName: string
): SalaryHit | null {
  const index = loadIndex();
  const key = `${seasonStartYear}|${normalizePlayerName(playerName)}`;
  const dollars = index.get(key);
  if (dollars == null) return null;
  return {
    playerName,
    seasonStart: seasonStartYear,
    salaryDollars: dollars,
    salaryM: Math.round((dollars / 1_000_000) * 100) / 100,
    source: "csv",
  };
}

/** Build a name → salaryM map for one season (start year). */
export function salaryMapForSeason(
  seasonStartYear: number
): Map<string, number> {
  const index = loadIndex();
  const out = new Map<string, number>();
  const prefix = `${seasonStartYear}|`;
  for (const [key, dollars] of index) {
    if (!key.startsWith(prefix)) continue;
    const name = key.slice(prefix.length);
    out.set(name, Math.round((dollars / 1_000_000) * 100) / 100);
  }
  return out;
}

/** Normalized name → whole dollars for one season (start year). */
export function salaryDollarsForSeason(seasonStartYear: number): Map<string, number> {
  const out = new Map<string, number>();
  const prefix = `${seasonStartYear}|`;
  for (const [key, dollars] of loadIndex()) {
    if (key.startsWith(prefix)) out.set(key.slice(prefix.length), Math.trunc(dollars));
  }
  return out;
}

export function salaryIndexSize(): number {
  return loadIndex().size;
}
