# Regression status semantics (M16k1.1 correction)

M16k1 reported:

```text
type check = FAIL
REGRESSION_SUITE = PASS
```

That pairing was **TOO_BROAD**.

## Correct labels

| Label | Meaning |
|-------|---------|
| CUTOVER_UNIT_TEST_SUITE | validated ability / percentile / ui-metric tests |
| REPO_TYPECHECK | `npx tsc --noEmit` across entire tsconfig include (incl. scripts) |
| PRODUCTION_BUILD | `npm run build` → `next build` |
| FULL_REGRESSION_CERTIFICATION | all of the above required gates for final cert |

## M16k1 characterization

`REGRESSION_SUITE=PASS` meant **cutover unit tests passed**, not full repo typecheck/build certification.

**CORRECTED** by M16k1.1.
