# Manual Validation Report

This report prepares a human validation sample for CaSiNo v2 labels.

CaSiNo attribution: Chawla et al., NAACL 2021, ConvoKit `casino-corpus`, CC BY 4.0.

The labels are behavior-profile annotations, not personality traits.

## Sample Counts

- `concession_offer`: 50
- `counteroffer`: 50
- `deadlock_window`: 34
- `demand`: 50
- `escalation_window`: 50
- `self_favoring_offer`: 50
- `soft_accept`: 50
- `terminal_accept`: 50

## Precision By Label

No human judgments filled yet. Precision is pending.

## Required Judgment Values

`correct`, `partially_correct`, or `wrong`.

If `wrong`, fill `human_label` with the class a human reader would assign.

## Machine-readable summary

```json
{
  "sample_rows": 384,
  "judged_rows": 0,
  "sample_counts": {
    "counteroffer": 50,
    "concession_offer": 50,
    "demand": 50,
    "self_favoring_offer": 50,
    "soft_accept": 50,
    "terminal_accept": 50,
    "escalation_window": 50,
    "deadlock_window": 34
  }
}
```
