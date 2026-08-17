# Old vs research architecture (M16g2)

## Legacy production

```text
raw P
→ EB200 P (drblP)
→ fusion with EB LN/B components
→ EB200 fused ability (posteriorAbilityRate / drbl100)
```

| Dimension | Legacy |
|-----------|--------|
| Fitted components in primary ability | P + LN + B (fusion) |
| EB operations | ≥2 (component + fused) |
| Prior strength(s) | k=200 (components), k=200 (fused) |
| Fusion | YES |
| Calibration | separate WAR-era / display layers possible |
| Rate meaning | fused + double-shrunk ability-ish |
| Zero meaning | R1 baseline inside components, then fused |

## Selected research shadow

```text
raw P_B (rawAbilityRate)
→ EB1600
→ researchDRBL100
```

| Dimension | Research |
|-----------|----------|
| Fitted components in primary ability | 1 (P only) |
| EB operations | exactly 1 |
| Prior strength | k=1600 |
| Fusion | NO |
| Calibration | NOT YET SELECTED |
| Rate meaning | posterior Approach-B rate |
| Zero meaning | R1 replacement baseline under Approach B |

## Major semantic difference
Production collapses component shrinkage, fusion, and a second fused posterior into `drbl100`.
Research isolates a single EB on unshrunk raw Approach-B P.
