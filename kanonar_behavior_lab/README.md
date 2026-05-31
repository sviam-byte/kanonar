# Kanonar Behavior Lab

This folder contains the first experimental behavioral translator for Kanonar:

```text
CaSiNo dialogue text -> event sequence -> trust/conflict/utility trajectory -> episode features
```

The current implementation is intentionally small and rule-based. `trust`,
`conflict`, and `utility` are internal simulation scalars, not measured
psychological quantities.

## Input

The pipeline reads the local ConvoKit CaSiNo export:

```text
data/processed/casino_utterances.parquet
data/processed/casino_conversations.parquet
data/processed/casino_speakers.parquet
```

CaSiNo attribution: Chawla et al., NAACL 2021, accessed through ConvoKit
`casino-corpus`, CC BY 4.0.

## Outputs

Generated local artifacts:

```text
kanonar_behavior_lab/data/processed/raw_dialogues.parquet
kanonar_behavior_lab/data/processed/events.parquet
kanonar_behavior_lab/data/processed/trajectories.parquet
kanonar_behavior_lab/data/processed/episode_features.parquet
kanonar_behavior_lab/data/reports/behavior_report.md
```

Refined v2 artifacts:

```text
kanonar_behavior_lab/data/processed/events_v2.parquet
kanonar_behavior_lab/data/processed/offer_dynamics.parquet
kanonar_behavior_lab/data/processed/trajectory_windows.parquet
kanonar_behavior_lab/data/processed/episode_features_v2.parquet
kanonar_behavior_lab/data/reports/behavior_report_v2.md
```

Validation, transition, and profile artifacts:

```text
kanonar_behavior_lab/data/processed/manual_validation_sample.parquet
kanonar_behavior_lab/data/processed/manual_validation_template.csv
kanonar_behavior_lab/data/processed/transition_matrix.parquet
kanonar_behavior_lab/data/processed/allocation_progress.parquet
kanonar_behavior_lab/data/processed/actor_episode_profiles.parquet
kanonar_behavior_lab/data/processed/trait_axes.parquet
kanonar_behavior_lab/data/processed/cluster_assignments.parquet
kanonar_behavior_lab/data/reports/validation_report.md
kanonar_behavior_lab/data/reports/transition_report.md
kanonar_behavior_lab/data/reports/cluster_report.md
```

These files are reproducible local artifacts and are ignored by git.

## Run

From the repository root:

```bash
python -m kanonar_behavior_lab.src.ingest.load_casino
python -m kanonar_behavior_lab.src.trajectories.build_trajectories
python -m kanonar_behavior_lab.src.trajectories.extract_features
python -m kanonar_behavior_lab.src.models.predict_outcome
python -m kanonar_behavior_lab.src.reports.make_report
python -m kanonar_behavior_lab.src.reports.validate_dataset
python -m kanonar_behavior_lab.src.trajectories.build_v2
python -m kanonar_behavior_lab.src.reports.make_report_v2
python -m kanonar_behavior_lab.src.reports.validate_dataset_v2
python -m kanonar_behavior_lab.src.validation.build_manual_sample
python -m kanonar_behavior_lab.src.transitions.build_transition_matrix
python -m kanonar_behavior_lab.src.profiles.build_actor_profiles
python -m kanonar_behavior_lab.src.profiles.build_trait_axes
python -m kanonar_behavior_lab.src.profiles.cluster_profiles
```

On this Windows workspace, use the local virtual environment if available:

```powershell
.\.venv\Scripts\python.exe -m kanonar_behavior_lab.src.reports.validate_dataset
```

## Action Alphabet

```text
offer
counteroffer
accept
reject
concede
ask
explain
pressure
threaten
repair
neutral
```

The labels are engineering hypotheses for the first interpretable behavioral
translator. Missing CaSiNo annotations remain missing; `neutral` is assigned
only by the rule-based classifier.

## v2 Refinement

v2 keeps v1 as a baseline and splits overloaded moves:

- `accept` becomes `terminal_accept`, `soft_accept`, and `acknowledge`.
- broad `counteroffer` is split into initial, repeat, concession,
  self-favoring, demand, and deal-formalization offer moves.
- local windows receive labels such as `deadlock_window`,
  `escalation_window`, and `cooperation_window`.

The v2 question is:

```text
Which real micro-movements of offers predict cooperation, deadlock, or escalation?
```

Later profile clusters are named as negotiation behavior profiles only. They are
not personality diagnoses or validated personality traits.
