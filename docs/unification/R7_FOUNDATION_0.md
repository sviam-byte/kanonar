# R7-FOUNDATION-0 — multi-agent foundation inventory + contract proposal

Статус: **PROPOSAL — awaiting author ADR sign-off.** Дата: 2026-07-13.
Основание: `docs/LAB_UNIFICATION_PLAN.md` §13 (R7 multi-agent foundation),
release gate R7 («N-participant contracts, observations и directed beliefs
работают»). Это подготовительный документ: он инвентаризует текущие
диадические посылки, предлагает аддитивные N-participant контракты и явно
выделяет решения, зарезервированные за автором. Кода он не меняет.

R7 scope по §13 — только *foundation*: N-participant contracts, individual
observations, sparse directed belief graph с границей `N·(N−1)`, отдельный
self-belief, role knowledge + multi-target action types, **сохранение dyadic
protocol execution**. Полноценный joint protocol для `N > 2`, coalition goals и
group payoff — отдельный будущий эпик и в R7 НЕ входят.

## 1. Ключевой вывод инвентаризации

Примитивные контракты уже направленные и per-observer — они генерализуются
почти без изменений. Диадическая жёсткость сосредоточена в трёх местах:
исполнимом ядре (его R7 сохраняет), в `ConflictDefinitionV2` (тип-литерал
`playerCount: 2` + валидатор «ровно 2 роли» + бинарный `target`), и в
отсутствии типизированного графа убеждений с self-узлом и границей `N·(N−1)`.

Практический эффект: реальный объём R7-foundation меньше, чем формулировка §13
на первый взгляд. Ниже — что уже готово и что требует аддитивного контракта.

### 1.1 Что уже N-способно (доказательства)

- **Observations — мульти-таргет, per-observer.**
  `SceneEventInputV1.targetIds: string[]` и `VisibilityRuleV1.mode` ∈
  `public | participants | observer_list | private` с `observerIds?/subjectIds?`
  (`lib/scene/observation/types.ts`). Individual observations = резолвер,
  прогнанный под каждый observerId; контракт этого уже не запрещает.
- **Belief edge — направленный.** `OpponentBeliefV1` несёт `observerId` +
  `targetId` и восемь `APPROVED_BELIEF_KEYS_V1`
  (`lib/tom/opponentBelief/types.ts`). Одно ребро = одна упорядоченная пара;
  множество рёбер и есть sparse directed граф.
- **S5-слой уже принимает список других.** `s5DualEmitLayer` берёт
  `selfId: string` + `otherIds: string[]` и итерирует по всем target'ам
  (`lib/tom/opponentBelief/s5DualEmitLayer.ts:27,49`). Диадической здесь только
  типичная поставка `otherIds.length === 1`, не сам контракт.

### 1.2 Что диадически заперто (доказательства)

- **`ConflictDefinitionV2`.** `playerCount: 2` — литеральный тип, не число;
  `roles`/`legalActions` валидатор требует «exactly two uniquely identified
  roles» (`lib/dilemma/definition/validation.ts:44`); action `target:
  'counterparty' | 'none'` (`lib/dilemma/definition/types.ts`) — бинарный, без
  адресации к конкретному участнику. То же в v1
  (`validateConflictDefinition`: `playerCount !== 2`).
- **Self-belief отсутствует.** Dual-emit явно пропускает self
  (`if (!targetId || targetId === args.selfId) continue`,
  `s5DualEmitLayer.ts:50`); отдельного self-узла в графе нет.
- **Нет типизированного объекта графа.** Хранилище — ad-hoc `tomStore[self][target]`;
  ни множества участников, ни enforced границы `N·(N−1)`, ни явной sparsity как
  контракта.
- **Исполнимое ядро диадично (сохраняется).** `worldForTick` берёт
  единственного другого `state.players.find((playerId) => playerId !== id)`
  (`lib/dilemma/integration/liveSession.ts`). Это kernel-execution
  `trust_exchange`; R7 его НЕ трогает.

## 2. Граница `N·(N−1)` (явно)

Sparse directed граф без self-петель имеет ровно `N·(N−1)` направленных рёбер:
для каждого из `N` наблюдателей — `N−1` целей. Проверка на малых `N`:

| N | N·(N−1) directed edges | +self (N) = full V1 store |
|---|---|---|
| 2 | 2 | 4 |
| 3 | 6 | 9 |
| 4 | 12 | 16 |
| 5 | 20 | 25 |

Дьяда (`N = 2`) даёт 2 направленных ребра — ровно то, что эмитит текущий
dual-emit при `otherIds.length === 1` для обоих участников. Это делает границу
проверяемым инвариантом обёртки-графа: `edges.length ≤ N·(N−1)`, self-узлы
считаются отдельно (см. §3.3, §4).

