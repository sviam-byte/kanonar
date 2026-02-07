# 5) Goal Lab: цели, утилиты, режимы, гистерезис

**Главный источник истины:** `lib/goals/goalAtoms.ts`.

Goal Lab — это слой, который строит:
- “экологию целей” `goal:domain:*`
- активные цели `goal:active:*` (top-N) и их стабилизацию (гистерезис)
- режим `goal:mode:*` (mixture-of-experts)
- `util:*` (проекция целей в утилитарное пространство)

## 5.1. Входы Goal Lab

1) `ctx:final:*` — **субъективный контекст** после S3.
2) `drv:*` — драйверы (если есть). Если драйверов нет, используется fallback на контекст.
3) `ctx:prio:*` — персональные веса важности контекстов.
4) опционально: `goal:lifeDomain:*` — “жизненные веса” доменов.

## 5.2. Приоритеты контекста: `amplifyByPrio`

Функция из `goalAtoms.ts`:

- вход: \(x\in[0,1]\) — величина контекста, \(p\in[0,1]\) — приоритет.
- коэффициент:
\[
 k(p)=0.6+0.8p\in[0.6,1.4]
\]
- результат:
\[
\mathrm{amplifyByPrio}(x,p)=\mathrm{clamp01}\big(0.5+(x-0.5)\,k(p)\big).
\]

Смысл: приоритет усиливает отклонение от нейтрали, но не меняет знак.

## 5.3. Экология доменных целей

Сейчас домены фиксированы (`GoalDomain`):
- safety, control, affiliation, status, exploration, order, rest, wealth.

Для каждого домена строится значение \(v\in[0,1]\) как смесь:
- контекстных сигналов (danger, uncertainty, normPressure, …)
- драйверов `drv:*` (если они заданы)
- life weights `goal:lifeDomain:*` (если заданы)

Пример (safety) из `goalAtoms.ts`:

Пусть \(D\) — усиленный `dangerW`, \(S\) — драйвер `drvSafety` (если есть), \(L\) — lifeSafety.

\[
base = \mathrm{clamp01}(0.60D + 0.40S)
\]
\[
v_{safety}=\mathrm{clamp01}(0.55\,base + 0.45\,L)
\]

Другие домены построены аналогично (см. `goalAtoms.ts`: блоки `ecology.push({...})`).

## 5.4. Каналы энергии → домены (карта весов)

В `goalAtoms.ts` задана матрица `DOMAIN_CHANNEL_WEIGHTS` — как каналы энергии (threat/uncertainty/norm/attachment/resource/status/curiosity/base) питают домены.

Это используется для explainability/SignalField и будущего «энергетического» вывода целей.

## 5.5. Mode selection (Mixture-of-Experts)

Выбор режима реализован в `lib/goals/modes.ts` и вызывается из `goalAtoms.ts` (`selectMode`).

Концептуально:

- есть набор режимов \(m\in M\) (например: deliberative/urgent/social/...);
- каждому режиму присваивается вес \(w_m\) как функция `ctx:final:*`, активных доменов и драйверов;
- режим выбирается либо argmax, либо мягко (в зависимости от реализации и temperature).

Результат материализуется как атом:
- `goal:mode:<selfId>` с `meta: { mode, weights }`.

## 5.6. Гистерезис активных целей

Функция выбора top-N: `selectActiveGoalsWithHysteresis` (`lib/goals/selectActive.ts`) + состояние `GoalState` (`lib/goals/goalState.ts`).

Идея:
- без памяти цели будут дрожать при малых изменениях сигналов;
- гистерезис задаёт *инерцию удержания* и *порог переключения*.

Контракт (что важно для документации/агентов):

1) активные цели должны быть стабильны при малых изменениях входов;
2) переключение должно требовать «существенного» выигрыша нового домена над старым (Δ-порог);
3) состояние цели (`goal:state:*`) должно содержать объяснимые компоненты (tension/lockIn/fatigue/progress).

## 5.7. Trace и explainability (обязательная часть Goal Lab)

Каждый derived-атом Goal Lab (`goal:domain:*`, `goal:active:*`, `goal:mode:*`, `goal:state:*`) обязан:

- ссылаться на `ctx:final:*` (не на сырой `ctx:*`), иначе субъективность не будет учитываться;
- сохранять ключевые величины расчёта в `trace.parts` (как сейчас сделано для доменов в `goalAtoms.ts`).

## 5.8. Практический “контракт правильности”

Если Goal Lab работает корректно, то для любого `selfId` после соответствующей стадии должны существовать:

- `goal:domain:<domain>:<selfId>` для всех доменов;
- `goal:active:<domain>:<selfId>` для top-N (или 0..N, если N меньше);
- `goal:mode:<selfId>`;
- `goal:state:<domain>:<selfId>` (если включено обновление состояния).
