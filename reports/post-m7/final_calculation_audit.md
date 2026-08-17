# Final Calculation Audit (post-M7)

## Trace

raw CDN PBP → normalize → possessions/lineups/quarantine →  
M5 EPV → R1 replacement (usage-weighted role) → involvement-weighted residual shares (P) →  
LN (ridge) + B (retrospective) →  
**future-block** OOF fusion → `drbl100` →  
WAR (stricter gate) + DRBL-L (isolated) →  
**parallel:** M6 shoot + C2 (V_{cont}) → `sdv100` / `shotMaking100` (**not** in fusion)

## Transition checks

| Step | Status |
|------|--------|
| Quarantine skip | PASS |
| Timestamp-safe EPV | PASS |
| Involvement weights same-poss only | PASS |
| Future-block fusion Y | PASS |
| SDV uses C2 | PASS |
| SDV excluded from fusion | PASS |
| DRBL-L isolated from WAR | PASS |
| Leaderboard sort key = drbl100 | PASS (unchanged wiring) |

## Known limitations remaining

- Approach B not A
- No true shot clock
- Soft C2 corr floor (0.15) not fully met
- Multi-season rolling WAR / external bakeoff still open
