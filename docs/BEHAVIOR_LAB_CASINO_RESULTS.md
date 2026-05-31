# CaSiNo Behavior Lab Results

This document describes the new experimental Behavior Lab block for Kanonar:
how the CaSiNo negotiation corpus was imported, normalized, transformed into
behavioral events, and extended into trajectories, local regimes, transition
statistics, and actor-level behavior profiles.

The block is intentionally scoped to **CaSiNo only**. It does not change the
Kanonar runtime and it does not claim that Kanonar variables are measured
psychological quantities.

```text
CaSiNo dialogue text
-> normalized dialogue rows
-> event sequence
-> trust/conflict/utility trajectory
-> episode features
-> local window regimes
-> transition matrix
-> actor-level behavioral profiles
```

## Source Dataset

Source dataset:

- CaSiNo: A Corpus of Campsite Negotiation Dialogues for Automatic Negotiation
  Systems
- Access layer: ConvoKit `casino-corpus`
- Paper: <https://aclanthology.org/2021.naacl-main.254/>
- Corpus page: <https://convokit.cornell.edu/documentation/casino-corpus.html>
- License: CC BY 4.0, <https://creativecommons.org/licenses/by/4.0/>

Recommended citation:

```bibtex
@inproceedings{chawla-etal-2021-casino,
    title = "{C}a{S}i{N}o: A Corpus of Campsite Negotiation Dialogues for Automatic Negotiation Systems",
    author = "Chawla, Kushal  and
      Ramirez, Jaysa  and
      Clever, Rene  and
      Lucas, Gale  and
      May, Jonathan  and
      Gratch, Jonathan",
    booktitle = "Proceedings of the 2021 Conference of the North American Chapter of the Association for Computational Linguistics: Human Language Technologies",
    year = "2021",
    publisher = "Association for Computational Linguistics",
    url = "https://aclanthology.org/2021.naacl-main.254/",
    doi = "10.18653/v1/2021.naacl-main.254",
    pages = "3167--3185",
}
```

## Raw ConvoKit Export

The initial export is produced by `scripts/download_casino.py` from ConvoKit:

```python
from convokit import Corpus, download

corpus = Corpus(filename=download("casino-corpus"))
```

Local raw export tables:

| Table | Rows | Meaning |
| --- | ---: | --- |
| `data/processed/casino_utterances.parquet` | 14,297 | One row per utterance |
| `data/processed/casino_conversations.parquet` | 1,030 | One row per dialogue |
| `data/processed/casino_speakers.parquet` | 846 | One row per ConvoKit speaker |

Important ID note: in this ConvoKit export, `conversation_id` is the root
utterance id, such as `utterance_0`. The actual CaSiNo dialogue id is stored in
`meta_json.dialogue_id`; downstream Behavior Lab tables promote that value into
`episode_id`, for example `casino_0176`.

## Raw Data Characteristics

### Utterances

`casino_utterances.parquet` contains:

- `utterance_id`
- `conversation_id`
- `reply_to`
- `speaker_id`
- `text`
- `meta_json`

Observed utterance metadata:

| Metadata field | Meaning |
| --- | --- |
| `annotations` | CaSiNo strategy annotations; non-empty on 4,615 utterances |
| `dialogue_id` | Numeric CaSiNo dialogue id |
| `speaker_id` | ConvoKit speaker id |
| `speaker_internal_id` | Participant role id, such as `mturk_agent_1` |
| `data` | Terminal negotiation metadata |
| `issue2youget` / `issue2theyget` | Submitted allocation maps |

Annotated dialogue count: **396**.

Top annotation components after splitting comma-separated annotations:

| Component | Count |
| --- | ---: |
| `non-strategic` | 1,455 |
| `small-talk` | 1,054 |
| `self-need` | 964 |
| `promote-coordination` | 579 |
| `vouch-fair` | 439 |
| `other-need` | 409 |
| `elicit-pref` | 377 |
| `showing-empathy` | 254 |
| `no-need` | 196 |
| `uv-part` | 131 |

Terminal action metadata:

| Value | Count |
| --- | ---: |
| `accept_deal` | 1,005 |
| `reject_deal` | 167 |
| `walk_away` | 25 |

Rows with submitted allocation maps: **1,181**.

### Conversations

`casino_conversations.parquet` contains:

