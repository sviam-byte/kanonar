# ADR-0 — канонические границы лабораторий

Статус: ACCEPTED. Дата решения: 2026-07-11. Runtime и tests не изменялись.

## Context

MAP-0 подтвердил несколько живых контуров с пересекающимися названиями, но
разной ответственностью:

- GoalLab v2 вызывает staged pipeline S0–S9 и является активной UI-поверхностью
  (MAP-0 §1);
- Conflict Lab вызывает `runDilemmaV2`, а typed deterministic math core находится
  в `lib/dilemma/dynamics/*` (MAP-0 §3;
  `docs/CONFLICT_LAB_CONTRACT.md` §Canonical Core Direction);
- SimKit повторяет runtime по ticks и подключает GoalLab через plugins
  (MAP-0 §5);
- Relations Lab вычисляет и показывает отношения, но не выбирает действия
  (MAP-0 §6);
- embedded GoalLab labs сохраняют отдельный orchestrator contour и React-код в
  `lib/`; это живой transitional layer, а не новый канон (MAP-0 §2).

Без явного ownership один и тот же термин «решение», «сцена» или «ToM» может
получить двух владельцев. Этот ADR фиксирует границы. Он не проектирует новые
формулы, wire types или choice policy.

## Decision

### 1. GoalLab владеет cognition и utility

`lib/goal-lab/pipeline/runPipelineV1.ts` — canonical владелец staged cognition,
goal pressure, utility/Q artifacts и decision provenance. Канонические данные
берутся из `pipelineV1.stages[*]`, а не из UI projection
(`docs/unified/01_CONTROL_PLANE.md`; MAP-0 §1).

Это не означает, что GoalLab уже владеет финальным выбором Conflict Lab.
`runDilemmaV2` сохраняет текущую compatibility policy до отдельного
CONFLICT-CHOICE-ADR-0.

### 2. ConflictDefinition владеет правилами механики

Целевая `ConflictDefinition` отвечает:

- до выбора — за roles, phase, observation contract и legal actions;
- после выбора — за joint resolution, payoff, transition и termination.

Психология/utility GoalLab может ранжировать только действия, разрешённые
активной механикой. Она не подменяет phase, payoff или transition. Текущий
исполняемый canonical kernel ограничен `trust_exchange`; остальные протоколы не
получают статус canonical dynamics без typed kernel и независимых tests
(`docs/CONFLICT_LAB_CONTRACT.md`). Generalized type shape остаётся задачей
CONFLICT-DEFINITION-0.

### 3. SimKit владеет циклом исполнения, а не вторым GoalLab

`SimKitSimulator` и plugins владеют tick loop, применением действий, runtime
facts, persistence/replay trace и сравнением прогонов. Cognition внутри SimKit
поступает через явный GoalLab bridge; SimKit не создаёт альтернативный
канонический utility pipeline (MAP-0 §5; `docs/unified/03_SYSTEM_MAP.md`).

### 4. UI является projection layer

Страницы и React-компоненты отображают и редактируют валидные domain inputs и
readouts. UI не определяет формулы, legal actions, transition rules или
каноническую форму trace. Embedded React labs под `lib/goal-lab/labs/*` остаются
transitional layer violation до отдельной миграции (MAP-0 §2).

### 5. Scene resolver — общий целевой input boundary

Один общий scene-resolution contract должен разрешать cast, roles, relations,
placement, visibility и provenance до запуска cognition или mechanics. Сейчас
единого доказанного resolver/type нет: GoalLab, Conflict runner и SimKit имеют
разные input builders (MAP-0 §§1, 3, 5). Поэтому решение фиксирует ownership и
направление, но не объявляет существующий модуль каноническим.

Конкретные types и adapter boundaries принимаются только после
SCENE-INVENTORY-0 и OBSERVATION-CONTRACT-0.

### 6. Directed opponent belief отделён от Self-ToM

Модель `observer -> target` не смешивается с self-model. S5/ToM artifacts должны
сохранять target и provenance. Окончательный `OpponentBelief` shape не принят:
сначала выполняются TOM-INVENTORY-0 и TOM-SPEC-0. Текущие GoalLab ToM paths и
собственные traits/relations `runDilemmaV2` считаются semantic gap, а не двумя
равноправными канонами (MAP-0 §§1, 3).

### 7. Relations Lab остаётся view

`pages/RelationsLabPage.tsx` и её metric/cognition helpers являются
расчётно-визуальной поверхностью. Они не владеют action choice или state
transition (MAP-0 §6).

### 8. Legacy Dilemma runner — compatibility boundary

