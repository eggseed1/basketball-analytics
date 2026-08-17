# M7 Target Definition — Continuation Value

**Status:** Conceptual freeze for implementation design (not yet coded as production continue).  
**Rule:** Do not optimize metrics until this target is accepted.  
**M6 frozen:** Current `epvContinue = M5(S_t)` remains the published M6 baseline comparator (C0).

---

## 0. Notation

At pre-shot decision time \(t\), with observable state \(S_t\) (timestamp-safe):

| Symbol | Meaning |
|--------|---------|
| \(A_t\) | Immediate action (shoot / continue-proxy) |
| \(R_t\) | Offense points scored from time \(t\) until **current possession ends** (remaining possession points) |
| \(Y^{\mathrm{shot}}\) | Points on the immediate FGA (0 or 2/3) |
| \(\widehat{\mathrm{EPV}}_{\mathrm{shoot}}(S_t)\) | \(E[Y^{\mathrm{shot}}\mid S_t]\) via make model × pointValue |
| \(V_{\mathrm{cont}}(S_t)\) | Continuation value (defined below) |
| \(\mathrm{SDV}(S_t)\) | \(\widehat{\mathrm{EPV}}_{\mathrm{shoot}}(S_t) - V_{\mathrm{cont}}(S_t)\) |
| \(\mathrm{ShotMaking}\) | \(Y^{\mathrm{shot}} - \widehat{\mathrm{EPV}}_{\mathrm{shoot}}(S_t)\) |

**Separation invariant:** ShotMaking never enters SDV; continue never uses \(Y^{\mathrm{shot}}\) as a feature.

---

## 1. Ideal counterfactual (unobserved)

\[
V^{\star}_{\mathrm{cont}}(S_t) = E\big[R_t \mid S_t,\, \mathrm{do}(A_t = \mathrm{continue})\big]
\]

We do not observe the continue path on possessions where the player shot. Any estimator is therefore:

- structural (transition model), or
- observational / action-conditioned (fit on continue-labeled states; apply at shot states).

---

## 2. Rejected target — C0 (current M6)

\[
V^{(0)}_{\mathrm{cont}}(S_t) := \widehat{\mathrm{EPV}}^{\mathrm{M5}}_{\mathrm{poss}}(S_t)
\approx E[\text{full possession points} \mid S_{\text{shaped like start}}]
\]

**Why reject as continuation:**

1. Trained on possession-**start** distribution.
2. Not action-conditioned on continue.
3. Predicts full PPP, not remaining value under continue.
4. Empirically flat at shot moments; ~uncorrelated with mid-poss remaining points.

**Role retained:** baseline comparator only.

---

## 3. Preferred target — C1 (action-conditioned remaining value)

### 3.1 Population for training

Define a continue-labeled event set \(\mathcal{C}\):

- Event occurs on a live offensive possession.
- Immediate event is **not** an FGA (`2pt`/`3pt` with Made/Missed).
- Prefer **pre-first-FGA** events on the possession for v1 (avoids post-miss OREB complexity); document coverage loss.
- Exclude pure bookkeeping: `period`, `game`, `timeout`, `substitution` (optional: keep `foul`/`turnover`/`rebound` as they are real possession transitions).

### 3.2 Target (Y only — may use post-state outcomes)

For event \(e \in \mathcal{C}\) at time \(t(e)\):

\[
Y^{\mathrm{cont}}_e = R_{t(e)} = \sum_{\text{actions } a \ge e \text{ on same possession}} \mathrm{pointsOnAction}(a)
\]

This **includes future scoring on the possession**. That is allowed for **targets**, forbidden for **features**.

### 3.3 Estimand

\[
V^{(1)}_{\mathrm{cont}}(S) = E\big[Y^{\mathrm{cont}} \mid S,\, e \in \mathcal{C}\big]
\]

Fit \(\widehat V^{(1)}_{\mathrm{cont}}(S)\) with chronological OOF.

