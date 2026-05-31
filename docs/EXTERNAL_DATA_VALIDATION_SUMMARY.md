# External Data and Validation Summary

Этот документ фиксирует внешние датасеты и validation-артефакты, которые были
добавлены в Kanonar в текущей волне работы:

```text
CaSiNo / ConvoKit
-> Behavior Lab: переговорные события, T/C/U-траектории, окна режимов,
   переходы, поведенческие профили и кластеры

SAPA Personality Inventory / SPI
-> Trait Validation v1: item factor loadings, derived trait scores,
   trait correlation matrix, validation report
```

Оба блока являются внешними проверочными слоями. Они не меняют deterministic
runtime Kanonar и не превращают внутренние переменные Kanonar в измеренные
психологические величины.

## Что было сделано

### 1. CaSiNo Behavior Lab

В предыдущем чате был создан и расширен экспериментальный Behavior Lab для
переговорного корпуса CaSiNo.

Сделано:

- скачан CaSiNo через ConvoKit `casino-corpus`;
- сохранён сырой ConvoKit export в локальные Parquet-таблицы;
- добавлен автономный Python-пакет `kanonar_behavior_lab`;
- построен v1 rule-based translator:
  `dialogue text -> action event -> trust/conflict/utility trajectory`;
- построен v2 translator с разделением перегруженных действий:
  `terminal_accept`, `soft_accept`, `acknowledge`, `initial_offer`,
  `counteroffer`, `concession_offer`, `demand`, `repair`, etc.;
- добавлены локальные window labels:
  `cooperation_window`, `bargaining_window`, `deadlock_window`,
  `escalation_window`, `repair_window`;
- добавлены transition matrix и named conditional probabilities;
- добавлен observed allocation progress proxy;
- добавлены actor-in-episode behavioral profiles;
- добавлены trait-like behavioral axes и behavioral profile clusters;
- добавлены Markdown/DOCX-отчёты и validation reports;
- документация CaSiNo вынесена в `docs/BEHAVIOR_LAB.md` и
  `docs/BEHAVIOR_LAB_CASINO_RESULTS.md`.

Главный смысл: CaSiNo используется не как личностный датасет, а как корпус
поведенческих эпизодов переговоров. Он пригоден для проверки того, меняются ли
Kanonar-подобные поведенческие признаки при офферах, уступках, давлении,
repair-поведении и deadlock-окнах.

### 2. SAPA/SPI Trait Validation

В текущем чате был добавлен компактный psychometric smoke-check слой для
derived traits Канонара.

Сделано:

- скачан CRAN package `psychTools` версии `2.6.4`;
- извлечены объекты `spi`, `spi.dictionary`, `spi.keys`;
- экспортированы локальные CSV:
  `raw_spi.csv`, `spi_dictionary.csv`, `spi_keys.csv`;
- добавлен validation contract:
  `docs/axis_validation_registry.yaml`;
- все `vector_base` A-G оси получили статус:
  `external_validatable`, `proxy_validatable`, `world_internal` или `derived`;
- отдельно зафиксировано, что `TRAITS` не равны базовым осям `vector_base`;
- добавлен runner `scripts/run_spi_trait_validation.py`;
- runner сгенерировал:
  `item_factor_loadings.csv`,
  `kanonar_trait_scores.csv`,
  `trait_correlation_matrix.csv`,
  `trait_validation_report.md`.

Главный смысл: SPI используется не для валидации всего Kanonar, а для первого
convergent/discriminant smoke-check derived traits:

```text
care
harshness
agency
submission
trust
paranoia / defensive_suspicion
stability
novelty_seeking
```

## Источники и лицензии

### CaSiNo

Источник:

- Dataset: CaSiNo: A Corpus of Campsite Negotiation Dialogues for Automatic
  Negotiation Systems
- Access layer: ConvoKit `casino-corpus`
- Corpus page: <https://convokit.cornell.edu/documentation/casino-corpus.html>
- Paper: <https://aclanthology.org/2021.naacl-main.254/>
- License: CC BY 4.0, <https://creativecommons.org/licenses/by/4.0/>

