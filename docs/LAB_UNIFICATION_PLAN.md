# План объединения лабораторий

Статус: proposal v4 / рабочая программа (обновлён по аудиту кода 2026-07-10).  
Дата: 2026-07-10.  
Назначение: один документ для архитектурного решения, технического планирования
и выдачи ограниченных задач моделям.

Документ разделён на три уровня:

1. **Концептуальный** — что строим и какие границы нельзя нарушать.
2. **Технический** — этапы миграции, зависимости, артефакты и release gates.
3. **Исполнительный** — готовые низкоуровневые ТЗ для моделей.

---

# Часть I. Концептуальный уровень

## 1. Целевое состояние

Kanonar должен использовать одну детерминированную систему персонажей,
наблюдений, beliefs, решений и переходов:

```text
Character Core + resolved scene + active ConflictDefinition/phase
  -> observations per observer + legal actions
  -> target-specific OpponentBelief
  -> GoalLab utility/decision seam
  -> joint-action resolution
  -> payoff + state transition
  -> persistence + trace + metrics + UI
```

Это не один монолитный runtime. Это набор чистых границ с одним владельцем
каждой семантики.

### Продуктовые симптомы, которые программа обязана снять

Программа считается успешной, только если исчезают конкретные наблюдаемые
боли, а не только «архитектура стала чище». Каждый симптом привязан к релизу:

| Симптом (как ощущается) | Чем снимается | Релиз |
| --- | --- | --- |
| Метрики на экране персонажа непонятны: неясно, зачем они и что происходит | каждая метрика получает source/status + человекочитаемое «зачем» | R2a → R2b |
| Персонажи ведут себя одинаково в Conflict Lab, если незнакомы с оппонентом | belief строится из видимого профиля (роль/статус/фракция/поведение) и доходит до utility/choice; sensitivity oracle | R3 → R5 |
| Непонятно, какие лабы живые и как связаны | доказательная карта surfaces → runtime → tests; canonical boundaries | R1 |
| Несколько визуально одинаковых сценариев с неясной механикой в Conflict Lab | preset inventory: mechanic / parameter variant / skin / duplicate; дубли скрываются | R6 |
| Нет конструктора конфликта | constructor v1 для dyad `trust_exchange` | R6 |
| Нельзя больше двух персонажей | N-participant contracts, individual observations, directed beliefs | R7 |
| Кооперация/коалиции | сознательно вынесено в следующий эпик после R7 | — |

## 2. Архитектурные роли

| Сущность | Единственная ответственность | Не должна делать |
| --- | --- | --- |
| Character Core | хранить устойчивый профиль и идентичность | хранить scene overrides или чужие beliefs |
| Scene draft | описывать намерение сцены: cast, roles, events, knowledge, seed | мутировать канонического персонажа |
| Scene resolver | разрешать персонажей, отношения, placement и visibility с provenance | выбирать действие |
| Observation resolver | строить отдельный наблюдаемый мир для каждого observer | раскрывать скрытые поля цели |
| OpponentBelief | хранить направленную модель `observer -> target` | подменять Self-ToM или true target state |
| GoalLab | вычислять cognition, goals, utility и decision trace | задавать правила фазы и transition |
| ConflictDefinition | до выбора задавать phase/observations/legal actions; после выбора — payoff/transition/termination | заводить отдельную психологию |
| SimKit | повторять runtime по ticks, применять действия и хранить simulation trace | создавать альтернативный GoalLab |
| UI | отображать и редактировать валидные данные | быть единственным местом domain validation |

## 3. Открытое архитектурное решение

Владелец финального выбора в Conflict Lab пока не утверждён:

- GoalLab S8 имеет Q-ranking и seeded choice;
- canonical Conflict kernel использует `replicator + argmax`;
- оба механизма имеют свою trace/test semantics.

До интеграции принимается отдельный ADR с одним вариантом:

1. GoalLab производит utility, conflict kernel сохраняет choice policy.
2. GoalLab S8 полностью владеет выбором.
3. Choice policy является явной версионированной настройкой.

Dual-run не заменяет это решение: он только показывает различия.

## 4. Неподвижные инварианты

### Детерминизм

- Одинаковые `state + params + active mechanic + seed` дают одинаковое следующее
  состояние и семантически одинаковый trace.
- Нет скрытого `Math.random()` в cognition, mechanics и transitions.
- Wall-clock metadata не участвует в выборе или semantic equality.

### Наблюдаемость и beliefs

- Изменение скрытого поля цели не меняет belief/decision, пока observer не
  получил новое evidence.
- Belief update принимает observation envelope, а не полный `WorldState` цели.
- Self-ToM хранится отдельно от `observer -> target` beliefs.
- Каждый belief update объясняет `before -> evidence -> after`.

### Pipeline

- После S3 consumers читают `ctx:final:*`.
- Единственный мост Goal -> Action: `goal:* -> util:* -> action:*`.
- S5/ToM artifacts сохраняют target и provenance.
- Новая decision boundary не обходит S0…S9 скрытым side channel.

### Versioning и persistence

- Новый wire payload получает `schemaVersion`.
- Общий runtime version берётся из `lib/goal-lab/versioning.ts`.
- Изменение persistence включает старый snapshot decoder или явный
  incompatibility report.
- Replay сравнивает semantic fields, а не wall-clock bytes.

### Conflict Lab

- Порядок: mathematical model -> domain types -> pure engine -> tests -> UI.
- `trust_exchange` уже существует как canonical pure kernel; его нельзя
  переписывать под видом миграции.
- Unsupported protocol не показывается как executable canonical dynamics.

### UI и метрики

- Неизвестное значение не заменяется нулём.
- Mock, broken и simulation-only metrics не выдаются за устойчивые свойства
  персонажа.
- UI labels не являются source of truth для формулы.

### Миграция и удаление

- Legacy удаляется после migration/parity evidence.
- Один пакет обычно затрагивает один домен и не более 10–20 файлов.
- Broad refactor, mass `any` replacement и массовое удаление не объединяются с
  domain change.
- Замороженные экспериментальные гейты спайна (`tests/simkit/mvp0_*_sign.test.ts`,
  `tests/simkit/memory_threat_v1.test.ts` и frozen-константы в
  `lib/config/formulaConfig.ts`) не перекалибровываются под видом адаптера или
  миграции — та же защита, что у `trust_exchange`. Их падение — regression.
