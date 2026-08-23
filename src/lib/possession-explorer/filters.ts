import type {
  PossessionExplorerFilters,
  PossessionExplorerRow,
  PossessionResultGroup,
} from "./types";
import { resultGroupLabel } from "./adapter";

export const POSSESSION_EXPLORER_PAGE_SIZE = 25;

export const DEFAULT_POSSESSION_FILTERS: PossessionExplorerFilters = {
  period: "all",
  offense: "both",
  result: "all",
};

export function filterPossessionRows(
  rows: PossessionExplorerRow[],
  filters: PossessionExplorerFilters,
  _teams?: { homeTeamId: string; awayTeamId: string }
): PossessionExplorerRow[] {
  void _teams;
  return rows.filter((row) => {
    if (filters.period !== "all" && row.period !== filters.period) {
      return false;
    }
    if (filters.offense === "home" && row.offenseSide !== "home") {
      return false;
    }
    if (filters.offense === "away" && row.offenseSide !== "away") {
      return false;
    }
    if (filters.result !== "all" && row.resultGroup !== filters.result) {
      return false;
    }
    return true;
  });
}

export function sliceVisiblePossessions(
  rows: PossessionExplorerRow[],
  visibleCount: number
): PossessionExplorerRow[] {
  return rows.slice(0, Math.max(0, visibleCount));
}

export function nextVisibleCount(
  current: number,
  matchedCount: number,
  pageSize = POSSESSION_EXPLORER_PAGE_SIZE
): number {
  return Math.min(matchedCount, current + pageSize);
}

export function resetVisibleCount(
  pageSize = POSSESSION_EXPLORER_PAGE_SIZE
): number {
  return pageSize;
}

export function showingLabel(matched: number, total: number): string {
  return `Showing ${matched} of ${total} reconstructed possessions`;
}

export function visibleShowingLabel(
  visible: number,
  matched: number,
  total: number
): string {
  if (matched === 0) {
    return `Showing 0 of ${total} reconstructed possessions`;
  }
  if (visible >= matched) {
    if (matched === total) {
      return showingLabel(matched, total);
    }
    return `Showing ${matched} of ${matched} matches · ${total} reconstructed possessions`;
  }
  return `Showing ${visible} of ${matched} matches · ${total} reconstructed possessions`;
}

export const RESULT_FILTER_OPTIONS: Array<{
  value: "all" | PossessionResultGroup;
  label: string;
}> = [
  { value: "all", label: "All results" },
  { value: "made_shot", label: resultGroupLabel("made_shot") },
  { value: "missed_shot", label: resultGroupLabel("missed_shot") },
  { value: "turnover", label: resultGroupLabel("turnover") },
  { value: "free_throws", label: resultGroupLabel("free_throws") },
  { value: "end_of_period", label: resultGroupLabel("end_of_period") },
  { value: "other", label: resultGroupLabel("other") },
];
