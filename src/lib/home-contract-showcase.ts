/**
 * Home contract showcase: salary played off (payoff) + surplus context.
 */

import type { PlayerSurplusRow } from "@/lib/contract-surplus";
import { normalizePlayerName } from "@/lib/player-name";
import type { PayoffSeasonMeta, PayoffSummary } from "@/data/runtime/salary-payoff";

/** Readings to treat as the "recent" climb window. */
export const SHOWCASE_RECENT_DATES = 7;
export const SHOWCASE_LIMIT = 6;

export type ContractShowcaseRow = {
  key: string;
  nbaId: string | null;
  href: string | null;
  name: string;
  teamId: string;
  salary: number;
  /** Latest share of salary covered (0–100+). */
  seasonPct: number;
  /** Percentage points gained over the recent window. */
  recentGain: number;
  earned: number;
  ahead: number;
  projected: number | null;
  paidOff: string | null;
  surplus: number | null;
  surplusRank: number | null;
  /** Last N pct samples for a tiny sparkline (oldest → newest). */
  spark: number[];
};

export type ContractShowcaseSurplusTile = {
  key: string;
  href: string | null;
  name: string;
  playerId: string | null;
  teamKey: string;
  teamId: string;
  surplus: number;
  rank: number;
  salary: number;
  /** Season % paid off when we can match a payoff line. */
  seasonPct: number | null;
};

export type ContractShowcaseModel = {
  season: string;
  /** True when the league year has no readings yet and we show a finished season. */
  showingPrior: boolean;
  waitingSeason: string | null;
  opener: string | null;
  meta: PayoffSeasonMeta;
  recent: ContractShowcaseRow[];
  seasonLeaders: ContractShowcaseRow[];
  surplus: ContractShowcaseSurplusTile[];
};

function recentGain(pct: number[]): number {
  if (pct.length < 2) return 0;
  const from = Math.max(0, pct.length - SHOWCASE_RECENT_DATES);
  return (pct.at(-1) ?? 0) - (pct[from] ?? 0);
}

function spark(pct: number[]): number[] {
  const from = Math.max(0, pct.length - SHOWCASE_RECENT_DATES);
  return pct.slice(from).map((p) => Math.round(p * 10) / 10);
}

function toRow(
  p: PayoffSummary,
  surplusByNba: Map<string, PlayerSurplusRow>,
  surplusByName: Map<string, PlayerSurplusRow>
): ContractShowcaseRow {
  const seasonPct = p.pct.at(-1) ?? 0;
  const matched =
    (p.nbaId ? surplusByNba.get(p.nbaId) : null) ??
    surplusByName.get(normalizePlayerName(p.name));
  return {
    key: p.key,
    nbaId: p.nbaId,
    href: p.nbaId ? `/players/${encodeURIComponent(p.nbaId)}` : null,
    name: p.name,
    teamId: p.teamId,
    salary: p.salary,
    seasonPct,
    recentGain: recentGain(p.pct),
    earned: p.earned.at(-1) ?? 0,
    ahead: p.ahead.at(-1) ?? 0,
    projected: p.projected,
    paidOff: p.paidOff,
    surplus: matched?.surplus ?? null,
    surplusRank: matched?.rank ?? null,
    spark: spark(p.pct),
  };
}

export function buildContractShowcase(opts: {
  season: string;
  showingPrior: boolean;
  waitingSeason: string | null;
  opener: string | null;
  meta: PayoffSeasonMeta;
  players: PayoffSummary[];
  surplusRows: PlayerSurplusRow[];
}): ContractShowcaseModel {
  const surplusByNba = new Map<string, PlayerSurplusRow>();
  const surplusByName = new Map<string, PlayerSurplusRow>();
  for (const row of opts.surplusRows) {
    if (row.playerId) surplusByNba.set(row.playerId, row);
    surplusByName.set(normalizePlayerName(row.name), row);
  }

  const rows = opts.players.map((p) => toRow(p, surplusByNba, surplusByName));
  const recent = [...rows]
    .sort(
      (a, b) =>
        b.recentGain - a.recentGain ||
        b.seasonPct - a.seasonPct ||
        a.name.localeCompare(b.name)
    )
    .slice(0, SHOWCASE_LIMIT);
  const seasonLeaders = [...rows]
    .sort(
      (a, b) => b.seasonPct - a.seasonPct || a.name.localeCompare(b.name)
    )
    .slice(0, SHOWCASE_LIMIT);

  const payoffByNba = new Map(
    rows.filter((r) => r.nbaId).map((r) => [r.nbaId!, r] as const)
  );
  const payoffByName = new Map(
    rows.map((r) => [normalizePlayerName(r.name), r] as const)
  );
  const surplus = opts.surplusRows.slice(0, SHOWCASE_LIMIT).map((row) => {
    const pay =
      (row.playerId ? payoffByNba.get(row.playerId) : null) ??
      payoffByName.get(normalizePlayerName(row.name));
    return {
      key: row.brefId,
      href: row.playerId
        ? `/players/${encodeURIComponent(row.playerId)}`
        : null,
      name: row.name,
      playerId: row.playerId,
      teamKey: row.teamKey,
      teamId: row.teamId,
      surplus: row.surplus,
      rank: row.rank,
      salary: row.salary,
      seasonPct: pay?.seasonPct ?? null,
    };
  });

  return {
    season: opts.season,
    showingPrior: opts.showingPrior,
    waitingSeason: opts.waitingSeason,
    opener: opts.opener,
    meta: opts.meta,
    recent,
    seasonLeaders,
    surplus,
  };
}
