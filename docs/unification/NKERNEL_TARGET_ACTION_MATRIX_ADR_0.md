# NKERNEL-TARGET-ACTION-MATRIX-ADR-0 — target-aware выбор при N > 2

Статус: **ACCEPTED**. Дата решения: 2026-07-19. Автор утвердил directed matrix,
независимые per-target S8/RNG frames, честный directed outcome/history и
сохранение player-level mean-utility profiles. Types/validator и pure matrix
step slices реализованы; N > 2 decision/live остаются fail-closed до session
slice.

Входные артефакты:

- `docs/unification/NKERNEL_FOUNDATION_0.md` §3.5, §5.5 и §6;
- `docs/unification/CONFLICT_CHOICE_ADR_0.md`;
- `docs/CONFLICT_LAB_CONTRACT.md`;
- `lib/dilemma/nkernel/types.ts`;
- `lib/dilemma/nkernel/nstep.ts`;
- `lib/dilemma/nkernel/ndefinitionbind.ts`;
- `lib/dilemma/integration/candidateBridge.ts`;
- `lib/dilemma/integration/ndecisionProvider.ts`.

## Context

Текущие контракты умеют представить N участников, отдельные observation views,
направленные beliefs и `all_others`-проекцию в несколько `targetIds`. Однако
choice/transition seam остаётся однотаргетным:

- `Possibility.targetId` и `ActionCandidate.targetId` содержат одну цель;
- `buildConflictPossibilities` читает `row.targetIds[0]`;
- `decideAction` возвращает одного победителя из одного пула;
- `ConflictNStepInputV1.forcedJointActions` и `ConflictOutcome.actions` хранят
  одно действие на участника;
- `ConflictHistoryEvent.actions` повторяет ту же форму.

Поэтому снятие `n_decision_requires_dyad` без нового контракта либо потеряет
цели, либо ложно объявит одно действие участника применённым ко всем его
контрагентам. Текущий fail-closed guard корректен и сохраняется до завершения
всех срезов этого ADR.

## Decision

### 1. Канонический выбор — направленная матрица

Для canonical pairwise `trust_exchange` вводится versioned контракт
`conflict-directed-action-matrix-v1`:

```text
actorId -> targetId -> actionId
```

Матрица содержит ровно `N * (N - 1)` ячеек: для каждого участника — действие
относительно каждого другого участника. Self-ячейки, пропуски и дополнительные
actors/targets запрещены. Action vocabulary и порядок участников связываются с
точным canonical `trust_exchange` protocol/definition.

Wire/result форма остаётся обычным JSON-compatible nested `Record`. Валидатор
не доверяет порядку ключей: он проходит canonical participant order, проверяет
полноту/отсутствие лишних ключей и возвращает заново собранную независимую
копию. Безопасность ключей наследуется от `participant-set-v1`.

`none`, `self`, coalition/subset и group-target actions не кодируются пустыми
или специальными matrix cells. Они остаются вне этого ADR. Первый контракт
обслуживает только направленные counterparty-действия canonical pairwise
`trust_exchange`.

### 2. Один независимый S8 choice frame на `(actor, target)`

`all_others`-строка не попадает в один расширенный пул. Она fan-out-ится по
canonical target order, после чего GoalLab S8 запускается отдельно для каждой
направленной пары с тремя кандидатами `trust | withhold | betray`, каждый из
которых адресован одному и тому же target этой frame.

Baseline pipeline input участника может быть переиспользован как immutable
input, но каждый target-frame получает собственный S8 run и собственный
именованный RNG channel. Один общий mutable RNG на все targets запрещён:
потребление случайных чисел в `A -> C` не должно сдвигать выбор `A -> B`.

При `N = 2` sole-target adapter передаёт существующие per-player pipeline input,
RNG function и `rngChannelId` без переименования. Это обязательное условие
byte-tight reduction oracle.

### 3. Исполнение — две направленные ячейки на неупорядоченную пару

Для каждой пары `{i, j}` реальный dyadic kernel вызывается с:

```text
i action = matrix[i][j]
j action = matrix[j][i]
```

