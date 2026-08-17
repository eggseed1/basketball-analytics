# Lineup support contract (M17a.2)

Version: historical-support-contract-v2

## Frozen attribution engine behavior

- FULL_5v5: offensePlayerIds.length===5 && defensePlayerIds.length===5 → full Approach-B attribution path.
- Missing players: possessions with empty/partial lineups are skipped or under-attributed by existing lineup-model filters (length===0 skipped).
- No fabrication of missing player IDs.
- Canonical production seasons (2024-25/2025-26) remain CANONICAL_PRODUCTION despite raw lineup < 99.9%.

## Categories

| Category | Meaning |
|---|---|
| FULL_5V5 | Both sides resolved 5 players |
| CANONICAL_FALLBACK_VALID | Engine path used in current production with documented incompleteness |
| PARTIAL_ATTRIBUTION | Some IDs present; not full 5v5 |
| UNUSABLE | No usable lineup for attribution |

MODEL_SEMANTICS_CHANGED = NO
