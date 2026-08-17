# 05 — Research Timeline

Chronology of sealed milestones relevant to the integrated freeze. Hashes are copied from seals — **not invented**.

| When (seal timestamps) | Milestone | Verdict / result | Seal / hash |
|---|---|---|---|
| Pre-M16l product | Point estimate freeze | frozen EB1600 P-only ability | `POINT_ESTIMATE_FREEZE_HASH` `942b21ef…` |
| M16j | Reserved point validation | STRONG_PASS | `84f4eadc…` |
| M16l2 | Reserved R1 value | STRONG_PASS; 2025-26 WAR reserved consumed once | `dc556c35…` |
| M16l3 | Product migration | CUTOVER_COMPLETE; R1 Points / WinEq canonical | `48a9d39e…` |
| M17a.1 | Raw historical import | sealed import | `b87fff81…` |
| 2026-08-17 ~05:03Z | M17a.2 Historical corpus | PARTIAL_HISTORICAL_BACKFILL_COMPLETE; Tier A NONE; Tier B 2020-21…2023-24 | `60ef9954…` |
| 2026-08-17 ~15:21Z | M17b Multi-season temporal | STRONG_MULTI_SEASON_PASS | `b606cf60…` |
| 2026-08-17 ~15:40Z | M18a Latent off-ball / UIR | Reserved STRONG_PASS; UIR persistent residual; off-ball NO | `ba98a652…` |
| 2026-08-17 ~15:51Z | M18b.0 Tracking readiness | T3; POSSIBLE_REQUIRES_USER_ACCESS | `ade47897…` |
| Merge parents | Analytics `72272b2` + Web `7e764ce` @ base `629bb1b` | — | — |
| Integration commit | `28827fb…` | semantics preserved; regressions 0 | health precommit `fed78dae…` |
| 2026-08-17 ~16:35Z | Docs integration seal | INTEGRATION_READY_FOR_RESEARCH YES | `76169541…` @ HEAD `64cc231` |

## Explicit non-events

| Milestone | Status |
|---|---|
| M17c External common-target benchmark | **NOT_STARTED** (authorized) |
| M18b Tracking off-ball identification | **NOT_STARTED** (beyond M18b.0 readiness) |

## Parameter freeze across lineage

Throughout M17/M18/integration seals:

```text
K = 1600
P1 = 37.490662671779255
CANONICAL_ABILITY_VERSION = drbl-ability-eb1600-r1-v1
DRBL_V1_REOPENED = NO
K_REFIT = NO
P1_REFIT = NO
R1_CHANGED = NO
EPV_CHANGED = NO
```
