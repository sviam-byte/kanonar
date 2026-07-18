# NKERNEL-FOUNDATION-0 — исполнимое N-ядро: инвентаризация + contract proposal

Статус: **ADR §5.1–§5.4 подписаны 2026-07-17; срезы 1–3 (`NKERNEL-STEP-0`, `NKERNEL-CHOICE-0`, `NKERNEL-TRAJECTORY-0`) РЕАЛИЗОВАНЫ.**
Дата: 2026-07-17.
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
  `NKERNEL-SESSION-0`.

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

### 3.5 N joint-decision provider — DEFERRED (`NKERNEL-DECISION-0`)
N-аналог `runConflictJointDecisionV1`: per-participant GoalLab S8 поверх
`ObservationViewV1`/`selectAllObservationViewsV1` и `BeliefGraphV1`.
Записанные инварианты потребителей: `makeNeutralOpponentBeliefPriorV1`
запрещает `observerId === targetId` (`self_target_forbidden`);
`buildBeliefGraphV1` fail-closed на дубликатах рёбер/участников.

### 3.6 N live session — DEFERRED (`NKERNEL-SESSION-0`)
За parity-gate (как R3/R5), никогда default. Записанный инвариант catalog-lane:
`getScenario` бросает на disabled/unknown id — правила канонической полосы
R6 применяются без изменений.

## 4. Сохраняемые инварианты

- Диадический `trust_exchange` kernel, его транзишн-уравнения и тесты не
  меняются; ни один существующий файл `lib/` не редактируется в срезе 1.
- Golden identity: no-profile семантический хеш `efa018b3…` не двигается;
  ни один NKERNEL-модуль не импортируется runtime-кодом (проверка:
  `grep -rn "nkernel" lib` — только self-references).
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
4. **`NKERNEL-DEFINITION-BIND-0`** — привязка v3-targets
   (`participant`/`all_others`) к исполнимым projection rows.
5. **`NKERNEL-DECISION-0`** — §3.5.
6. **`NKERNEL-SESSION-0`** — §3.6, за parity-gate, никогда default.
7. Хвост: coalition goals / group payoff — собственный ADR, вне первых срезов.

## 7. Пределы верификации

Документ инвентаризационный: доказательства §1 — чтение кода по указанным
путям. Утверждение «транзишн-хелперы pair-generic» проверено чтением циклов
(state.ts:31–52, engine.ts:420–434), не N-прогоном — исполнимое доказательство
приходит с тестами среза 1 (§6). Арифметика §2 проверена на малых N вручную.
Теорема редукции — утверждение о конструкции; её силу даёт только оракул
(«fold-of-one = тождество» верно лишь пока свёртка реализована как в §2 —
оракул и пинит это).