Локальный downloader:

```text
scripts/download_casino.py
```

Зависимости:

```text
requirements-behavior-lab.txt
```

Рекомендуемая ссылка и BibTeX находятся в `docs/BEHAVIOR_LAB.md`.

### SAPA/SPI

Источник:

- Dataset object: SAPA Personality Inventory / SPI
- Access layer: CRAN package `psychTools`
- Downloaded archive:
  `https://cran.r-project.org/src/contrib/psychTools_2.6.4.tar.gz`
- Local archive:
  `kanonar_trait_validation/psychTools_2.6.4.tar.gz`

Извлечённые объекты:

```text
psychTools/data/spi.rda
psychTools/data/spi.dictionary.rda
psychTools/data/spi.keys.rda
```

Локальная конверсия:

```text
spi.rda            -> raw_spi.csv
spi.dictionary.rda -> spi_dictionary.csv
spi.keys.rda       -> spi_keys.csv
```

## CaSiNo: сырой экспорт

Сырой ConvoKit export находится в:

```text
data/processed/
```

Эти файлы игнорируются git и должны регенерироваться локально.

| File | Rows | Columns | Meaning |
| --- | ---: | ---: | --- |
| `casino_utterances.parquet` | 14,297 | 6 | One row per utterance |
| `casino_conversations.parquet` | 1,030 | 2 | One row per dialogue |
| `casino_speakers.parquet` | 846 | 2 | One row per speaker |
| `casino_manifest.json` | - | - | Source, counts, file map, notes |

### `casino_utterances.parquet`

Columns:

- `utterance_id` - ConvoKit utterance id.
- `conversation_id` - ConvoKit conversation id. В этом export это root
  utterance id, например `utterance_0`.
- `reply_to` - parent utterance id.
- `speaker_id` - ConvoKit speaker id.
- `text` - текст реплики.
- `meta_json` - deterministic JSON со вложенной metadata.

Важная metadata внутри `meta_json`:

- `annotations` - CaSiNo strategy annotations; non-empty на 4,615 utterances.
- `dialogue_id` - numeric CaSiNo dialogue id.
- `speaker_id` - ConvoKit speaker id.
- `speaker_internal_id` - роль участника, например `mturk_agent_1`.
- `data` - terminal negotiation action metadata.
- `issue2youget` / `issue2theyget` - submitted allocation maps.

Аннотированных диалогов: 396.

Top strategy components после split comma-separated annotations:

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

Rows with allocation maps: 1,181.

### `casino_conversations.parquet`

Columns:

- `conversation_id`
- `meta_json`

Metadata:

- `dialogue_id`
- `participant_info`

`participant_info` contains:

- `mturk_agent_1`
- `mturk_agent_2`

For each participant:

- `value2issue` - maps `High`, `Medium`, `Low` to `Food`, `Water`,
  `Firewood`.
- `value2reason` - natural-language reasons for preferences.
- `outcomes` - `points_scored`, `satisfaction`, `opponent_likeness`.

Participant points summary:

```text
min = 5
max = 32
mean = 18.637
```

### `casino_speakers.parquet`

Columns:

- `speaker_id`
- `meta_json`

Metadata:

- `demographics`: `age`, `education`, `ethnicity`, `gender`.
- `personality`: `big-five`, `svo`.

SVO distribution:

| SVO class | Count |
| --- | ---: |
| `prosocial` | 463 |
| `proself` | 364 |
| `unclassified` | 19 |

## CaSiNo: processed Behavior Lab data

Processed Behavior Lab data находится в:

```text
kanonar_behavior_lab/data/processed/
```

Эти файлы тоже ignored/local. Они являются производными от CaSiNo.

### v1 behavioral translator

Цепочка:

```text
raw_dialogues.parquet
-> events.parquet
-> trajectories.parquet
-> episode_features.parquet
-> prediction_metrics.json
-> behavior_report.md
```

#### `raw_dialogues.parquet`

Rows: 14,297. Columns: 13.