- `conversation_id`
- `meta_json`

Conversation metadata contains:

- `dialogue_id`
- `participant_info`

`participant_info` contains `mturk_agent_1` and `mturk_agent_2`. For each
participant, CaSiNo stores:

- `value2issue`: preference mapping for `Food`, `Water`, `Firewood`;
- `value2reason`: natural-language reasons for preferences;
- `outcomes`: `points_scored`, `satisfaction`, and `opponent_likeness`.

Participant points summary in the inspected export:

```text
min = 5
max = 32
mean = 18.637
```

### Speakers

`casino_speakers.parquet` contains:

- `speaker_id`
- `meta_json`

Speaker metadata contains:

- `demographics`: `age`, `education`, `ethnicity`, `gender`;
- `personality`: `big-five`, `svo`.

SVO distribution:

| SVO class | Count |
| --- | ---: |
| `prosocial` | 463 |
| `proself` | 364 |
| `unclassified` | 19 |

## Processed Dataset Overview

All processed Behavior Lab outputs are generated under:

```text
kanonar_behavior_lab/data/processed/
```

Reports are generated under:

```text
kanonar_behavior_lab/data/reports/
```

Generated data files are local artifacts and are ignored by git.

| Dataset | Rows | Unit | Purpose |
| --- | ---: | --- | --- |
| `raw_dialogues.parquet` | 14,297 | utterance | Normalized CaSiNo dialogue rows |
| `events.parquet` | 14,297 | utterance/event | v1 behavioral event labels and deltas |
| `trajectories.parquet` | 14,297 | event state | v1 trust/conflict/utility trajectory |
| `episode_features.parquet` | 1,030 | episode | v1 episode-level features and labels |
| `prediction_metrics.json` | n/a | metrics | early prediction baseline metrics |
| `events_v2.parquet` | 14,297 | utterance/event | refined v2 event labels |
| `offer_dynamics.parquet` | 7,447 | offer-family row | offer signatures and allocation movement |
| `trajectory_windows.parquet` | 3,329 | local window | local regime labels |
| `episode_features_v2.parquet` | 1,030 | episode | v2 episode-level features and labels |
| `manual_validation_sample.parquet` | 384 | validation sample row | stratified sample for human validation |
| `manual_validation_template.csv` | 384 | validation sample row | fillable human validation template |
| `manual_validation_results.parquet` | 384 | validation sample row | initialized validation results table |
| `transition_matrix.parquet` | 24 | transition pair | local regime transition probabilities |
| `allocation_progress.parquet` | 7,447 | offer/progress row | observed allocation-progress proxy |
| `actor_episode_profiles.parquet` | 2,060 | actor in episode | actor-level behavioral features |
| `trait_axes.parquet` | 2,060 | actor in episode | trait-like behavioral axes |
| `cluster_assignments.parquet` | 2,060 | actor in episode | behavioral profile cluster labels |

## Processing Stages

### 1. Normalization: `raw_dialogues.parquet`

`raw_dialogues.parquet` preserves every CaSiNo utterance and exposes stable
columns for downstream preprocessing:

- `episode_id`
- `dialogue_id`
- `t`
- `utterance_id`
- `actor`
- `target`
- `speaker_id`
- `speaker_internal_id`
- `text`
- `annotations`
- `terminal_data`
- `issue2youget`
- `issue2theyget`

Rules:

- missing CaSiNo annotations remain missing;
- missing annotations are not treated as `neutral`;
- `neutral` is assigned only by the Behavior Lab action classifier;
- `speaker_internal_id` is preserved because it links utterances to
  `participant_info`;
- UTF-8 text is preserved.

### 2. v1 Event Translation: `events.parquet`

`events.parquet` converts each utterance into one formal event:

```text
utterance -> action_type -> flags -> state deltas -> outcome
```

v1 action alphabet:

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

Each event stores:

- actor and target;
- original text;
- action type;
- coarse emotion and intent;
- boolean flags for offer/reject/accept/concession/repair/pressure;
- `trust_delta`, `conflict_delta`, `utility_delta`;
- final outcome marker.

The v1 classifier is deterministic and rule-based. It is an interpretable
baseline, not a validated language model.

### 3. v1 Trajectories: `trajectories.parquet`

`trajectories.parquet` applies rule-based state deltas after each event.

Initial state:

