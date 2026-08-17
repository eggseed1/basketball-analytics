# Proposed tracking evaluation protocol (not executed)

## Branch A — Licensed modern optical (preferred for UIR mediation)

Contingent on user/license access covering ≥ 2022-23…2024-25.

Proposed (finalize only after actual coverage known):

```text
TRAIN: earliest licensed seasons with stable provider
VALIDATION: middle season
RESERVED: latest season never opened for tracking-model selection
```

Note: 2024-25 was consumed for **UIR** reserved validation; it is **not** automatically a pristine tracking holdout. Prefer a later season or a pre-registered tracking-only reserved window.

## Branch B — SportVU 2015-16 method prototype

```text
TRAIN/VAL within 2015-16 games only
No claim about 2020–25 UIR mediation
```

Authorize: `M18b_1_TRACKING_METHOD_PROTOTYPE` only.

## Stage plan (future)

1. **Stage 1 (association):** Off-Ball Behavior Index / separate features vs sealed UIR-C after role/context controls. Not causal OBV.
2. **Stage 2:** Research spatial value candidate `OBV_CANDIDATE` / `tracking-epv-research-v1` (isolated; never mutates canonical EPV).
3. **Stage 3:** Future outcomes: P_RAW vs P_RAW + spatial candidate; test whether spatial features shrink UIR’s incremental effect (mediation-*like* pattern; not claimed causal mediation).

## UIR join contract (no refit)

```text
playerId, season, UIR-C, P_RAW, N, team, role features, tracking coverage
```

UIR_REFIT_FOR_TRACKING = NO

## Sample planning (association)

Frames are clustered within player / game / team. Effective N ≪ frame count. Plan power on player-possession and player-season units with clustered SEs — not millions of frames as independent samples.

## Coverage bias protocol

Before inference, audit whether tracked players differ by minutes, role, team, starter status, usage, ability. Incomplete coverage can induce selection bias.

## Camera / provider era

If provider changes across seasons, do not treat raw feature means as comparable until normalized.

## Team scheme / role

Pre-register controls for team, role axes (usage, three-rate, starter, mpg, creation), possession context. Do not use listed position alone. Do not blindly residualize team if scheme mediates behavior of interest.

## Rules

- Freeze tracking features/model before reserved opens
- UIR-C sealed (λ=3200) — no refit for tracking
- Source selection before named player inspection
- Any tracking EPV = `tracking-epv-research-v1` only
