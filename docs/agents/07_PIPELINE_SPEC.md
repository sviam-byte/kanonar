# 7) Pipeline Spec — фактическая реализация `runGoalLabPipelineV1` (S0…S8)

Документ фиксирует *что считается корректным состоянием* на каждой стадии.

**Почему это нужно агентам:** они будут читать/производить атомы, и без строгого контракта легко получить “тихие” баги: цели считаются из сырого контекста, линза применена дважды, trace ломается, и т.п.

## 7.1. Базовые понятия

- **Atom** — минимальная единица знания/сигнала (см. `lib/context/v2/types.ts`).
- **Trace** — объяснимость: `trace.usedAtomIds` задаёт зависимость derived-атомов.
- **Stage** — детерминированный шаг обработки набора атомов.

Контракт атома:

- `id` уникален;
- `magnitude` обычно в [0,1] для “психологических” сигналов;
- `confidence` в [0,1];
- для derived-атомов обязателен `trace.usedAtomIds` без self-cycle.

## 7.2. S0 — вход мира (world/obs)

**Назначение:** загрузить факты мира и наблюдения.

Ожидаемые namespaces:

- `world:*` — факты (локация, контроль, доступ, ресурсы).
- `obs:*` — наблюдения (сенсорные данные, события сцены).

Инварианты:

- S0 *не должен* создавать `ctx:*`, `goal:*`, `tom:*`.

## 7.3. S1 — нормализация/санитация

**Назначение:** привести входные атомы к формату v2 (`normalizeAtom`).

Ожидаемые эффекты:

- все `id/ns/origin/magnitude/confidence` валидны;
- NaN и бесконечности обнулены/клиппнуты;
- `trace.usedAtomIds` (если есть) санитизирован.

## 7.4. S2 — сенсоры → сырой контекст `ctx:*`

**Назначение:** преобразовать `world/obs` в “сырые” контекстные оси.

Ожидаемые namespaces:

- `ctx:<axis>:<selfId>` для осей из `ContextAxisId` (`types.ts`), минимум:

  danger, uncertainty, normPressure, publicness, surveillance, intimacy, hierarchy, control, timePressure, secrecy, legitimacy.

Контракт:

- `ctx:*` ещё не субъективный (одинаков для всех при одинаковом world/obs);

- `trace.usedAtomIds` должен ссылаться на `world:*`/`obs:*`.

## 7.5. S2.5 — traits/body для линзы (`feat:char:*`)

**Назначение:** обеспечить параметры, которые читает линза.

Ожидаемые namespaces (минимум):

- `feat:char:<selfId>:trait.paranoia`

- `feat:char:<selfId>:trait.sensitivity`

- `feat:char:<selfId>:trait.experience`

- `feat:char:<selfId>:trait.ambiguityTolerance`

- `feat:char:<selfId>:trait.hpaReactivity`

- `feat:char:<selfId>:trait.normSensitivity`

- `feat:char:<selfId>:body.stress`

- `feat:char:<selfId>:body.fatigue`

Источники:

- либо напрямую из `CharacterEntity` (если где-то маппится),

- либо как derived из комбинации `vector_base` + текущего `world/obs` (в зависимости от архитектуры сенсоров).

Инвариант:

- если линза читает атом, он обязан существовать до S3, иначе будет fallback и персонажи «усреднятся».

## 7.6. S3 — CharacterLens: `ctx:* → ctx:final:*`

**Назначение:** применить субъективность агента к контексту.

Ожидаемые namespaces:

- `ctx:final:<axis>:<selfId>` для ключевых осей.

Контракт:

- не перетирать `ctx:*`; только добавлять `ctx:final:*`.

- `trace.usedAtomIds` должен включать исходные `ctx:*` и `feat:char:*` (см. `03_CHARACTER_LENS.md`).

## 7.7. S4 — ToM: `tom:dyad:*` (+ опционально `tom:dyad:final:*`)

**Назначение:** посчитать отношения A о B.

Ожидаемые namespaces:

- `tom:dyad:<metric>:<A>:<B>` где metric ∈ {liking,trust,fear,respect,closeness,dominance}.

- если применяем “линзу к ToM” — `tom:dyad:final:<metric>:<A>:<B>`.

Trace:

- должен ссылаться на `vector_base`-связанные атомы/конфиги (или их материализацию), а не быть «магией без причин».

## 7.8. S5 — Goal Lab: `goal:*`

**Назначение:** построить цели/режим/активные цели/состояние.

Ожидаемые namespaces:

- `goal:domain:<domain>:<selfId>` для всех доменов

- `goal:active:<domain>:<selfId>` для top-N

- `goal:mode:<selfId>`

- `goal:state:<domain>:<selfId>` (если включено)

Контракт:

- Goal Lab должен использовать `ctx:final:*` (иначе субъективность не будет учтена).

## 7.9. S6 — Utilities: `util:*`

**Назначение:** превратить цели в утилитарные сигналы для выбора действий.

(Конкретная реализация может меняться; важен контракт trace.)

Контракт:

- `util:*` должен иметь trace, ведущий к `goal:*` и `ctx:final:*`.

## 7.10. S7 — Actions: `action:*`

**Назначение:** сгенерировать кандидаты действий и их скоры/веса.

Контракт:

- кандидаты действий должны ссылаться на util/goal/context источники;

- выбор (policy) должен быть воспроизводимым при фиксированном seed/temperature.

## 7.11. S8 — Possibilities / Access / Priors / Decision

**Назначение:** сформировать кандидаты действий, рассчитать веса (ранжирование), выбрать решение.

Контракт:

- `action:*` атомы должны ссылаться на `util:*` и `ctx:final:*` (goal isolation).
- ранжирование и выбор детерминированы при фиксированном seed/temperature.

**Важно:** текущий S8 **не делает World update**. Он возвращает `action:*` и вспомогательные артефакты (ranked/best/intentPreview).