- Новые canonical contracts объявляют собственные type modules. Корневой
  `types.ts` (~3261 строк, ~350 импортёров) подключается к новым contracts
  только через adapters и не расширяется новыми доменными полями.
- Широкие re-export barrels не являются canonical entrypoints: новые contracts
  экспортируются точечно. Прецедент: barrel `lib/dilemma/index.ts` вешает
  тестовый прогон, затягивая весь модульный граф.

## 5. Концептуальные границы релизов

```text
R1 — управляемый репозиторий и доказанная карта runtime
R2a — честная инвентаризация метрик
R3 — единый target-specific belief contract
R4 — общая scene/observation boundary
R5 — GoalLab и существующий Conflict kernel соединены явно
R6 — generalized ConflictDefinition и ограниченный constructor
R2b — UI метрик на стабильных scene/belief contracts
R7 — multi-agent foundation
R8 — удаление мигрированных legacy contours
```

---

# Часть II. Технический уровень

## 6. Зависимости программы

```text
R1: VERIFY-0 -> TEST-0 -> BASELINE-0 ∥ DETERMINISM-SWEEP-0 -> MAP-0 -> ADR-0
                                      ├-> R2a METRIC-INVENTORY-0
                                      ├-> CONFLICT-GAP-0
                                      └-> R3a TOM-INVENTORY-0 -> TOM-SPEC-0
                                                               ↓
R4a: SCENE-INVENTORY-0 -> OBSERVATION-CONTRACT-0
                                      ↓
R4a.1: SCENE-OWNERSHIP-ADR-0
       -> OBSERVATION-TYPES-0 -> OBSERVATION-RESOLVER-0
                                      ↓
R3b: TOM-BUILDER-0 -> TOM-UPDATE-0
                                      ↓
R4b: GOALLAB-SCENE-ADAPTER-0
     -> CONFLICT-SCENE-ADAPTER-0
     -> SIMKIT-SCENE-ADAPTER-0
              ├-> R2b durable metric catalog/UI
                                      ↓
R5a: CONFLICT-CHOICE-ADR-0 -> CONFLICT-DEFINITION-0
                                      ↓
R5b: CONFLICT-INTEGRATION-0
              └-> R6 generalized schema/validator/constructor
                                      ↓
R7 multi-agent -> R8 cleanup
```

Стрелки описывают поток данных и артефактов, а не гейт выдачи: параллельные
inventory-карточки выдаются только по очереди §28 (после принятых MAP-0/ADR-0).
R2b зависит от стабилизированных scene/belief contracts (R3b/R4b), а не от
conflict integration — это исправляет более раннюю версию графа.

## 7. R1 — контроль репозитория

### VERIFY-0

Артефакт: `verification matrix` с реальными scripts/config. Текущее известное
состояние: один Vitest project с `**/*.test.ts`; отдельных `lint`, `check`,
`test:unit`, `test:dilemma` scripts нет.

### TEST-0

Артефакт: таблица duration/status для `tests/dilemma`, `tests/pipeline`,
`tests/simkit` и полного run. Новые aliases создаются только после измерения.

### BASELINE-0

Артефакт: ревизия/дата, typecheck/tests/build, chunks, largest files, `any`,
unreachable candidates, dependency advisories. Baseline не принимает решений
об удалении.

### DETERMINISM-SWEEP-0

Артефакт: классификация всех wall-clock/RNG вхождений в `lib/` на
metadata-only и semantic. Read-only; выполняется параллельно с BASELINE-0.

### MAP-0

Артефакт для каждой surface:

```text
route -> page -> provider/hook -> state/world/character input
      -> ToM -> decision runtime -> persistence -> tests -> status
```

Обязательные surfaces: GoalLab v2, Conflict Lab/Dilemma, Live Simulator,
SimKit, Mafia, Relations Lab, Entity Detail и experimental panels.

### ADR-0

Фиксирует canonical/transitional/compatibility/legacy boundaries. Не закрывает
choice-policy вопрос — он принадлежит CONFLICT-CHOICE-ADR-0.

## 8. R2 — персонажные метрики

### R2a / METRIC-INVENTORY-0

Первый scope: `pages/EntityDetailPage.tsx` -> `components/MetricsDashboard.tsx`
-> `lib/metrics.ts` и непосредственные formula sources.

Строка inventory:

```text
metric id | UI label/path | field | formula/source | range/unit |
update trigger | scope | downstream | placeholder? | duplicate? | decision
```

Решения: `keep`, `connect real source`, `optional`, `unavailable without scene`,
`hide`, `deprecated`, `needs formula ticket`.

### R2b / METRIC-CATALOG-0…N

После стабилизации scene/belief contracts отдельными пакетами:

1. Catalog type + unique-ID/status projection tests.
2. Overview projection на 6–10 подтверждённых метрик.
3. Profile / Current state / Self-ToM / Opponent model / Diagnostics views.
4. Social-event source.
5. Отдельный formula ticket на каждую спорную метрику.

Каждая запись каталога обязана содержать человекочитаемое назначение:
одна строка «зачем эта метрика и что означает её изменение». Метрика без
внятного «зачем» не попадает в Overview — это ответ на симптом «непонятно,
нахуя они нужны».

## 9. R3 — OpponentBelief

### R3a / TOM-INVENTORY-0

Сопоставить:

- `lib/tom/state.ts`;
- `lib/tom/v3/types.ts`;
- `lib/tom/contextual/types.ts`;
- `lib/tom/compat.ts`;
- S5 implementation в `lib/goal-lab/pipeline/runPipelineV1.ts`;
- `lib/goal-lab/pipeline/beliefPersist.ts`.

Результат: один canonical owner, adapter list и судьба каждого старого contract.

### R3a / TOM-SPEC-0

Утвердить:

- реальные ID types;
- belief axes и ranges;
- estimate/uncertainty representation;
- evidence kinds и reliability;
- provenance/trace shape;
- serialization/schemaVersion;
- S0 load, S5 emission, persistence/replay;
- Self-ToM separation.

Conceptual shape не является готовым TypeScript contract:

```ts
interface OpponentBelief {
  observerId: AgentId;
  targetId: AgentId;
  estimates: Record<ApprovedBeliefKey, Estimate>;
  inferredGoals: ApprovedGoalBeliefs;
  predictedPolicy: ApprovedPolicyBelief;
  evidence: VersionedBeliefEvidence[];
  confidence: number;
  uncertainty: number;
  provenance: ApprovedBeliefTrace;
  updatedAtTick: number;
}
```

### R3b / TOM-BUILDER-0

