/**
 * Player salary lookup from vendored historical CSV (2000-2025 start years).
 * Source file: data/salaries/player-salaries-2000-2025.csv
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

function salaryPath(): string {
  return path.join(
    process.cwd(),
    "data",
    "salaries",
    "player-salaries-2000-2025.csv"
  );
}

function loadIndex(): Index {
  if (cached) return cached;
  const index: Index = new Map();
  let raw: string;
  try {
    raw = readFileSync(salaryPath(), "utf8");
  } catch {
    cached = index;
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
    const seasonStart = Number(seasonStr);
    if (!player || !Number.isFinite(dollars) || !Number.isFinite(seasonStart)) {
      continue;
    }
    const key = `${seasonStart}|${normalizePlayerName(player)}`;
    const prev = index.get(key);
    // Keep highest if duplicates
    if (prev == null || dollars > prev) index.set(key, dollars);
  }
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

export function salaryIndexSize(): number {
  return loadIndex().size;
}
