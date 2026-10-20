/**
 * Game status + legal watch discovery.
 *
 * ## Canonical statuses
 * scheduled | pregame | in_progress | halftime | period_break | final |
 * postponed | cancelled | suspended | delayed | unknown
 *
 * ## ESPN → DRBL mapping
 * Implemented in `normalizeEspnStatusType` (`src/lib/game-status.ts`).
 * Critical rule: completed/post + 0–0 does **not** become `final` unless an
 * explicit STATUS_FINAL (with real scores) is present.
 *
 * ## Watch logos
 * UI: `GameWatchLogos` in the game identity header / lineup center on
 * `/games/[gameId]`. One small mark per network family; click opens the
 * official destination. The old full “Streaming on” card is gone.
 *
 * ### Per-game networks
 * ESPN `broadcasts` / `geoBroadcasts` → `mapEspnBroadcasts` (`src/lib/game-watch.ts`).
 * National labels (ESPN, ABC, NBC, Peacock, Prime Video, …) get official
 * `watchUrl`s from `officialWatchUrlForLabel` (`src/lib/nba-streaming.ts`).
 * Local RSN names stay link-less (no invented affiliate URLs).
 * Dedupe uses `broadcastNetworkKey` so NBC / Peacock / “NBC / Peacock” share
 * one chip.
 *
 * ### Geography helpers
 * `streamingRegionForCountry` and League Pass blocked countries remain for
 * any future regional UI. The compact logo row only shows networks listed
 * on this game.
 *
 * ### Season auto-update
 * - Game listings refresh with the ESPN schedule feed (same as scores).
 * - Media-deal era flips with the game season string via
 *   `streamingEraForSeason` (2025-26+ = Disney / NBCU / Amazon).
 * - “How to watch this season” links to NBA.com’s living guide
 *   (`NBA_HOW_TO_WATCH_2025`), which the league updates during the year.
 *
 * ## Legal / licensing notes (not legal advice)
 * - Broadcast names come from the same ESPN feed already used for scores.
 * - Provider logos / deep-link policies may require licensing review before
 *   commercial branding use.
 * - Prefer linking fans to official destinations (NBA Tap to Watch / League
 *   Pass / network apps) when a verified URL exists; do not invent URLs.
 *
 * ## Live refresh
 * Cadence policy: `src/lib/live-refresh-policy.ts`
 * Batched day scoreboard: `GET /api/scores/live` → `fetchScoreboardDay`
 * Client: one timer via `useLiveScoreboardRefresh` / `LiveScoreboardScope`
 *   - live: 20s · halftime: 45s · scheduled: 120s · final: stop
 *   - hidden tab ×3 · failure backoff · visibility wake with force bypass
 * Watch metadata rides along with schedule/shell fetches, not the 20s live tick.
 *
 * ## Future PBP / DRBL Wins Above R1
 * Correct live status + tipOffAt + period/clock form the substrate for:
 * LIVE GAME STATE → LIVE PBP → EACH PLAY → DRBL_R1_delta → cumulative value.
 * Do not invent formulas here.
 */

export {};