Meaning: нормализованный CaSiNo dialogue layer после promotion нужных metadata
в явные columns.

Columns:

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

#### `events.parquet`

Rows: 14,297. Columns: 18.

Meaning: one row per utterance after rule-based action classification.

Action alphabet v1:

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

Columns:

- ids/time: `episode_id`, `t`, `actor`, `target`
- text/action: `text`, `action_type`, `emotion`, `intent`
- rule flags: `offer_present`, `reject_present`, `accept_present`,
  `concession_present`, `repair_present`, `pressure_present`
- trajectory deltas: `trust_delta`, `conflict_delta`, `utility_delta`
- `outcome`

#### `trajectories.parquet`

Rows: 14,297. Columns: 9.

Meaning: per-turn internal trajectory after applying rule-based deltas.

Columns:

- `episode_id`
- `t`
- `action_type`
- `trust`
- `conflict`
- `utility`
- `trust_delta`
- `conflict_delta`
- `utility_delta`

Important limitation: `trust`, `conflict`, and `utility` are Kanonar-style
internal simulation scalars, not measured CaSiNo labels.

#### `episode_features.parquet`

Rows: 1,030. Columns: 22.

Meaning: one row per dialogue with v1 aggregate features and labels.

Feature families:

- counts: `offer_count`, `reject_count`, `accept_count`, `concession_count`,
  `pressure_count`, `repair_count`
- final state: `final_trust`, `final_conflict`, `final_utility`
- shape stats: `max_conflict`, `mean_conflict`, `conflict_slope`,
  `trust_slope`, `utility_slope`
- timing: `first_reject_time`, `first_concession_time`, `time_to_accept`
- entropy/outcome: `action_entropy`, `deal_outcome`, `attractor_label`

v1 results:

```text
episodes = 1030
events = 14297
trajectory rows = 14297
deal_outcome = {'deal': 1005, 'no_deal': 25}
attractor_label = {'cooperation': 981, 'bargaining': 39, 'escalation': 10}
mean final trust = 0.886
mean final conflict = 0.027
mean final utility = 0.987
```

Early prediction baseline:

| Prefix | Target | Accuracy | Balanced accuracy |
| --- | --- | ---: | ---: |
| first 20% | `deal_outcome` | 0.849 | 0.516 |
| first 20% | `attractor_label` | 0.481 | 0.365 |
| first 40% | `deal_outcome` | 0.775 | 0.560 |
| first 40% | `attractor_label` | 0.547 | 0.618 |

### v2 refined translator

Цепочка:

```text
events_v2.parquet
-> offer_dynamics.parquet
-> trajectory_windows.parquet
-> episode_features_v2.parquet
-> behavior_report_v2.md
```

v2 исправляет главный дефект v1: слишком широкие `accept` и `counteroffer`.

#### `events_v2.parquet`

Rows: 14,297. Columns: 22.

Meaning: one row per utterance with split v2 action label and current
trajectory state.

Columns:

- ids/time: `episode_id`, `dialogue_id`, `t`, `actor`, `target`
- text/action: `text`, `action_type_v2`, `emotion`, `intent`
- rule flags: `offer_present`, `reject_present`, `accept_present`,
  `concession_present`, `repair_present`, `pressure_present`
- deltas: `trust_delta`, `conflict_delta`, `utility_delta`
- state: `trust`, `conflict`, `utility`
- `outcome`

Action distribution v2:

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

#### `offer_dynamics.parquet`

Rows: 7,447. Columns: 11.

Meaning: offer-family rows with offer signatures and allocation movement.

Columns:

- `episode_id`
- `t`
- `actor`
- `action_type_v2`
- `offer_signature`
- `offer_shift_from_previous`
- `allocation_present`
- `issue2youget`
- `issue2theyget`
- `offer_shift_distance`
- `distance_to_final_deal`

Results:

```text
allocation_present rows = 1181
offer_shift_from_previous =
  changed: 6161
  initial: 1030
  empty/non-offer metadata rows: 234
  repeat_by_actor: 17
  repeat_global: 5
mean allocation shift distance = 4.410
```