Порядок builder:

```text
observer prior
-> visible evidence
-> role/status/faction visible to observer
-> known directed relation
-> scene context
-> observer bias
-> confidence/uncertainty
```

Hidden-information oracle:

```text
same visible observation envelope + changed hidden target field
  => semantically equal belief (semantic fields, без wall-clock metadata)
     + same semantic decision trace
```

Оракул сравнивает semantic fields, а не сериализованные байты — в соответствии
с инвариантом Versioning («Replay сравнивает semantic fields, а не wall-clock
bytes»).

Sensitivity oracle (обратная сторона hidden-information oracle; прямой ответ
на симптом «все незнакомцы на одно лицо»):

```text
два незнакомых target с разными видимыми профилями
(role/status/faction/observable behavior) при одинаковом observer prior
  => различающиеся beliefs, и различие доходит до utility/decision trace
```

Инвариантность к скрытому и чувствительность к видимому проверяются парой:
belief не должен реагировать на невидимое и обязан реагировать на видимое.

### R3b / TOM-UPDATE-0

Update принимает `belief + observation/event + tick`, возвращает новое belief и
trace. Добавляются reload/replay и sensitivity tests. Прямое чтение полного
target state запрещено.

## 10. R4 — scene и observation boundary

### R4a / SCENE-INVENTORY-0

Сопоставить `lib/scene/types.ts`, GoalLab `WorldState/sceneControl`, SimKit
scenario/world types и proposed draft. Для поля определить owner, writer,
persistence, visibility, provenance и adapter.

### R4a / OBSERVATION-CONTRACT-0

Минимальный scene input:

```text
id, schemaVersion, systemVersion, seed, cast, POV,
location/placement, events, relations, knowledge, visibilityRules, tags
```

Минимальный observation envelope:

```text
id, observerId, subjectId?, targetId?, kind, payload,
visibility, reliability, source, tick, provenance
```

Resolver возвращает `observationsByCharacterId`. Validators проверяют cast, POV,
roles, references, placement, relation overrides и knowledge assignments.

Relation priority:

```text
persistent -> branch -> scene override -> runtime update
```

### R4b / adapters

Каждый adapter — отдельный пакет. Golden сравнивает:

```text
visible inputs | candidate set | Q decomposition |
selected action under fixed policy | persisted semantic atoms
```

Намеренное исправление leakage/fallback требует exception record.

Для SIMKIT-SCENE-ADAPTER-0 в golden-набор дополнительно входят замороженные
спайновые гейты `tests/simkit` (знаковые `mvp0_*_sign` и decay/wipe
`memory_threat_v1`). Их падение — regression адаптера, а не повод
перекалибровать константы или переписать тест.

## 11. R5 — Conflict integration

### CONFLICT-GAP-0

Не создаёт kernel. Сравнивает существующий `lib/dilemma/dynamics/*` с GoalLab
boundary и canonical docs/tests. Результат — список отсутствующих contracts.

### CONFLICT-CHOICE-ADR-0

Решает владельца utility и final choice, formula/trace/version/compatibility и
перечень изменяемых tests.

### CONFLICT-DEFINITION-0

Минимальный immutable runtime contract для существующего `trust_exchange`:

```text
roles, phase, observation rules, legal actions,
payoff, transition, termination, validation
```

Authoring schema и UI constructor не входят.

### CONFLICT-INTEGRATION-0

Подключает resolved scene, beliefs и GoalLab seam к существующему kernel.
Сохраняет state, hysteresis, memory/learning, relation deltas и transition trace.

## 12. R6 — generalized definition и constructor

Последовательность:

1. Generalized schema/version migration.
2. Pure validator role/phase/knowledge/target.
3. Preset inventory: mechanic / parameter variant / skin / duplicate /
   unsupported / needs multi-agent.
4. Скрытие утверждённых duplicate/unsupported cards.
5. Constructor v1 только для dyad `trust_exchange`.
6. Schema editor v2 только после стабильного validation report.

## 13. R7 — multi-agent foundation

Foundation означает:

- N-participant contracts;
- individual observations;
- sparse directed belief graph с верхней границей `N * (N - 1)`;
- Self-belief отдельно;
- role knowledge и multi-target action types;
- сохранение dyadic protocol execution.

Полноценный joint protocol для `N > 2`, coalition goals и group payoff —
отдельный будущий эпик.

R7-FOUNDATION-0 2026-07-13 (PROPOSAL): инвентаризация зафиксировала, что
примитивы уже направленные/per-observer (`SceneEventInputV1.targetIds`,
`OpponentBeliefV1` observer→target, `s5DualEmitLayer` `otherIds: string[]`), а
диадическая жёсткость сосредоточена в `ConflictDefinitionV2` (`playerCount: 2`
литерал, «ровно 2 роли», бинарный `target`), в отсутствии self-belief и
типизированного графа с границей `N·(N−1)`. Предложены аддитивные контракты
(`participant-set-v1`, `observation-view-v1`, `belief-graph-v1`,
`conflict-definition-v3`), сохраняющие диадический kernel-execution и golden
identity. ADR-решения (self-belief shape, multi-target семантика, порядок)
ждут подписи автора. Полный документ: `docs/unification/R7_FOUNDATION_0.md`.

NKERNEL-FOUNDATION-0 2026-07-17: отложенный «отдельный будущий эпик»
(исполнимый N-транзишн) начат; семейство карточек `NKERNEL-*`. Kernel
execution в runtime остаётся диадическим; N-шаг строится как pure-domain
парная декомпозиция поверх нетронутого ядра (транзишн-хелперы уже
pair-generic). Полный документ: `docs/unification/NKERNEL_FOUNDATION_0.md`.

Audit repair 2026-07-18: forced pairwise N-step, trajectory and typed analysis
remain experimental and available, but N>2 GoalLab choice/live-session wiring
is explicitly deferred. Both integration entrypoints fail early with typed
dyad-only errors until a per-target action-matrix ADR defines choice semantics.
Self-belief is a distinct `SelfBeliefV1`, observations are revalidated at the
view boundary, and live round budgets are strict finite integers in `1..30`.

## 14. R8 — controlled cleanup

Каждый кандидат получает статус: `false positive`, `test-only`, `runtime plugin`,
`compatibility`, `legacy reference`, `safe delete`, `needs decision`, `generated`.

Delete package: один домен, утверждённые files/imports, tests before/after,
отсутствие нового fallback. Dependency upgrade — один пакет. `any` сокращается в
порядке public contracts -> resolvers -> beliefs -> definitions -> trace ->
adapters -> UI.

