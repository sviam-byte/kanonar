# NKERNEL-FOUNDATION-0 — исполнимое N-ядро: инвентаризация + contract proposal

Статус: **ADR §5.1–§5.5 подписаны 2026-07-17/18; срезы 1–6 (`NKERNEL-STEP-0`, `NKERNEL-CHOICE-0`, `NKERNEL-TRAJECTORY-0`, `NKERNEL-DEFINITION-BIND-0`, `NKERNEL-DECISION-0` v1, `NKERNEL-SESSION-0`) РЕАЛИЗОВАНЫ.**
Дата: 2026-07-17.
Audit repair 2026-07-18 (authoritative over historical slice notes below):
forced pairwise N-step, trajectory and Result-based analysis remain available
for `N > 2`, but GoalLab joint decision and live sessions are now explicitly
dyad-only. They return `n_decision_requires_dyad` / `n_live_requires_dyad`
before pipeline work. The former single-target N=3 escape hatch is removed;
per-target action matrices, coalition choice and group payoff require a future
ADR. N execution also requires exact canonical trust protocol/definition
binding, and live budgets are finite integers in `1..30`.
Update 2026-07-18 (5): `NKERNEL-SESSION-0` реализован (см. §3.6/§6.6) —
parity-gated N-live-session-раннер `runConflictNLabSessionV1`; **первый срез,
осознанно пересекающий границу «nkernel не импортируется runtime-кодом»**:
N-полоса вызываема из integration-барреля, но ничто не диспатчит в неё по
умолчанию (`runConflictLabSessionV1`, catalog-lane и UI не тронуты байтово).
Gate: `tsc --noEmit` чист; 574 passed / 10 skipped / 0 failed; golden
`efa018b3…` не сдвинут; grep-инвариант §4 переформулирован (точка пересечения).
Update 2026-07-18 (4): `NKERNEL-DECISION-0` v1 реализован (см. §6.5) —
однотаргетный N-joint-decision provider по ADR §5.5. Gate: `tsc --noEmit`
чист; 566 passed / 10 skipped / 0 failed; golden `efa018b3…` не сдвинут.
Update 2026-07-18 (3): `NKERNEL-DEFINITION-BIND-0` реализован (см. §6.4) —
привязка v3-target-режимов (`none | self | counterparty | participant |
all_others`) к конкретным `targetIds`, плюс проекция `legalActions` определения
в исполнимые строки. Gate: `tsc --noEmit` чист; 561 passed / 10 skipped /
0 failed; golden `efa018b3…` не сдвинут.
Update 2026-07-18: автор подписал ADR агрегации utilities (§5.2-agg:
покомпонентный MEAN по N−1 целям игрока) — `NKERNEL-CHOICE-0` реализован
pure-domain (см. §6.2): `lib/dilemma/nkernel/nchoice.ts` + разблокирован
`learn_from_utility` при `N > 2` в `nstep.ts` (fail-closed
`unsupported_strategy_mode_for_n` удалён — он стоял ровно до этой подписи).
Gate: `tsc --noEmit` чист; полный набор 549 passed / 10 skipped / 0 failed;
golden `efa018b3…` не сдвинут.
Update 2026-07-18 (2): `NKERNEL-TRAJECTORY-0` реализован (см. §6.3) —
N-траектории и метрики. Gate: `tsc --noEmit` чист; 554 passed / 10 skipped /
0 failed; golden `efa018b3…` не сдвинут.
Update 2026-07-17: `NKERNEL-STEP-0` реализован pure-domain (см. §6.1):
`lib/dilemma/nkernel/{types,nstate,nstep}.ts` +
`tests/dilemma/nkernel_step_v1.test.ts` (8). Gate: `tsc --noEmit` чист; полный
набор 543 passed / 10 skipped / 0 failed; golden-тест зелёный, no-profile хеш
`efa018b3…` не сдвинут (`grep -rn "nkernel" lib` — только self-references,
barrel не расширялся).