```text
trust = 0.50
conflict = 0.10
utility = 0.00
```

All values are clipped to `[0.0, 1.0]`.

Important limitation: `trust`, `conflict`, and `utility` are internal
simulation scalars. They are not measured psychological quantities from CaSiNo.

### 4. v1 Episode Features: `episode_features.parquet`

One row equals one negotiation episode.

Feature families:

- action counts;
- final trust/conflict/utility;
- max and mean conflict;
- trust/conflict/utility slopes;
- first reject time;
- first concession time;
- time to accept;
- action entropy;
- `deal_outcome`;
- `attractor_label`.

v1 result:

| Metric | Value |
| --- | ---: |
| Episodes | 1,030 |
| Events | 14,297 |
| Trajectory rows | 14,297 |
| Deal episodes | 1,005 |
| No-deal episodes | 25 |

v1 attractor labels:

| Label | Count |
| --- | ---: |
| `cooperation` | 981 |
| `bargaining` | 39 |
| `escalation` | 10 |

Mean final v1 state:

| State | Mean |
| --- | ---: |
| trust | 0.886 |
| conflict | 0.027 |
| utility | 0.987 |

v1 exposed two important modeling issues:

- `accept` was too broad and captured many local acknowledgements;
- `counteroffer` became a large mixed bucket.

These were not hidden; they became the motivation for v2.

## v2 Refinement

v2 keeps v1 as a baseline but refines the action space.

Acceptance split:

```text
accept -> terminal_accept | soft_accept | acknowledge
```

Offer split:

```text
offer/counteroffer
-> initial_offer
-> counteroffer
-> repeat_offer
-> concession_offer
-> self_favoring_offer
-> demand
-> deal_formalization
```

Other v2 labels:

```text
reject
pressure
threaten
repair
explain_preference
ask_preference
neutral
```

v2 result counts:

| Dataset | Rows |
| --- | ---: |
| `events_v2.parquet` | 14,297 |
| `offer_dynamics.parquet` | 7,447 |
| `trajectory_windows.parquet` | 3,329 |
| `episode_features_v2.parquet` | 1,030 |

v2 action distribution:

| Action | Count |
| --- | ---: |
| `counteroffer` | 4,346 |
| `soft_accept` | 2,016 |
| `neutral` | 1,617 |
| `ask_preference` | 1,182 |
| `concession_offer` | 1,180 |
| `initial_offer` | 1,030 |
| `terminal_accept` | 1,005 |
| `demand` | 570 |
| `reject` | 287 |
| `repair` | 267 |
| `self_favoring_offer` | 252 |
| `explain_preference` | 198 |
| `threaten` | 140 |
| `pressure` | 77 |
| `acknowledge` | 61 |
| `deal_formalization` | 52 |
| `repeat_offer` | 17 |

Offer dynamics:

| Metric | Value |
| --- | ---: |
| offer-family rows | 7,447 |
| allocation-present rows | 1,181 |
| mean allocation shift distance | 4.410 |

Offer shift categories:

| Category | Count |
| --- | ---: |
| `changed` | 6,161 |
| `initial` | 1,030 |
| empty / non-offer metadata rows | 234 |
| `repeat_by_actor` | 17 |
| `repeat_global` | 5 |

## Local Window Regimes

v2 adds segment-level labels in `trajectory_windows.parquet`.

This is important because a whole dialogue can end in a deal while still
containing local deadlock or escalation segments.

Window label distribution:

| Window label | Count |
| --- | ---: |
| `cooperation_window` | 1,537 |
| `bargaining_window` | 1,296 |
| `escalation_window` | 298 |
| `repair_window` | 164 |
| `deadlock_window` | 34 |

v2 episode attractors:

| Attractor | Count |
| --- | ---: |
| `cooperation` | 791 |
| `bargaining` | 160 |
| `escalation` | 77 |
| `deadlock` | 2 |

Interpretation: in CaSiNo, `deadlock` is better represented as a local regime
than as a frequent final episode label.

## Manual Validation Sample

`manual_validation_sample.parquet` and `manual_validation_template.csv` prepare
a stratified human-review sample.

Sample counts:

| Sample type | Count |
| --- | ---: |
| `counteroffer` | 50 |
| `concession_offer` | 50 |
| `demand` | 50 |
| `self_favoring_offer` | 50 |
| `soft_accept` | 50 |
| `terminal_accept` | 50 |
| `escalation_window` | 50 |
| `deadlock_window` | 34 |

