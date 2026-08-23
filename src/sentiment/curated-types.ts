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
};

export type CuratedSentimentLane = {
  polarity: SentimentPolarity;
  score: number;
  direction: SentimentDirection;
  mentionVolume: number;
  coverageConfidence: number;
  platformBreakdown: Partial<Record<SentimentPlatform, number>>;
  topicBreakdown: Record<string, number>;
};

export type SentimentProfileProvenance =
  | "hand_crafted"
  | "generated"
  | "observation";

export type PlayerSentimentProfile = {
  playerIds: string[];
  displayName?: string;
  teamKey?: string;
  window: string;
  provenance?: SentimentProfileProvenance;
  fan: CuratedSentimentLane;
  media: CuratedSentimentLane;
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

export type SentimentMoverRow = {
  playerId: string;
  displayName: string;
  teamKey?: string;
  fanScore: number;
  delta: number;
  mentionVolume: number;
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
};

export type SentimentCuratedSnapshot = {
  meta: SentimentSnapshotMeta;
  players: PlayerSentimentProfile[];
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
};

export type TrackedPlayerSentimentRow = {
  playerId: string;
  displayName: string;
  teamKey?: string;
  window: string;
  fan?: CuratedSentimentLane;
  media?: CuratedSentimentLane;
  hasProfile?: boolean;
  provenance?: SentimentProfileProvenance;
};

export type LeagueSentimentFeed = {
  season: string;
  disclaimer: string;
  status: string;
  league: LeagueSentimentSnapshot;
  moodSeriesByWindow: Record<SentimentWindowId, SentimentMoodSeries>;
};