## 15. Release gates

| Release | Обязательный результат |
| --- | --- |
| R1 | tests измерены; baseline и determinism sweep сняты; surfaces/runtimes названы; ADR принят |
| R2a | каждая выбранная UI metric имеет source/status/decision |
| R3 | один belief owner; hidden fields не протекают; разные видимые профили незнакомцев дают разные beliefs, доходящие до решения; update versioned/traceable |
| R4 | три runtime получают scene/observations через общий versioned contract |
| R5 | utility/choice ownership принято; trust kernel интегрирован без смены transition semantics |
| R6 | roles/phases/actions валидны; constructor не создаёт декоративные mechanics |
| R2b | UI использует settled contracts и не выдаёт mock/broken за реальные |
| R7 | N-participant contracts, observations и directed beliefs работают |
| R8 | конкурирующие contours мигрированы или удалены с evidence |

---

# Часть III. Низкоуровневые ТЗ для моделей

## 16. Общие правила выдачи

Модели выдаётся одна карточка за раз. Она не должна:

- расширять scope без остановки;
- принимать архитектурное решение, зарезервированное за ADR;
- исправлять найденные соседние проблемы;
- удалять compatibility code без отдельного delete package;
- считать задачу готовой без указанных artifacts/checks;
- создавать project code в audit-only карточке.

Общий формат отчёта модели:

```text
Result:
Files changed:
Evidence/source map:
Commands and outcomes:
Not verified:
Stop conditions encountered:
Remaining risks:
Useful diff summary:
```

## 17. ТЗ VERIFY-0 — реестр проверок

### Цель

Зафиксировать реально доступные verification commands до изменения scripts.

### Scope

- `package.json`;
- `vite.config.ts`;
- CI workflows/configs, если существуют;
- README/docs, где названы команды.

### Разрешено

- только read-only inspection;
- создать/обновить один planning artifact с таблицей команд.

### Запрещено

- менять `package.json`;
- запускать dependency upgrades;
- создавать `check`, lint или test aliases;
- чинить тесты.

### Работы

1. Выписать каждый script и его точную shell command.
2. Прочитать `vite.config.ts`; записать environment/include/projects.
3. Найти CI references к npm scripts.
4. Отметить заявленные в docs, но отсутствующие scripts.
5. Подготовить таблицу:

```text
name | exact command | configured scope | exists? |
safe for automation? | needs measurement? | notes
```

### Acceptance

- явно записано: один Vitest project, `environment=node`, include
  `**/*.test.ts`;
- отсутствие lint/check не маскируется;
- ни один runtime/config file не изменён.

### Стоп-условие

Конфигурация генерируется внешним tooling и её нельзя доказать из репозитория —
зафиксировать unknown и остановиться.

## 18. ТЗ TEST-0 — baseline завершаемости

### Цель

Измерить фактическую завершаемость доменных наборов и полного test run.

### Входы

- результат VERIFY-0;
- `package.json`, `vite.config.ts`;
- `tests/dilemma`, `tests/pipeline`, `tests/simkit`.

### Запрещено

- менять domain semantics;
- добавлять `.skip`, fake timers или process termination как обход;
- одновременно чинить более одной подтверждённой import problem.

### Команды

Использовать фактический Node/npm toolchain среды. Минимальная последовательность:

```text
vitest run tests/dilemma
vitest run tests/pipeline
vitest run tests/simkit
npm test
npm run typecheck
npm run build
```

Каждый запуск получает внешний timeout и duration. Если npm отсутствует, не
изобретать результат: записать blocker и найденные возможные toolchain paths.

Известный факт среды (2026-07-10): node может отсутствовать в PATH; рабочий
Node v24 поставляется в составе Playwright bundle. Проверить его первым, прежде
чем объявлять environment blocker.

Статус зависания (ИЗМЕРЕНО 2026-07-10, см. `docs/unification/TEST_0.md`):
заявление внешнего аудита «`npm test` виснет >300 s на barrel
`lib/dilemma/index.ts`» **не воспроизводится** в среде репозитория —
полный прогон завершается за ~51 s, tests/dilemma за ~3 s при живых
barrel-импортах. Первичный golden-дрейф в
`tests/simkit/mvp0_golden.test.ts` локализован: actions/events/menuCounts
остались byte-stable относительно `7b68c1e`, а `1740492` намеренно изменил
provenance и форму диагностического trace. Hash перепинован с обоснованием в
тесте; см. TEST_0.md. Barrel остаётся широким
(13 re-exports) — архитектурная претензия в силе (см. инвариант §4),
поведенческая (hang) не подтверждена. Если у другого исполнителя hang
воспроизведётся — записать точный toolchain и приложить к TEST_0.md, не
чинить вслепую.

Oracle re-scope 2026-07-11: full `world.facts` digest больше не используется
как фиксированный межсредовый pin. `mvp0_golden.test.ts` по-прежнему требует
полной byte-equality повторных запусков в одной среде, но замороженное
ожидание теперь относится к semantic applied-dynamics subset без `factsDigest`
(`efa018b311fe889b…`). Основание: полный hash имеет ТРИ стабильные
пер-средовые линии — `4352ad74…` (env A; подтверждён 2026-07-11 clean
worktrees на 7be8f15 и 2822bff, lockfile не менялся, Node v24.11.1),
`451edc9d…` (toolchain 07-07/1740492), `e925be50…` (третья среда — sandbox
агента-аудитора). Semantic subset совпадает во всех трёх. Первоначальная
формулировка аудита «pin не воспроизводится в clean worktree» была неверна:
она отражала измерение только третьей среды; pin в env A жив.

Известный дисбаланс покрытия (для интерпретации результатов): tests/simkit 31
файлов, tests/pipeline 17, tests/goals 16, tests/decision 15, tests/dilemma 11 —
против tests/metrics, tests/lens, tests/possibilities, tests/util по 1 файлу.

### Output artifact

```text
scope | command | start/end | duration | exit |
test files/tests | first failure | hangs? | suspected import chain
```

### Acceptance

- четыре test scopes имеют измеримый outcome либо честный environment blocker;
- semantic failure отделён от hang/tooling failure;
- состав будущего `npm run check` предложен, но не внедрён.

### Стоп-условие

Первое исправление требует менять formula/transition/runtime behavior — вынести
в отдельный bug ticket.

## 19. ТЗ BASELINE-0 — снимок состояния репозитория