Порядок пар, payoff sum, mean `agentDeltas`, directed relation/memory/regime
слоты, trace frames и tag aggregation остаются ровно такими, как в
`resolveConflictNStepV1`. Формулы `trust_exchange` не меняются и не
реализуются повторно.

Существующий `conflict-nstep-v1` не меняет семантику: он по-прежнему означает
одно действие участника, broadcast во все его пары. Matrix execution получает
новую schema/version и отдельный public entrypoint.

### 4. Outcome и history получают честную N-форму

`ConflictOutcome.actions` и `ConflictHistoryEvent.actions` нельзя заполнять
«первой целью», агрегированным действием или другим surrogate: при разных
действиях `A -> B` и `A -> C` единого `actions[A]` не существует.

Matrix step возвращает новый directed outcome/history contract. Pairwise
provenance продолжает хранить настоящие dyadic `ConflictOutcome` каждой пары.
Общий transition application разделяется на:

1. применение уже вычисленных agent/relation/environment deltas, memories,
   regimes, profiles и frames;
2. append переданного валидного history event.

Существующий `applyConflictTransition` становится неизменным по публичному
поведению wrapper-ом над этим pure core. Matrix entrypoint вызывает тот же core
с directed history event. Surrogate `ConflictOutcome.actions`, post-hoc
переписывание ложного history event и второй transition engine запрещены.

При `N = 2` matrix adapter создаёт legacy `ConflictHistoryEvent`, а не новую
обёртку. Поэтому next state и history остаются структурно равны dyadic kernel
output. При `N > 2` state contract явно допускает versioned directed history
event; decoder/replay обязан различать варианты по schema/version.

### 5. Strategy profile остаётся player-level

Strategy profile не становится матрицей в этом ADR. Это агрегированная
player-level learning/reference величина. Режим `learn_from_utility` продолжает
использовать уже утверждённый component-wise mean utility по `N - 1` targets.

Canonical applied actions при этом берутся из directed matrix. Pair-local
kernel profiles не подменяют N-level profile и остаются частью pairwise
вычисления/provenance. Изменение profile storage на `(actor, target)` потребует
отдельного ADR и не нужно для target-aware GoalLab choice.

### 6. Reference lane также становится directed

Существующий `resolveConflictNChoiceStepV1` выбирает одно действие участника по
mean utility и остаётся экспериментальной global-action политикой. Он не
является семантически сопоставимым reference для target matrix.

Новый reference matrix строится независимо по каждой dyadic projection:
настоящий kernel `replicator + dominant action` возвращает две направленные
ячейки пары. При `N = 2` это тот же единственный reference step. При `N > 2`
parity сравнивает canonical и reference action отдельно для каждой
`(actorId, targetId)`.

### 7. Trace и replay

Каждая directed choice cell обязана сохранять:

```text
actorId + targetId + actionId
policyId + policyVersion
rngChannelId
protocolId + phaseId
utilityCandidateId
ranked candidates + sampling-pool membership
usedAtomIds + goal-energy sources
tick + historyLength
```

Matrix-level trace дополнительно содержит schemaVersion, canonical participant
order и точное число cells. Replay сравнивает semantic fields и не зависит от
object insertion order или wall-clock metadata.

## Target-aware pairwise choice

### Purpose

Дать каждому участнику отдельный объяснимый выбор относительно каждой видимой
цели, сохранив настоящий dyadic transition kernel и N=2 parity.

### Formula

```text
P = ordered participant set, |P| = N >= 2
D = {(i, j) in P x P | i != j}
M : D -> A
M[i,j] = S8(Q[i,j,*], rng[i,j])

for each unordered pair {i,j}:
  pairOutcome[i,j] = K(state|{i,j}, M[i,j], M[j,i])

payoff[i]    = sum_{j != i} pairPayoff[i,j]
agentDelta[i] = (1 / (N - 1)) * sum_{j != i} pairAgentDelta[i,j]
relationDelta[i,j] = pairRelationDelta[i,j]
```

### Variables

- `P` — валидированный ordered participant set; минимум 2, без повторов и
  unsafe IDs.
