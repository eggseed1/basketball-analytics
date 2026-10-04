import type {
  SentimentDirection,
  SentimentPolarity,
  SentimentPlatform,
} from "@/sentiment/types";

export type SentimentWindowId = "7d" | "30d" | "90d";

export const SENTIMENT_WINDOW_OPTIONS: { id: SentimentWindowId; label: string }[] = [
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
  { id: "90d", label: "90d" },
];

export type SentimentMoodSeries = {
  fan: SentimentSeriesPoint[];
  media: SentimentSeriesPoint[];
};

export type SentimentSeriesPoint = {
  date: string;
  score: number;
  /** Items behind the point (automated lanes). */
  count?: number;
};

/**
 * Where a lane's numbers come from.
 * curated: hand-written prototype values (illustrative, not measured).
 * headlines: publisher RSS headline tone (automated; Workers AI model rating per
 *   player where available, word list otherwise).
 * reddit: approved-subreddit post-title tone via the official API (older snapshots).
 * fans: fan blogs, Bluesky posts, YouTube comments and Reddit titles blended;
 *   platformBreakdown says how much each contributed. Player lanes use the
 *   Workers AI model rating where one was made at ingest, word list otherwise.
 */
export type SentimentLaneOrigin = "curated" | "headlines" | "reddit" | "fans";

export type CuratedSentimentLane = {
  polarity: SentimentPolarity;
  score: number;
  direction: SentimentDirection;
  mentionVolume: number;
  coverageConfidence: number;
  platformBreakdown: Partial<Record<SentimentPlatform, number>>;
  topicBreakdown: Record<string, number>;
  origin?: SentimentLaneOrigin;
  /** Latest sample date in the lane (YYYY-MM-DD). */
  asOf?: string;
  /** Earliest sample date counted in the lane window (YYYY-MM-DD). */
  windowStart?: string;
  modelVersion?: string;
  /**
   * Mean score over the previous window of equal length, when that window
   * also cleared the floor. Null means the trend is unknown, not flat.
   */
  priorScore?: number | null;
};

/** A linked headline behind an automated media lane. */
export type SentimentHeadlineExemplar = {
  title: string;
  url: string;
  outlet: string;
  publishedAt: string;
  score: number;
  /** Model rating toward the player (player pages) or the one player named (league list). */
  rating?: -1 | 0 | 1;
};

export type SentimentProfileProvenance =
  | "hand_crafted"
  | "generated"
  | "observation"
  | "ingest";

export type PlayerSentimentProfile = {
  playerIds: string[];
  displayName?: string;
  teamKey?: string;
  window: string;
  provenance?: SentimentProfileProvenance;
  /** Absent when no source clears the coverage floor (blank, not neutral). */
  fan?: CuratedSentimentLane;
  media?: CuratedSentimentLane;
  headlines?: SentimentHeadlineExemplar[];
  /** Last completed season's DRBL/100, joined by name at build time. */
  performance?: { season: string; drbl100: number; possessions: number };
  association?: {
    explanation: string;
    eventKind: string;
    eventRef: string;
  };
  /** Daily score trend for line charts (curated prototype). */
  series?: {
    fan: SentimentSeriesPoint[];
    media: SentimentSeriesPoint[];
  };
};

/** Franchise-level fan/media lanes (team discourse or roster rollup). */
export type TeamSentimentProfile = {
  teamIds: string[];
  displayName?: string;
  teamKey?: string;
  window: string;
  provenance?: SentimentProfileProvenance;
  /** Roster rollup vs direct team-entity observations. */
  source?: "roster_rollup" | "team_observation" | "headlines";
  fan?: CuratedSentimentLane;
  media?: CuratedSentimentLane;
  headlines?: SentimentHeadlineExemplar[];
  series?: {
    fan: SentimentSeriesPoint[];
    media: SentimentSeriesPoint[];
  };
};

export type SentimentMoverRow = {
  playerId: string;
  displayName: string;
  teamKey?: string;
  fanScore: number;
  delta: number;
  mentionVolume: number;
  origin?: SentimentLaneOrigin;
  asOf?: string;
};

export type SentimentSnapshotMeta = {
  methodologyVersion: string;
  status: string;
  season: string;
  disclaimer: string;
  snapshotDate?: string;
  builtAt?: string;
  rosterPlayerCount?: number;
  pilotProfileCount?: number;
  observationBatchCount?: number;
  observationBatchIds?: string[];
  movers?: {
    window: string;
    lookbackDays: number;
    risers: SentimentMoverRow[];
    fallers: SentimentMoverRow[];
  };
  /** Largest |fan − media| gaps (perception disagreement). */
  divergences?: {
    window: string;
    minAbsGap: number;
    rows: SentimentDivergenceRow[];
  };
  /** Topic weights rolled up across tracked player lanes. */
  topicHeat?: SentimentTopicHeatRow[];
  topicHeatOrigin?: SentimentLaneOrigin;
  teamProfileCount?: number;
  sources?: SentimentSourceSummary;
};