#### `trajectory_windows.parquet`

Rows: 3,329. Columns: 13.

Meaning: local windows over v2 trajectories with regime labels.

Columns:

- `episode_id`
- `window_id`
- `start_t`
- `end_t`
- `n_turns`
- `window_label`
- `reject_count`
- `concession_count`
- `pressure_count`
- `repair_count`
- `utility_slope`
- `conflict_slope`
- `trust_slope`

Window labels:

| Window label | Count |
| --- | ---: |
| `cooperation_window` | 1,537 |
| `bargaining_window` | 1,296 |
| `escalation_window` | 298 |
| `repair_window` | 164 |
| `deadlock_window` | 34 |

#### `episode_features_v2.parquet`

Rows: 1,030. Columns: 32.

Meaning: one row per dialogue with split action counts, v2 window counts,
trajectory stats and final v2 attractor.

Feature families:

- split action counts:
  `initial_offer_count`, `counteroffer_count`, `repeat_offer_count`,
  `concession_offer_count`, `self_favoring_offer_count`, `demand_count`,
  `soft_accept_count`, `terminal_accept_count`, `acknowledge_count`,
  `reject_count`, `pressure_count`, `repair_count`
- final state and slopes:
  `final_trust`, `final_conflict`, `final_utility`, `max_conflict`,
  `mean_conflict`, `conflict_slope`, `trust_slope`, `utility_slope`
- timing and entropy:
  `first_reject_time`, `first_concession_time`,
  `time_to_terminal_accept`, `action_entropy`
- local regimes:
  `deadlock_window_count`, `escalation_window_count`,
  `cooperation_window_count`, `repair_window_count`
- labels:
  `deal_outcome`, `attractor_label_v2`

v2 episode attractors:

| Attractor | Count |
| --- | ---: |
| `cooperation` | 791 |
| `bargaining` | 160 |
| `escalation` | 77 |
| `deadlock` | 2 |

### Manual validation sample

Files:

```text
manual_validation_sample.parquet
manual_validation_template.csv
manual_validation_results.parquet
```

Rows: 384. Columns: 12.

Meaning: deterministic stratified sample for human review of action/window
labels.

Columns:

- `sample_id`
- `sample_type`
- `episode_id`
- `t`
- `start_t`
- `end_t`
- `actor`
- `text_or_window_text`
- `predicted_label`
- `human_label`
- `judgment`
- `notes`

Current status:

- `human_label`, `judgment`, and `notes` are empty template fields.
- Human precision metrics are not computed yet.
- Next manual step: fill `manual_validation_template.csv`.

Sample counts:

| Label/sample | Count |
| --- | ---: |
| `counteroffer` | 50 |
| `concession_offer` | 50 |
| `demand` | 50 |
| `self_favoring_offer` | 50 |
| `soft_accept` | 50 |
| `terminal_accept` | 50 |
| `escalation_window` | 50 |
| `deadlock_window` | 34 |

### Transition and allocation calibration

#### `transition_matrix.parquet`

Rows: 24. Columns: 4.

Columns:

- `current_window`
- `next_window`
- `count`
- `probability`

Named conditional probabilities:

| Probability | Value |
| --- | ---: |
| P(cooperation next \| repair current) | 0.552 |
| P(escalation next \| deadlock current) | 0.000 |
| P(cooperation next \| concession_offer in previous window) | 0.590 |
| P(deadlock next \| repeat_offer + no concession) | 0.500 |
| P(escalation next \| demand + pressure) | 0.091 |

#### `allocation_progress.parquet`

Rows: 7,447. Columns: 12.

Columns:

- `episode_id`
- `t`
- `actor`
- `action_type_v2`
- `allocation_observed`
- `allocation_distance_to_final`
- `allocation_distance_delta`
- `offer_progress_observed`
- `concession_magnitude_observed`
- `mutual_closure_rate_observed`
- `utility_rule_based`
- `utility_observed_proxy`

Calibration result:

```text
allocation observed rows = 1181
corr(utility_rule_based, utility_observed_proxy) = 0.132
```