### Цель

Зафиксировать измеримое состояние кодовой базы до миграции. Baseline не
принимает решений об удалении.

### Входы

- результаты VERIFY-0 и TEST-0.

### Работы

1. Ревизия/дата; outcome typecheck/build/test.
2. Largest files; количество `any` по слоям; корневой `types.ts`
   (строки, число импортёров).
3. Unreachable candidates — только по import evidence (grep путей, не догадка).
4. Dependency advisories, если toolchain позволяет; иначе явный blocker.

### Предзаполненные измерения (аудит 2026-07-10; пересчитать при выполнении)

- `any` (вне тестов): lib ~2563, components ~853, hooks ~136, pages ~45.
- Крупнейшие файлы: `lib/simkit/actions/specs.ts` 2231,
  `lib/goals/goalLabContext.ts` 1979, `lib/possibilities/defs.ts` 1888,
  `components/goal-lab/GoalLabResults.tsx` 1855, `lib/dilemma/runner.ts` 1682,
  корневой `types.ts` 3261 (~350 импортёров).
- Кандидаты unreachable (0 импортёров вне себя): `lib/solver` (5 файлов),
  `lib/simulations` (5 файлов), `lib/ai` (self-declared deprecated stub),
  `lib/tom/compat.ts`.
- `archive/` — 47 ts/tsx файлов (reference only по TRUST_MAP).
- Мёртвый конфиг: define-блок `GEMINI_API_KEY` в `vite.config.ts` —
  0 использований в коде; заодно кандидат по no-LLM гигиене.
- UI внутри lib: `lib/goal-lab/labs/*.tsx` (3 файла, до ~1092 строк) —
  layer violation, кандидат на перенос в R8.

Данные внешнего аудита (Codex, 2026-07-10; пересчитать и приложить команды):

- масштаб: ~178k строк, ~1059 ts/tsx файлов вне node_modules, `lib/` >100k
  строк, 52 исходника длиннее 500 строк;
- `npm run unused`: 273 недостижимых файла, из них 191 в `lib/` (тесты уже
  считаются entrypoints);
- обход типов: ~2541 `as any`, ~1770 явных `any`, 209 non-null assertions;
  лидеры: `goalLabContext.ts` 215 any, корневой `types.ts` 189,
  `simkit/actions/specs.ts` 88, `GoalLabResults.tsx` 86, `runPipelineV1.ts` 70;
- production bundle: главный чанк ~2.03 MB, `react-force-graph-3d` ~1.32 MB,
  чанк GoalLabResults ~516 KB;
- `npm audit`: 3 moderate / 1 high / 1 critical; critical — старый Vitest
  (dev-dep) — известный первый кандидат dependency-upgrade пакета в R8.

### Запрещено

- удалять или менять код;
- объявлять кандидата «мусором» без записанной команды-evidence.

### Acceptance

Каждое число воспроизводимо командой, записанной рядом с ним; каждый
unreachable candidate имеет grep-evidence.

### Стоп-условие

Dependency advisories невозможны из-за toolchain — зафиксировать blocker,
не изобретать результат.

## 20. ТЗ MAP-0 — карта лабораторий

### Цель

Доказательно связать UI surfaces с фактическими runtime и tests.

### Начальные entrypoints

- `App.tsx`;
- `pages/GoalLabPageV2.tsx`;
- `pages/ConflictLabPage.tsx`;
- `pages/SimulatorPage.tsx`;
- `pages/RelationsLabPage.tsx`;
- `pages/EntityDetailPage.tsx`;
- `components/sim/LiveSimulator.tsx`.

### Обязательные строки карты

GoalLab v2, Conflict Lab/Dilemma, Live Simulator/SimKit, Mafia, Relations Lab,
Entity Detail, embedded GoalLab labs и legacy/redirect surfaces.

### Работы

1. От route пройти imports до page/provider/hook.
2. Найти создание/вызов decision runtime.
3. Найти world/character/relation/ToM input.
4. Найти persistence/export path.
5. Найти ближайшие tests.
6. Назначить status только по evidence.

### Output schema

```text
surface | route | page | provider/hook | input builder |
ToM path | decision runtime | persistence | tests | status | evidence paths
```

### Запрещено

- менять код;
- считать название каталога доказательством canonical status;
- объединять Dilemma и Conflict Lab в одну строку без описания bridge.

### Acceptance

У каждой активной route есть runtime/test evidence либо явный `not found`.

### Известные a-priori runtime candidates

Каждый из следующих контуров обязан появиться в какой-то строке карты либо
получить явный статус `unreachable from routes`:

- `lib/goal-lab/pipeline` (S0…S9);
- `lib/dilemma/dynamics` + `lib/dilemma/runner.ts`;
- `lib/simkit` (65 файлов);
- `lib/engine` + `lib/context` (активный контур: ~30+ импортёров,
  `lib/engine/tick.ts` тянет `lib/orchestrator`);
- `lib/orchestrator` (импортируется в т.ч. напрямую из
  `components/goal-lab/GoalLabResults.tsx` — layer violation, зафиксировать);
- `lib/mafia` (через `components/conflict/MafiaLabPanel.tsx`);
- `lib/simulate.ts` / `lib/sde.ts` / `lib/negotiation` (seedrandom-контур).

Embedded GoalLab labs физически живут в `lib/goal-lab/labs/*.tsx` (UI внутри
lib) — зафиксировать как layer violation, не чинить в этой карточке.

### Стоп-условие

Surface строится динамически или через plugin registry, который нельзя доказать
из статических imports, — отметить `runtime inspection required`, не назначать
status по предположению.

## 21. ТЗ ADR-0 — канонические границы

### Предусловие

MAP-0 принят человеком/ведущей моделью.

### Цель

Зафиксировать ownership без проектирования новых formulas.

### Решения

- GoalLab pipeline — canonical cognition/utility.
- UI — projection, не truth layer.
- target-specific ToM отдельно от Self-ToM.
- scene resolver — общий input boundary.
- ConflictDefinition работает до и после выбора.
- Relations Lab — view.
- legacy Dilemma runner — compatibility до migration evidence.

### Открытые вопросы

Conflict choice policy, окончательный OpponentBelief shape и generalized
ConflictDefinition остаются отдельными ADR/spec tasks.

### Output

Один ADR: context, decision, alternatives, consequences, migration impact,
compatibility, invalidated assumptions и links на MAP-0 evidence.

### Запрещено

