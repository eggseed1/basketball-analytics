/**
 * Fan & Media Sentiment — S1 curated prototype (seeds + observation batches).
 * See docs/architecture/sentiment.md and docs/architecture/sentiment-s0-policy.md
 */

export * from "./types";
export * from "./curated-types";
export * from "./load-curated";
export * from "./movers";
export * from "./insights";
export { buildSentimentSnapshot } from "./build-snapshot";
export { hydrateLeagueNarrativeHygiene } from "./narrative-hygiene";