Total rows: **384**.

Human precision is pending. The fields `human_label`, `judgment`, and `notes`
are intentionally empty until manual annotation.

Allowed judgment values:

```text
correct
partially_correct
wrong
```

## Transition Matrix

`transition_matrix.parquet` stores observed transitions between local window
regimes. It currently contains **24 observed transition pairs**.

Named transition probabilities:

| Conditional probability | Value |
| --- | ---: |
| `P(cooperation next | repair current)` | 0.552 |
| `P(escalation next | deadlock current)` | 0.000 |
| `P(cooperation next | concession_offer in previous window)` | 0.590 |
| `P(deadlock next | repeat_offer + no concession)` | 0.500 |
| `P(escalation next | demand + pressure)` | 0.091 |

These are descriptive transition priors for Kanonar simulation experiments.
They are not causal claims.

## Observed Allocation Progress

`allocation_progress.parquet` compares rule-based utility against an observed
allocation-progress proxy.

Important counts:

| Metric | Value |
| --- | ---: |
| offer/progress rows | 7,447 |
| observed allocation rows | 1,181 |
| corr(`utility_rule_based`, `utility_observed_proxy`) | 0.132 |

Interpretation: the correlation is weak. This is a calibration warning. The
current rule-based T/C/U deltas should not be automatically retuned, but the
mismatch should guide a future calibration task.

Numeric allocation geometry is reliable only when `allocation_observed = true`.
Text-only offer signatures support behavioral counts but not precise
fairness/progress claims.

## Actor-Level Behavioral Profiles

v4 adds actor-in-episode profiles:

```text
1030 episodes * 2 actors = 2060 rows
```

Files:

- `actor_episode_profiles.parquet`
- `trait_axes.parquet`
- `cluster_assignments.parquet`

Profile features are rates or normalized values rather than raw dialogue-length
counts. Examples:

- `offer_rate`
- `counteroffer_rate`
- `concession_offer_rate`
- `demand_rate`
- `self_favoring_offer_rate`
- `soft_accept_rate`
- `terminal_accept_rate`
- `reject_rate`
- `pressure_rate`
- `repair_rate`
- `acknowledge_rate`
- `action_entropy`
- `strategy_switch_rate`
- `rigidity_score`
- `repair_after_escalation_rate`
- `concede_after_reject_rate`
- `pressure_after_deadlock_rate`
- `mean_trust_delta_after_actor`
- `mean_conflict_delta_after_actor`
- `mean_utility_delta_after_actor`

Direct outcome and final-state leakage columns are excluded from clustering
input:

- `deal_outcome`
- `attractor_label_v2`
- `final_trust`
- `final_conflict`
- `final_utility`

Those fields remain external validation columns only.

## Trait-Like Axes

`trait_axes.parquet` contains interpretable behavioral axes:

| Axis | Mean |
| --- | ---: |
| `cooperativeness` | 0.139 |
| `assertiveness` | 0.147 |
| `aggressive_pressure` | 0.216 |
| `flexibility` | 0.256 |
| `repair_orientation` | 0.043 |
| `rigidity` | 0.200 |
| `fairness_orientation` | 0.068 |

These are **trait-like behavioral signatures**, not personality traits. They
summarize repeated behavior patterns in this dataset and need manual example
review before stronger interpretation.

## Behavioral Profile Clusters

Clustering uses trait-like axes only. Direct outcomes and final T/C/U states are
excluded from clustering input.

K-means was evaluated for `k = 2..7`.

| k | Silhouette |
| ---: | ---: |
| 2 | 0.369 |
| 3 | 0.370 |
| 4 | 0.379 |
| 5 | 0.371 |
| 6 | 0.321 |
| 7 | 0.320 |

Selected `k`: **4**.

Bootstrap stability ARI:

```text
mean = 0.991
min = 0.976
max = 0.998
```

Cluster distribution:

| Cluster | Rows |
| --- | ---: |
| `flexible_adapter` | 735 |
| `rigid_repeater` | 609 |
| `pressuring_escalator` | 540 |
| `repair_mediator` | 176 |

Cluster interpretation:

| Cluster | Main signal |
| --- | --- |
| `flexible_adapter` | higher flexibility, cooperativeness, and fairness orientation |
| `pressuring_escalator` | higher aggressive pressure and assertiveness |
| `repair_mediator` | higher repair orientation and cooperativeness |
| `rigid_repeater` | higher rigidity and lower strategic switching |

These names are descriptive behavior-profile labels, not diagnoses and not
validated personality categories.

## Reports

Generated reports:

| Report | Purpose |
| --- | --- |
| `behavior_report.md` | v1 event, trajectory, feature, and prediction summary |
| `behavior_report_v2.md` | v2 action split, offer dynamics, and window labels |
| `validation_report.md` | manual validation sample summary |
| `transition_report.md` | local window transition matrix and named probabilities |
| `cluster_report.md` | trait-like axes clustering summary |
| `kanonar_behavior_lab_casino_results.docx` | Word/OpenXML version of this results overview |

The `.docx` report is preserved as a local artifact. This Markdown document is
the docs-side description.

## Validation Commands

Commands already used for the Behavior Lab layer:

```powershell
.\.venv\Scripts\python.exe -m compileall -q kanonar_behavior_lab
.\.venv\Scripts\python.exe -m kanonar_behavior_lab.src.ingest.load_casino
.\.venv\Scripts\python.exe -m kanonar_behavior_lab.src.trajectories.build_trajectories
.\.venv\Scripts\python.exe -m kanonar_behavior_lab.src.trajectories.extract_features
.\.venv\Scripts\python.exe -m kanonar_behavior_lab.src.models.predict_outcome
.\.venv\Scripts\python.exe -m kanonar_behavior_lab.src.reports.make_report
.\.venv\Scripts\python.exe -m kanonar_behavior_lab.src.reports.validate_dataset
.\.venv\Scripts\python.exe -m kanonar_behavior_lab.src.trajectories.build_v2
.\.venv\Scripts\python.exe -m kanonar_behavior_lab.src.reports.make_report_v2
.\.venv\Scripts\python.exe -m kanonar_behavior_lab.src.reports.validate_dataset_v2
.\.venv\Scripts\python.exe -m kanonar_behavior_lab.src.validation.build_manual_sample
.\.venv\Scripts\python.exe -m kanonar_behavior_lab.src.transitions.build_transition_matrix
.\.venv\Scripts\python.exe -m kanonar_behavior_lab.src.profiles.build_actor_profiles
.\.venv\Scripts\python.exe -m kanonar_behavior_lab.src.profiles.build_trait_axes
.\.venv\Scripts\python.exe -m kanonar_behavior_lab.src.profiles.cluster_profiles
```

Key validation results:

- v1 final validator: `DATASET_VALIDATION_OK`;
- v2 final validator: `DATASET_V2_VALIDATION_OK`;
- v3/v4 sanity checks passed for sample counts, transition probability sums,
  allocation progress rows, actor profile rows, leakage exclusion, and report
  limitation language.

## Current Scientific Interpretation

What is already useful:

- the pipeline preserves all 14,297 utterances and all 1,030 dialogues;
- v1 establishes the full translation chain;
- v2 fixes the most important label inflation around acceptance and adds
  local regimes;
- `deadlock_window` exists as a local phenomenon even though final no-deal
  episodes are rare;
- transition probabilities can be used as first simulation priors;
- actor-level profiles provide a structured basis for studying behavior styles.

What is not solved yet:

- manual precision for v2 labels is still pending;
- `counteroffer` remains large and needs manual audit or finer rules;
- rule-based `utility` weakly correlates with observed allocation progress;
- cluster names need representative dialogue review before being treated as
  stable behavior-profile names.

## Assumptions and Limitations

Kanonar is a research/prototype simulation system. Variables such as trust,
conflict, utility, pressure, flexibility, rigidity, or repair orientation are
internal simulation or derived behavior-profile variables. They are not
clinical, psychometric, or experimentally calibrated measurements.

The CaSiNo Behavior Lab layer is useful for deterministic preprocessing,
annotation coverage checks, event extraction, trajectory experiments, local
transition analysis, and future calibration. It is not by itself a validation
of Kanonar as a real-world behavioral prediction model.

Any public use of these derived results must preserve CaSiNo attribution,
ConvoKit source attribution, the ACL paper citation, and the CC BY 4.0 license
link.
