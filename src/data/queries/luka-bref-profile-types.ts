/**
 * Client-safe Luka profile types / constants.
 * Keep scrape loaders in `luka-bref-profile.ts` so season-table JSON stays server-only.
 * Bio shape mirrors BrefPlayerBio without importing the scraper module graph.
 */

export const LUKA_COHORT_RULE =
  "Qualified: 20+ games or 500+ minutes, same season and season type, combined-season grain.";

export type LukaTab = "overview" | "trends" | "shooting" | "all-stats";

export type LukaBrefBio = {
  displayName: string;
  pronunciation: string | null;
  positionLine: string | null;
  shoots: string | null;
  heightLabel: string | null;
  heightInches: number | null;
  weightLbs: number | null;
  currentTeamName: string | null;
  currentTeamAbbr: string | null;
  birthDate: string | null;
  birthPlace: string | null;
  country: string | null;
  draftLine: string | null;
  debutLine: string | null;
  experienceLine: string | null;
  jersey: string | null;
};

export type LukaHeroCard = {
  key: string;
  label: string;
  display: string;
  unit: string;
  definition: string;
  percentile: number | null;
  rank: number | null;
  cohortSize: number | null;
  deltaDisplay: string | null;
  qualified: boolean;
  percentilesOnStint: boolean;
};

export type LukaPercentileRow = {
  id: string;
  group: string;
  label: string;
  display: string;
  percentile: number;
  fillPercentile: number;
  rank: number;
  cohortSize: number;
  lowerIsBetter: boolean;
};

export type LukaLedgerRow = {
  season: string;
  teamAbbr: string;
  combined: boolean;
  gamesPlayed: number | null;
  gamesStarted: number | null;
  minutes: number | null;
  points: number | null;
  rebounds: number | null;
  assists: number | null;
  fieldGoalPct: number | null;
  threePointPct: number | null;
  freeThrowPct: number | null;
  trueShootingPct: number | null;
  effectiveFieldGoalPct: number | null;
  usagePct: number | null;
  turnoverPct: number | null;
  per: number | null;
  bpm: number | null;
  vorp: number | null;
  winShares: number | null;
};

export type LukaTrendPoint = {
  season: string;
  value: number;
  teamId: string;
  teamAbbr: string;
  color: string;
};

export type LukaBrefProfile = {
  espnId: string;
  nbaId: string;
  displayName: string;
  bio: LukaBrefBio;
  scrapedAt: string;
  season: string;
  seasonType: "regular" | "playoffs";
  team: string;
  rate: "perGame" | "totals" | "per36" | "per100";
  tab: LukaTab;
  seasons: string[];
  teamOptions: string[];
  viewingLine: string;
  currentLine: string;
  viewingAge: number | null;
  viewingPosition: string | null;
  rateUnit: string;
  hero: LukaHeroCard[];
  percentileRows: LukaPercentileRow[] | null;
  percentileBlockedReason: string | null;
  trends: {
    pts: LukaTrendPoint[];
    ts: LukaTrendPoint[];
    usg: LukaTrendPoint[];
    bpm: LukaTrendPoint[];
  };
  ledger: LukaLedgerRow[];
  emptyPlayoffs: boolean;
};
