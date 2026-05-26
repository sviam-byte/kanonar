# 4) ToM dyad: модель `A о B`

**Источники истины:**

- implementation: `lib/tom/dyad-metrics.ts`
- config examples: `data/tom-dyad-configs.ts`
- stage wiring: `lib/goal-lab/pipeline/runPipelineV1.ts`
- context materialization: `lib/context/sources/tomDyadAtoms.ts`
- lens final-layer support: `lib/context/lens/characterLens.ts`

Этот документ описывает базовую dyad-модель Theory of Mind в Kanonar: как агент `A` вычисляет bounded social metrics по отношению к агенту `B`.

## 4.1. Модель и типы

Входы:

- `a.vector_base`
- `b.vector_base`
- `DyadConfigForA`
- опционально `DyadOverride`

Выходы:

- `liking ∈ [-1,1]`
- `trust ∈ [0,1]`
- `fear ∈ [0,1]`
- `respect ∈ [0,1]`
- `closeness ∈ [0,1]`
- `dominance ∈ [-1,1]`

Главный принцип:

ToM здесь — не probabilistic black box. Это прозрачная rule-based aggregation over axes with bounded nonlinearities.

## 4.2. Primitive metrics

## Axis similarity

### Purpose

Считать близость A и B по одной оси как базовый строительный блок для liking, trust и closeness.

### Formula

```text
simAxis(a, b) = 1 - |a - b|
```

### Variables

- `a ∈ [0,1]` — значение оси у A
- `b ∈ [0,1]` — значение оси у B

### Source of truth

- implementation: `lib/tom/dyad-metrics.ts`
- downstream: `weightedSim(...)`

### Invariants

- результат всегда в `[0,1]`
- отсутствие оси заменяется на `0.5`

### Minimal example

Input:

```text
a = 0.8
b = 0.3
```

Calculation:

```text
simAxis = 1 - |0.8 - 0.3| = 0.5
```

### Failure modes

- docs claim cosine similarity or correlation while runtime uses absolute-distance similarity

## Weighted similarity / partner level / dominance / threat

### Purpose

Сжать набор осей в один интерпретируемый агрегат для конкретного аспекта dyad-восприятия.

### Formula

```text
weightedSim(W, a, b)          = Σ w_i * simAxis(a_i, b_i) / Σ |w_i|
weightedPartnerLevel(W, b)    = Σ w_i * b_i / Σ |w_i|
weightedDom(W, a, b)          = Σ w_i * (b_i - a_i) / Σ |w_i|
weightedThreat(W, b)          = Σ w_i * b_i / Σ |w_i|
```

### Variables

- `W = { axis_i -> w_i }` — набор весов конфигурации восприятия A
- `a_i`, `b_i` — значения осей для A и B

### Source of truth

- implementation: `lib/tom/dyad-metrics.ts`
- config: `data/tom-dyad-configs.ts`

### Invariants

- если сумма `Σ |w_i| = 0`, агрегат возвращает `0`
- weights берутся из perception-config A, а не из B
- отсутствие оси у A или B трактуется как `0.5`

### Minimal example

Input:

```text
W = { fairness: 1.0, loyalty: 0.5 }
a = { fairness: 0.8, loyalty: 0.2 }
b = { fairness: 0.6, loyalty: 0.9 }
```

Calculation:

```text
sim_fairness = 1 - |0.8 - 0.6| = 0.8
sim_loyalty = 1 - |0.2 - 0.9| = 0.3
weightedSim = (1.0 * 0.8 + 0.5 * 0.3) / 1.5 = 0.6333
```

### Failure modes

- docs imply the weights are normalized elsewhere while runtime normalizes only by `Σ |w_i|`
- docs confuse `weightedPartnerLevel` with similarity

## 4.3. Bounding nonlinearities

ToM uses two output squashes:

```text
squash(x) = tanh(x)               -> [-1, 1]
g(x) = 0.5 * (tanh(x) + 1)       -> [0, 1]
```

Meaning:

- signed outputs use `tanh`
- probability-like bounded social outputs use `g`

## 4.4. Final dyad metrics

## Liking

### Purpose

Оценить симпатию как смесь сходства, комплементарности и анти-threat поправки.

### Formula

```text
like_sim = weightedSim(cfg.like_sim_axes, a, b)
like_opp = 1 - weightedSim(cfg.like_opposite_axes, a, b)

liking_raw =
  bias_liking +
  1.5 * like_sim +
  1.0 * like_opp -
  1.0 * fear_threat +
  override.liking_delta

liking = tanh(liking_raw)
```

### Variables

- `like_sim ∈ [0,1]` — сходство по приятным для A осям
- `like_opp ∈ [0,1]` — комплементарность по opposite-осям
- `fear_threat ∈ [0,1]` — perceived threat from B
- `bias_liking ∈ [-1,1]` — baseline affective predisposition

