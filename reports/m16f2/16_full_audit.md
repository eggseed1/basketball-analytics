# M16f2 Full Audit

## Freeze
- git: 629bb1b790bef21020940122194772b6921569ff
- dirty: true
- protocol: drbl-eval-v1
- hashes: PASS

## Candidates
- A: drbl-p-counterfactual-v1 / drbl-counterfactual-epv-v1 λ=100 k=8
- B: drbl-seq-attr-v1 native drblP

## Coverage
- eligible: 419
- A supported/weak/unsupported: 0/106/313
- common: 106 (25.3%)
- coef appearance share: 51.6%

## Primary (native)
- RMSE A=3.927505 B=1.728416 Δ=2.199090
- relative A improvement=-127.232%
- Pearson A=0.1980 B=0.3821
- Spearman A=0.2179 B=0.3284

## Bootstrap
- ΔRMSE point=2.199090 CI=[1.753055, 2.678804]
- P(A beats B)=0.000

## Decision
- **APPROACH_B_WINS**
- RESEARCH_P_INCUMBENT=B
- reason: B materially better on native RMSE / bootstrap evidence favors B

## Diagnostics
- train-calibrated RMSE A=1.7830 B=1.6718 (not primary)
- contextual incremental: POSITIVE
- support strata: near n=20 Δ=2.8192; medium n=44 Δ=2.2296; far n=42 Δ=1.8292
- offense/defense Pearson vs target: off=0.196 def=0.100

## Frozen systems
- production P / posterior / WAR unchanged
- RESERVED_TEST not accessed
- no model changes after VALIDATION

## Next
- Proceed with posterior/shrinkage evaluation on incumbent B; do not rescue A on this VALIDATION set
