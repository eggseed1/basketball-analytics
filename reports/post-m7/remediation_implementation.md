# Post-M7 Remediation Implementation

**Generated:** 2026-08-12T03:50:48.766Z  
**Season:** 2024-25  
**After games:** 400  
**Baseline games:** 50  
**Artifact version:** drbl-post-m7-v1  
**Paths:** C:\Users\parkh\Projects\basketball-analytics\src\data\drbl\precomputed\2024-25.json

## Fixed this pass

- PM7-002/020: C2 (V_{cont}) in SDV (`sdv100`); C1 rejected
- PM7-001/010/028: Emit `sdv100`, `shotMaking100`, `epvShootMean`, `vContMean` (not fused)
- PM7-004/029: Fusion target = future chrono-block residual/100
- PM7-006/036: Involvement-weighted P/D shares
- PM7-027: Usage-weighted on-court role for replacement EP
- PM7-007/030: Stricter WAR calibration gate (provisional 1/30 retained)
- PM7-008: `behaviorRetrospectiveOnly=true`
- PM7-005: Recompute with limit=400 (≫ baseline 50 when baseline present)
- PM7-023: SDV validation via C2 continue metrics (not next-poss corr)

## Left unchanged (and why)

- PM7-003 Approach A — product/underdetermined; Approach B labeled
- PM7-009/024 bakeoff harness — limitation / out of scope
- PM7-012 shrinkage k=200 — research
- PM7-016/031 LN LOO — research
- PM7-022 SDV→fusion weights — explicit NO-GO until future review
- PM7-019 true shot clock — unavailable

## Fusion recommendation

**NO-GO** for folding SDV into `drbl100` this pass.  
**GO** to treat `drbl-post-m7-v1` as the corrected calculation baseline for a *future* fusion design review.

## Top-10 after

1. Ryan Rollins drbl100=1.45 P=1.53 LN=2.13 sdv100=0.43
2. Patrick Baldwin Jr. drbl100=1.36 P=1.85 LN=1.26 sdv100=-0.41
3. Chet Holmgren drbl100=1.11 P=1.12 LN=1.66 sdv100=3.63
4. Grant Williams drbl100=1.04 P=0.43 LN=2.53 sdv100=-0.93
5. De'Anthony Melton drbl100=0.99 P=0.66 LN=1.93 sdv100=-2.13
6. Chris Duarte drbl100=0.82 P=1.34 LN=0.88 sdv100=0.42
7. Patty Mills drbl100=0.82 P=0.12 LN=2.11 sdv100=-0.92
8. Gary Harris drbl100=0.69 P=0.11 LN=1.8 sdv100=-1.79
9. Zion Williamson drbl100=0.69 P=0.22 LN=1.6 sdv100=-2.4
10. Anthony Gill drbl100=0.63 P=0.96 LN=1.26 sdv100=0.39

## Top-10 baseline (if present)

1. Royce O'Neale drbl100=3.92
2. Brandin Podziemski drbl100=3.1
3. Lonzo Ball drbl100=2.69
4. Patrick Baldwin Jr. drbl100=2.6
5. Nic Claxton drbl100=2.42
6. Buddy Hield drbl100=2.41
7. Alex Caruso drbl100=2.38
8. Nicolas Batum drbl100=2.37
9. Jonathan Mogbo drbl100=2.36
10. Mason Plumlee drbl100=2.34
