# CONFLICT-PARITY-0 — dual-run parity evidence (canonical S8 vs kernel reference)

Статус: **DONE — evidence collected, два дефекта интеграции найдены и исправлены**
Дата: 2026-07-12
Основание: план §CONFLICT-6.3 (dual-run parity mode), CONFLICT_CHOICE_ADR_0 §7
(«divergence is data, never silently resolved»).

Цель прогона — **не** добиться одинакового выбора в обеих линиях, а измерить и
объяснить семантические различия между:

- **canonical lane**: per-player GoalLab pipeline → S8 Q над typed-проекцией →
  `goal_lab_s8_gumbel_v1` → `forcedJointActions(learn_from_utility)`;
- **reference lane**: kernel-внутренний replicator-update → argmax
  (`resolveProtocolStep` без forced actions).

## 1. Методология

- Харнесс: `tests/dilemma/conflictParityEvidence.test.ts`;
  экстракция/агрегация: `lib/dilemma/integration/paritySweep.ts`
  (`conflict-parity-evidence-v1`, чистый модуль без I/O).
- Сетка `conflict-parity-grid-v1`: отношения {allied, neutral, strained} ×
  пары агентов {coop-coop, coop-def, def-def} × среда {calm, pressured} ×
  температура {default 0.5, cool 0.12 — `vector_base.B_decision_temperature`}
  × 4 сида × роллаут 3 тика (canonical-ветка ведёт состояние) =
  **432 joint decisions / 864 player-decisions**.
- Отношения зеркалируются в обе линии: kernel `relations` и legacy
  `world.tom[traits]` (S0 dyad-атомы → S5 decoder prior → `tom:belief:final:*`;
  профиль `phase1`, dual-emit ON).
- Оси сравнения (план §CONFLICT-6.3): legal actions, selected actions,
  utility ranking, state transition, trace completeness.
- Артефакт: `docs/unification/evidence/conflict_parity_0.json` (агрегат +
  все 432 записи). Воспроизведение:

```powershell
$env:CONFLICT_PARITY_FULL='1'
$env:CONFLICT_PARITY_OUT='docs\unification\evidence\conflict_parity_0.json'
node node_modules\vitest\vitest.mjs run tests/dilemma/conflictParityEvidence.test.ts
```

Гейт-режим (без env) гоняет фиксированное подмножество 2 ячейки × 2 сида ×
2 тика + байт-детерминизм одной ячейки (~5 с).

## 2. Найденные и исправленные дефекты

Первый прогон (216 решений, до фиксов) дал `canonical Q ≡ −0.2` у **всех**
кандидатов во **всех** записях — канонический выбор был чистым Gumbel-шумом.
Диагностика вскрыла два разрыва.

### F1. Плоский Q: goal-energy словарь затенял доменные дельты

`buildGoalEnergyMap` при наличии хотя бы одного `util:activeGoal:*` атома
делал early-return и не читал `goal:domain:*`. Конфликтный мост (и SimKit
offers) пишут `deltaGoals` в **доменном** словаре (affiliation/safety/…), а
энергия отдавалась только в словаре **активных целей** (maintain_cohesion/…).
Словари не пересекаются → `Σ E_g·Δg ≡ 0` → `Q = −cost` у всех кандидатов.

**Фикс**: механика `runtimeMechanics.goalEnergyDomainUnionV1`
(`actionScoring.goalEnergyDomainUnionV1`) — объединение словарей, активные
цели в приоритете при коллизии. **Default OFF во всех профилях** (legacy,
phase1, config) — глобальное включение требует отдельного решения с
golden-перепином, т.к. затрагивает любой S8-прогон с offer-кандидатами.
`runConflictJointDecisionV1` включает механику явно (трейс:
`goalEnergyMode: 'domain-union-v1'`). Регрессии:
`tests/decision/goal_energy_domain_union.test.ts` (легаси-инвариантность,
union-дифференциация, приоритет коллизий, эквивалентность при пустых активных
целях) + Q-дифференциация в `tests/dilemma/conflictIntegration.test.ts`.

### F2. Belief-слепота моста при выключенном S5-слое

`readBeliefMetric` в `candidateBridge` не читал S0-формат легаси-атомов
(`tom:dyad:{self}:{other}:{metric}` из `extractTomDyadAtoms`) — только
metric-first формы. Без `tom:belief:final:*` (флаг OFF) belief-сигналы
падали в нейтраль 0.5/0.5, и Q был идентичен в allied и strained ячейках.
S8-шный `tomRead` этот формат читает; мост теперь тоже (фоллбэк последним,
канонические belief-атомы по-прежнему первыми). Регрессия — «falls back to
S0 legacy dyad atoms» в `conflictIntegration.test.ts`.

## 3. Числа (финальный прогон, 432 решения)

| Ось | Результат |
| --- | --- |
| Legal actions | совпадение 100% (проекция ≡ kernel action order) |
| Trace completeness | 100% (ranked=rows, atoms, pool, единственный chosen) |
| Utility ranking | top-1 = **1.000**, конкордантность пар Q↔U = **1.000** |
| Selected actions | совпадение **44.4%** (joint: 23.6%) |
| Transition parity | при совпадении joint-действий **102/102** (payoffs, relations, strategyProfiles байт-в-байт; `learn_from_utility` ≡ kernel step) |