export type SentimentSourceSummary = {
  curated: { asOf: string | null; laneCount: number };
  headlines: {
    asOf: string | null;
    firstDate: string | null;
    itemCount: number;
    windowItemCount: number;
    outlets: string[];
    modelVersion: string;
    floor: number;
    laneCount: number;
    /** Set once any player mention in the window has a model rating. */
    toneModel?: string;
    /** Share of this week's headline player mentions rated by the model (0..1). */
    ratedShare?: number;
  };
  reddit: {
    configured: boolean;
    asOf: string | null;
    itemCount: number;
    floor: number;
    laneCount: number;
  };
  /** Every fan source together. Absent in snapshots built before fan blogs. */
  fans?: {
    asOf: string | null;
    firstDate: string | null;
    itemCount: number;
    windowItemCount: number;
    /** Items per platform: reddit, fan_blog, bluesky, youtube. */
    platforms: Partial<Record<SentimentPlatform, number>>;
    blogCount: number;
    floor: number;
    laneCount: number;
    /** Set once any Bluesky post or YouTube comment has a model rating. */
    toneModel?: string;
    /** Share of this week's Bluesky and YouTube player mentions rated by the model (0..1). */
    ratedShare?: number;
  };
};

export type SentimentDivergenceRow = {
  playerId: string;
  displayName: string;
  teamKey?: string;
  fanScore: number;
  mediaScore: number;
  /** fanScore − mediaScore (negative = fans colder than media). */
  gap: number;
  absGap: number;
  /** Both lanes curated, or both measured. Mixed pairs are never compared. */
  origin?: "curated" | "measured";
};

export type SentimentTopicHeatRow = {
  topic: string;
  /** Mention-weighted share across fan+media lanes (0–1 after normalize). */
  weight: number;
  playerCount: number;
  mentionVolume: number;
};

export type SentimentCuratedSnapshot = {
  meta: SentimentSnapshotMeta;
  players: PlayerSentimentProfile[];
  teams?: TeamSentimentProfile[];
  league?: LeagueSentimentSnapshot;
};

export type SentimentNarrativePlayer = {
  playerId: string;
  displayName: string;
  teamKey?: string;
  /** Share of mentions within this narrative (0–1). */
  narrativeShare: number;
  fanScore: number;
  mediaScore: number;
  note: string;
};

export type SentimentNarrativeCollection = {
  id: string;
  slug: string;
  label: string;
  description: string;
  direction: SentimentDirection;
  mentionVolume: number;
  coverageConfidence: number;
  players: SentimentNarrativePlayer[];
  series?: SentimentSeriesPoint[];
};

export type LeagueSentimentSnapshot = {
  window: string;
  mood: {
    fan: CuratedSentimentLane;
    media: CuratedSentimentLane;
  };
  moodSeries?: SentimentMoodSeries;
  moodSeriesByWindow?: Partial<Record<SentimentWindowId, SentimentMoodSeries>>;
  narratives: SentimentNarrativeCollection[];
  /** Daily tone across all NBA headlines (automated). */
  headlineMood?: { lane: CuratedSentimentLane; series: SentimentSeriesPoint[] };
  /** Daily tone across approved subreddits (automated, needs Reddit credentials). */
  redditMood?: { lane: CuratedSentimentLane; series: SentimentSeriesPoint[] };
  /** Daily tone across every fan source (automated). Replaces redditMood. */
  fanMood?: { lane: CuratedSentimentLane; series: SentimentSeriesPoint[] };
  latestHeadlines?: (SentimentHeadlineExemplar & {
    players: { id: string; name: string }[];
    teamIds: string[];
    topics: string[];
  })[];
};

export type TrackedPlayerSentimentRow = {
  playerId: string;
  displayName: string;
  teamKey?: string;
  window: string;
  fan?: CuratedSentimentLane;
  media?: CuratedSentimentLane;
  series?: PlayerSentimentProfile["series"];
  headlineCount?: number;
  performance?: PlayerSentimentProfile["performance"];
  hasProfile?: boolean;
  provenance?: SentimentProfileProvenance;
};

export type LeagueSentimentFeed = {
  season: string;
  disclaimer: string;
  status: string;
  snapshotDate: string | null;
  sources: SentimentSourceSummary | null;
  league: LeagueSentimentSnapshot;
  moodSeriesByWindow: Record<SentimentWindowId, SentimentMoodSeries>;
  /** Lane behind each mood chart (origin + asOf drive the labels). */
  moodLanes: { fan: CuratedSentimentLane; media: CuratedSentimentLane };
  divergences: SentimentDivergenceRow[];
  topicHeat: SentimentTopicHeatRow[];
  topicHeatOrigin: SentimentLaneOrigin;
};
