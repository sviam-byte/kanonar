# Window Transition Report

This report summarizes local regime transitions from CaSiNo v2 trajectory windows.

CaSiNo attribution: Chawla et al., NAACL 2021, ConvoKit `casino-corpus`, CC BY 4.0.

`trust`, `conflict`, and `utility` are rule-based simulation scalars.

## Transition Matrix

- `bargaining_window` -> `bargaining_window`: count=361, p=0.325
- `bargaining_window` -> `cooperation_window`: count=603, p=0.543
- `bargaining_window` -> `deadlock_window`: count=9, p=0.008
- `bargaining_window` -> `escalation_window`: count=73, p=0.066
- `bargaining_window` -> `repair_window`: count=65, p=0.059
- `cooperation_window` -> `bargaining_window`: count=213, p=0.298
- `cooperation_window` -> `cooperation_window`: count=425, p=0.594
- `cooperation_window` -> `deadlock_window`: count=9, p=0.013
- `cooperation_window` -> `escalation_window`: count=47, p=0.066
- `cooperation_window` -> `repair_window`: count=21, p=0.029
- `deadlock_window` -> `bargaining_window`: count=9, p=0.265
- `deadlock_window` -> `cooperation_window`: count=14, p=0.412
- `deadlock_window` -> `deadlock_window`: count=10, p=0.294
- `deadlock_window` -> `repair_window`: count=1, p=0.029
- `escalation_window` -> `bargaining_window`: count=92, p=0.323
- `escalation_window` -> `cooperation_window`: count=146, p=0.512
- `escalation_window` -> `deadlock_window`: count=3, p=0.011
- `escalation_window` -> `escalation_window`: count=29, p=0.102
- `escalation_window` -> `repair_window`: count=15, p=0.053
- `repair_window` -> `bargaining_window`: count=44, p=0.286
- `repair_window` -> `cooperation_window`: count=85, p=0.552
- `repair_window` -> `deadlock_window`: count=3, p=0.019
- `repair_window` -> `escalation_window`: count=17, p=0.110
- `repair_window` -> `repair_window`: count=5, p=0.032

## Named Conditional Probabilities

- P(cooperation next | repair current): 0.552 (85/154)
- P(escalation next | deadlock current): 0.000 (0/34)
- P(cooperation next | concession_offer in previous window): 0.590 (483/818)
- P(deadlock next | repeat_offer + no concession): 0.500 (5/10)
- P(escalation next | demand + pressure): 0.091 (42/464)

## Allocation Progress Calibration

- allocation observed rows: 1181
- corr(utility_rule_based, utility_observed_proxy): 0.132
- calibration warning: weak or missing correlation; do not retune deltas automatically.

## Machine-readable named probabilities

```json
{
  "P(cooperation next | repair current)": {
    "hits": 85,
    "total": 154,
    "probability": 0.551948051948052
  },
  "P(escalation next | deadlock current)": {
    "hits": 0,
    "total": 34,
    "probability": 0.0
  },
  "P(cooperation next | concession_offer in previous window)": {
    "hits": 483,
    "total": 818,
    "probability": 0.5904645476772616
  },
  "P(deadlock next | repeat_offer + no concession)": {
    "hits": 5,
    "total": 10,
    "probability": 0.5
  },
  "P(escalation next | demand + pressure)": {
    "hits": 42,
    "total": 464,
    "probability": 0.09051724137931035
  }
}
```
