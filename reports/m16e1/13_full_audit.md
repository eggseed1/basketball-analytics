# M16e1 full audit

## Freeze
git 629bb1b790bef21020940122194772b6921569ff dirty=true
evaluationProtocolVersion drbl-eval-v1
M16E0_RESEARCH_BASE = P

## Possession conventions
- Combined: off + def player side-of-ball appearances
- Paired: average(off, def) from normalized possession files
- mean ratio 2 median 2

## LOO unit
`net_points_per_100_paired_team_possessions`

## Equivalence
max residual 0 (paired vs combined-converted)

## Slope decomposition
original 5.835416607524311
exposure factor 2
combined-target slope 2.917708303762156
remaining empirical 2.9177083037621556

## Team accounting
production slope 0.5546008106678035
paired slope 1.109201621335607
combined slope 1.109201621335607

## Bug status
CONFIRMED

## Preserved
- P research base
- M6 research component
- posterior untouched
- P calibration untouched
- production WAR/DRBL unchanged
- RESERVED_TEST unused for predictive evaluation