- менять runtime;
- объявлять удаление файлов;
- решать choice policy без CONFLICT-CHOICE-ADR-0.

### Acceptance

- каждое решение ссылается на конкретную строку MAP-0 и canonical docs;
- alternatives и consequences перечислены;
- открытые решения не замаскированы как утверждённые;
- runtime и tests не изменены.

### Стоп-условие

MAP-0 показывает два активных владельца одной семантики без достаточного
evidence для выбора — оставить decision open и запросить отдельный gap audit.

## 22. ТЗ CONFLICT-GAP-0 — аудит существующего kernel

### Цель

Определить, чего не хватает между существующим `trust_exchange` и целевой
GoalLab/scene/belief boundary.

### Source map

- `lib/dilemma/dynamics/*`;
- `lib/dilemma/runner.ts`;
- `lib/dilemma/types.ts`;
- `docs/CONFLICT_LAB_CONTRACT.md`;
- `docs/CONFLICT_LAB_MATH_SPEC.md`;
- `lib/goal-lab/pipeline/runPipelineV1.ts`;
- `tests/dilemma/conflictDynamics.test.ts`;
- `tests/dilemma/canonicalBridge.test.ts`;
- `tests/dilemma/dynamicsCore.test.ts`;
- `tests/dilemma/mechanicProtocols.test.ts`.

### Работы

1. Зафиксировать state/action/observation/payoff/transition/trace contracts
   существующего kernel.
2. Зафиксировать, откуда сейчас приходят agent traits, relations и choices.
3. Сопоставить action vocabulary kernel и GoalLab candidates.
4. Отметить недостающие adapters/projections/version fields.
5. Разделить gaps на required / compatibility / future.

### Output

```text
boundary | current owner/path | target owner |
semantic mismatch | required adapter/test | decision needed
```

### Semantic oracle

Audit не меняет существующие canonical dynamics или golden expectations.

### Acceptance

- state/action/observation/payoff/transition/trace ownership описан путями;
- action vocabulary mismatch перечислен без переименования действий;
- каждый required gap имеет proposed adapter/test либо `decision needed`;
- domain runtime и существующие tests не изменены.

### Стоп-условие

`trust/withhold/betray` нельзя однозначно спроецировать в GoalLab vocabulary —
остановиться и запросить projection contract; не переименовывать actions.

## 23. ТЗ TOM-INVENTORY-0 — карта ToM contracts

### Цель

Не допустить появления ещё одного параллельного ToM.

### Source map

Перечисленные файлы — entrypoints, а не полный периметр: `lib/tom` содержит
30+ файлов. Обязателен полный обход `lib/tom/**`.

- `lib/tom/state.ts`;
- `lib/tom/v3/types.ts`;
- `lib/tom/contextual/types.ts`;
- `lib/tom/compat.ts`;
- `lib/tom/v3/buildDyadReport.ts`;
- `lib/tom/contextual/engine.ts`;
- `lib/tom/noncontextTom.ts` (~1357 строк — крупнейший ToM-файл);
- `lib/tom/engine-v4.ts`, `lib/tom/second_order.ts`, `lib/tom/decay.ts`;
- `lib/tom/base/*`, `lib/tom/memory/update.ts`, `lib/tom/policy/*`,
  `lib/tom/ctx/*`;
- S5 block в `lib/goal-lab/pipeline/runPipelineV1.ts`;
- `lib/goal-lab/pipeline/beliefPersist.ts`;
- ToM-related pipeline/decision tests.

Известные факты (2026-07-10, перепроверить):

- `lib/tom/compat.ts` не импортируется вне `lib/tom` — готовое delete-candidate
  evidence (удаление всё равно отдельным delete package);
- выделенного `tests/tom` не существует; ToM покрыт только косвенно через
  tests/goals, tests/pipeline, tests/simkit. `not found` в колонке test
  evidence — ожидаемый и допустимый результат, не заполнять предположением.

### Inventory columns

```text
type/function | runtime owner | observer/target IDs | axes/ranges |
input visibility | persistence | trace/provenance | consumers |
self vs other | status | keep/adapt/replace/delete | evidence
```

### Обязательные решения для следующего этапа

- canonical owner candidate;
- ID type;
- persisted vs derived fields;
- adapter list;
- поля с `any`/unknown;
- payloads, требующие schema migration.

### Запрещено

- создавать `OpponentBelief`;
- механически объединять types;
- удалять compat;
- утверждать формулу update.

### Acceptance

Все active ToM representations и S5/persistence links присутствуют; отсутствие
пути помечено `not found`, а не заполнено предположением.

### Стоп-условие

Невозможно определить, какой contract реально доходит до S5 или persistence, —
зафиксировать missing runtime evidence и не выбирать canonical owner.

## 24. ТЗ METRIC-INVENTORY-0 — метрики Entity Detail

### Цель

Проследить каждую метрику первого UI scope до источника и решения.

### Scope

- `pages/EntityDetailPage.tsx`;
- `components/MetricsDashboard.tsx`;
- вложенные display components, реально вызываемые dashboard;
- `lib/metrics.ts`;
- непосредственные formula sources и types.

### Работы

1. Перечислить каждый rendered label/field.
2. Проследить props до вычисления или placeholder.
3. Указать formula, range/unit и update trigger.
4. Найти hardcoded `0`, `[]`, fallback и duplicate projection.
5. Назначить только одно решение из утверждённого списка.

### Output

Inventory table плюс отдельный список:

```text
confirmed false zeros
unknown without scene
mock/broken
duplicate labels/fields
formula tickets required
```

### Запрещено

- менять UI или formulas;
- охватывать все GoalLab panels в том же пакете;
- переименовывать метрики без подтверждённого source.

### Acceptance

Каждый видимый показатель выбранного scope имеет source/status/decision.

### Стоп-условие

Значение формируется только во время интерактивной сцены и source нельзя
воспроизвести статически — отметить `runtime probe required`; не подставлять
формулу или ноль.

## 25. ТЗ SCENE-INVENTORY-0 — карта scene contracts

### Цель

Определить, какой существующий contract расширяется, адаптируется или заменяется.

### Source map

- `lib/scene/types.ts`;
- `lib/scene/engine.ts`;
- `lib/scene/applyScene.ts`;
- GoalLab `WorldState` и `sceneControl` types/consumers;
- `lib/simkit/core/types.ts`;
- `lib/simkit/core/world.ts`;
- `lib/simkit/core/simulatorScenario.ts`;
- `lib/simkit/scenario/types.ts`;
- placement/scene tests.

