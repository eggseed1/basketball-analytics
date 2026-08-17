# Preexisting technical debt (separated from cutover)

## Production-scoped typecheck

After M16k1.1 engineering repairs, production-scoped `npx tsc --noEmit` (current `tsconfig.json`) reports **0** errors.

## Why scripts were excluded

`next build` / `tsc` were failing on dozens of historical research scripts under `scripts/drbl-m16*` that are **not imported by the Next app**. Those failures predated the validated DRBL cutover and are unrelated to canonical `drbl100`.

Excluding them from the production TypeScript project is **build-scope separation**, not mass cleanup of script bodies.

## Remaining backlog (outside production graph)

- `scripts/drbl-m16*.ts` historical type errors
- `drbl/evaluation/*` research helpers
- `drbl/models/counterfactual-epv-v1.ts` research module
- Optional future cleanup milestone for research-tooling TS debt

## Do not conflate

| Concern | Status |
|---------|--------|
| Validated DRBL/100 numerical cutover | CERTIFIED |
| Production `npm run build` | PASS |
| Research-script TypeScript hygiene | BACKLOG |

## Cutover-induced repair that was fixed

- Duplicate `behaviorRetrospectiveOnly` on `DrblSeasonArtifact` introduced while extending the interface in M16k1 — removed in M16k1.1.
