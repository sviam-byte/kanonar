# Goal Lab Probe Harness — статический sign-аудит базиса (Шаг 0)

*Шаг 0 валидационного плана (kanonar_validation_plan_v0): заморозить динамику и
проверить базис как статическую карту вход→поведение. Гейт перед всем, что ниже
по течению — пока базис не подписан верно и различим, аттракторы/динамика строить
не на чем.*

Код: `lib/goal-lab/probe/` (TS). Аналитический триаж (Фаза 3+) — Python/fc-стек,
потребляет CSV-выгрузку.

> **⚠️ Оговорка про базис (важно для чтения результатов).** Первый прогон Фазы 3
> (таблица ниже) шёл на **синтетическом 0.5-агенте** (`buildProbeAgent`): 14 осей
> на 0.5, по одной свипается, **без архетипа / λ / биографии / life-goals**, и
> словарь осей из тест-фикстуры (не канонический schema). Поэтому вердикты
> **провизорные**: они показывают «проводка жива и подписана верно в центроиде», а
> не «реальный базис персонажей валиден». Реальная валидация — δ-свип вокруг
> базлайнов реального ростера (24 персонажа, ~52 оси) + отдельный аудит
> архетип-базиса; см. `docs/WORKLOG_2026-06-18_BASIS_AND_DYNAMICS.md`. До этого
> зелёные PASS ниже читать как «не мёртво и не перепутано», не более.

## Зачем два слоя readout'а

Проба показала: один слой недостаточен. Поэтому harness читает поведение с двух
уровней пайплайна S0–S9:

- **S7** — `goalLayerSnapshot.domains[].score01`. Дёшево, косвенно; часть осей
  здесь невидима (напр. Power не двигает goal-scores).
- **S8** — `decisionSnapshot.best` / `ranked[].q`. Прямо, но стохастично (Gumbel) →
  усредняется по N сидам.

## Файлы

| файл | роль | фаза |
|---|---|---|
| `runProbe.ts` | мультислойный экстрактор readout'ов (S6 drivers, S7 domains, S8 dist/Q/entropy, stress) | 0 |
| `scenes.ts` | батарея сцен (affordances через мир-контракт) | 1 |
| `sweep.ts` | свип оси 0→1 → long-format `{axis,value,scene,layer,readout,result}` + `toCsv` | 0 |
| `signTable.ts` | **пре-регистрированная** таблица знаков v1, наблюдаемая A (заморожена 2026-06-18) | 2 |
| `game.ts` | T1 outcome scorer: Game (verb→move→outcome→payoff), наблюдаемая B (заморожен 2026-07-02, SCENE_BATTERY §0-B) | T1 |
| `outcomeSignTable.ts` | **пре-регистрированная** таблица знаков v2 на исходах, 3 строки (заморожена 2026-07-02) | T1 |
| `tests/goals/probe_harness.test.ts` | контрактный gate (НЕ проверяет знаки — это эксперимент) | — |
| `tests/goals/outcome_scorer.test.ts` | контрактный gate наблюдаемой B (детерминизм, тотальность, `unclassified_rate === 0`) | T1 |

Точка входа в пайплайн — `runGoalLabPipelineV1({ world, agentId, participantIds,
manualAtoms })` (тот же, что в `tests/pipeline/decision_snapshot_trace_surface`).
Каждый сид строит мир заново через `scene.build(self)` и ставит `world.rngSeed`,
чтобы сиды не контаминировали друг друга.

## Батарея сцен (рабочий минимум)

| сцена | affordance | конструкты под тестом | слои |
|---|---|---|---|
| `S_neutral` | — (контроль; ловит «протекающие» сцены) | — | S7 |
| `S_vulnerable` | B ранен (pain 0.8, energy 0.2) + низкий clearance | Care, affiliation, Power-как-эксплуатация | S7+S8 |
| `S_hierarchy` | B clearance 3 + текущий лидер | Power, Autonomy, Procedure, Tradition | S8 |
| `S_threat` | hazard (fire 0.8) + враждебный B | Safety_Care, betrayal_cost, HPA_reactivity | S7+S8 |

`S_contest` / `S_defection` (дефицит ресурса, PD) — **после** payoff-харнесса
(Шаг 1); соответствующие строки sign-таблицы помечены `pending`.

## Дисциплина