- `D` — все направленные пары без self-edge; размер ровно `N * (N - 1)`.
- `A` — canonical action vocabulary `trust | withhold | betray` в protocol
  order.
- `M[i,j]` — выбранное действие actor `i` относительно target `j`.
- `Q[i,j,*]` — GoalLab S8 ranking трёх target-bound candidates.
- `rng[i,j]` — независимый named seeded RNG channel directed frame.
- `K` — существующий dyadic `resolveProtocolStep`; формулы не меняются.

### Source of truth

- current dyadic transition: `lib/dilemma/dynamics/engine.ts`;
- current N pair fold: `lib/dilemma/nkernel/nstep.ts`;
- current target binding: `lib/dilemma/nkernel/ndefinitionbind.ts`;
- current GoalLab bridge: `lib/dilemma/integration/candidateBridge.ts`;
- current dyad-only guard: `lib/dilemma/integration/ndecisionProvider.ts`;
- current reduction tests: `tests/dilemma/nkernel_step_v1.test.ts`,
  `tests/dilemma/nkernel_decision_v1.test.ts`;
- matrix types/validator/N=2 adapter: `lib/dilemma/nkernel/ntargetmatrix.ts`;
- matrix contract/reduction tests:
  `tests/dilemma/nkernel_target_matrix_v1.test.ts`;
- shared transition application: `lib/dilemma/dynamics/engine.ts`
  (`applyConflictTransitionCoreV1`);
- shared N pair fold: `lib/dilemma/nkernel/npairfold.ts`;
- matrix step/outcome/history/replay: `lib/dilemma/nkernel/ntargetstep.ts`;
- matrix-step reduction/directed-history tests:
  `tests/dilemma/nkernel_target_matrix_step_v1.test.ts`;
- matrix provider/session остаются отдельными implementation slices.

### Invariants

- `|cells| = N * (N - 1)`; self, missing и extra cells fail closed.
- Один target frame не потребляет RNG и candidates другого target frame.
- Каждая pair transition использует ровно `M[i,j]` и `M[j,i]`.
- При `N = 2` matrix-to-dyad fold является fold-of-one и сохраняет legacy
  state/history bytes.
- Никакой UI или adapter не создаёт отсутствующую matrix cell fallback-ом.

### Minimal example

Input:

```text
participants = [A, B, C]
M[A] = { B: trust,    C: withhold }
M[B] = { A: betray,   C: trust }
M[C] = { A: withhold, B: betray }
```

Calculation:

```text
pair {A,B}: (trust, betray)
pair {A,C}: (withhold, withhold)
pair {B,C}: (trust, betray)
```

Output:

```text
3 pair outcomes
6 directed choice traces
1 folded N outcome with directedActions = M
1 directed N history event
```

### Failure modes

- Один общий S8 pool выбирает только `(action, target)`, а не действие для
  каждого target.
- Broadcast одного выбранного action теряет target-specific beliefs.
- Общий mutable RNG связывает независимые target frames порядком обхода.
- Surrogate `actions[playerId]` делает outcome/history ложными.
- Отсутствующая cell, target или RNG тихо получает default.
- Pair transition или payoff реализуется заново вне dyadic kernel.

## Alternatives considered

### Один action на actor, применяемый ко всем targets

Rejected как target-blind. Это текущая экспериментальная семантика
`conflict-nchoice-v1`, но она не позволяет `A` доверять `B` и удерживаться от
доверия к `C` в одном раунде.

### Один плоский pool `(action, target)`

Rejected. Один вызов S8 возвращает одного победителя, следовательно выбирает
одну цель и оставляет остальные directed pairs без действия.

### Сначала агрегировать Q по targets, затем broadcast action

Rejected. Mean utility полезен для player-level strategy profile, но уничтожает
target-specific choice и belief provenance.

### Сразу добавить coalition/subset actions и group payoff

Deferred. Coalition membership, subset targeting, group payoff и shared action
constraints требуют другого joint protocol, а не расширения pairwise
`trust_exchange`.

### Хранить pair-specific strategy profiles

Deferred. Это меняет learning state и persistence без необходимости для
первого target-aware GoalLab choice slice.

## Implementation order

