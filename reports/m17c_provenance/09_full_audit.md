# M17c provenance reconciliation — full audit

## Verdict

```text
DOCUMENTATION / PRODUCT-ONLY PROVENANCE DEBT
M17C_RERUN_REQUIRED = NO
```

Existing numerical seals remain valid and transportable to product tip `6bc55d7`.

## Ancestry

Linear:

```text
a229b076 → 5614ce3 (P17.3) → 4e998d0 (docs) → 6bc55d7 (R1 public labels)
```

`LATEST_PRE_M17C_PRODUCT_COMMIT = 6bc55d7a71937615de8e1951cda85b640b93ce52`

## Diff summary (a229 → 6bc55d7)

72 paths. Classification counts:

| Class | Count |
|-------|------:|
| REPORT/DOCS | 35 |
| PUBLIC_METRIC_LABEL | 14 |
| PLAYER_IDENTITY_PRESENTATION | 10 |
| LEARN/COPY | 6 |
| TEST | 6 |
| PRODUCT_PRESENTATION | 1 |
| ANALYTICS_CORE / TARGET / HISTORICAL_PIPELINE / PLAYER_VALUE_DATA | 0 |

## Research dependencies

Scientifically relevant paths audited (precomputed seasons, m18 lineup engine, evaluation loaders, prior seals): **all identical**.

Product-only paths (identity presentation, public labels, Learn) changed as expected — **not** M17c inputs.

## Target equality

- rows: 1743 (TRAIN 866 / VAL 437 / RES 440)
- sealed hash: `9004b7ae…`
- reproduced from sealed manifest (exact canonical JSON): **match**
- Input identity a229↔6bc55d7 ⇒ Target-A regenerable identically; no λ/protocol change

## DRBL predictor equality

`DRBL_INPUT_MISMATCHES = 0` (inter-commit + sealed-vs-precomputed)

## Identity

- DISPLAY_IDENTITY_CHANGED = YES (P17.3)
- RESEARCH_IDENTITY_CHANGED = NO

## R1 simplification

Presentation only; M17c does not depend on public R1 labels.

## Existing scientific interpretation (retained)

- Pairwise BPM: STATISTICALLY_INDISTINGUISHABLE (ΔRMSE ≈ −0.0134; CI crosses 0)
- Broad verdict: **BLOCKED_INSUFFICIENT_EXTERNAL_DATA** (not COMPETITIVE)
- Source status: EPM blocked; LEBRON insufficient; DARKO lookahead-unsafe; RAPM no archive; RAPTOR insufficient reserved coverage

## Simple surface

DRBL and BPM were essentially tied on the shared future lineup-impact target. Not enough other historical metrics cleared coverage for a broader field judgment.

## Deep rabbit hole

Target construction, affine calibration, validation vs reserved, bootstrap, coverage, source provenance, team changers, exposure bins, complementarity — unchanged seals.

## Roadmap

```text
NEXT_PRIMARY_MILESTONE = M17d_FULL_HISTORICAL_PBP_PRODUCTIZATION
external source acquisition = PARALLEL / OPPORTUNISTIC
```

Reason: broad M17c is blocked by external-source availability, not by DRBL pipeline failure. Historical PBP corpus remains available for product/research value.

## Firewall

- DRBL changed: NO
- Product changed in this provenance milestone: NO
- New external metrics: NO
- M17d started: NO
