# Legacy DRBL-LN forensics (M18a)

## Implementation

- Source: `drbl/models/lineup-model.ts` (`drbl-ln-ridge-v1`)
- Wired in `compute-season.ts` with `lambda: 800`, `holdoutFrac: 0.2`

## Target

```text
y = possession.points − EPV(state)
```

Not raw scoreboard points. EPV-residual association estimator.

## Design matrix

- +1 offense on-court player
- −1 defense on-court player
- optional home offense flag
- Single net player coefficient (not separate O/D)

## Regularization

Ridge λ = 800 (production fixed; not selected in M18 TRAIN).

## Ratings

Coefficients × 100 → per-100, then EB-shrunk with player N in `player-value.ts`.

## Directly usable as UIR?

**NO.**

Reasons:
1. Target is EPV residual, not scoreboard points (different estimand).
2. Production λ fixed without M18 protocol.
3. Raw LN − P is dimensionally/scientifically invalid as UIR.
4. LN is fused into legacy stacks; M18 requires residualized L ⊥̸ P_RAW by construction.

LEGACY_DRBL_LN_DIRECTLY_USED = NO  
RAW_DRBL_LN_MINUS_P_USED = NO