1. **NKERNEL-TARGET-MATRIX-TYPES-0** — ✅ IMPLEMENTED 2026-07-19: additive
   matrix types, validator и N=2 matrix adapter; runtime wiring отсутствует.
2. **NKERNEL-TARGET-MATRIX-STEP-0** — ✅ IMPLEMENTED 2026-07-19: общий pure
   transition-application core, directed pair execution и history/replay;
   старые APIs неизменны.
3. **NKERNEL-TARGET-MATRIX-DECISION-0** — per-target projection fan-out,
   independent S8/RNG frames, cell traces и directed reference lane.
4. **NKERNEL-TARGET-MATRIX-SESSION-0** — N>2 live loop за parity gate; только
   после full targeted/full-suite verification первых трёх срезов.
5. **NKERNEL-TARGET-MATRIX-UI-0** — participant/target matrix visualization;
   UI не входит в предыдущие pure/runtime packages.

До завершения среза 4 `runConflictNJointDecisionV1` и
`runConflictNLabSessionV1` продолжают возвращать dyad-only typed errors при
`N > 2`.

## Required acceptance tests

### Matrix contract

- N=2 и N=3 canonical reconstruction в participant order.
- Reject: missing/extra actor, missing/extra target, self target, unknown action,
  unsafe participant ID, input mutation after validation.
- Exact `N * (N - 1)` cell count and independent output copy.

### Matrix step

- N=2 oracle: все 9 joint actions × `freeze | learn_from_utility`, затем
  5-round chain; state/history/outcome projection byte-equal dyadic kernel.
- N=3 pairwise oracle: каждая пара получает две правильные directed cells;
  payoff/delta folds совпадают с независимыми dyadic runs.
- N=3 history хранит directed matrix без surrogate player action.
- Determinism, input immutability и fail-closed pair errors.

### Decision provider

- N=2 oracle против `runConflictJointDecisionV1`, включая candidate/ranking,
  RNG, selected action, transition и trace.
- N=3 target differentiation: `A -> B` и `A -> C` могут выбрать разные actions
  из разных visible beliefs.
- Target non-interference: изменение только evidence/candidates/RNG `A -> C`
  не меняет ranking, RNG draw или choice `A -> B`.
- Missing target RNG, incomplete matrix, stale candidate, mismatched
  participant/protocol/definition — typed error до transition.
- Trace completeness для всех `N * (N - 1)` cells.

### Session and UI gate

- N>2 live остаётся fail-closed до matrix session slice.
- После wiring: round budgets `1..30`, replay determinism, per-round complete
  matrix/history и no-profile/legacy non-interference.
- UI не становится source of truth и не синтезирует matrix defaults.

## Consequences

Positive: target-specific beliefs действительно доходят до target-specific
choice; dyadic kernel и N=2 parity сохраняются; trace становится честным на
уровне каждой направленной пары.

Costs: canonical round требует `N * (N - 1)` S8 choice frames и независимых
RNG channels; outcome/history получают новую versioned форму; transition
application нужно аккуратно выделить из dyadic history wrapper без изменения
старого поведения.

## Decision record

Автор утвердил 2026-07-19 четыре связанных решения:

1. directed matrix `actor -> target -> action` как canonical N>2 choice;
2. независимый S8 + RNG frame на каждую направленную пару;
3. новый честный directed outcome/history contract без surrogate actions;
4. player-level mean-utility strategy profile сохраняется, pair-specific
   profiles и coalition/group payoff остаются deferred.

ADR добавлен в canonical unification index/roadmap. Реализация идёт строго по
срезам из раздела выше; принятие ADR само по себе не открывает N > 2 runtime.

## Assumptions and limitations

Kanonar is a research/prototype simulation system. Variables such as trust, fear,
stress, resentment, affiliation need, or control need are internal simulation
scalars. They are not clinical, psychometric, or experimentally calibrated
measurements.

The system is useful for deterministic simulation, explainable decision
pipelines, sensitivity analysis, comparing rule systems, and prototyping agent
dynamics.

The system must not be presented as a validated psychological, diagnostic, or
real-world behavioral prediction model without external validation.