### Inventory columns

```text
contract/field | owner | writers | consumers | persistence |
visibility semantics | provenance | validation | status |
keep/adapt/replace | migration risk
```

### Обязательные вопросы

- судьба `ScenePreset` и `SceneInstance`;
- seed type и ownership;
- relation override priority;
- individual observations;
- knowledge/visibility representation;
- conversion into GoalLab S0 and SimKit world;
- schema/system versioning.

### Запрещено

- создавать `LabSceneDraft`;
- менять scene/runtime code;
- добавлять пустые defaults как совместимость.

### Acceptance

Есть migration matrix и список unresolved decisions для
OBSERVATION-CONTRACT-0.

### Стоп-условие

Два active runtime по-разному владеют одним persisted field — не выбирать
победителя в inventory; вынести ownership в отдельный ADR.

## 26. ТЗ DETERMINISM-SWEEP-0 — wall-clock и RNG в семантических путях

### Цель

Отделить wall-clock/RNG в metadata (допустимо по инварианту: «wall-clock
metadata не участвует в выборе») от участия в semantic state или persisted
semantic fields (нарушение инварианта детерминизма).

### Известные стартовые находки (2026-07-10; проверить и классифицировать)

- `lib/social/acquaintance.ts:59` — fallback tick → `Date.now()` в semantic path;
- `lib/planning/world-builders.ts:121` — `hydrateAgent(char, Date.now())`;
- `lib/diagnostics/runner.ts:147` — `historicalEvents` с `t: Date.now()`;
- `lib/utils/arr.ts:27`, `lib/utils/listify.ts:20` — `t: Date.now()` в data atoms;
- `lib/biography.ts:197` — `storyTime ?? Date.now()`;
- seedrandom: `lib/simulate.ts` (seeded от `cfg.rngSeed`),
  `lib/negotiation/simulate.ts` (seeded от repetition index), `lib/sde.ts` —
  проверить seeding и попадание в semantic state.

`Math.random` в `lib/` отсутствует (проверено 2026-07-10; 5 совпадений grep —
комментарии «без Math.random»).

### Работы

1. Полный поиск `Date.now`, `new Date(`, `performance.now`, `seedrandom` по `lib/`.
2. Для каждого вхождения решить: metadata-only (export timestamps, trace
   labels) или влияет на state/choice/persisted semantic fields.
3. Для семантических вхождений предложить замену источника (tick / seed /
   frozen constant) — предложить, не менять код.

### Output

```text
path:line | использование | metadata|semantic | downstream consumer |
предложение | severity
```

### Запрещено

- менять runtime;
- «чинить» найденное в этом же пакете.

### Acceptance

Каждое вхождение классифицировано; каждое семантическое имеет
ticket-предложение либо `runtime probe required`.

### Стоп-условие

Невозможно статически определить, попадает ли значение в persisted semantic
field, — пометить `runtime probe required`, не гадать.

## 27. Следующие ТЗ, которые пока нельзя выдавать

`OBSERVATION-CONTRACT-0`, `TOM-SPEC-0` и `SCENE-OWNERSHIP-ADR-0` выполнены
2026-07-11. Статическая сверка ADR обнаружила обязательную typed/resolver
границу перед builder. До её реализации не выдавать последующие задачи:

```text
CONFLICT-CHOICE-ADR-0
CONFLICT-DEFINITION-0
CONFLICT-INTEGRATION-0
```

Для каждой из них сначала заполняются реальные files, approved types, semantic
oracle, migration/version impact и exact test commands из результатов inventory.

## 28. Ближайшая очередь выдачи моделям

Статус (2026-07-11): позиции 1–20 имеют завершённый core. MAP-0 принят пользователем;
ADR-0 зафиксировал ownership, CONFLICT-GAP-0 остановил string-based action
mapping до typed projection contract, TOM-INVENTORY-0 проследил живой путь до
S5, SCENE-INVENTORY-0 зафиксировал конкурирующий ownership без выбора победителя,
OBSERVATION-CONTRACT-0 и TOM-SPEC-0 утвердили минимальные versioned contracts,
SCENE-OWNERSHIP-ADR-0 разделил immutable run input и mutable runtime truth, а
OBSERVATION-TYPES-0/RESOLVER-0 реализовали изолированный typed boundary.
METRIC-INVENTORY-0 отделил живые SDE и V4.2 readouts от false zeros/placeholders
Entity Detail. Legacy runtime не изменялся; добавлен новый не подключённый к
pipeline observation module.
артефакты находятся в `docs/unification/`.