`lib/dilemma/runner.ts` / `runDilemmaV2` остаётся живым UI-facing
legacy/experimental runner. `lib/dilemma/dynamics/*` — canonical deterministic
math core для новых protocol kernels. Bridge между ними должен быть явным;
расхождение не разрешается молчаливым выбором одного результата
(`docs/CONFLICT_LAB_CONTRACT.md`; MAP-0 §3).

## Boundary classification

| boundary | status | owner / evidence |
| --- | --- | --- |
| GoalLab S0–S9 cognition, utility, provenance | canonical | `runPipelineV1.ts`; MAP-0 §1 |
| typed Conflict dynamics kernel | canonical | `lib/dilemma/dynamics/*`; contract; MAP-0 §3 |
| `runDilemmaV2` scenario behavior | compatibility | `lib/dilemma/runner.ts`; MAP-0 §3 |
| SimKit tick/replay/trace runtime | canonical runtime host | `lib/simkit/core/*`; MAP-0 §5 |
| GoalLab/SimKit bridge plugins | transitional adapter | `lib/simkit/plugins/*`; MAP-0 §5 |
| v2 pages and components | active projection | MAP-0 §1 |
| embedded React labs in `lib/` | transitional violation | MAP-0 §2 |
| Relations Lab | view | MAP-0 §6 |
| old GoalLab/Dilemma/Mafia routes | compatibility redirect | MAP-0 §9 |
| `lib/engine/tick.ts`, negotiation/simulate contour | legacy candidate, not live evidence | MAP-0 A-priori table |

## Alternatives considered

### UI as source of truth

Rejected. UI routes are active, but component state cannot enforce domain
invariants independently of tests and pure engines.

### `runDilemmaV2` as the only Conflict canon

Rejected. It is live and behaviorally useful, but the repository contract names
`lib/dilemma/dynamics/*` as the typed deterministic core and requires an explicit
bridge where semantics differ.

### GoalLab S8 immediately owns all conflict choice

Deferred. This would silently replace the existing replicator/argmax and
runner-specific policies. CONFLICT-CHOICE-ADR-0 must compare those policies and
their trace semantics first.

### Each lab keeps its own scene and ToM contracts

Rejected as target architecture. It preserves current duplication and prevents
observer-specific evidence from having one provenance contract. Existing inputs
remain compatibility adapters until the inventories define the shared boundary.

### Treat SimKit as an independent cognitive engine

Rejected. The live bridge already invokes GoalLab; duplicating utility semantics
would create two owners and break trace comparability.

## Consequences

Positive:

- new work has one owner for cognition, mechanics, tick execution and UI;
- current live contours can migrate incrementally through explicit adapters;
- open shape and choice questions remain visible instead of being encoded by
  an incidental implementation.

Costs and constraints:

- `runDilemmaV2` and embedded orchestrator labs remain supported compatibility
  surfaces until parity/migration evidence exists;
- scene and belief work requires inventories before new shared types;
- Conflict integration cannot proceed until CONFLICT-CHOICE-ADR-0 and
  CONFLICT-DEFINITION-0 close their separate decisions.

## Migration and compatibility impact

1. No runtime, persistence payload or public type changes in ADR-0.
2. R2a, CONFLICT-GAP-0, TOM-INVENTORY-0 and SCENE-INVENTORY-0 may now use this
   ownership table when classifying duplicates and gaps.
3. New shared wire payloads must be versioned; adapters preserve old snapshots
   until a decoder or explicit incompatibility report exists.
4. Legacy removal requires migration/parity evidence. Reachability alone is not
   deletion authority.

## Invalidated assumptions

- An active UI route is not automatically a canonical domain owner.
- Dilemma and canonical dynamics are not interchangeable merely because one
  calls the other through a bridge.
- SimKit is not a second GoalLab.
- Relations Lab is not a decision runtime.
- A shared scene resolver and finalized OpponentBelief type do not yet exist.

## Explicitly open decisions

- conflict choice owner/policy — CONFLICT-CHOICE-ADR-0;
- final `OpponentBelief` wire shape — TOM-SPEC-0;
- generalized `ConflictDefinition` schema — CONFLICT-DEFINITION-0;
- exact scene and observation types — SCENE-INVENTORY-0 then
  OBSERVATION-CONTRACT-0;
- migration/removal list — only after adapter parity evidence.

## Acceptance evidence

- Each accepted boundary above cites MAP-0 and/or an existing canonical doc.
- Alternatives, consequences, compatibility and invalidated assumptions are
  explicit.
- Open decisions are named and were not resolved here.
- `git diff` confirms no runtime implementation or existing test logic was
  changed by ADR-0.

