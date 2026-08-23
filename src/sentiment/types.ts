/**
 * Fan & Media Sentiment domain types (architecture only — no ingest yet).
 * See docs/architecture/sentiment.md
 *
 * Sentiment is independent from performance metrics and Movement Center evidence.
 */

export type SentimentSourceClass = "fan" | "media";

export type SentimentPlatform =
  | "reddit"
  | "news"
  | "youtube"
  | "x_permitted"
  | "other";

export type SentimentDirection = "rising" | "stable" | "falling";

export type SentimentPolarity = "positive" | "neutral" | "negative" | "mixed";

/** Raw observation before aggregation. */
export type SentimentObservation = {
  id: string;
  entityType: "player" | "team";
  entityId: string;
  sourceClass: SentimentSourceClass;
  platform: SentimentPlatform;
  polarity: SentimentPolarity;
  score: number; // normalized -1..1
  mentionVolume: number;
  language: string;
  topicTags: string[];
  sampledAt: string;
  modelVersion: string;
  samplingMethod: string;
  associatedEventIds?: string[];
};

export type SentimentAggregate = {
  entityType: "player" | "team";
  entityId: string;
  window: "24h" | "7d" | "30d" | "season";
  sourceClass: SentimentSourceClass;
  polarity: SentimentPolarity;
  score: number;
  direction: SentimentDirection;
  mentionVolume: number;
  coverageConfidence: number; // 0..1
  platformBreakdown: Partial<Record<SentimentPlatform, number>>;
  topicBreakdown: Record<string, number>;
  modelVersion: string;
  computedAt: string;
};

export type SentimentEventAssociation = {
  id: string;
  entityId: string;
  entityType: "player" | "team";
  eventKind:
    | "game"
    | "injury"
    | "transaction"
    | "contract"
    | "movement_story"
    | "comment"
    | "lineup_role"
    | "award"
    | "playoff";
  eventRef: string;
  windowStart: string;
  windowEnd: string;
  /** Wording must stay associative, not causal */
  explanation: string;
  fanDelta?: number;
  mediaDelta?: number;
};
