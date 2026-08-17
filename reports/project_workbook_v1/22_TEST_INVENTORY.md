# 22 — Test inventory

## DRBL unit tests (`npm run drbl:test`)

36 files under `drbl/**/__tests__/**/*.test.ts`.

- `drbl/evaluation/__tests__/fusion-constraint.test.ts`
- `drbl/evaluation/__tests__/m16b-evaluation.test.ts`
- `drbl/historical/__tests__/m17a-registry-adapter.test.ts`
- `drbl/models/__tests__/ability-lineage.test.ts`
- `drbl/models/__tests__/attribution-weights.test.ts`
- `drbl/models/__tests__/behavior.test.ts`
- `drbl/models/__tests__/board-provenance.test.ts`
- `drbl/models/__tests__/continuation-value.test.ts`
- `drbl/models/__tests__/fusion-oof.test.ts`
- `drbl/models/__tests__/leaderboard.test.ts`
- `drbl/models/__tests__/leverage.test.ts`
- `drbl/models/__tests__/lineup-model.test.ts`
- `drbl/models/__tests__/pipeline-value.test.ts`
- `drbl/models/__tests__/ranking-forensics.test.ts`
- `drbl/models/__tests__/replacement.test.ts`
- `drbl/models/__tests__/research-ability-v1.test.ts`
- `drbl/models/__tests__/research-direct-quantile-uncertainty-v2.test.ts`
- `drbl/models/__tests__/research-monotone-conditional-uncertainty-v3.test.ts`
- `drbl/models/__tests__/research-predictive-uncertainty-v1.test.ts`
- `drbl/models/__tests__/research-rate-v1.test.ts`
- `drbl/models/__tests__/research-reliability-features-v1.test.ts`
- `drbl/models/__tests__/research-reliability-uncertainty-v2.test.ts`
- `drbl/models/__tests__/sequential-attribution.test.ts`
- `drbl/models/__tests__/shot-decision.test.ts`
- `drbl/models/__tests__/ui-metric-integrity.test.ts`
- `drbl/models/__tests__/uncertainty.test.ts`
- `drbl/models/__tests__/validated-ability-v1.test.ts`
- `drbl/models/__tests__/validated-percentile-eligibility-v1.test.ts`
- `drbl/models/__tests__/war-dimensional.test.ts`
- `drbl/models/__tests__/war-math.test.ts`
- `drbl/models/__tests__/war-team-stint-allocation-v1.test.ts`
- `drbl/models/__tests__/war-unit-repair.test.ts`
- `drbl/models/__tests__/war-units.test.ts`
- `drbl/models/__tests__/war.test.ts`
- `drbl/possessions/__tests__/possession-edge-cases.test.ts`
- `drbl/research/m18/__tests__/m18-lineup-uir.test.ts`

## Script / product tests (`npm run test:*`)

48 runners in `scripts/test-*.ts`.

- `scripts/test-advanced-stats-audit.ts` — `npm run test:advanced-stats-audit`
- `scripts/test-ask-drbl.ts` — `npm run test:ask-drbl`
- `scripts/test-ask-examples.ts` — `npm run test:ask-examples`
- `scripts/test-ask-recent-store.ts` — `npm run test:ask-recent-store`
- `scripts/test-box-score-context.ts` — `npm run test:box-score-context`
- `scripts/test-career-resume.ts` — `npm run test:career-resume`
- `scripts/test-cross-route-continuity.ts` — `npm run test:cross-route-continuity`
- `scripts/test-data-truth.ts` — `npm run test:data-truth`
- `scripts/test-drbl-release.ts` — `npm run test:drbl-release`
- `scripts/test-explore-players-board.ts` — `npm run test:explore-players-board`
- `scripts/test-external-links.ts` — `npm run test:external-links`
- `scripts/test-game-lab.ts` — `npm run test:game-lab`
- `scripts/test-game-matchup-theme.ts` — `npm run test:game-matchup-theme`
- `scripts/test-game-season-context.ts` — `npm run test:game-season-context`
- `scripts/test-game-shell.ts` — `npm run test:game-shell`
- `scripts/test-game-status.ts` — `npm run test:game-status`
- `scripts/test-historical-impact.ts` — `npm run test:historical-impact`
- `scripts/test-historical-team-brand.ts` — `npm run test:historical-team-brand`
- `scripts/test-historical-team-era.ts` — `npm run test:historical-team-era`
- `scripts/test-historical-team-fail-fast.ts` — `npm run test:historical-team-fail-fast`
- `scripts/test-leaderboard-context-panel.ts` — `npm run test:leaderboard-context-panel`
- `scripts/test-learn-explanations.ts` — `npm run test:learn-explanations`
- `scripts/test-live-refresh.ts` — `npm run test:live-refresh`
- `scripts/test-offseason-tracker.ts` — `npm run test:offseason-tracker`
- `scripts/test-pbp-capability.ts` — `npm run test:pbp-capability`
- `scripts/test-player-board-resilience.ts` — `npm run test:player-board-resilience`
- `scripts/test-player-career-explorer.ts` — `npm run test:player-career-explorer`
- `scripts/test-player-data-health.ts` — `npm run test:player-data-health`
- `scripts/test-player-identity-preview.ts` — `npm run test:player-identity-preview`
- `scripts/test-player-percentile-metrics.ts` — `npm run test:player-percentile-metrics`
- `scripts/test-player-season-compare.ts` — `npm run test:player-season-compare`
- `scripts/test-player-season-rank.ts` — `npm run test:player-season-rank`
- `scripts/test-production-provider-guard.ts` — `npm run test:production-provider-guard`
- `scripts/test-progressive-destinations.ts` — `npm run test:progressive-destinations`
- `scripts/test-scoreboard-resilience.ts` — `npm run test:scoreboard-resilience`
- `scripts/test-season-evidence.ts` — `npm run test:season-evidence`
- `scripts/test-site-nav.ts` — `npm run test:site-nav`
- `scripts/test-team-arc.ts` — `npm run test:team-arc`
- `scripts/test-team-assets.ts` — `npm run test:team-assets`
- `scripts/test-team-identity.ts` — `npm run test:team-identity`
- `scripts/test-team-intelligence.ts` — `npm run test:team-intelligence`
- `scripts/test-team-season-compare.ts` — `npm run test:team-season-compare`
- `scripts/test-team-season-rank.ts` — `npm run test:team-season-rank`
- `scripts/test-teams-catalog-resilience.ts` — `npm run test:teams-catalog-resilience`
- `scripts/test-time-machine.ts` — `npm run test:time-machine`
- `scripts/test-transaction-lineage.ts` — `npm run test:transaction-lineage`
- `scripts/test-transaction-player-resolve.ts` — `npm run test:transaction-player-resolve`
- `scripts/test-ui-continuity.ts` — `npm run test:ui-continuity`

## Priority gates for integration workbook

| Gate | Command | Role |
| --- | --- | --- |
| DRBL units | `npm run drbl:test` | Model/math invariants |
| Typecheck | `npx tsc --noEmit` | TS contract |
| Data truth | `npm run test:data-truth` | Precomputed/board truth |
| Site nav | `npm run test:site-nav` | Nav contract |
| DRBL release (fixture) | `npm run test:drbl-release:fixture` | Release semantics without live ESPN fragility |
| Provider guard | `npm run test:production-provider-guard` | Production provider safety |

Live ESPN fixture flakes (e.g. team-identity schedule sample miss) must not fail the forensic workbook.