```text
1. VERIFY-0                — DONE (docs/unification/VERIFY_0.md)
2. TEST-0                  — DONE (docs/unification/TEST_0.md)
3. BASELINE-0              — DONE (docs/unification/BASELINE_0.md)
4. DETERMINISM-SWEEP-0     — DONE (docs/unification/DETERMINISM_SWEEP_0.md)
5. MAP-0                   — ACCEPTED 2026-07-11 (docs/unification/MAP_0.md)
6. ADR-0                   — DONE (docs/unification/ADR_0.md)
7. CONFLICT-GAP-0          — DONE (docs/unification/CONFLICT_GAP_0.md)
8. TOM-INVENTORY-0           — DONE (docs/unification/TOM_INVENTORY_0.md)
9. METRIC-INVENTORY-0        — DONE (docs/unification/METRIC_INVENTORY_0.md)
10. SCENE-INVENTORY-0       — DONE (docs/unification/SCENE_INVENTORY_0.md)
11. OBSERVATION-CONTRACT-0   — DONE (docs/unification/OBSERVATION_CONTRACT_0.md)
12. TOM-SPEC-0               — DONE (docs/unification/TOM_SPEC_0.md)
13. SCENE-OWNERSHIP-ADR-0    — DONE (docs/unification/SCENE_OWNERSHIP_ADR_0.md)
14. OBSERVATION-TYPES-0      — DONE (lib/scene/observation/types.ts)
15. OBSERVATION-RESOLVER-0   — DONE (lib/scene/observation/resolver.ts)
16. TOM-BUILDER-0            — DONE (lib/tom/opponentBelief/builder.ts)
17. TOM-UPDATE-0             — DONE (lib/tom/opponentBelief/update.ts)
18. GOALLAB-SCENE-ADAPTER-0  — DONE CORE (lib/scene/adapters/goalLab.ts)
19. CONFLICT-SCENE-ADAPTER-0 — DONE CORE (lib/scene/adapters/conflict.ts)
20. SIMKIT-SCENE-ADAPTER-0   — DONE CORE (lib/scene/adapters/simKit.ts)
21. SCENE-ADAPTER-LIVE-WIRING-0 — DEFERRED; requires per-runtime caller migration
22. TOM-LIVE-WIRING-AUDIT-FIX-0 — DONE 2026-07-11; subject/relation direction,
    fail-closed observer-map + envelope decode, S5 provenance artifact, S8 Q
    sensitivity and semantic-only MVP-0 golden pin
23. CONFLICT-CHOICE-ADR-0    — ACCEPTED 2026-07-11
    (docs/unification/CONFLICT_CHOICE_ADR_0.md): utility = GoalLab S8 Q,
    canonical choice = versioned goal_lab_s8_gumbel_v1, шов = существующий
    forcedJointActions + validateJointAction; kernel/runner политики →
    reference/compatibility; dual-run обязателен до parity
24. CONFLICT-DEFINITION-0    — DONE 2026-07-12 (lib/dilemma/definition/):
    frozen TRUST_EXCHANGE_DEFINITION (contract §11: roles/phase/observation/
    legal actions/payoff/transition/termination/validation; bound kernel, не
    ре-имплементация) + typed projection row v1 c fail-closed exact-match
    resolveProjectedChoice; пять GAP-0 тестов + non-interference/immutability
    (tests/dilemma/conflictActionProjection.test.ts, conflictDefinition.test.ts)
25. CONFLICT-INTEGRATION-0   — DONE CORE 2026-07-12 (lib/dilemma/integration/):
    runConflictJointDecisionV1 = pipeline S8-атомы → кандидаты из projection
    rows (typed ActionImpact × conflict-impact-goal-matrix-v1,
    belief-модуляция v1) → decideAction (goal_lab_s8_gumbel_v1, fail-closed
    rng) → forcedJointActions (learn_from_utility) + dual-run reference lane;
    live-замена runDilemmaV2 отложена до parity evidence
    (tests/dilemma/conflictIntegration.test.ts)
26. R2-METRIC-FIXES-0        — DONE 2026-07-12: goalTension/frustration →
    honest unknown (number|null; у deriveGoalCatalog нет реального
    вычисления — константные нули), linterIssues скрыт, scenario warn ≠
    fail (scenarioStatusPresentation), RAP c live SDE Pv
    (lib/metrics/liveV42.ts); tests/metrics/entity_detail_fixes.test.ts
```

27. PHASE1-OPPONENT-BELIEF-DEFAULT-0 — DONE 2026-07-12: S5 dual-emit ON по
умолчанию только у `phase1`; `legacy` и no-profile/config остаются OFF;
object-form override `true|false` сохраняет opt-in/rollback. Global FC не
изменён. Оракулы: runtime profile matrix, S5 grammar, hidden/reverse
non-interference, visible S8 Q/provenance, determinism и no-profile golden.

`CONFLICT-PARITY-0` завершён: evidence подтверждает совпадение legal set,
utility ranking и transition при одинаковых joint actions; расхождение выбора
локализовано в versioned seeded-Gumbel policy против reference argmax.

Историческая очередь ниже закрыта: `GOALENERGY-UNION-DEFAULT`, live wiring
canonical Conflict provider и R6 schema/catalog уже реализованы. Текущая
граница следующего Conflict-пакета — отдельный ADR для per-target N>2 choice;
до него N>2 decision/live остаются fail-closed. Live replacement прочих
GoalLab/SimKit callers остаётся в `SCENE-ADAPTER-LIVE-WIRING-0`; pure adapters
не объявляются уже подключённым runtime.

Audit repair 2026-07-12: непрозрачный projection ID отделён от типизированного
`actionKey`; ID связывает tick/history; допустимые Conflict possibilities входят
в реальный GoalLab S8 в режиме replace с именованным seeded decision RNG; trace
сохраняет effective temperature и membership в sampling pool.

Phase1 OpponentBelief default 2026-07-12: `phase1` включает семь механизмов,
включая S5 dual-emit; `legacy` и no-profile/config сохраняют прежний OFF-path.

GOALENERGY-UNION-DEFAULT 2026-07-12: `phase1` now includes eight effective
mechanisms by enabling `actionScoring.goalEnergyDomainUnionV1`; `legacy` and
no-profile/config remain OFF. Object-form `true|false` preserves opt-in and
rollback. The no-profile semantic golden is not repinned because that runtime
path is unchanged. Conflict provider live wiring is completed below.

R5 live wiring 2026-07-12: `runConflictLabSessionV1` now owns active
`trust_exchange` execution. Its multi-round loop feeds GoalLab S8 choices into
the typed kernel, carries the canonical next state forward, and records the
autonomous kernel policy as the reference lane. `DilemmaLabPanel` exposes the
versioned choice trace and exports it under `ConflictLabSessionV1`. Other
mechanics remain explicit legacy/`unsupported_kernel` compatibility runs.
Regression: `tests/dilemma/liveTrustExchangeRuntime.test.ts`.

R6 step 4 catalog wiring 2026-07-13: the Conflict Lab catalog lane is now a
pure function of the typed inventory (`conflictCatalogLane(kind, runnable)`),
not the ad-hoc `disabled` flag. Runnability gates selectability; the inventory
kind decides canonical-kernel vs an explicit compatibility run. `trust_exchange`
(`trust_interrogation`) is the sole canonical lane; the eight runnable
non-kernel presets stay selectable under an explicit "compatibility — no typed
kernel" lane (each badged with its inventory kind + reason), and disabled
presets are shown as unavailable. No card is promoted into an executable
mechanic by presentation, and no runnable behavior is removed. Steps 1–3 and 5
(schema/validator/inventory/constructor) landed in `CONFLICT-LIVE-0`; step 6
(schema editor v2) stays gated behind a stable validation report. Regression:
`tests/dilemma/conflictCatalog.test.ts`.

## 29. Assumptions and limitations

Раздел намеренно на английском: это внешний дисклеймер, а не рабочий текст.

Kanonar is a research/prototype simulation system. Variables such as trust, fear,
stress, resentment, affiliation need, or control need are internal simulation
scalars. They are not clinical, psychometric, or experimentally calibrated
measurements.

The system is useful for deterministic simulation, explainable decision
pipelines, sensitivity analysis, comparing rule systems, and prototyping agent
dynamics.

The system must not be presented as a validated psychological, diagnostic, or
real-world behavioral prediction model without external validation.
