import type { CareerSummary, OutcomeTier } from "./report";
import { maybeCountry } from "./world";

/** One row on the shared board. Earnings are career pay before tax. Extra fields are the career line shown when the row is opened. */
export type EarningsRow = {
  boardId: string;
  name: string;
  earnings: number;
  birthCountry: string;
  tier: OutcomeTier;
  endedAge: number;
  finishedAt: string;
  seed: number;
  mode: "random" | "daily";
  /** Three letters, arcade style. Absent on rows posted before initials existed. */
  tag?: string | null;
  heightCm?: number | null;
  debutAge?: number | null;
  draft?: string | null;
  peak?: string | null;
  honors?: string | null;
  netWorth?: number | null;
  after?: string | null;
  nbaGames?: number | null;
};

export const MAX_ALL_TIME = 50;
/** Above anything the salary model can pay across a career. */
const EARNINGS_CAP = 5_000_000_000;
const TIERS = new Set<OutcomeTier>(["nba-career", "nba-debut", "drafted", "top-pro", "pro", "semi-pro", "youth"]);

function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.replace(/\s+/g, " ").trim();
  if (name.length < 1 || name.length > 40) return null;
  return name;
}

/** Keep a short text field, or drop it. A bad extra never rejects the score. */
function optText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  if (!text || text.length > max) return null;
  return text;
}

function optInt(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) return null;
  return value;
}

export function cleanTag(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const tag = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(tag) ? tag : null;
}

/** Reject a posted row that is missing a field or outside the game's range. */
export function parseEarningsRow(raw: unknown): EarningsRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.boardId !== "string" || !/^[0-9a-f-]{16,80}$/i.test(r.boardId)) return null;
  const name = cleanName(r.name);
  if (!name) return null;
  if (typeof r.earnings !== "number" || !Number.isInteger(r.earnings) || r.earnings < 0 || r.earnings > EARNINGS_CAP) return null;
  if (typeof r.birthCountry !== "string" || !maybeCountry(r.birthCountry)) return null;
  if (typeof r.tier !== "string" || !TIERS.has(r.tier as OutcomeTier)) return null;
  if (typeof r.endedAge !== "number" || !Number.isInteger(r.endedAge) || r.endedAge < 0 || r.endedAge > 90) return null;
  if (typeof r.finishedAt !== "string" || !Number.isFinite(Date.parse(r.finishedAt))) return null;
  const finished = Date.parse(r.finishedAt);
  if (finished > Date.now() + 86_400_000 || finished < Date.parse("2020-01-01")) return null;
  if (typeof r.seed !== "number" || !Number.isInteger(r.seed) || r.seed < 0 || r.seed > 0xffffffff) return null;
  if (r.mode !== "random" && r.mode !== "daily") return null;
  return {
    boardId: r.boardId,
    name,
    earnings: r.earnings,
    birthCountry: r.birthCountry,
    tier: r.tier as OutcomeTier,
    endedAge: r.endedAge,
    finishedAt: new Date(finished).toISOString(),
    seed: r.seed,
    mode: r.mode,
    tag: cleanTag(r.tag),
    heightCm: optInt(r.heightCm, 120, 250),
    debutAge: optInt(r.debutAge, 15, 45),
    draft: optText(r.draft, 40),
    peak: optText(r.peak, 90),
    honors: optText(r.honors, 180),
    netWorth: optInt(r.netWorth, -2_000_000_000, EARNINGS_CAP),
    after: optText(r.after, 80),
    nbaGames: optInt(r.nbaGames, 0, 4000),
  };
}

export function placeRows(existing: EarningsRow[], next: EarningsRow, limit = MAX_ALL_TIME): EarningsRow[] {
  const merged = [next, ...existing.filter((r) => r.boardId !== next.boardId)];
  merged.sort((a, b) => b.earnings - a.earnings || a.finishedAt.localeCompare(b.finishedAt) || a.boardId.localeCompare(b.boardId));
  return merged.slice(0, limit);
}

export function rowRank(board: EarningsRow[], boardId: string): { rank: number; of: number } | null {
  const i = board.findIndex((r) => r.boardId === boardId);
  if (i < 0) return null;
  return { rank: i + 1, of: board.length };
}

export function rowFromSummary(c: CareerSummary): EarningsRow | null {
  return parseEarningsRow({
    boardId: c.boardId,
    name: c.name,
    earnings: c.earnings,
    birthCountry: c.birthCountry,
    tier: c.tier,
    endedAge: c.endedAge,
    finishedAt: c.finishedAt,
    seed: c.seed,
    mode: c.mode,
    tag: c.tag ?? null,
    heightCm: c.heightCm,
    debutAge: c.debutAge,
    draft: c.draft,
    peak: c.peak,
    honors: c.honors ?? null,
    netWorth: c.netWorth ?? null,
    after: c.after ?? null,
    nbaGames: c.nbaGames ?? null,
  });
}

export const MAX_BOARD = 20;

/** Pre-tax career earnings, or null when a saved life never recorded them. */
export function earningsOf(c: CareerSummary): number | null {
  return typeof c.earnings === "number" && Number.isFinite(c.earnings) ? Math.round(c.earnings) : null;
}

/** Highest earnings first. A tie goes to whoever finished earlier. */
export function rankByEarnings(list: CareerSummary[]): CareerSummary[] {
  return list
    .filter((c) => earningsOf(c) !== null)
    .sort((a, b) => earningsOf(b)! - earningsOf(a)! || a.finishedAt.localeCompare(b.finishedAt) || a.runId.localeCompare(b.runId));
}

/** Insert one finished life and keep the top of the board. A repeat run replaces its old row. */
export function placeOnBoard(existing: CareerSummary[], next: CareerSummary, limit = MAX_BOARD): CareerSummary[] {
  if (earningsOf(next) === null) return rankByEarnings(existing).slice(0, limit);
  const merged = [next, ...existing.filter((c) => c.runId !== next.runId)];
  return rankByEarnings(merged).slice(0, limit);
}

export function earningsRank(board: CareerSummary[], runId: string): { rank: number; of: number } | null {
  const ranked = rankByEarnings(board);
  const i = ranked.findIndex((c) => c.runId === runId);
  if (i < 0) return null;
  return { rank: i + 1, of: ranked.length };
}

export function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
