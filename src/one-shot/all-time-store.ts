import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { askAgentEnv } from "@/ask-agent/env";
import { parseEarningsRow, placeRows, rowRank, type EarningsRow } from "@/one-shot/leaderboard";

const KEY = "one-shot:earnings:v1";
const FILE = path.join(process.cwd(), ".tmp", "one-shot-earnings.json");

function kv() {
  return askAgentEnv().PAGE_CACHE ?? null;
}

function parseList(raw: string | null): EarningsRow[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as unknown[];
    if (!Array.isArray(list)) return [];
    return list.flatMap((row) => {
      const parsed = parseEarningsRow(row);
      return parsed ? [parsed] : [];
    });
  } catch {
    return [];
  }
}

async function readFileBoard(): Promise<EarningsRow[]> {
  try {
    return parseList(await readFile(FILE, "utf8"));
  } catch {
    return [];
  }
}

async function writeFileBoard(rows: EarningsRow[]) {
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(rows));
}

/** Shared board. Cloudflare KV when the worker has it, a local file in dev. */
export async function readAllTime(): Promise<{ entries: EarningsRow[]; unavailable: boolean }> {
  const cache = kv();
  if (cache) {
    try {
      return { entries: parseList(await cache.get(KEY)), unavailable: false };
    } catch {
      return { entries: [], unavailable: true };
    }
  }
  if (process.env.NODE_ENV === "production") return { entries: [], unavailable: true };
  return { entries: await readFileBoard(), unavailable: false };
}

export async function submitAllTime(raw: unknown): Promise<
  | { ok: true; entries: EarningsRow[]; rank: number | null }
  | { ok: false; status: number; error: string; unavailable?: boolean }
> {
  const row = parseEarningsRow(raw);
  if (!row) return { ok: false, status: 400, error: "That life is missing a field the board needs." };
  const current = await readAllTime();
  if (current.unavailable) return { ok: false, status: 503, error: "The all-time board is not reachable.", unavailable: true };
  const entries = placeRows(current.entries, row);
  const cache = kv();
  try {
    if (cache) await cache.put(KEY, JSON.stringify(entries));
    else await writeFileBoard(entries);
  } catch {
    return { ok: false, status: 503, error: "The all-time board could not be saved.", unavailable: true };
  }
  return { ok: true, entries, rank: rowRank(entries, row.boardId)?.rank ?? null };
}