Распределение выбора:

| lane | trust | withhold | betray |
| --- | --- | --- | --- |
| canonical (Gumbel) | 384 (44%) | 252 (29%) | 228 (26%) |
| reference (argmax) | **864 (100%)** | 0 | 0 |

Совпадение по измерениям: temp default **0.375** / cool **0.514**;
rel allied 0.458 / neutral 0.458 / strained 0.417; agents и env — ровно 0.444
каждый; тики 0.31 / 0.54 / 0.48.

## 4. Семантическое чтение

1. **Порядки полезностей совпадают полностью.** На всей сетке
   canonical Q-ранжирование = kernel U-ранжирование = trust > withhold >
   betray (864/864). Матрица `conflict-impact-goal-matrix-v1` × goal energy
   упорядочивает действия так же, как kernel utility — противоречий в
   *направлении* utility на trust_exchange не обнаружено.
2. **Всё расхождение выбора — политика, не utility.** Reference —
   детерминированный argmax; canonical — версионированный seeded Gumbel.
   Наблюдаемые доли совпадают с softmax-предсказанием: при cool
   (T=0.3, ΔQ trust↔withhold ≈ 0.16) P(trust) ≈ 0.52 — измерено 0.514.
   Совпадение зависит только от температуры/сида/тика; пресеты отношений
   двигают его слабо (belief-модуляция меняет |ΔQ|, не порядок).
3. **Несоизмеримость масштабов utility.** Kernel U живёт в диапазоне
   ±2.6; canonical Q на этой сетке — в [−0.40, −0.04] (дельты ≤ 0.36).
   Политика Gumbel масштабо-чувствительна через температуру: при живом
   диапазоне температур (T=0.3…1.75) канонический выбор остаётся
   исследовательским там, где kernel всегда жаден. Это **не дефект**, а
   зафиксированное ADR-решение (§2, §6: температурный закон общий, без
   conflict-local поправок) — но масштаб Q надо иметь в виду при чтении
   диверсий.
4. **Belief-модуляция жива и направленно верна**: trust-Q A→B
   allied −0.041 / neutral −0.077 / strained −0.113 (реципрокность растёт с
   believed trust); withhold/betray Q от пресета не зависят — см. quirk (b).
5. **Kernel-сторона на этой сетке никогда не предпочитает betray/withhold**
   — даже def-def × strained × pressured даёт U(trust) > U(withhold) >
   U(betray). Дивергенция «canonical выбрал betray, reference trust» — это
   исследование canonical-линии, а не конфликт оценок.

### Quirks, зафиксированные попутно (не исправлялись)

- (a) Дубликат `goal:domain:safety:{id}` атомов в S8-наборе: второй (0)
  затирает первый (0.077) в goal-energy map → эффективная E_safety = 0.
- (b) Как следствие (a), threat-ветка belief-модуляции
  (`betrayal/threat → safety`) не влияет на Q — безопасностные дельты
  умножаются на нулевую энергию.
- (c) Scene evidence статично по тикам роллаута: beliefs не обновляются от
  конфликтных действий (это отдельная миграция belief-update поверх
  kernel-переходов); kernel-память при этом живёт через
  `learn_from_utility`.

## 5. Следствия для очереди

1. **GOALENERGY-UNION-DEFAULT** (новый тикет): решить глобальный default
   `goalEnergyDomainUnionV1` (как минимум phase1 ON) — иначе SimKit
   tactical deltas продолжают обнуляться в Q при активных целях. Требует
   golden-прогона/перепина semantic-subset.
2. **Live wiring провайдера в Conflict Lab UI**: parity-блокеров нет —
   legal set, trace, transition эквивалентны, ranking согласован. Осознанно
   принять: канонический выбор стохастичен по контракту политики; в UI
   должна быть видна температура и sampling pool (поля уже в трейсе).
3. **Q-scale заметка для R6**: при generalized schema дельты новых механик
   проходят ту же матрицу — держать |ΔQ| в сопоставимом масштабе или
   документировать температурную чувствительность.
4. Чистка дубликата `goal:domain:*` эмиссии — маленький тикет до R2b.

## 6. Изменённые файлы

- `lib/config/runtimeMechanics.ts` — `goalEnergyDomainUnionV1` (+ override).
- `lib/decision/actionCandidateUtils.ts` — union-режим goal-energy map.
- `lib/goal-lab/pipeline/runPipelineV1.ts` — проброс флага в S8.
- `lib/dilemma/integration/decisionProvider.ts` — явный opt-in + трейс-поле.
- `lib/dilemma/integration/candidateBridge.ts` — S0 dyad фоллбэк.
- `lib/dilemma/integration/paritySweep.ts` — экстракция/агрегация evidence.
- `tests/decision/goal_energy_domain_union.test.ts`,
  `tests/dilemma/conflictIntegration.test.ts`,
  `tests/dilemma/conflictParityEvidence.test.ts` — регрессии + харнесс.
