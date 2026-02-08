# Pipeline contracts (S0…S8)

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
- Context domains are projected into goal axes with `contextScoring` knobs:
  - `noiseFloor` (default 0.20) to ignore weak signals.
  - `scale` (default 4.5) to map 0..1 domain intensity into logit space.
  - High danger (>~0.55) vetoes non-survival axes and boosts escape/control/preserve_order.

Forbidden:
- goal derivation НЕ должна читать `ctx:*` без `:final:` (кроме явно документированного fallback)

## S8 — Decision / Actions

Inputs:
- `util:*`, action priors, access, possibilities

Outputs:
- `action:*`
  - decisions scored as `Q(a)=Σ_g E_g*Δg(a) − cost(a)` over ActionCandidate entries
- violent affordances (e.g., `aff:attack:*`) are gated by aggression drive (danger/threat/affect) + protocol; proximity must still be present
- Feasibility gate: actions with confidence < `decisionMinConfidence` (default 0.15) are excluded (if all excluded, fallback to full list).
- Hysteresis: if `action.id` equals previous action, add `decisionMomentumBonus` (default 0.25) to Q to reduce jitter.

Forbidden:
- `action:*` НЕ должен зависеть от `goal:*` напрямую (только через `util:*`)
