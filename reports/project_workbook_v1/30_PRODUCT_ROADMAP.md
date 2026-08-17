# 30 — Product Roadmap

Product work must preserve sealed metric semantics (`24_PRODUCTION_INVARIANTS.md`).

## Near-term product priorities (debt-aware)

1. **ESPN ↔ NBA player identity mapping** — reduce empty live DRBL columns (PRODUCT_DATA_INTEGRATION_DEBT)  
2. **Team-evidence / live fixture stability** — resolve schedule sample miss without weakening precomputed regression authority  
3. **Continue web IA polish** without changing DRBL formulas — health banners, destination completeness, ASK quality  
4. **Keep Learn/glossary copy synchronized** with sealed definitions  

## Do not ship without research seals

| Feature idea | Gate |
|---|---|
| Public UIR columns | Requires explicit product+research authorization; currently forbidden as canonical |
| Off-ball / tracking-derived value | Requires M18b player-value validation authorization + seals |
| Career cumulative R1 leaderboard | Requires continuous Tier A/B support + cross-era audit |
| All-time DRBL ranking | Explicitly NO until semantics established |
| “WAR” labeling of R1 Win Equivalents | Forbidden |

## Integration posture

- `INTEGRATION_READY_FOR_RESEARCH = YES`  
- Web design intent preserved; analytics semantics preserved  
- Prefer fixing identity/joins and fixtures over recomputing model artifacts  

## Suggested sequencing relative to research

```text
Product identity/fixture debt  ∥  M17c branch  ∥  tracking access for M18b
```

None of these reopen `k`/`P1`/ability version.