Основание: `docs/LAB_UNIFICATION_PLAN.md` §13 («Полноценный joint protocol для
`N > 2`, coalition goals и group payoff — отдельный будущий эпик») и
`docs/unification/R7_FOUNDATION_0.md` §0/§3.4/§6.4 (R7-foundation закрыт на
уровне контрактов; исполнимый N-транзишн вынесен в отдельный эпик). Этот
документ открывает тот эпик: инвентаризует диадические посылки *исполнимого*
ядра (слой ниже, чем R7 — там инвентаризовались декларативные контракты),
формулирует парную декомпозицию N-шага и режет эпик на срезы. Семейство
карточек — `NKERNEL-*` (прецедент — ненумерованные `CONFLICT-*`/`TOM-*`;
`R8` занят controlled cleanup).

Scope-инвариант эпика, унаследованный от R7 §0: kernel execution в runtime
остаётся диадическим; всё новое — pure-domain модули за пределами runtime-пути.
Coalition goals и group payoff в первые срезы НЕ входят (§6, хвост).

## 1. Инвентаризация исполнимого ядра

### 1.1 Что уже pair-generic на рантайме (доказательства)

Диадичность ядра — в основном свойство *типов*, не циклов:

- **`normalizeConflictState`** (`lib/dilemma/dynamics/state.ts:24`) — циклы по
  всем ordered-парам `fromId ≠ toId`; при `players.length = N` создаёт полные
  направленные карты relations/memories/regimes без изменений кода.