### Source of truth

- implementation: `lib/tom/dyad-metrics.ts`
- config example: `data/tom-dyad-configs.ts`
- trace/UI: materialized later as `tom:dyad:*` atoms

### Invariants

- output bounded in `[-1,1]`
- override добавляется в raw-space до `tanh`

### Minimal example

Input:

```text
like_sim = 0.7
like_opp = 0.4
fear_threat = 0.2
bias_liking = -0.1
```

Calculation:

```text
liking_raw = -0.1 + 1.5 * 0.7 + 1.0 * 0.4 - 1.0 * 0.2 = 1.15
liking = tanh(1.15) ≈ 0.818
```

### Failure modes

- docs call liking a probability even though it is signed

## Trust / fear / respect / closeness / dominance

### Purpose

Собрать остальные dyad-метрики как bounded nonlinear combinations of similarity, partner-level, threat and dominance primitives.

### Formula

```text
trust_raw =
  bias_trust +
  1.5 * trust_sim +
  1.0 * trust_partner -
  1.0 * fear_threat -
  0.5 * fear_dom +
  override.trust_delta
trust = g(trust_raw)

fear_raw =
  bias_fear +
  1.5 * fear_threat +
  1.0 * fear_dom +
  override.fear_delta
fear = g(fear_raw)

respect_raw =
  bias_respect +
  1.5 * respect_partner +
  0.3 * fear_threat +
  0.3 * fear_dom +
  override.respect_delta
respect = g(respect_raw)

closeness_raw =
  bias_closeness +
  1.5 * closeness_sim +
  0.5 * liking -
  1.0 * fear +
  override.closeness_delta
closeness = g(closeness_raw)

dominance_raw =
  bias_dominance +
  1.0 * dom -
  0.5 * fear_threat +
  override.dominance_delta
dominance = tanh(dominance_raw)
```

### Variables

- `trust_sim ∈ [0,1]` — сходство по trust-related axes
- `trust_partner ∈ [0,1]` — perceived reliability/quality of B
- `fear_dom ∈ [0,1]` — feared domination component
- `respect_partner ∈ [0,1]` — evaluated competence/standing of B
- `closeness_sim ∈ [0,1]` — similarity in bonding-relevant space
- `dom ∈ [-1,1]` — signed dominance differential

### Source of truth

- implementation: `lib/tom/dyad-metrics.ts`
- config: `data/tom-dyad-configs.ts`
- stage materialization: `lib/context/sources/tomDyadAtoms.ts`

### Invariants

- `trust`, `fear`, `respect`, `closeness` bounded in `[0,1]`
- `dominance` bounded in `[-1,1]`
- `fear_dom = max(0, weightedDom(...))`, so fear from dominance is one-sided
- `closeness` uses already computed `liking` and `fear`, not just raw primitives

### Minimal example

Input:

```text
trust_sim = 0.8
trust_partner = 0.7
fear_threat = 0.2
fear_dom = 0.1
bias_trust = -0.2
```

Calculation:

```text
trust_raw = -0.2 + 1.5 * 0.8 + 1.0 * 0.7 - 1.0 * 0.2 - 0.5 * 0.1 = 1.45
trust = 0.5 * (tanh(1.45) + 1) ≈ 0.948
```

### Failure modes

- docs imply the outputs are Bayesian posteriors; they are bounded score transforms
- docs omit the role of raw bias terms
- docs say closeness is independent, while runtime feeds it through `liking` and `fear`

## 4.5. Где ToM становится атомами

Числа из `computeDyadMetrics_A_about_B(...)` сами по себе ещё не являются atoms. Дальше они materialize в `tom:dyad:*` через context-source layer.

Canonical runtime surfaces:

- base ToM atoms: `lib/context/sources/tomDyadAtoms.ts`
- S5 wiring: `lib/goal-lab/pipeline/runPipelineV1.ts`
- subjective final-layer dyads: `lib/context/lens/characterLens.ts`

Типичные id:

```text
tom:dyad:<selfId>:<otherId>:trust
tom:dyad:<selfId>:<otherId>:threat
tom:dyad:final:<selfId>:<otherId>:trust
```

## 4.6. Tests and validation status

У этого dyad-ядра сейчас нет отдельного узкого unit-test файла уровня `tests/tom/dyad_metrics.test.ts`.

Поэтому test anchors нужно описывать честно:

- прямой source of truth — `lib/tom/dyad-metrics.ts`
- косвенная pipeline-проверка — `tests/pipeline/stage_isolation.test.ts`
- косвенная decision/use-site проверка — `tests/decision/action_hint_compat.test.ts`, `tests/decision/target_differentiation.test.ts`

Это означает, что ToM-док уже можно делать формульно и контрактно, но дальнейшая волна качества должна добавить прямые unit tests для самого dyad-core.