### 3.4 Application at shot decisions

For FGA at \(t\), set:

\[
\widehat{\mathrm{EPV}}_{\mathrm{continue}}(S_t) := \widehat V^{(1)}_{\mathrm{cont}}(S_t)
\]

using only pre-shot features. **Do not** include the FGA’s own points in any feature.

### 3.5 Identification caveats (must document, not hand-wave)

1. **Selection:** States where players continue may differ from states where they shoot (openness, contest, instruction).
2. **No true `continue` action in PBP:** \(\mathcal{C}\) is a proxy (fouls, violations, rare non-shot events, early-possession markers).
3. **Coverage:** Pre-first-FGA non-shot rows are dense near possession starts; sparse deep into the shot clock.

These caveats do **not** justify keeping C0; they bound how strongly we claim causality.

---

## 4. Feature-expanded target — C2 (same Y, richer S)

Same \(Y^{\mathrm{cont}}\) as C1. Expand \(S\) with timestamp-safe fields:

- possession age \(\max(0, \mathrm{startClock} - \mathrm{clock}_t)\) as **shot-clock proxy**
- game clock / period / score diff / home
- prior-only player / team / opponent / lineup summaries
- optional: whether possession began via OREB / steal / inbound (from earlier events **before** \(t\))

Still **no** true shot clock (unavailable).

---

## 5. Deferred — C3 structural / C4 subsequent-shot value

### C3 — Structural

\[
V_{\mathrm{cont}}(S) = \sum_{s'} P(s'\mid S, \mathrm{continue})\, V(s')
\]

Requires action/transition graph. **Deferred** — CDN PBP lacks dribble/pass graph.

### C4 — Subsequent opportunity

\[
V_{\mathrm{opp}}(S) = E\big[\max_{u>t} \widehat{\mathrm{EPV}}_{\mathrm{shoot}}(S_u) \mid S, \mathrm{continue}\big]
\]

Nested and selection-heavy. Useful as a **diagnostic**, not v1 production continue.

---

## 6. SDV and ShotMaking under the new continue

Once \(\widehat V_{\mathrm{cont}}\) replaces C0 **in experiment only**:

\[
\begin{aligned}
\widehat{\mathrm{EPV}}_{\mathrm{shoot}}(S_t) &= \hat P(\mathrm{make}\mid S_t)\cdot \mathrm{pointValue} \\
\widehat{\mathrm{EPV}}_{\mathrm{continue}}(S_t) &= \widehat V_{\mathrm{cont}}(S_t) \\
\mathrm{SDV}(S_t) &= \widehat{\mathrm{EPV}}_{\mathrm{shoot}}(S_t) - \widehat{\mathrm{EPV}}_{\mathrm{continue}}(S_t) \\
\mathrm{ShotMaking}_t &= Y^{\mathrm{shot}}_t - \widehat{\mathrm{EPV}}_{\mathrm{shoot}}(S_t)
\end{aligned}
\]

No combining of ShotMaking into SDV.

---

## 7. Comparison criteria vs C0 (before metric chasing)

A candidate continue model is **conceptually justified** if:

1. It estimates remaining value under non-shoot paths (C1/C2), not start-PPP.
2. Features are timestamp-safe (leakage report PASS).
3. On holdout continue-labeled states, it beats C0 on MAE/RMSE **and** shows non-trivial correlation with \(Y^{\mathrm{cont}}\).
4. When plugged into experimental SDV, Corr(SDV, ÊPV_shoot) falls vs C0’s ~0.61 **without** targeting that correlation as a loss.

If (1)–(2) fail → **STOP**. If (3) fails after a good-faith C1/C2 → document NO-GO for replacement of C0.

---

## 8. Acceptance for implementation

| Item | Decision |
|------|----------|
| Production continue for next isolated build | **C1**, features from **C2** as available |
| C0 | Baseline only |
| C3/C4 | Out of scope until better action data |
| Fusion | Forbidden until validation plan gates pass |