- **`applyConflictTransition`** (`lib/dilemma/dynamics/engine.ts:409`) — agents
  по всем игрокам, relations по всем ordered-парам; `outcome`-вход Record-shaped
  (`payoffs`/`agentDeltas`/`relationDeltas` — Record'ы, не кортежи).
- **`validateJointAction`** (`engine.ts:96`) — итерирует `players` без
  2-посылки; error-коды `invalid_player`/`duplicate_player`/`missing_player`/
  `invalid_action` уже N-готовы.
- **`ConflictProtocol`** (`dynamics/types.ts:151`) — `roles:
  Record<ConflictPlayerId, ConflictRole>` N-generic; кортежным остаётся только
  конструктор `createTrustExchangeProtocol`.
- **`relationDynamics`/`learningDynamics`/`actionImpact`/`math`** — ни одного
  игрок-индексирования; работают на направленных (from, to) величинах.
- **`ConflictTrajectoryFrame`** — направленный (`agentId`, `otherId`);
  `ConflictHistoryEvent.payoffs` — Record.

### 1.2 Что диадически заперто (доказательства)

- **`ConflictState.players: readonly [ConflictPlayerId, ConflictPlayerId]`** —
  кортеж-литерал (`dynamics/types.ts:134`); тот же кортеж у
  `createTrustExchangeProtocol` (`trustExchange.ts:33`) и
  `CanonicalConflictLabRunConfig.players` (`bridge.ts:28`).
- **`otherPlayer()`** (`engine.ts:504`) — только `players[0]`/`players[1]`;
  на нём сидят `getObservationForPlayer` (`engine.ts:50`, сингулярные
  `otherId`/`relationToOther`/`memoryToOther`/`regimeToOther`) и
  `buildLearningArtifacts` (`engine.ts:256`).
- **`resolveTrustExchangeOutcome`** (`trustExchange.ts:52`) —
  `const [a, b] = state.players` + парная 3×3 матрица `trust_exchange`.
- **`analysis.ts:32,53`** — `const [a, b] = canonical.players` в
  trajectory-метриках.
- **`worldForTick`** (`integration/liveSession.ts:62`) — единственный другой
  через `players.find(...)`; runtime-путь, эпиком НЕ трогается до
  `NKERNEL-SESSION-0`. ✅ Шов закрыт 2026-07-18 срезом 6: `worldForTickNV1`
  (`integration/nliveSession.ts`) патчит relationships к КАЖДОМУ другому
  участнику в порядке объявления; диадический оригинал не тронут (побайтный
  N=2 session-оракул сравнивает именно против него).

Практический вывод — тот же паттерн, что в R7 §1, слоем ниже: объём работы
меньше формулировки §13. N-шаг строится *поверх* диадического ядра парной
декомпозицией, а не заменой транзишна.

### 1.3 Seam выбора

На каноническом live-пути kernel не выбирает: `decisionProvider.ts` зовёт
`definition.step(state, protocol, { forcedJointActions,
forcedActionStrategyMode })` — выбор принадлежит GoalLab S8
(CONFLICT-CHOICE-ADR-0 §3). Поэтому первый исполнимый срез — **forced-joint-
action N-step**; эндогенный N-выбор — отдельный срез (§3.4, §6).

## 2. Парная декомпозиция (математика, явно)

Механика `trust_exchange` парная: исход тика для неупорядоченной пары `{i, j}`
определяется только `(action_i, action_j)`. Все направленные артефакты
(relations, memories, regimes, frames) уже живут per ordered pair. Значит
N-шаг = прогон диадического ядра по каждой паре + свёртка в player-level.

- Множество пар: `P = {{i, j} : i ≠ j}`, `|P| = N·(N−1)/2`.
- Фреймов за тик: по 2 на пару = `N·(N−1)` — совпадает с
  `maxDirectedEdgesV1(N)` из belief-graph-v1 (R7 §2).
- Проверка на малых N: `N = 2` → 1 пара, 2 фрейма (ровно сегодняшнее ядро);
  `N = 3` → 3 пары, 6 фреймов; `N = 4` → 6 пар, 12 фреймов.

Свёртки за тик (ADR §5.1):

- `payoff_i = Σ_{j≠i} u_i^(ij)` — сумма по парам (round-robin конвенция);
- `ΔA_i = (1/(N−1)) · Σ_{j≠i} δ_i^(ij)` — среднее по парам игрока: величина
  драйвовых сдвигов (`boundedLogitShift`) не растёт с N; поле дельты
  присутствует в свёртке, только если присутствовало хотя бы в одной паре
  (отсутствующее слагаемое = 0);
- relations/memories/regimes: направленный слот `(i → j)` берётся из
  единственной пары `{i, j}` — свёртка дизъюнктна, конфликтов нет;
- `computeReward` внутри каждой пары видит **pairwise** payoff (ADR §5.1).

**Теорема редукции (N = 2):** при `N = 2` каждая свёртка — fold-of-one
(`Σ` по одной паре, `mean` с делителем 1), т.е. тождество. Значит
`resolveConflictNStepV1` на диаде обязан воспроизводить `resolveProtocolStep`
с точностью до структурного равенства. Закрепляется оракулом (§6, срез 1) —
все 9 комбинаций joint-действий × оба strategy-режима × мультираунд.

## 3. Предлагаемые аддитивные контракты (versioned, fail-closed)

Все контракты — новые pure-domain модули в `lib/dilemma/nkernel/`, не меняющие
существующих подписей; в barrel `lib/dilemma/index.ts` не входят; в runtime
никем не импортируются (паттерн R7 §3).

### 3.1 N-state (`conflict-nstate-v1`)
`ConflictStateNV1` — структурно `ConflictState` с
`players: readonly ConflictPlayerId[]` вместо кортежа; БЕЗ дополнительных
полей (чтобы диадический инстанс оставался структурно равен kernel-состоянию).
Fail-closed нормализация `normalizeConflictStateNV1`: участники через
participant-set строгость (уникальность, `N ≥ 2` — reuse
`buildParticipantSetV1`, не ре-имплементация), затем делегат в pair-generic
`normalizeConflictState` через единственный документированный type-adapter
(§5.4). Плюс `dyadicPairProjectionV1(state, i, j)` — истинная диада пары:
рестрикции agents/relations/memories/regimes/profiles, общие
environment/tick/history, `trace: []` (harvest-инвариант: trace результата
пары = ровно новые фреймы).

### 3.2 N-конструкторы протокола/дефиниции (`trust-exchange-protocol-n-v1`)
`buildTrustExchangeProtocolNV1(set: ParticipantSetV1): ConflictProtocol` —
`ConflictProtocol` уже N-generic, нужен только конструктор (roles все
`participant`, фазы и action order ядра). `trustExchangeDefinitionNV1(set)` —
декларативный N-инстанс `trust_exchange` в `conflict-definition-v3` (targets
`{ mode: 'all_others' }`, т.к. `counterparty` легален только при `N = 2` по
R7 §5.2), ре-валидируемый `validateConflictDefinitionV3` — связка исполнимого
эпика с v3-контрактом R7.

### 3.3 Forced-joint-action N-step (`conflict-nstep-v1`) — исполнимый срез 1
`resolveConflictNStepV1({ state, protocol, forcedJointActions,
forcedActionStrategyMode })`: normalize + fail-closed участники → проверка
покрытия протоколом → N-generic `validateJointAction` → прогон настоящего
`resolveProtocolStep` по каждой паре на `dyadicPairProjectionV1` → свёртка §2
→ один `applyConflictTransition` на N-уровне. Reuse, не ре-имплементация:
парная матрица, learning, hysteresis и транзишн-уравнения остаются кодом
диадического ядра. Провенанс: per-pair outcomes сохраняются в `pairwise`.
Подробности — карточка среза (§6.1).

### 3.4 Эндогенный N-выбор (`conflict-nchoice-v1`) — ✅ IMPLEMENTED 2026-07-18
Replicator-выбор ядра при N. ADR агрегации подписан 2026-07-18 (§5.2-agg):
`U_i(a) = (1/(N−1))·Σ_{j≠i} U_i^(ij)(a)` — покомпонентный mean; U линеен по
компонентам ⇒ `mean(U) = U(mean)` (самосогласованность), масштаб не зависит
от N (та же логика, что mean-дельты §5.1), при `N = 2` fold-of-one ⇒ оракул
редукции. `resolveConflictNChoiceStepV1`: kernel-скоринг по парным проекциям →
`updateStrategyProfileReplicator` над агрегатом → `selectDominantAction` →
делегат в N-step в режиме `learn_from_utility` (память/гистерезис живут, как
в неforced-пути ядра). `learn_from_utility` при `N > 2` разблокирован в
`nstep`: N-профили = репликатор над mean-агрегатом harvested utilities.

### 3.5 N joint-decision provider — ✅ N=2 REDUCTION ONLY (`NKERNEL-DECISION-0`)
N-аналог `runConflictJointDecisionV1` (`lib/dilemma/integration/decisionProvider.ts:88`):
per-participant GoalLab S8 поверх `ObservationViewV1`/`selectAllObservationViewsV1`
и `BeliefGraphV1`. Записанные инварианты потребителей: `makeNeutralOpponentBeliefPriorV1`
запрещает `observerId === targetId` (`self_target_forbidden`);
`buildBeliefGraphV1` fail-closed на дубликатах рёбер/участников.

Инвентаризация (после срезов 1–4, 2026-07-18):

- Уже N-generic, без переделки: `state.players`-цикл (`decisionProvider.ts:99`)
  не несёт диадической посылки; `ConflictPlayerDecisionInputV1`,
  `ConflictJointDecisionReportV1.choices`/`.divergence.byPlayer` уже
  `Record<ConflictPlayerId, …>` (`integration/types.ts:29,86,103`).
- Диадически заперто, но уже есть N-замена в срезах эпика: `args.definition?:
  ConflictDefinition` — v1/v2-интерфейс с `.step()`/`.createProtocol()`, не
  v3 (`integration/types.ts:127`); дыадические `projectLegalActions`/
  `resolveProjectedChoice` — N-замена проекции есть
  (`projectConflictDefinitionV3ActionsV1`, срез 4), N-аналога
  `resolveProjectedChoice` ещё нет; недforced-reference-lane
  `definition.step(state, protocol)` — N-аналог уже есть
  (`resolveConflictNChoiceStepV1`, срез 2).
- **Развилка — не механическая генерализация.** `buildConflictPossibilities`
  (`integration/candidateBridge.ts:123-166`) строит один GoalLab `Possibility`
  на projection-строку с единственным `targetId = row.targetIds[0]` (:130) —
  `Possibility` однотаргетна по контракту. При `N > 2` `all_others`-target несёт
  несколько `targetIds` (срез 4); инвариант «один candidate = одно действие ×
  один таргет» перестаёт покрывать вход. Варианты:
  (a) **fan-out** — один candidate на пару (action × target), S8 ранжирует по
  расширенному пулу; «выбор» становится (actionId, targetId), а не actionId —
  меняет форму `ConflictChoiceTraceV1`/`resolveProjectedChoice`;
  (b) **однотаргетный первый срез** — `NKERNEL-DECISION-0` v1 покрывает только
  definitions, где легальные действия однотаргетны в момент вызова
  (`self`/`none`/`participant`/`counterparty`, и `all_others` лишь при `N = 2`);
  многотаргетный choice уходит в тот же хвостовой ADR, что coalition goals/
  group payoff (§6 п.7).
  ADR-резерв — см. §5.5. ✅ РЕШЕНО автором 2026-07-18: однотаргетный первый
  срез (вариант b); многотаргетный fan-out — в хвостовой ADR (§6 п.7).
  Реализация — см. §6.5.

### 3.6 N live session — ✅ DYADIC WRAPPER; N>2 DEFERRED (`NKERNEL-SESSION-0`)
За parity-gate (как R3/R5), никогда default. N>2 fails before GoalLab work;
forced N-core availability does not widen this boundary. Записанный инвариант catalog-lane:
`getScenario` бросает на disabled/unknown id — правила канонической полосы
R6 применяются без изменений.

Реализация (`lib/dilemma/integration/nliveSession.ts`, см. §6.6):

- **`runConflictNLabSessionV1`** — канонический trust_exchange-цикл
  `runConflictLabSessionV1` (`liveSession.ts:88`), поднятый на N: per-round
  scheduled pressure → `worldForTickNV1` → per-player GoalLab pipelineInput +
  seeded rng → `runConflictNJointDecisionV1` (срез 5) → межшаговый
  `normalizeConflictState` (конвенция ntrajectory, несущая ниже
  replicator-floor). Fail-closed `Result` вместо диадического throw; механика
  не-trust_exchange → `unsupported_mechanic` **без** `runDilemmaV2`-fallback.
  `getScenario` зовётся первым, его throw пропагирует — catalog-инвариант
  выполняется дословно.
- **`buildCanonicalInitialStateNV1`** — per-pair reuse настоящего
  `buildCanonicalInitialState` (по вызову на каждую неупорядоченную пару в
  порядке объявления) + **anchor-partner-правило слияния** (ADR среза):
  `agents[p]`/`strategyProfiles[p]` — из первой пары с `p` (единственное
  pair-зависимое поле агента — `fear` из собственной исходящей диады, т.е.
  начальный fear — к первому другому участнику в порядке объявления;
  mean-over-others — записанная отложенная альтернатива, меняет только
  семантику `N > 2`); `relations` — дизъюнктно из своих пар; `environment` —
  pair-инвариантен. При `N = 2` слияние = выход единственной пары, побайтно.
- **RNG-цепь** — итерированный golden-ratio imul (`s_0 = seed`,
  `s_{k+1} = imul(s_k, 0x9e3779b1)`); при `N = 2` буквально диадическая пара.
  `rngChannelId` — тот же формат `conflict-live:<scenario>:<seed>:<player>`
  (trace-метка, не ключ реестра; общий формат и держит побайтное сравнение
  choices).
- **Audit-repaired session boundary** — `N = 2` requires the canonical
  counterparty definition binding. `N > 2` always returns
  `n_live_requires_dyad`; `config.definition` cannot bypass the boundary.

## 4. Сохраняемые инварианты

- Диадический `trust_exchange` kernel, его транзишн-уравнения и тесты не
  меняются; ни один существующий файл `lib/` не редактируется в срезе 1.
- Golden identity: no-profile семантический хеш `efa018b3…` не двигается.
  Runtime-import-инвариант **переформулирован срезом 6** (точка пересечения,
  осознанная): до среза 6 — «ни один NKERNEL-модуль не импортируется
  runtime-кодом» (срезы 1–5 держали `grep -rn "nkernel" lib` = только
  self-references); с среза 6 — «nkernel в `lib/` импортируется ТОЛЬКО
  N-session-полосой (`integration/nliveSession.ts`,
  `integration/ndecisionProvider.ts`, integration-баррель), в которую ничто
  не диспатчит по умолчанию: `runConflictLabSessionV1`, catalog-lane и UI
  байтово не тронуты».
- v1/v2/v3 definition-контракты заморожены; N-конструкторы §3.2 — поверх, не
  вместо.
- Barrel `lib/dilemma/index.ts` не расширяется (прецедент
  CONFLICT-DEFINITION-0).

## 5. Решения, зарезервированные за автором

1. **Агрегация pairwise → player-level.** ✅ DECIDED 2026-07-17:
   `agentDeltas` — **среднее** по `N−1` парам игрока (величина драйва не
   зависит от N; сумма масштабировала бы `boundedLogitShift`-драйвы ×(N−1));
   `payoffs` — **сумма** (round-robin); `computeReward` внутри пары видит
   pairwise payoff. При `N = 2` оба выбора невидимы (fold-of-one) — семантика
   пинится N=3-тестом.
2. **Strategy-profile/utility агрегация при `N > 2`.** ✅ DECIDED 2026-07-17:
   fail-closed — `learn_from_utility` при `N > 2` возвращает
   `unsupported_strategy_mode_for_n`; агрегация utilities — отдельный ADR к
   `NKERNEL-CHOICE-0`. При `N = 2` оба режима работают полностью
   (identity-агрегация единственной пары).
   **§5.2-agg ✅ DECIDED 2026-07-18:** агрегация = покомпонентный **MEAN**
   `ActionUtilityBreakdown` по N−1 целям игрока (альтернативы sum — N-зависимое
   обострение репликатора, min — нелинейный worst-case — отклонены).
   Fail-closed заменён рабочей агрегацией; error-код удалён из union.
3. **Нейминг/версии.** ✅ DECIDED 2026-07-17: семейство `NKERNEL-*`, модули в
   `lib/dilemma/nkernel/`, схемы `conflict-nstate-v1`/`conflict-nstep-v1`
   (`R8` занят cleanup; прецедент ненумерованных семейств — `CONFLICT-*`).
4. **`outcomeTag`/`eventTags` при `N > 2`.** ✅ DECIDED 2026-07-17: `N = 2` —
   дословный passthrough единственной пары (закреплён оракулом); `N > 2` —
   детерминированный агрегатный `outcomeTag` (`n_pairwise`) + отсортированный
   union `eventTags`; per-pair теги сохраняются в `pairwise`-провенансе.

5. **Multi-target candidate scope для `NKERNEL-DECISION-0`.** ✅ DECIDED
   2026-07-18: однотаргетный первый срез — `NKERNEL-DECISION-0` v1 покрывает
   только definitions, чьи легальные действия однотаргетны на момент вызова
   (`self`/`none`/`participant`/`counterparty`, и `all_others` лишь при
   `N = 2`); многотаргетный choice (fan-out кандидатов, (actionId, targetId)
   вместо actionId) уходит в тот же хвостовой ADR, что coalition goals/group
   payoff (§6 п.7) — не в объём этого среза. Совпадает с собственной
   дисциплиной эпика: `STEP-0` тоже начался forced-only, до эндогенного
   выбора в `CHOICE-0`.

Зафиксированная граница reuse (следствие §5.3 R7 и CONFLICT-DEFINITION-0):
pair-generic хелперы (`normalizeConflictState`, `applyConflictTransition`,
`validateJointAction`) и per-pair `resolveProtocolStep` переиспользуются через
один документированный type-adapter; ре-имплементация транзишна запрещена —
дрейф ловят оракулы редукции и pairwise-consistency.

## 6. Имплементационные срезы

1. **`NKERNEL-STEP-0`** — §3.1–§3.3 — ✅ IMPLEMENTED 2026-07-17 (pure-domain):
   `lib/dilemma/nkernel/types.ts` (`ConflictStateNV1` без лишних полей —
   диадический инстанс структурно равен kernel-состоянию; error union =
   kernel-коды + `invalid_participants`/`unsupported_strategy_mode_for_n`/
   `pair_step_failed`), `nstate.ts` (единственный документированный адаптер
   `asKernelConflictStateV1`, `normalizeConflictStateNV1`,
   `dyadicPairProjectionV1` с harvest-инвариантом `trace: []`,
   `buildTrustExchangeProtocolNV1`, `trustExchangeDefinitionNV1` с
   ре-валидацией v3), `nstep.ts` (`resolveConflictNStepV1` — парная
   декомпозиция §2, свёртки ADR §5.1/§5.4, один `applyConflictTransition` на
   N-уровне); `tests/dilemma/nkernel_step_v1.test.ts` (8): оракул редукции
   N=2 — все 9 joint-действий × оба режима, побайтно state/outcome/
   observations/utilities/profiles + 5-раундовая learning-цепочка;
   pairwise-consistency N=3 с численным пином свёрток; non-interference N=3
   (мутация `c→b` не трогает a-сторону, адресат меняется — «зубы»);
   fail-closed ×8; детерминизм + иммутабельность входа (N=4, 6 пар,
   12 фреймов).
2. **`NKERNEL-CHOICE-0`** — ✅ IMPLEMENTED 2026-07-18 (pure-domain):
   `lib/dilemma/nkernel/nchoice.ts` (`resolveConflictNChoiceStepV1`,
   провенанс `aggregatedUtilities` + `chosenActions`),
   `aggregateActionUtilitiesMeanV1` в `nstep.ts` (переиспользуется learn-веткой
   N-шага); фикстура вынесена в `tests/dilemma/nkernelFixtures.ts`;
   `tests/dilemma/nkernel_choice_v1.test.ts` (5): оракул редукции N=2 против
   НЕforced `resolveProtocolStep` (побайтно, single + 5-раундовая эндогенная
   цепочка), N=3 агрегация против независимого ручного mean, композиция
   репликатор→dominant, choice non-interference, детерминизм/иммутабельность,
   fail-closed passthrough; в step-тесте learn-N=3 кейс заменён позитивным
   пином профилей.
3. **`NKERNEL-TRAJECTORY-0`** — ✅ IMPLEMENTED 2026-07-18 (pure-domain):
   `lib/dilemma/nkernel/nanalysis.ts` (`stateDistanceNV1` — взвешенная
   евклидова норма по N агентам + N·(N−1) отношениям + env;
   `collapseScoreNV1`/`repairCapacityNV1` — средние по N агентам и N·(N−1)
   отношениям; cycle/divergence/metrics generic поверх) и
   `lib/dilemma/nkernel/ntrajectory.ts` (`runConflictNTrajectoryV1`:
   forced-шаг = N-step freeze как у array-формы ядра, шаг без forced =
   эндогенный NKERNEL-CHOICE-0). Санкционированное единственное дублирование:
   приватные squared-distance хелперы `analysis.ts` отзеркалены дословно —
   дрейф ловит побайтный N=2 оракул (`toBe` на каждой метрике).
   НАХОДКА оракула: kernel-раннер ре-нормализует state между шагами и это
   несущая семантика — `normalizeActionProbabilities` не идемпотентна
   побайтно, когда вероятность после деления падает ниже replicator-floor;
   межшаговая ре-нормализация отзеркалена. Тесты
   `tests/dilemma/nkernel_trajectory_v1.test.ts` (5): смешанное
   forced/эндогенное 6-шаговое расписание против `runConflictTrajectory`
   побайтно; все метрики против диадических оригиналов (`toBe` + `toEqual`
   полного `trajectoryMetrics` с perturbed-двойником); N=3 sanity/циклы;
   детерминизм; fail-closed passthrough.
4. **`NKERNEL-DEFINITION-BIND-0`** — ✅ IMPLEMENTED 2026-07-18 (pure-domain):
   `lib/dilemma/nkernel/ndefinitionbind.ts` (`resolveConflictActionTargetIdsV1`
   — fail-closed резолвер каждого §3.2/R7-§5.2 target-режима в конкретные
   `targetIds`, независимый от `validateConflictDefinitionV3` (defense-in-depth,
   как `dyadicPairProjectionV1`); `counterparty` при `N = 2` резолвится
   идентично `all_others` — тот же fold-of-one, что уже видит диада через
   `all_others` в `trustExchangeDefinitionNV1`; `projectConflictDefinitionV3ActionsV1`
   — проекция `legalActions` определения для `(actorRoleId, phaseId)` в новый,
   намеренно более узкий тип строки `ConflictActionProjectionRowNV1`, а не
   переиспользование `ConflictActionProjectionRow` — его `protocolId`/
   `kernelActionId` пришиты к kernel-литералам, от которых `conflict-definition-v3`
   осознанно отвязан через `string`). `tests/dilemma/nkernel_definition_bind_v1.test.ts`
   (7): оракул редукции N=2 — `all_others`-биндинг `trustExchangeDefinitionNV1`
   побайтно против диадического `projectLegalActions` (оба актора); `all_others`
   при `N = 3..5` в порядке participant-set; `self`/`none`/`participant` на
   ручном N=3 определении; роль без действий в фазе → пустой список строк, не
   ошибка; `counterparty` при `N = 2` ≡ `all_others`; fail-closed по каждому
   коду ошибки независимо от валидатора; детерминизм + иммутабельность входа.
   Gate: `tsc --noEmit` чист; 561 passed / 10 skipped / 0 failed; golden
   `efa018b3…` не сдвинут (`grep -rn "nkernel" lib` — только self-references).
5. **`NKERNEL-DECISION-0`** — ✅ IMPLEMENTED AS N=2 REDUCTION BOUNDARY:
   `lib/dilemma/integration/ndecisionProvider.ts`
   (`runConflictNJointDecisionV1` — N-аналог `runConflictJointDecisionV1`:
   тот же per-player цикл GoalLab-baseline → `projectConflictDefinitionV3ActionsV1`
   → gate `multi_target_not_supported` при `targetIds.length > 1` (ADR §5.5) →
   единственный документированный адаптер `toDyadicProjectionRowV1` в
   настоящий `ConflictActionProjectionRow` — минтит тот же опаковый
   `utilityCandidateId`, что и дыадический `candidateId()` (буквально то же
   значение при N=2, это и держит побайтный оракул) → переиспользованные
   `buildConflictPossibilities`/`resolveProjectedChoice` без изменений →
   `resolveConflictNStepV1` (срез 1) как canonical-транзишн,
   `resolveConflictNChoiceStepV1` (срез 2) как reference-lane вместо
   недforced `definition.step`). `tests/dilemma/nkernel_decision_v1.test.ts`
   тесты сохраняют побайтный оракул редукции N=2 против
   `runConflictJointDecisionV1`; любой `N = 3` фейлится рано с
   `n_decision_requires_dyad`, до projection/pipeline/RNG;
   детерминизм. Gate: `tsc --noEmit` чист; 566 passed / 10 skipped / 0 failed;
   golden `efa018b3…` не сдвинут; `grep -rn "ndecisionProvider\|runConflictNJointDecisionV1" lib`
   — только self-references, не в барреле `integration/index.ts`
   (wiring — задача `NKERNEL-SESSION-0`).
6. **`NKERNEL-SESSION-0`** — ✅ DYADIC WRAPPER (§3.6, за parity-gate,
   никогда default): `lib/dilemma/integration/nliveSession.ts`
   (`runConflictNLabSessionV1` — N-цикл канонической live-сессии поверх
   `runConflictNJointDecisionV1`; `buildCanonicalInitialStateNV1` — per-pair
   reuse `buildCanonicalInitialState` + anchor-partner-слияние;
   `worldForTickNV1` — закрытие §1.2-шва; RNG imul-цепь; общий
   `rngChannelId`-формат; definition override валидируется, но не обходит
   dyad-only boundary);
   N-полосы (`ndecisionProvider` + `nliveSession`) экспортированы из
   `integration/index.ts` — БЕЗ расширения главного барреля `lib/dilemma/index.ts`
   (он импортирует liveSession напрямую, integration-баррель туда не течёт);
   `tests/dilemma/nkernel_session_v1.test.ts`
   (8): побайтный N=2 initial-state оракул против `buildCanonicalInitialState`
   (default + pressure-override); побайтный N=2 session-оракул против
   `runConflictLabSessionV1` (per-round choices вкл. `rngChannelId`,
   canonical/reference actions + step state/outcome, divergence,
   `game.rounds`-соответствие; whole-run trajectory/initial/final/metrics
   против `conflictCore`; исключены by design: schemaVersion-поля, N-step-экстры
   `pairwise`/observations/utilities, V2-only confidence/summaries); пин
   channel-id-формата; N=3 → ранний `n_live_requires_dyad`; бюджеты
   `1..30` принимаются, остальные → `invalid_round_budget`; catalog-throw на unknown + disabled id;
   `authority_judgment` → `unsupported_mechanic` без fallback. Gate:
   `tsc --noEmit` чист; 574 passed / 10 skipped / 0 failed; golden `efa018b3…`
   не сдвинут; `liveSession.ts`/`lib/dilemma/index.ts` байтово не тронуты.
7. Хвост: coalition goals / group payoff — собственный ADR, вне первых срезов.
   Следующий кандидат-срез вне эпика: UI-полоса N-сессий в Dilemma Lab
   (explicit opt-in, диадический default) — по прецеденту R6 catalog-lane.

## 7. Пределы верификации

Документ инвентаризационный: доказательства §1 — чтение кода по указанным
путям. Утверждение «транзишн-хелперы pair-generic» проверено чтением циклов
(state.ts:31–52, engine.ts:420–434), не N-прогоном — исполнимое доказательство
приходит с тестами среза 1 (§6). Арифметика §2 проверена на малых N вручную.
Теорема редукции — утверждение о конструкции; её силу даёт только оракул
(«fold-of-one = тождество» верно лишь пока свёртка реализована как в §2 —
оракул и пинит это).