Interpretation: correlation is weak. Do not retune T/C/U deltas automatically
from this proxy without manual review and better allocation geometry.

### Actor profiles, trait-like axes and clusters

#### `actor_episode_profiles.parquet`

Rows: 2,060. Columns: 35.

Meaning: one row per `episode_id x actor`, exactly `1030 episodes * 2 actors`.

Column families:

- activity volume: `n_actor_turns`
- action rates: `pressure_rate`, `threaten_rate`, `repeat_offer_rate`,
  `offer_rate`, `counteroffer_rate`, `concession_offer_rate`, `demand_rate`,
  `self_favoring_offer_rate`, `soft_accept_rate`, `terminal_accept_rate`,
  `reject_rate`, `repair_rate`, `acknowledge_rate`
- sequence/strategy: `action_entropy`, `strategy_switch_rate`,
  `rigidity_score`
- timing: `first_offer_time`, `first_concession_time`,
  `first_pressure_time`
- offer movement: `mean_offer_shift`, `mean_concession_magnitude`,
  `mean_self_favoring_shift`, `mean_partner_favoring_shift`,
  `observed_allocation_offer_count`
- response dynamics:
  `repair_after_escalation_rate`, `concede_after_reject_rate`,
  `pressure_after_deadlock_rate`
- local effect:
  `mean_trust_delta_after_actor`, `mean_conflict_delta_after_actor`,
  `mean_utility_delta_after_actor`
- labels for analysis:
  `deal_outcome`, `attractor_label_v2`

#### `trait_axes.parquet`

Rows: 2,060. Columns: 11.

Meaning: hand-built behavioral axes from actor profiles.

Columns:

- `episode_id`
- `actor`
- `cooperativeness`
- `assertiveness`
- `aggressive_pressure`
- `flexibility`
- `repair_orientation`
- `rigidity`
- `fairness_orientation`
- `deal_outcome`
- `attractor_label_v2`

These are trait-like behavioral signatures, not personality traits.

Mean axis values:

```text
cooperativeness = 0.139
assertiveness = 0.147
aggressive_pressure = 0.216
flexibility = 0.256
repair_orientation = 0.043
rigidity = 0.200
fairness_orientation = 0.068
```

#### `cluster_assignments.parquet`

Rows: 2,060. Columns: 13.

Meaning: cluster labels from trait-like axes only. Direct outcomes and final
T/C/U states are excluded from clustering input.

Columns:

- `episode_id`
- `actor`
- `deal_outcome`
- `attractor_label_v2`
- `cooperativeness`
- `assertiveness`
- `aggressive_pressure`
- `flexibility`
- `repair_orientation`
- `rigidity`
- `fairness_orientation`
- `cluster_id`
- `cluster_name`

Cluster selection:

```text
k=4 selected by silhouette score
bootstrap stability ARI mean = 0.991
bootstrap stability ARI min = 0.976
bootstrap stability ARI max = 0.998
```

Clusters:

| Cluster | Rows | Main signature |
| --- | ---: | --- |
| `flexible_adapter` | 735 | flexibility, cooperativeness, fairness orientation |
| `pressuring_escalator` | 540 | aggressive pressure, assertiveness, flexibility |
| `repair_mediator` | 176 | repair orientation, cooperativeness, flexibility |
| `rigid_repeater` | 609 | rigidity, assertiveness, aggressive pressure |

## SAPA/SPI: raw local data

SPI data находится в:

```text
kanonar_trait_validation/
```

Эта папка ignored/local. Она хранит и исходный archive, и derived validation
outputs.

### Source archive

```text
psychTools_2.6.4.tar.gz
```

Downloaded from:

```text
https://cran.r-project.org/src/contrib/psychTools_2.6.4.tar.gz
```

Package metadata:

```text
Package: psychTools
Version: 2.6.4
Published: 2026-05-04
License: GPL >= 2
```

### `raw_spi.csv`

Rows: 4,000. Columns: 145.

Meaning: SPI item responses plus demographic/criterion variables.

Columns:

