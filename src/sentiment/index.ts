/**
 * Fan & Media Sentiment — future Live NBA Intelligence layer.
 * Architecture + types only until Phase S1. See docs/architecture/sentiment.md
 */

export * from "./types";
export * from "./curated-types";
export * from "./load-curated";
export * from "./movers";
export { buildSentimentSnapshot } from "./build-snapshot";
export { hydrateLeagueNarrativeHygiene } from "./narrative-hygiene";
