# Model card — drbl-counterfactual-epv-v1

- **Family:** regularized linear (ridge / SGD ridge)
- **Lambda:** 100 (chrono CV on ENGINE_FIT; grid [0.1,1,3,8,20,50,100])
- **M5 treatment:** fit on ENGINE_FIT; V = M5 + residual
- **Players:** 160 with ≥40 FIT appearances
- **Replacement:** R1 k=8 equal weight; FIT-only pool
- **Support:** distance thresholds weak=1.5 / unsupported=2.5 (predeclared)
- **Defense convention:** credit = E[V_rep_opp] − V_actual_opp
- **Training:** ENGINE_FIT only; HOLDOUT evaluation only
- **Not executed:** frozen VALIDATION scoring (deferred to M16f2)
