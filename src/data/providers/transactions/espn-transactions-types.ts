/**
 * ESPN site.api transaction feed shapes.
 * Endpoint: GET https://site.api.espn.com/apis/site/v2/sports/basketball/nba/transactions
 *
 * Observed fields (2000–present): date, description, team.
 * No athlete ids, pick ids, or structured multi-team asset graph.
 */

export type EspnTransactionTeam = {
  id?: string | number;
  abbreviation?: string;
  displayName?: string;
  location?: string;
  name?: string;
};

export type EspnTransactionRow = {
  date?: string;
  description?: string;
  team?: EspnTransactionTeam;
};

export type EspnTransactionsResponse = {
  timestamp?: string;
  status?: string;
  count?: number;
  pageIndex?: number;
  pageSize?: number;
  pageCount?: number;
  requestedYear?: { year?: number; displayName?: string };
  transactions?: EspnTransactionRow[];
};

/** On-disk raw year dump written by the ingest script. */
export type EspnTransactionsYearDump = {
  source: "espn-site-v2-transactions";
  datasetVersion: string;
  espnCalendarYear: number;
  fetchedAt: string;
  apiCount: number;
  rows: EspnTransactionRow[];
};
