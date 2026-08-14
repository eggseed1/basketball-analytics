import {
  FRANCHISE_HISTORIES,
  FRANCHISE_HISTORY_AS_OF,
  type FranchiseHistory,
} from "@/data/franchises/history";

export function listFranchiseHistories(): FranchiseHistory[] {
  return FRANCHISE_HISTORIES;
}

export function getFranchiseHistory(idOrAbbr: string): FranchiseHistory | null {
  const key = idOrAbbr.trim().toLowerCase();
  return (
    FRANCHISE_HISTORIES.find(
      (f) => f.id === key || f.abbr.toLowerCase() === key
    ) ?? null
  );
}

export function franchiseHistoryAsOf(): string {
  return FRANCHISE_HISTORY_AS_OF;
}

export function franchiseWinPct(f: FranchiseHistory): number {
  const g = f.regularSeasonWins + f.regularSeasonLosses;
  return g ? f.regularSeasonWins / g : 0;
}

export function franchisePlayoffWinPct(f: FranchiseHistory): number {
  const g = f.playoffWins + f.playoffLosses;
  return g ? f.playoffWins / g : 0;
}

export function franchiseTitleCount(f: FranchiseHistory): number {
  return f.championships.length;
}
