# M17c provenance audit addendum

## Summary

M17c reported start `a229b076…` is an **ancestor** of the later product tip that includes P17.3 and R1 public simplification (`6bc55d7…`).

The gap is **documentation / product-only provenance debt**, not a scientifically relevant input difference.

```text
M17C_RERUN_REQUIRED = NO
```

## Recorded facts

| Field | Value |
|-------|-------|
| reported starting commit | `a229b076f85efe88c5e980b43cd1d471a60ac34d` |
| latest pre-M17c product commit | `6bc55d7a71937615de8e1951cda85b640b93ce52` |
| dependency equality | YES (scientific paths) |
| target equality | YES (`9004b7ae…`, n=1743) |
| DRBL input equality | YES (0 mismatches) |
| display identity changed | YES (P17.3) |
| research identity changed | NO |

## Why rerun is unnecessary

M17c Target A and `DRBL_pred` are functions of:

1. frozen precomputed overlays (`drbl100`, `teamId`, possessions)
2. `m18-lineup-impact-v1` @ λ=3200 on normalized games
3. evaluation loaders / prior research seals

All repository-controlled items in (1)–(3) are **byte-identical** between `a229` and `6bc55d7`. Product commits did not alter those blobs.

## Seals

Original seals **retained unaltered**:

- `M17C_PROTOCOL_FREEZE_HASH` = `2900c8bcbfd184fb7b119cacbeffe44c3f71b0cfd557ed0771fde1599dad59a2`
- `M17C_TARGET_FREEZE_HASH` = `9004b7ae8b16d237356885b6049255ef725527c033606fd52002c7196fdeff56`
- `M17C_RESULT_SEAL` = `ed5def7810c4cb24e2c9056e4e425b2c5d293e9eb46f856741b54264b8530b69`

Addendum hash:

- `M17C_PROVENANCE_ADDENDUM_HASH` = `bfe082f93b575931e9f9d602f6c95d1f8d501ab376cf931c4e5e35ba48f2e690`

## Scientific interpretation unchanged

Broad verdict remains **BLOCKED_INSUFFICIENT_EXTERNAL_DATA**.

BPM pairwise remains an allowed “essentially tied / statistically indistinguishable” description — not a promotion to COMPETITIVE.
