# Trait-Like Behavioral Profile Clusters

These clusters are negotiation behavior profiles, not personality traits.

CaSiNo attribution: Chawla et al., NAACL 2021, ConvoKit `casino-corpus`, CC BY 4.0.

Clustering input uses trait-like axes only. Direct outcomes and final T/C/U states are excluded from clustering input and used only for external validation.

## K Selection

- k=2: silhouette=0.369
- k=3: silhouette=0.370
- k=4: silhouette=0.379
- k=5: silhouette=0.371
- k=6: silhouette=0.321
- k=7: silhouette=0.320

Selected k: `4`
Bootstrap stability ARI: mean=0.991, min=0.976, max=0.998

## Cluster Profiles

### Cluster 0: flexible_adapter

- rows: 735
- top axes: flexibility=0.358, cooperativeness=0.218, fairness_orientation=0.106
- deal outcomes: `{'deal': 728, 'no_deal': 7}`
- attractors: `{'cooperation': 674, 'bargaining': 49, 'escalation': 11, 'deadlock': 1}`
- representative examples: `[{'episode_id': 'casino_0001', 'actor': 'A'}, {'episode_id': 'casino_0001', 'actor': 'B'}, {'episode_id': 'casino_0002', 'actor': 'A'}, {'episode_id': 'casino_0002', 'actor': 'B'}, {'episode_id': 'casino_0003', 'actor': 'B'}]`

### Cluster 1: pressuring_escalator

- rows: 540
- top axes: aggressive_pressure=0.577, assertiveness=0.319, flexibility=0.295
- deal outcomes: `{'deal': 507, 'no_deal': 33}`
- attractors: `{'cooperation': 269, 'bargaining': 151, 'escalation': 118, 'deadlock': 2}`
- representative examples: `[{'episode_id': 'casino_0000', 'actor': 'A'}, {'episode_id': 'casino_0005', 'actor': 'A'}, {'episode_id': 'casino_0006', 'actor': 'B'}, {'episode_id': 'casino_0009', 'actor': 'B'}, {'episode_id': 'casino_0010', 'actor': 'A'}]`

### Cluster 2: repair_mediator

- rows: 176
- top axes: repair_orientation=0.409, cooperativeness=0.371, flexibility=0.319
- deal outcomes: `{'deal': 172, 'no_deal': 4}`
- attractors: `{'cooperation': 162, 'bargaining': 13, 'escalation': 1}`
- representative examples: `[{'episode_id': 'casino_0000', 'actor': 'B'}, {'episode_id': 'casino_0004', 'actor': 'B'}, {'episode_id': 'casino_0014', 'actor': 'A'}, {'episode_id': 'casino_0019', 'actor': 'A'}, {'episode_id': 'casino_0021', 'actor': 'A'}]`

### Cluster 3: rigid_repeater

- rows: 609
- top axes: rigidity=0.409, assertiveness=0.129, aggressive_pressure=0.116
- deal outcomes: `{'deal': 603, 'no_deal': 6}`
- attractors: `{'cooperation': 477, 'bargaining': 107, 'escalation': 24, 'deadlock': 1}`
- representative examples: `[{'episode_id': 'casino_0003', 'actor': 'A'}, {'episode_id': 'casino_0008', 'actor': 'A'}, {'episode_id': 'casino_0008', 'actor': 'B'}, {'episode_id': 'casino_0013', 'actor': 'A'}, {'episode_id': 'casino_0016', 'actor': 'A'}]`

## Machine-readable cluster names

```json
{
  "0": "flexible_adapter",
  "1": "pressuring_escalator",
  "2": "repair_mediator",
  "3": "rigid_repeater"
}
```
