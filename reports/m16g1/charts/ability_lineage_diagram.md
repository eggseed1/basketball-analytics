# Ability lineage graph

```
seq-attr possession credits
        │
        ▼
acc.totalValue / N  ──► rawAbilityRate          [UNSHRUNK Approach B]
        │
        │ EB(k=200, prior=0)
        ▼
      drblP ────────────────┐
                            │
LN ridge ─EB(k=200)─► drblLn ──┐
                            │         │  fusePlayerRating / OOF fusion
B model ──EB(k=200)─► drblB ───┼──────────────► fusedRateRaw
                                      │
                                      │ EB(k=200, prior=0)
                                      ▼
                            posteriorAbilityRate = drbl100
                                      │
                                      ▼
                            WAR ability input / seasonal boards
```

## Research M16g/M16g1 path (single intended EB)

```
rawAbilityRate ──EB(k_research, prior=0)──► P_B_posterior
```

## MULTI_STAGE_SHRINKAGE_PRESENT

YES in production published ability path:
component EB → fusion of shrunk components → EB on fused rate.

This is **intentional multi-stage** relative to research single-EB on raw P_B.
ACCIDENTAL_DOUBLE_SHRINKAGE on the *same* conceptual estimator is NO for research
(research does not re-EB posteriorAbilityRate). For production `drblP` alone: one EB.
For production `drbl100`: component EB + fused EB = two stages (documented, not "accidental" if intentional product design — flagged MULTI_STAGE).
