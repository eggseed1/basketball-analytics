# Support gate reaudit (M17a.2)

Prior conservative Tier-A gate: raw lineup completeness >= 99.9%.

## Decision

**REQUIRE_BOTH** for Tier A:

1. RAW_LINEUP_COMPLETENESS_RATE >= 0.999
2. SCOREBOARD_PASS_RATE >= 0.999
3. UNEXPLAINED_HIGH_FREQUENCY_EVENT_LABELS == 0

For Tier B (canonical with documented source limitation):

1. SCOREBOARD_PASS_RATE >= 0.99
2. RAW_LINEUP_COMPLETENESS_RATE >= 0.95 (current-production neighborhood)
3. Explicit qualityFlags disclosure

Historical seasons in this archive have raw lineup completeness typically **0.47–0.73**, far below Tier A/B lineup gates.
Therefore they are classified **Tier C / D** for frozen-v1 product publication until lineup reconstruction improves **without inventing players**.

This is DATA QUALITY policy only. Model computation unchanged.
