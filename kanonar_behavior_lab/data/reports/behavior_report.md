# CaSiNo Behavioral Dataset Report

This report describes a rule-based experimental translation from CaSiNo dialogue text to Kanonar behavior-lab events and T/C/U trajectories.

CaSiNo attribution: Chawla et al., NAACL 2021, accessed through ConvoKit `casino-corpus`, CC BY 4.0.

The `trust`, `conflict`, and `utility` values are rule-based simulation scalars, not measured psychological quantities.

## Dataset Counts

- episodes: 1030
- events: 14297
- trajectory rows: 14297

## Outcome Distribution

- deal outcome: `{'deal': 1005, 'no_deal': 25}`
- attractor labels: `{'cooperation': 981, 'bargaining': 39, 'escalation': 10}`

## Mean Final Trajectory State

- trust: 0.886
- conflict: 0.027
- utility: 0.987

## Mean T/C/U Trajectory

| Progress | Trust | Conflict | Utility |
| ---: | ---: | ---: | ---: |
| 0.00 | 0.516 | 0.096 | 0.091 |
| 0.25 | 0.558 | 0.128 | 0.279 |
| 0.50 | 0.633 | 0.171 | 0.537 |
| 0.75 | 0.711 | 0.164 | 0.742 |
| 1.00 | 0.856 | 0.046 | 0.962 |

## Top Action Prefix Patterns

- `offer -> counteroffer -> counteroffer -> counteroffer -> counteroffer -> counteroffer -> counteroffer -> counteroffer`: 15
- `ask -> offer -> counteroffer -> counteroffer -> counteroffer -> counteroffer -> counteroffer -> counteroffer`: 6
- `ask -> offer -> counteroffer -> concede -> counteroffer -> concede -> counteroffer -> counteroffer`: 4
- `neutral -> ask -> ask -> offer -> counteroffer -> counteroffer -> counteroffer -> counteroffer`: 4
- `offer -> counteroffer -> counteroffer -> counteroffer -> counteroffer -> counteroffer -> counteroffer -> concede`: 3
- `ask -> ask -> neutral -> ask -> offer -> counteroffer -> counteroffer -> concede`: 3
- `neutral -> ask -> neutral -> neutral -> ask -> offer -> counteroffer -> counteroffer`: 3
- `offer -> counteroffer -> counteroffer -> counteroffer -> counteroffer -> neutral -> counteroffer -> counteroffer`: 3
- `concede -> counteroffer -> concede -> counteroffer -> counteroffer -> counteroffer -> counteroffer -> counteroffer`: 3
- `concede -> concede -> counteroffer -> counteroffer -> counteroffer -> concede -> counteroffer -> counteroffer`: 3

## Early Prediction Baseline

### First 20% of turns
- `deal_outcome` mode: `logistic_regression`
  accuracy=0.849, balanced_accuracy=0.516
  top features: concession_count, first_concession_time, trust_slope, mean_conflict, n_turns
- `attractor_label` mode: `logistic_regression`
  accuracy=0.481, balanced_accuracy=0.365
  top features: max_conflict, conflict_slope, utility_slope, mean_conflict, time_to_accept

### First 40% of turns
- `deal_outcome` mode: `logistic_regression`
  accuracy=0.775, balanced_accuracy=0.560
  top features: trust_slope, conflict_slope, reject_count, repair_count, mean_conflict
- `attractor_label` mode: `logistic_regression`
  accuracy=0.547, balanced_accuracy=0.618
  top features: max_conflict, conflict_slope, trust_slope, pressure_count, repair_count

## Worked Example

```text
Dialogue casino_0176

Pattern:
ask -> neutral -> offer -> reject -> pressure -> reject -> counteroffer -> explain -> counteroffer -> concede -> counteroffer -> counteroffer -> accept -> accept

Trajectory:
trust:    0.50 -> 0.50 -> 0.50 -> 0.50 -> 0.45 -> 0.30 -> 0.25 -> 0.25 -> 0.30 -> 0.30 -> 0.40 -> 0.40 -> 0.40 -> 0.50 -> 0.60
conflict: 0.10 -> 0.10 -> 0.10 -> 0.10 -> 0.25 -> 0.50 -> 0.65 -> 0.70 -> 0.65 -> 0.70 -> 0.60 -> 0.65 -> 0.70 -> 0.50 -> 0.30
utility:  0.00 -> 0.02 -> 0.02 -> 0.12 -> 0.02 -> 0.02 -> 0.00 -> 0.05 -> 0.10 -> 0.15 -> 0.35 -> 0.40 -> 0.45 -> 0.75 -> 1.00

Attractor:
bargaining

Predictive signs:
early reject: yes
concession before midpoint: no
pressure: yes
final outcome: deal
```
