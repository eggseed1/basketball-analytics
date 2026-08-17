# Historical 2× bug reconstruction

## Old LOO target

Team net rating scale:

```text
pts / 100 paired team possessions
```

## WAR 4.0.0 production exposure

```text
combinedPossessionAppearances = N_off + N_def ≈ 2 × paired
```

## Algebra

```text
value ≈ rate_paired_units × combined_exposure / 100
      ≈ rate_paired_units × (2 × paired) / 100
      ≈ 2 × (rate_paired_units × paired / 100)
```

Exact half relationship when `combined = 2 × paired` by definition (M16e1: 555/555 exact).

## WAR 4.0.1 repair

Use `paired = combined/2` with **frozen** slope/repl/PPW ⇒ WAR exactly halves.

## Implication for new canonical DRBL WAR

Canonical `validatedDRBL100` / `rawAbilityRate` are **pts per 100 combined appearances**.

Therefore:

```text
rate × combined / 100   is dimensionally matched
rate × paired / 100     undercounts by ~2× relative to attributed value
```

**Do NOT** apply the historical `/2` to the new rate merely because 4.0.1 needed it for a differently defined calibrated rate.