- **Сцены = главное узкое место, не харнесс.** Без affordance пол-базиса ложно
  «мёртв». Какой affordance реально «садится» (vs читается dead) — эмпирический
  вопрос первого прогона (Фаза 3 триаж), не утверждение в коде.
- **Пре-регистрация знаков.** `signTable.ts` заморожен 2026-06-18. Если предсказание
  не сбывается — это находка (MISLABELED / NON-MONOTONE), а не повод править строку.
- **Контрактный тест ≠ эксперимент.** `probe_harness.test.ts` проверяет, что
  харнесс работает (оба слоя, свип, CSV), а НЕ направления эффектов.

## Как прогнать (gate)

```bash
npx vitest run tests/goals/probe_harness.test.ts
```

Затем — sweep + выгрузка CSV для триажа (пример):

```ts
import { sweepAxis, toCsv } from '@/lib/goal-lab/probe/sweep';
import { S_vulnerable } from '@/lib/goal-lab/probe/scenes';
const csv = toCsv(sweepAxis({ axis: 'A_Care_Compassion', scene: S_vulnerable }));
```

## Фаза 3 — триаж (прогнано 2026-06-18)

Драйвер `lib/goal-lab/probe/runBasisSweep.ts` свипит каждую активную строку
sign-таблицы × её сцену (+ контроль `S_neutral`) → `basis_sweep.csv`. Питон-триаж
классифицирует каждую ячейку:

```bash
python -m kanonar_behavior_lab.src.basis.triage   # -> data/reports/basis_triage.json
```

Главный результат: **базис жив и подписан верно, но пре-регистрированные readout'ы
указаны не на тот СЛОЙ.** Сигнал конструкта живёт в `act:prior:*` (S8), не в
goal-domain/util агрегатах:

| ось | пререги-readout: вердикт | реальные движители (act:prior) |
|---|---|---|
| A_Care_Compassion | `goal:affiliation`: **DEAD** (Δ+0.02) | treat +0.29, comfort +0.25, share_resource +0.22 ↑; threaten −0.19 ↓ → **PASS** |
| A_Power_Sovereignty | `act:dominate\|assert`: **ABSENT** (нет таких глаголов) | command +0.38, threaten +0.29, accuse +0.19 ↑ → **PASS** (Power невидим на S7, виден на S8) |
| A_Safety_Care | `goal:safety`: **DEAD** (0) | call_backup +0.25, guard +0.18, escort +0.11 ↑ → **PASS** |
| A_Liberty_Autonomy | `act:challenge_authority`: **ABSENT**, движителей нет | **DEAD** — настоящая дыра в S_hierarchy (плумбинг оси или affordance) |
| C_betrayal_cost | `goal:safety`: монотонно-вверх (не inv-U) | ctxDanger +0.53, affiliation −0.43, escape +0.38 → жив, в основном верно; inv-U не подтверждён → adjudicate |
| B_decision_temperature | `action_entropy`: **PASS** (range 1.9) | энтропия 0→2.2 (после фикса Gumbel) |
| D_HPA_reactivity | interaction | SKIP (нужен 2D stress×ось) |

Дисциплина соблюдена: sign-таблица НЕ переписана под результат. Вывод =
пере-указать readout'ы на `act:prior` в **v2** пре-регистрации (новая заморозка),
а не править замороженную v1.

### Побочный фикс (production bug)

Триаж вскрыл мёртвый Gumbel: `runPipelineV1` передавал в `decideAction`
`() => rng.next()` (сырой uint32), а тот ждёт `[0,1)` → шум клампился в константу,
exploration был выключен для ВСЕХ агентов. Исправлено на `nextFloat()` в
`runPipelineV1.ts` + `decide.ts` (защитно). Энтропия действий ожила (0→~2.2),
реагирует на temperature. Регрессий нет (269 тестов decision/pipeline/simkit/
goals/dilemma зелёные). Probe-агент теперь получает `rngChannels.decide` на сид.

## Дальше

- **v2 пре-регистрация** — пере-указать readout'ы на `act:prior` слой, заморозить, перепрогнать триаж.
- **Liberty_Autonomy DEAD** — проверить: маппинг оси → trait, и есть ли в S_hierarchy
  афорданс «бросить вызов/не подчиниться».
- Фаза 4 — коллинеарность effect-профилей + различимость θ (nested-CV/permutation/bootstrap).
- Шаг 1 — payoff-харнесс (PD/Stag Hunt) разблокирует `S_contest`/`S_defection`.