- 10 non-item columns:
  `age`, `sex`, `health`, `p1edu`, `p2edu`, `education`, `wellness`, `exer`,
  `smoke`, `ER`
- 135 item response columns:
  `q_*`

Observed response range:

```text
min item response = 1
max item response = 6
missing item response rate = 0.0
```

Runner normalization:

```text
item01 = (response - 1) / 5
```

### `spi_dictionary.csv`

Rows: 145. Columns: 6.

Meaning: item metadata.

Columns:

- `item_id`
- `item`
- `item_scale`
- `resp_type`
- `B5`
- `L27`

Coverage:

- all 135 raw `q_*` item columns are present in the dictionary;
- dictionary also includes the 10 non-item rows.

`B5` coverage:

| B5 value | Count |
| --- | ---: |
| `Agree` | 14 |
| `Consc` | 14 |
| `Neuro` | 14 |
| `Extra` | 14 |
| `Open` | 14 |
| empty / non-B5 | 75 |

### `spi_keys.csv`

Rows: 205. Columns: 3.

Meaning: scale scoring keys extracted from `spi.keys`.

Columns:

- `scale`
- `item_id`
- `reverse_keyed`

Scale count: 32.

Scales:

```text
Agree
Consc
Neuro
Extra
Open
Compassion
Trust
Honesty
Conservatism
Authoritarianism
EasyGoingness
Perfectionism
Order
Industry
Impulsivity
SelfControl
EmotionalStability
Anxiety
Irritability
WellBeing
EmotionalExpressiveness
Sociability
Adaptability
Charisma
Humor
AttentionSeeking
SensationSeeking
Conformity
Introspection
ArtAppreciation
Creativity
Intellect
```

Reverse-key scoring rule:

```text
if reverse_keyed:
  scored_item = 1 - item01
else:
  scored_item = item01
```

### `source_metadata.json`

Meaning: machine-readable export summary.

Important fields:

- `dataset`: SAPA Personality Inventory / SPI
- `source_package`: `psychTools`
- `source_package_version`: `2.6.4`
- `rows`: 4000
- `columns`: 145
- `item_response_columns`: 135
- `dictionary_rows`: 145
- `keyed_scale_count`: 32
- `keyed_item_rows`: 205

## SAPA/SPI: validation outputs

Validation runner:

```text
scripts/run_spi_trait_validation.py
```

Command:

```powershell
python scripts\run_spi_trait_validation.py
```

Observed runner output:

```text
SPI_TRAIT_VALIDATION_OK
rows=4000
item_response_columns=135
spi_scales=32
derived_traits=8
```

### Method

The runner:

1. reads `raw_spi.csv`, `spi_dictionary.csv`, `spi_keys.csv`;
2. reads `docs/axis_validation_registry.yaml`;
3. normalizes 135 item responses from `1..6` to `0..1`;
4. scores reverse-keyed items as `1 - normalized`;
5. computes 32 SPI scale scores;
6. runs PCA with 5 factors;
7. runs `sklearn.decomposition.FactorAnalysis` with 5 factors;
8. builds first-pass SPI proxy axes for only SPI-plausible Kanonar axes;
9. computes Python-equivalent current `computeTraits`;
10. exports loadings, trait scores, trait correlation matrix, and report.

No changes were made to `lib/traits.ts`.

### `item_factor_loadings.csv`

Rows: 135. Columns: 16.

Meaning: item metadata plus PCA and FactorAnalysis loadings.

Columns:

- item metadata:
  `item_id`, `item`, `item_scale`, `resp_type`, `B5`, `L27`
- PCA loadings:
  `pca_factor_1`, `pca_factor_2`, `pca_factor_3`,
  `pca_factor_4`, `pca_factor_5`
- FactorAnalysis loadings:
  `fa_factor_1`, `fa_factor_2`, `fa_factor_3`,
  `fa_factor_4`, `fa_factor_5`

Top factor marker families observed in the report:

- factor 1: wellbeing / neuroticism direction;
- factor 2: impulsivity / sensation seeking / attention seeking;
- factor 3: agreeableness / compassion;
- factor 4: openness / creativity / introspection;
- factor 5: irritability / perfectionism / trust mix.

