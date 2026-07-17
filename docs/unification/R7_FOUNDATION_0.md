# R7-FOUNDATION-0 — multi-agent foundation inventory + contract proposal

Статус: **IMPLEMENTED — ADR §5.1–§5.4 decided, все срезы 1–4 реализованы.** Дата: 2026-07-13.
Update 2026-07-13: author decided §5.1 (self-belief = separate node reusing
`OpponentBeliefV1`, observerId===targetId, outside the directed bound). The
`belief-graph-v1` slice is implemented pure-domain
(`lib/tom/opponentBelief/beliefGraph.ts`, `tests/tom/belief_graph_v1.test.ts`).
§5.2/§5.3/§5.4 (multi-target semantics, ordering beyond this slice, naming)
still await sign-off.
Update 2026-07-17: `participant-set-v1` (§3.1) и `observation-view-v1` (§3.2)
реализованы pure-domain (см. §6.2/§6.3). Они не зависят от §5.2/§5.4 — те
решения ограничивают только `conflict-definition-v3` — и следуют тому же
contract-first паттерну, что и уже принятый belief-graph-v1 (рекомендация
§5.3; формальная подпись §5.3 по-прежнему открыта). `conflict-definition-v3`
остаётся заблокирован до подписи §5.2/§5.4.
Update 2026-07-17 (2): автор подписал §5.2 (МИНИМАЛЬНЫЙ target-набор), §5.3
(contract-first) и §5.4 (отдельный модуль v3 + lift). `conflict-definition-v3`
реализован pure-domain (см. §6.4) — R7-foundation закрыт на уровне контрактов.
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

### 3.1 Participant set contract (`participant-set-v1`) — ✅ IMPLEMENTED 2026-07-17
Явное упорядоченное множество участников сцены + роль-привязка, обобщающее
`ConflictDefinitionV2Role[]` с 2 до `N ≥ 2`. Additive: диадический инстанс —
частный случай `N = 2`, байт-идентичный текущему. Реализация — §6.2.

### 3.2 Individual observation views (`observation-view-v1`) — ✅ IMPLEMENTED 2026-07-17
Тонкая обёртка: резолвер под каждого observerId → per-participant view.
Контракт наблюдений уже это позволяет (§1.1); нужен только типизированный
селектор + доказательство, что hidden-поля одного участника не протекают в
view другого (перенос hidden-field non-interference оракула на N).
Реализация — §6.3.

### 3.3 Sparse directed belief graph (`belief-graph-v1`)
Типизированная обёртка над множеством `OpponentBeliefV1` рёбер:
- множество участников + карта рёбер `(observerId → targetId) → OpponentBeliefV1`;
- инвариант `directedEdges ≤ N·(N−1)`, отсутствие self-петель среди directed;
- **self-belief — отдельный узел** `selfBeliefs[observerId]` вне directed-множества
  (см. ADR-решение §5.1);
- fail-closed конструктор: дублирующее ребро, self-в-directed, неизвестный
  participant → отказ.

### 3.4 Role knowledge + multi-target actions (`conflict-definition-v3`) — ✅ IMPLEMENTED 2026-07-17
Обобщение `ConflictDefinitionV2`:
- `playerCount: number (≥2)` вместо литерала `2`;
- `target: 'counterparty'` → адресуемый target-режим (`self | role | participant
  | all_others | subset`), сохраняя `counterparty` как алиас для `N = 2`;
- role knowledge: что роль знает per-phase (уже есть `observation` enum на фазе).

**Kernel execution остаётся диадическим:** v3 описывает контракт, исполнимый
транзишн для `N > 2` — отдельный эпик (§0). Валидатор v3 fail-closed как v2.

Реализация — §6.4. Отгружен МИНИМАЛЬНЫЙ target-набор по решению §5.2 (без
`role`/`subset` — они отложены в аддитивный v3.1).

## 4. Сохраняемые инварианты

- Диадический `trust_exchange` kernel и его транзишн-уравнения не меняются.
- Golden identity: no-profile семантический хеш `efa018b3…` не двигается; ни
  один R7-контракт не включён в runtime по умолчанию.
