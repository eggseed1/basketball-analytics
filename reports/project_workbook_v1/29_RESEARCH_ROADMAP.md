# 29 — Research Roadmap

**Firewall:** do not reopen DRBL v1 parameters without a new sealed milestone. Do not start work from this workbook generation task.

## Authorized next (not started)

### M17c — External common-target benchmark

- Status: **NOT_STARTED**
- Authorization: YES (independent parallel branch)
- Integration health label: `NEXT_MILESTONE = M17c_EXTERNAL_COMMON_TARGET_BENCHMARK` with `M17C_EXECUTED = NO`
- Intent: compare / benchmark against external common targets **without** using them to retune DRBL v1 acceptance casually
- Constraint: keep `EXTERNAL_METRICS_USED_AS_TARGET = NO` for v1 retune unless explicitly redesigned

### M18b — Tracking off-ball identification

- M18b.0 readiness: **COMPLETE** (seal `ade47897…`)
- Full M18b: **NOT_STARTED**
- Preferred next: **USER_TRACKING_ACCESS_STEP**
- Alternate if no license: M18b.1 method prototype on public SportVU 2015-16 (method only; **no** player-value validation authorization)
- Player-value validation: **NO** until overlapping modern tracking exists
- Hard rule: `UIR_RELABELED_AS_OFFBALL = NO`

## Completed research spine (do not redo casually)

```text
M16j → M16l* → M17a.* → M17b → M18a → M18b.0 → analytics+web integration
```

## Explicit non-goals near-term

- Publishing UIR on public boards  
- Claiming off-ball from PBP alone  
- Refitting `k` / P1 / EPV / R1 for curiosity  
- Redistributing unassigned residual into players without a new accounting milestone  