## 3. Предлагаемые аддитивные контракты (versioned, fail-closed)

Все контракты — новые модули рядом с существующими, не меняющие текущих
подписей; вводятся под новыми schema-версиями. Ни один не подключается к
runtime по умолчанию (paritygate как в R3/R5).

### 3.1 Participant set contract (`participant-set-v1`)
Явное упорядоченное множество участников сцены + роль-привязка, обобщающее
`ConflictDefinitionV2Role[]` с 2 до `N ≥ 2`. Additive: диадический инстанс —
частный случай `N = 2`, байт-идентичный текущему.

### 3.2 Individual observation views (`observation-view-v1`)
Тонкая обёртка: резолвер под каждого observerId → per-participant view.
Контракт наблюдений уже это позволяет (§1.1); нужен только типизированный
селектор + доказательство, что hidden-поля одного участника не протекают в
view другого (перенос hidden-field non-interference оракула на N).

### 3.3 Sparse directed belief graph (`belief-graph-v1`)
Типизированная обёртка над множеством `OpponentBeliefV1` рёбер:
- множество участников + карта рёбер `(observerId → targetId) → OpponentBeliefV1`;
- инвариант `directedEdges ≤ N·(N−1)`, отсутствие self-петель среди directed;
- **self-belief — отдельный узел** `selfBeliefs[observerId]` вне directed-множества
  (см. ADR-решение §5.1);
- fail-closed конструктор: дублирующее ребро, self-в-directed, неизвестный
  participant → отказ.

### 3.4 Role knowledge + multi-target actions (`conflict-definition-v3` **proposal**)
Обобщение `ConflictDefinitionV2`:
- `playerCount: number (≥2)` вместо литерала `2`;
- `target: 'counterparty'` → адресуемый target-режим (`self | role | participant
  | all_others | subset`), сохраняя `counterparty` как алиас для `N = 2`;
- role knowledge: что роль знает per-phase (уже есть `observation` enum на фазе).

**Kernel execution остаётся диадическим:** v3 описывает контракт, исполнимый
транзишн для `N > 2` — отдельный эпик (§0). Валидатор v3 fail-closed как v2.

## 4. Сохраняемые инварианты

- Диадический `trust_exchange` kernel и его транзишн-уравнения не меняются.
- Golden identity: no-profile семантический хеш `efa018b3…` не двигается; ни
  один R7-контракт не включён в runtime по умолчанию.
- Существующие v1/v2 definition-контракты и их валидаторы остаются; v3 —
  аддитивный, не заменяющий.
- self-belief считается отдельно от `N·(N−1)` directed-границы.

## 5. Решения, зарезервированные за автором (нужна подпись до кода)

1. **Self-belief representation.** Отдельный узел `selfBeliefs[id]` того же типа
   `OpponentBeliefV1` (observerId === targetId) — или отдельный тип
   `SelfModelV1`? Влияет на форму графа и S8-чтение.
2. **Multi-target action семантика.** Набор target-режимов (§3.4): минимальный
   (`self | participant | all_others`) или полный (`+ role | subset`)? Это
   ADR-уровень: определяет форму legal-action и проекции.
3. **Порядок реализации.** Contract-first (все типы+валидаторы+тесты как pure
   domain, затем wiring — паттерн R3/TOM-SPEC-0), что рекомендуется, или
   иной срез?
4. **Именование/версии.** `conflict-definition-v3` vs расширение v2 in-place под
   новым флагом.

## 6. Первый имплементационный срез (наименьшая карта)

Рекомендация (после подписи §5): **`belief-graph-v1` pure-domain** — самый
изолированный и полезный:
- типы графа + fail-closed конструктор + инвариант границы `N·(N−1)` + self-узел;
- построение из существующих `OpponentBeliefV1` рёбер, без изменения S5/runtime;
- тесты: конструктор, граница на `N = 2..5`, self-isolation, детерминизм,
  отказ на дубликат/self-петлю/неизвестного участника.

Gate этого среза: pure-domain типы+валидатор+тесты зелёные; `tsc` чист; golden
no-profile идентичность; ни одного изменения runtime-подписи. Далее —
`participant-set-v1`, затем `observation-view-v1`, затем `conflict-definition-v3`.

## 7. Пределы верификации

Документ инвентаризационный: доказательства — чтение контрактов по указанным
путям, не прогон. Утверждение «примитивы N-способны» проверено на уровне типов
(мульти-таргет наблюдения, направленное ребро, `otherIds: string[]`), но
end-to-end N-participant прогон намеренно вне scope до имплементационных карт.
Граница `N·(N−1)` доказана арифметически (§2), enforced-инвариант появится в
`belief-graph-v1`.