- Существующие v1/v2 definition-контракты и их валидаторы остаются; v3 —
  аддитивный, не заменяющий.
- self-belief считается отдельно от `N·(N−1)` directed-границы.

## 5. Решения, зарезервированные за автором (нужна подпись до кода)

1. **Self-belief representation.** ✅ DECIDED 2026-07-13: отдельный узел
   `selfBeliefs[id]` того же типа `OpponentBeliefV1` (observerId === targetId),
   вне directed-границы `N·(N−1)`. Переиспользует валидированный тип; минимум
   новой поверхности. Реализовано в `belief-graph-v1`.
2. **Multi-target action семантика.** ✅ DECIDED 2026-07-17: минимальный набор
   `none | self | counterparty | participant | all_others`; `counterparty` —
   валидируемый алиас, легален только при `playerCount === 2`; `participant`
   несёт явный `participantId` (playerId известной роли, не role id);
   `role`/`subset` — будущий аддитивный v3.1.
3. **Порядок реализации.** ✅ DECIDED 2026-07-17: contract-first pure domain
   (типы + fail-closed валидатор + тесты; без runtime/UI wiring; kernel
   остаётся диадическим) — паттерн, уже принятый для срезов 1–3.
4. **Именование/версии.** ✅ DECIDED 2026-07-17: отдельный модуль
   `conflict-definition-v3`; v2 заморожен (его пин-тест не тронут);
   `liftConflictDefinitionV2ToV3` доказывает, что v2 — частный случай
   `N = 2`/counterparty (тот же bridge-паттерн, что
   `participantSetFromConflictRolesV1`).

## 6. Имплементационные срезы

### 6.1 `belief-graph-v1` — ✅ IMPLEMENTED 2026-07-13 (pure-domain)
- `lib/tom/opponentBelief/beliefGraph.ts`: `BeliefGraphV1` тип, fail-closed
  `buildBeliefGraphV1`, `maxDirectedEdgesV1(n) = n·(n−1)`, self-узлы отдельно;
- построение из существующих `OpponentBeliefV1` рёбер, без изменения S5/runtime;
- `tests/tom/belief_graph_v1.test.ts` (8): дьяда, граница `N = 2..5`,
  self-isolation, детерминизм по порядку входа, fail-closed на пустой/дублирующий
  participant, неизвестного участника и дубликат ребра.

Gate достигнут: `tsc` чист; полный набор зелёный; golden no-profile хеш
`efa018b3…` не сдвинут (модуль никем в runtime не импортируется).

### 6.2 `participant-set-v1` — ✅ IMPLEMENTED 2026-07-17 (pure-domain)
- `lib/dilemma/definition/participantSet.ts`: `ParticipantSetV1` (упорядоченный,
  порядок автора сохраняется дословно, не сортируется), fail-closed
  `buildParticipantSetV1` (`N ≥ 2`, уникальные participant- и role-id, непустые
  id), `participantIdsV1` (форма, которую ест `buildBeliefGraphV1`) и
  диадический мост `participantSetFromConflictRolesV1`
  (`ConflictDefinitionV2Role[]` → частный случай `N = 2`, чистая пере-разметка
  `playerId → participantId`, `id → roleId`);
- `tests/dilemma/participant_set_v1.test.ts` (7): мост v2-ролей ≡ прямое
  построение, `N = 3..5`, порядок verbatim, fail-closed на `< 2`, пустые id,
  дубликаты participant/role, композиция `participantIdsV1 →
  buildBeliefGraphV1` (fully connected `N = 3` упирается в `maxDirectedEdgesV1`).

