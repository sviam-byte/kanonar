# Pipeline contracts (S0…S9)

Цель: фиксировать “что где рождается” и какие зависимости допустимы.

## Pipeline output envelope

- `GoalLabPipelineV1.step`: явный снимок шага (tick/seed/events), чтобы фиксировать время и входные события.
- `GoalLabPipelineV1.beliefPersist`: результат post-S9 персиста убеждений (`beliefAtoms`, `surpriseAtoms`, debug) для записи в `agent.memory.beliefAtoms` вызывающим слоем.

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
- `phys:threat:<self>:<other>` (physical threat differential)
- `social:rank:diff:<self>:<other>` (signed social standing differential)

Notes:
- стадия может быть отключена через `sceneControl.enableToM === false`
- при отключении стадия не добавляет атомы и пишет артефакт `tomEnabled: false`

## S6 — Drivers / ContextMind / Priorities

Outputs:
- `drv:*`
- `ctx:prio:*`

Notes:
- `ctx:prio:*` derives personal attention weights used by S7 goal ecology and contextual goal→action links.
- S6 также читает `belief:surprise:*` (если есть в persisted belief) и добавляет ограниченный буст к `drv:*` по конфигу `FC.drivers.surpriseFeedback`; вклад пишется в trace.parts.surpriseBoost.


### S6 additions (v27+)

- Driver formulas centralized in `lib/config/formulaConfig.ts` → `DRIVERS_FORMULA`.
- **Surprise feedback (POMDP loop):** S6 reads `belief:surprise:*` atoms from
  the previous tick (persisted via `beliefPersist`). High surprise on a feature
  amplifies the corresponding need via configurable routing table
  (`FC.drivers.surpriseFeedback.routing`). Maximum total boost is capped at
  `FC.drivers.surpriseFeedback.maxBoost` (default 0.25).
  
  This closes the POMDP feedback loop: S9 predicts features → beliefPersist
  saves predictions → next tick S0 loads them → S9 computes surprise →
  beliefPersist saves surprise → next tick S6 reads surprise → amplified needs.

Dependencies:
- `belief:surprise:*` atoms (ns: 'belief', persisted in beliefPersist output)
- `FC.drivers.surpriseFeedback` config section

### S6 additions (v29+ driver physics)

Driver derivation now uses a 5-step chain:
`raw linear -> curve shaping -> cross-inhibition -> temporal accumulation -> surprise boost -> clamp01`.

New knobs (all in `FC.drivers`):
- `curves`: per-driver `CurveSpec` (default linear identity; agent override: `agent.driverCurves`)
- `inhibition`: lateral suppression matrix (`threshold`, `maxSuppression`, `matrix`; agent override: `agent.inhibitionOverrides`)
- `accumulation`: EMA pressure memory (`alpha`, `blend`; agent override: `agent.driverInertia`)

Persistence link:
- `beliefPersist` now stores `belief:pressure:<driverKey>:<selfId>` atoms from current `drv:*` magnitudes.
- Next tick S6 reads these atoms to compute accumulation pressure before surprise boost.

Trace contract:
- each `drv:*` atom writes intermediate values in `trace.parts`:
  - `rawLinear`, `curveSpec`, `shaped`
  - `inhibition`, `postInhibition`
  - `accumulation`
  - `surpriseBoost`

## S7 — Goals + Planning

Inputs:
- `ctx:final:*`, `ctx:prio:*`, `drv:*`, релевантные мемы/релэйшены

Outputs:
- `goal:*`
- `util:*` проекция (в конце S7)
- `goal:state:*` и `goal:active:*` должны переноситься между тиками (memory), т.к. GoalLab хранит состояние через атомы, а не через in-memory кэш.
- domain scores are smoothed with EMA (activation hysteresis) to reduce flicker.

Forbidden:
- goal derivation НЕ должна читать `ctx:*` без `:final:` (кроме явно документированного fallback)


### S7 additions (v27+)

- **Per-agent GoalTuningConfig:** `agent.goalTuning` (type: `GoalTuningConfig`
  from `types.ts`) is now threaded into `deriveGoalAtoms`. If present:
  - `goalTuning.veto[domain]` → domain score forced to 0
  - `goalTuning.goals[domain].slope/bias` → logit-space modulation
  - `goalTuning.categories[cat].slope/bias` → category-level fallback
  - `goalTuning.global.slope/bias` → global fallback
  
  Applied AFTER energy refinement, BEFORE activation hysteresis.
  Default: no tuning applied (identity transform).

## S8 — Decision / Actions

Inputs:
- `util:*`, action priors, access, possibilities

Outputs:
- `action:*`
  - canonical ranking/reporting: `Q_raw(a)=Σ_g E_g*Δg(a) − cost(a)`, then confidence is applied as additive risk penalty `Q=Q_raw−k·|Q_raw|·(1−conf)`
  - optional sampling override path (`sceneControl.useLookaheadForChoice`) may use lookahead logits **only for stochastic choice**, without mutating reported/ranked canonical `Q`
  - when S9 lookahead is enabled, S8 may damp per-goal `goalEnergy[g]` before `decideAction` if top lookahead actions show consistently negative feasibility (`max_a ΔV_g(a) < -0.01`)
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
- action effects are context-modulated: `Δz_action = actionEffect(kind, z0)` to preserve scenario sensitivity
- optional observation envelope from S0 (`observationLite.visibleAgentIds`, `noiseSigma`) can inject deterministic extra uncertainty into social-affective features (`socialTrust`, `emotionValence`)

Outputs:
- артефакт `transitionSnapshot`:
  - `z0` + provenance по каждой фиче
  - `perAction[]` с `qNow`, `qLookahead`, `delta`, `v1`
  - `sensitivity` (at z1) for explainability
  - optional `sensitivityZ0` (at current z0) is computed only when explicitly enabled (`enableSensitivityZ0`)
  - `flipCandidates` use `sensitivityZ0` when available so UI answers “what to change now to flip decision”
  - risk penalty for lookahead value uses L1 uncertainty over feature deltas: `V_risk = clamp01(V* - riskAversion * 0.3 * Σ|Δz|)`
  - предупреждения по отсутствующим фичам

- post-stage persist payload (`pipeline.beliefPersist`) с атомами:
  - `belief:predicted:*` — прогноз фич после выбранного действия
  - `belief:chosen:*` — выбранное действие и его Q
  - `belief:feasibility:*` — feasibility по goal-доменам
  - `belief:surprise:*` — рассогласование прогноза прошлого тика и фактического `z0` текущего тика (добавляются в текущий кадр и persist-ятся в `beliefPersist.beliefAtoms` для следующего тика)

Determinism:
- шум в lookahead должен быть детерминирован по `seed/tick/actionId`
