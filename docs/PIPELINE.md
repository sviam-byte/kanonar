# Pipeline contracts (S0…S9)

Цель: фиксировать “что где рождается” и какие зависимости допустимы.

## Pipeline output envelope

- `GoalLabPipelineV1.step`: явный снимок шага (tick/seed/events), чтобы фиксировать время и входные события.

## Naming conventions (atoms)

- `ctx:<axis>:<agentId>` — объективная ось контекста (base)
- `ctx:final:<axis>:<agentId>` — субъективная ось после линзы персонажа
- `drv:*` — драйверы (ContextMind)
- `goal:*` — цели (до проекции)
- `util:*` — утилиты (единственный мост Goal → Action)
- `action:*` — действия/решение

## S0 — Canonicalization

Outputs:
- `world:*`, `obs:*`, `mem:*`, `rel:*`, `life:*`

Forbidden:
- любые `ctx:*`

## S1 — Normalize → Quarks

Outputs:
- quarks (внутренние индексы/представление)

Notes:
- как правило не добавляет новые атомы (зависит от реализации)

## S2 — Context Signals + Base Axes

Outputs:
- `ctx:*` (НО НЕ `ctx:final:*`)

Forbidden:
- `ctx:final:*`

## S3 — Character Lens

Inputs:
- `ctx:*` из S2 + traits/body из feat/mem/etc.

Outputs:
- `ctx:final:*`

Invariant:
- после S3 потребители должны читать `ctx:final:*`

## S4 — Emotions

Outputs:
- эмоции (как атомы/метрики)

## S5 — ToM

Outputs:
- dyads / priors / tom-политики (зависит от реализации)

Notes:
- стадия может быть отключена через `sceneControl.enableToM === false`
- при отключении стадия не добавляет атомы и пишет артефакт `tomEnabled: false`

## S6 — Drivers / ContextMind

Outputs:
- `drv:*`

## S7 — Goals + Planning

Inputs:
- `ctx:final:*`, `drv:*`, релевантные мемы/релэйшены

Outputs:
- `goal:*`
- `util:*` проекция (в конце S7)
- `goal:state:*` и `goal:active:*` должны переноситься между тиками (memory), т.к. GoalLab хранит состояние через атомы, а не через in-memory кэш.
- domain scores are smoothed with EMA (activation hysteresis) to reduce flicker.

Forbidden:
- goal derivation НЕ должна читать `ctx:*` без `:final:` (кроме явно документированного fallback)

## S8 — Decision / Actions

Inputs:
- `util:*`, action priors, access, possibilities

Outputs:
- `action:*`
  - canonical ranking/reporting remains `Q(a)=Σ_g E_g*Δg(a) − cost(a)` over ActionCandidate entries
  - optional sampling override path (`sceneControl.useLookaheadForChoice`) may use lookahead logits **only for stochastic choice**, without mutating reported/ranked canonical `Q`
- if no possibility rules fire, S8 must still receive a fallback cognitive option `cog:wait:<selfId>` to avoid hard deadlocks in action selection
- violent affordances (e.g., `off:attack:*`) are target-specific and gated by explicit threat + protocol; without threat or concrete target they must not be emitted
- decision hints are consumed from `util:hint:allow:*`; legacy `goal:hint:allow:*` may be accepted only as compatibility fallback

Forbidden:
- `action:*` НЕ должен зависеть от `goal:*` напрямую (только через `util:*`)

## S9 — Predict tick (linear lookahead)

Purpose:
- дополнительная объяснимая оценка для top-K действий из S8

Inputs:
- top-K действий из S8 (`id/kind/q`)
- feature-вектор `z` из атомов
- `sceneControl.enablePredict`, `sceneControl.lookaheadGamma`, `sceneControl.lookaheadRiskAversion`
- optional `goalEnergy` weights from S8 for subjective `V*(z, goalEnergy)`; empty/missing goalEnergy must fallback to legacy `V(z)`

Outputs:
- артефакт `transitionSnapshot`:
  - `z0` + provenance по каждой фиче
  - `perAction[]` с `qNow`, `qLookahead`, `delta`, `v1`
  - предупреждения по отсутствующим фичам

Determinism:
- шум в lookahead должен быть детерминирован по `seed/tick/actionId`
