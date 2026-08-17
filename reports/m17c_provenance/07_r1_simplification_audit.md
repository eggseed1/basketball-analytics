# R1 public simplification audit (`6bc55d7`)

## What changed

Public presentation / label / sort hierarchy:

- Prefer **Wins Above R1** over **R1 Points** on product surfaces
- Learn/glossary/ASK vocabulary copy
- Explore sort bookmarks (`r1Points` / legacy WAR → `r1WinEquivalents`)
- New `src/lib/drbl-public-labels.ts` documents frozen P1 for **display/docs only**

## What did NOT change

Verified via git blob equality a229 ↔ 6bc55d7:

| Artifact | Equal |
|----------|-------|
| `src/data/drbl/precomputed/2020-21…2024-25.json` | YES |
| Precomputed `r1Points` fields (exhaustive scan) | YES (0 mismatches) |
| Precomputed `drbl100` | YES |
| `P1` constant semantics in research seals | unchanged |
| M18 target engine | unchanged |
| M17c orchestrator scientific inputs | unchanged |

`drbl-public-labels.ts` states:

```text
Presentation only — does not change R1 Points / P1 / model semantics.
```

## M17c dependency

M17c predictors use **`validatedDRBL100` (`drbl100`)** from precomputed overlays, not public R1 naming.

```text
presentation changed: YES
model/data changed: NO
M17c dependency changed: NO
```
