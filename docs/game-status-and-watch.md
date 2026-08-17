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
 * ## Watch data
 * Structured `broadcasts` / `geoBroadcasts` from ESPN scoreboard events are
 * mapped in `mapEspnBroadcasts`. No pirate streams. League Pass is always
 * shown with blackout caveats — this repo does **not** implement a blackout
 * entitlement API.
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
 * Watch metadata is NOT refreshed on the live score cadence.
 *
 * ## Future PBP / DRBL Wins Above R1
 * Correct live status + tipOffAt + period/clock form the substrate for:
 * LIVE GAME STATE → LIVE PBP → EACH PLAY → DRBL_R1_delta → cumulative value.
 * Do not invent formulas here.
 */

export {};