### `kanonar_trait_scores.csv`

Rows: 4,000. Columns: 74.

Meaning: row-level derived scores for each SPI respondent.

Column groups:

- 8 Kanonar derived trait scores:
  `care`, `harshness`, `agency`, `submission`, `trust`, `paranoia`,
  `stability`, `novelty_seeking`
- 8 direct SPI proxy trait scores:
  `spi_proxy_care`, `spi_proxy_harshness`, `spi_proxy_agency`,
  `spi_proxy_submission`, `spi_proxy_trust`, `spi_proxy_paranoia`,
  `spi_proxy_stability`, `spi_proxy_novelty_seeking`
- 16 proxy axes used by Python-equivalent `computeTraits`:
  `proxy_axis_A_Safety_Care`, `proxy_axis_C_dominance_empathy`,
  `proxy_axis_C_reciprocity_index`, `proxy_axis_C_betrayal_cost`,
  `proxy_axis_A_Power_Sovereignty`, `proxy_axis_G_Narrative_agency`,
  `proxy_axis_A_Liberty_Autonomy`, `proxy_axis_A_Legitimacy_Procedure`,
  `proxy_axis_C_coalition_loyalty`, `proxy_axis_A_Transparency_Secrecy`,
  `proxy_axis_C_reputation_sensitivity`, `proxy_axis_B_cooldown_discipline`,
  `proxy_axis_A_Tradition_Continuity`, `proxy_axis_B_goal_coherence`,
  `proxy_axis_B_exploration_rate`, `proxy_axis_F_Plasticity`
- 32 `spi_scale_*` columns;
- 5 `pca_factor_*` score columns;
- 5 `fa_factor_*` score columns.

### `trait_correlation_matrix.csv`

Rows: 8. Columns: 8 trait columns plus CSV index column.

Meaning: correlation matrix among the eight Kanonar derived trait scores.

Sticky threshold:

```text
abs(r) >= 0.8
```

Observed sticky pairs:

| Pair | r |
| --- | ---: |
| `care` vs `trust` | +0.893 |
| `care` vs `harshness` | -0.892 |
| `harshness` vs `paranoia` | +0.851 |
| `trust` vs `paranoia` | -0.801 |

Interpretation:

- `care`, `trust`, and inverse `harshness` are too close in this SPI proxy
  space.
- `paranoia` behaves more like nonclinical defensive suspicion mixed with low
  trust and irritability.
- These results support the registry warning that several derived traits need
  splitting before they are treated as independent dimensions.

### `trait_validation_report.md`

Meaning: human-readable validation report.

It contains:

- source and local input summary;
- data dimensions;
- PCA and FactorAnalysis method;
- top item markers for each factor;
- derived trait correlations with SPI scales/factors;
- trait-to-trait sticky pair summary;
- dirty trait flags;
- methodological limitations.

Important current conclusions:

- `submission` is dirty:
  proceduralism, coalitional loyalty, low-autonomy submission and authority
  deference should be split.
- `harshness` is dirty:
  low-care, punitive, power and defensive harshness should be split.
- `paranoia` must be renamed or reframed as nonclinical
  `defensive_suspicion`.
- `stability` is dirty:
  goal, affective, cooldown and identity stability should be split.
- SPI does not validate world-internal axes such as
  `A_Causality_Sanctity`, `E_KB_topos`,
  `E_Skill_causal_surgery`, or `E_Skill_repair_topology`.

## Axis validation registry

Registry:

```text
docs/axis_validation_registry.yaml
```

Purpose:

- separates base `vector_base` axes from derived `TRAITS`;
- assigns every A-G axis a validation status;
- records expected effects and negative controls;
- prevents treating world-internal Kanonar axes as ordinary psychological
  scales;
- marks dirty derived traits that need split/rename work.

Coverage verified:

```text
schema A-G axes from data/character-schema.ts = 52
registry base axes = 52
runtime traits from lib/traits.ts = 8
registry derived traits = 8
missing axes = none
missing traits = none
```