### 6.3 `observation-view-v1` — ✅ IMPLEMENTED 2026-07-17 (pure-domain)
- `lib/scene/observation/observationView.ts`: `ObservationViewV1`, fail-closed
  `selectObservationViewV1` (per-observer срез уже разрешённой
  `ObservationResolutionV1`; отказ на невалидную/чужую resolution, неизвестного
  observer'а и «foreign envelope» — конверт чужого наблюдателя в слоте) и
  `selectAllObservationViewsV1` (все views, сортировка по observerId,
  all-or-nothing);
- `tests/scene/observation_view_v1.test.ts` (9): точный срез слота, все views,
  fail-closed ×3, и **N=3 non-interference оракул** — мутация hidden-поля вне
  allowlist не меняет ни один view; мутация alice-only канала (event),
  carol-only knowledge и carol-only relation меняет view только адресата,
  остальные byte-for-byte равны baseline (`.not.toEqual` на адресате — оракул
  «с зубами»).

Gate 2026-07-17: `tsc --noEmit` чист; полный набор 520 passed / 10 skipped / 0
failed; golden-тест зелёный, no-profile хеш `efa018b3…` не сдвинут (оба модуля
никем в runtime не импортируются).

### 6.4 `conflict-definition-v3` — ✅ IMPLEMENTED 2026-07-17 (pure-domain)
- `lib/dilemma/definition/conflictDefinitionV3.ts`: `ConflictDefinitionV3`
  (`playerCount: number`, обязан равняться `roles.length`; `N ≥ 2` — через
  мост participant-set), discriminated target union §5.2 (минимальный набор),
  fail-closed `validateConflictDefinitionV3` (14-кодовый error union,
  collect-all) и `liftConflictDefinitionV2ToV3` (чистая пере-разметка +
  ре-валидация результата — теорема «lift валидного v2 = валидный v3»);
- ключевые решения: `protocolId` и action `id` — plain `string`, расцеплены от
  kernel-литералов `ConflictProtocolId`/`ConflictActionId` (иначе `N = 3` игра
  нетипизируема; lift type-sound — литералы расширяются); уникальность action
  id НЕ требуется — канонический v2-инстанс дублирует id между ролями,
  уникальность на тройке `(phaseId, actorRoleId, id)`; роли валидируются через
  `participantSetFromConflictRolesV1` (ошибки фолдятся в `invalid_roles` +
  `causeCode`), поэтому v3 **строже v2**: дубликаты `playerId` отвергаются
  (пин-тест фиксирует оба поведения); `participant`-target адресует `playerId`;
  `phase.observation`/`role_limited` остаётся декларативным до v3.1;
- `tests/dilemma/conflict_definition_v3.test.ts` (15): lift канонического
  trust_exchange с пополевой эквивалентностью, оба v2-target вида, `N = 3..5`,
  counterparty при `N = 2` напрямую / отказ при `N > 2`, participant=playerId
  («зубы»: role id отвергается), неизвестный target, mismatch в обе стороны,
  `N < 2`, дубликаты/пустые id через мост, malformed phases/actions,
  collect-all, строгость v3 над v2.

Gate 2026-07-17 (2): `tsc --noEmit` чист; полный набор 535 passed / 10 skipped
/ 0 failed; golden-тест зелёный, no-profile хеш `efa018b3…` не сдвинут (модуль
никем в runtime не импортируется). R7-foundation закрыт на уровне контрактов;
исполнимый N-транзишн, joint protocol `N > 2`, coalition goals — отдельный
будущий эпик (§0).

## 7. Пределы верификации

Документ инвентаризационный: доказательства — чтение контрактов по указанным
путям, не прогон. Утверждение «примитивы N-способны» проверено на уровне типов
(мульти-таргет наблюдения, направленное ребро, `otherIds: string[]`), но
end-to-end N-participant прогон намеренно вне scope до имплементационных карт.
Граница `N·(N−1)` доказана арифметически (§2), enforced-инвариант появится в
`belief-graph-v1`.

Update 2026-07-17: для слоя наблюдений утверждение §1.1 теперь подтверждено
исполнением, не только типами — `resolveObservationsV1` реально прогнан на
`N = 3` сцене в `tests/scene/observation_view_v1.test.ts`, включая
non-interference оракул. End-to-end N-participant прогон *всего пайплайна*
(kernel + S5 + выбор) по-прежнему вне scope — kernel диадичен по §0/§4.
