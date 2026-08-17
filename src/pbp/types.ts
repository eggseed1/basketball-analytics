/**
 * Play-by-play contracts.
 * Extend event fields only after observing a real imported corpus.
 */

export type PbpEventType =
  | "shot"
  | "miss"
  | "ft"
  | "reb"
  | "ast"
  | "tov"
  | "foul"
  | "sub"
  | "timeout"
  | "period"
  | "other";

/**
 * Stub event shape until a real corpus schema is observed.
 * Extend only from imported fields — do not invent columns.
 */
export type PbpEvent = {
  id: string;
  gameId: string;
  period: number;
  /** Clock remaining in period, seconds. */
  clockSeconds?: number;
  wallTime?: string;
  type: PbpEventType;
  teamId?: string;
  playerId?: string;
  description?: string;
  /** Points scored on this event, if any. */
  points?: number;
  locX?: number;
  locY?: number;
};

export type Possession = {
  id: string;
  gameId: string;
  period: number;
  offenseTeamId: string;
  defenseTeamId: string;
  startEventId?: string;
  endEventId?: string;
  points: number;
  eventIds: string[];
};

/** Executable ASK / Game Lab gates — stay false until Phase B+ wiring. */
export type PbpCapability = {
  gamesIndexed: boolean;
  possessionsDerived: boolean;
  shotLocations: boolean;
  lineups: boolean;
};

/**
 * Dataset identity for an attached corpus.
 * Written by the import pipeline; read by coverage / future loaders.
 * Counts are declarative — do not scan the full corpus to build this.
 */
export type PbpCorpusManifest = {
  /** Logical source label (e.g. vendor / pipeline name). */
  source: string;
  /** Dataset or pipeline version string. */
  version: string;
  /** Absolute or repo-relative root that holds this corpus. */
  path: string;
  /** ISO timestamp when this corpus was imported/normalized. */
  importedAt: string;
  games: number;
  events: number;
  seasons: string[];
  earliestSeason: string | null;
  latestSeason: string | null;
  fileCount: number;
  /** e.g. jsonl, parquet, sqlite — as observed, not aspirational. */
  format: string;
  notes?: string[];
};

export type PbpCorpusAttachment =
  | "missing"
  | "unreadable"
  | "malformed"
  | "attached";

export type PbpCorpusStatus = {
  attachment: PbpCorpusAttachment;
  /** Resolved root from PBP_DATA_PATH or default data/pbp. */
  dataPath: string;
  manifestPath: string;
  /** Env var used, if any. */
  envPath: string | null;
  /** True when a readable, schema-valid manifest exists. */
  manifestPresent: boolean;
  manifest: PbpCorpusManifest | null;
  errors: string[];
  /**
   * Local attach ≠ production readiness.
   * Capability flags remain false until executors are wired.
   */
  executable: false;
};