Validation statuses:

- `external_validatable` - close real construct exists.
- `proxy_validatable` - no exact scale, but behavior/data proxy can test it.
- `world_internal` - validate only inside Kanonar simulation/world tasks.
- `derived` - computed label, not a base axis.

## How the two dataset blocks differ

CaSiNo and SPI answer different questions.

CaSiNo:

- is behavioral dialogue data;
- tests action classification, negotiation dynamics, regime transitions and
  behavior-profile clustering;
- can support predictive validity experiments for negotiation-like behavior;
- cannot validate stable personality structure by itself.

SPI:

- is item-response personality data;
- tests whether derived traits resemble known factor/scale structure;
- can reveal trait collapse and dirty derived labels;
- cannot test scene behavior, memory updates or world-internal mechanics.

The two layers are complementary:

```text
SPI asks:
  Do the derived trait labels collapse into one psychometric blob?

CaSiNo asks:
  Do behavior-like signals improve prediction or interpretation of negotiation
  actions and local regimes?
```

## Current validation status

| Area | Status | What passed | What remains |
| --- | --- | --- | --- |
| CaSiNo raw export | available | 14,297 utterances, 1,030 dialogues, 846 speakers | regenerate locally when needed |
| CaSiNo v1 | available | events/trajectories/features/report/validator | v1 action labels are coarse |
| CaSiNo v2 | available | split actions, windows, offer dynamics, validator | thresholds still heuristic |
| Manual validation | template ready | 384 stratified rows | needs human labels |
| Transition matrix | available | probabilities normalize by current window | needs external behavioral interpretation |
| Allocation progress | available | observed allocation rows extracted | weak correlation with rule utility |
| Actor profiles | available | 2,060 actor-episode rows | needs representative dialogue review |
| Profile clusters | available | k=4, high bootstrap ARI | cluster names are first-pass labels |
| SPI raw export | available | 4,000 rows, 135 items, 32 scales | source package version should be pinned |
| SPI Trait Validation v1 | available | target CSV/MD artifacts generated | proxy mapping is preliminary |
| Axis registry | available | covers 52 axes and 8 traits | needs citations and scenario tests |

## What was not done yet

- No runtime semantics in `lib/traits.ts` were changed.
- No TypeScript runtime checks were necessary for the SPI runner because the
  app runtime was not changed.
- No human validation has been completed for CaSiNo labels.
- No diagnostic scenario battery has been implemented yet.
- No perturbation tests have been implemented yet for A-G axes.
- No held-out baseline comparison has been run for trait model vs context-only
  behavior prediction.
- No external validation was performed for world-internal axes.

## Assumptions and limitations

Kanonar is a research/prototype simulation system. Variables such as trust,
fear, stress, resentment, affiliation need, or control need are internal
simulation scalars. They are not clinical, psychometric, or experimentally
calibrated measurements.

The system is useful for deterministic simulation, explainable decision
pipelines, sensitivity analysis, comparing rule systems, and prototyping agent
dynamics.

The system must not be presented as a validated psychological, diagnostic, or
real-world behavioral prediction model without external validation.

Additional dataset-specific limits:

- CaSiNo-derived T/C/U values are rule-based Kanonar simulation scalars, not
  original CaSiNo annotations.
- CaSiNo strategy annotations are sparse and not present for every utterance.
- CaSiNo allocation geometry is only available on rows with submitted
  allocation maps.
- SPI factor and trait outputs are first-pass engineering proxies.
- SPI cannot validate Kanonar-only world mechanics.
- Dirty derived traits must be split before they are used as independent
  stable dimensions.

## Repro commands

CaSiNo raw export:

```powershell
python scripts\download_casino.py
```

Behavior Lab pipeline:

```powershell
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

SPI Trait Validation:

```powershell
python scripts\run_spi_trait_validation.py
```

Expected SPI runner output:

```text
SPI_TRAIT_VALIDATION_OK
rows=4000
item_response_columns=135
spi_scales=32
derived_traits=8
```
