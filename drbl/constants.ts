/** Bump when event/box parsers change shape or semantics. */
export const DRBL_PARSER_VERSION = "drbl-parser-2026.08.11";

/** Bump when possession/lineup reconstruction rules change. */
export const DRBL_RECONSTRUCTION_VERSION = "drbl-recon-2026.08.11";

/** First season whose play-by-play is published. Earlier seasons stay unpublished until minutes match. */
export const DRBL_PUBLISHED_START = "2020-21";

export function isBeforePublishedDrblSeason(season: string): boolean {
  return season < DRBL_PUBLISHED_START;
}
