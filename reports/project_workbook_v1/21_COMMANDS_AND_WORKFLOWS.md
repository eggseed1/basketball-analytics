# 21 — Commands and workflows

Derived from `package.json` scripts (130 total). Focus on gates and milestone workflows.

```bash
# day-to-day
npm run dev
npm run build
npm run lint

# engineering health (workbook)
npm run drbl:test
npx tsc --noEmit
npm run test:data-truth
npm run test:site-nav
```

Typecheck is not a package script; use `npx tsc --noEmit`.

## App lifecycle

| script | command |
| --- | --- |
| `npm run dev` | `next dev` |
| `npm run build` | `next build` |
| `npm run start` | `next start` |
| `npm run lint` | `eslint` |

## Engineering gates

| script | command |
| --- | --- |
| `npm run drbl:test` | `tsx --test drbl/**/__tests__/**/*.test.ts` |
| `npm run test:data-truth` | `tsx scripts/test-data-truth.ts` |
| `npm run test:site-nav` | `tsx scripts/test-site-nav.ts` |
| `npm run test:drbl-release` | `tsx scripts/test-drbl-release.ts` |
| `npm run test:drbl-release:fixture` | `tsx scripts/test-drbl-release.ts fixture` |
| `npm run test:drbl-release:live-espn` | `tsx scripts/test-drbl-release.ts live-espn` |
| `npm run test:production-provider-guard` | `tsx scripts/test-production-provider-guard.ts` |

## DRBL compute / remaster

| script | command |
| --- | --- |
| `npm run drbl:compute` | `tsx scripts/drbl-compute-season.ts` |
| `npm run drbl:pipeline` | `tsx scripts/drbl-pipeline-remaster.ts` |
| `npm run drbl:ranking-remaster` | `tsx scripts/drbl-ranking-remaster.ts` |
| `npm run drbl:epv` | `tsx scripts/drbl-epv-calibrate.ts` |
| `npm run drbl:sequential` | `tsx scripts/drbl-sequential-reattribute.ts` |
| `npm run drbl:war-audit` | `tsx scripts/drbl-war-audit.ts` |
| `npm run drbl:ui-metric-integrity` | `tsx scripts/drbl-ui-metric-integrity.ts` |

## Milestone scripts (recent)

| script | command |
| --- | --- |
| `npm run drbl:m16l3` | `tsx scripts/drbl-m16l3.ts` |
| `npm run drbl:m17a` | `tsx scripts/drbl-m17a.ts` |
| `npm run drbl:m17a_2` | `tsx scripts/drbl-m17a_2.ts` |
| `npm run drbl:m17b` | `tsx scripts/drbl-m17b.ts` |
| `npm run drbl:m18a` | `tsx scripts/drbl-m18a.ts` |
| `npm run drbl:m18b_0` | `tsx scripts/drbl-m18b_0.ts` |
| `npm run drbl:import-historical` | `tsx scripts/drbl-import-historical.ts` |

## Smoke / prefetch

| script | command |
| --- | --- |
| `npm run smoke:nba` | `tsx scripts/smoke-nba.ts` |
| `npm run smoke:games` | `tsx scripts/smoke-games.ts` |
| `npm run smoke:historical` | `tsx scripts/smoke-historical.ts` |
| `npm run prefetch:historical` | `tsx --env-file=.env.local scripts/prefetch-historical-games.ts --from 1960 --to 2025` |
| `npm run prefetch:1960s` | `tsx --env-file=.env.local scripts/prefetch-historical-games.ts --from 1960 --to 1969` |

## Product feature tests (sample)

| script | command |
| --- | --- |
| `npm run test:career-resume` | `tsx scripts/test-career-resume.ts` |
| `npm run test:ask-drbl` | `tsx scripts/test-ask-drbl.ts` |
| `npm run test:game-lab` | `tsx scripts/test-game-lab.ts` |
| `npm run test:team-intelligence` | `tsx scripts/test-team-intelligence.ts` |
| `npm run test:time-machine` | `tsx scripts/test-time-machine.ts` |
| `npm run test:team-identity` | `tsx scripts/test-team-identity.ts` |
| `npm run test:historical-team-era` | `tsx scripts/test-historical-team-era.ts` |

## Notes

- `drbl:test` runs `tsx --test drbl/**/__tests__/**/*.test.ts` (unit/model tests).
- `test:drbl-release:fixture` is the safe release gate; `live-espn` may fail on schedule sample misses without failing the workbook.
- Historical prefetch / BallDontLie smokes require `BALLDONTLIE_API_KEY` in `.env.local`.
- Many `drbl:m16*` / `drbl:m17*` / `drbl:m18*` scripts are milestone forensic runners — prefer sealed reports over re-running unless intentional.
