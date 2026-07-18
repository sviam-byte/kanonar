# CONFLICT-PARITY-0 — dual-run parity evidence (canonical S8 vs kernel reference)

Audit repair 2026-07-18: goal-energy now follows canonical first-write-wins,
ranked traces carry per-candidate energy provenance, and one-sided ties are
excluded from concordance denominators. The full grid was regenerated. The
tracked artifact is compact (aggregate + capped divergence examples) and is
bound to system/policy/toolchain metadata plus a SHA-256 fingerprint of 77
relevant tracked source files; raw records are optional reproduction output.

Update 2026-07-12 (`GOALENERGY-UNION-DEFAULT`): the original all-profile OFF
default described below is superseded. `phase1` now enables the union;
`legacy` and no-profile/config remain OFF, and object-form `true|false`
preserves opt-in/rollback. The no-profile semantic golden is unchanged. The
Conflict provider live wiring was completed on 2026-07-12 through
`runConflictLabSessionV1`; the remaining generalized-mechanic work belongs to
R6, not to the trust-only R5 migration.

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
- Артефакт: `docs/unification/evidence/conflict_parity_0.json` (compact
  aggregate + capped divergence examples, без 432 raw records). Воспроизведение:

```powershell
$env:CONFLICT_PARITY_FULL='1'
$env:CONFLICT_PARITY_OUT='docs\unification\evidence\conflict_parity_0.json'
npm test -- --run tests/dilemma/conflictParityEvidence.test.ts
```

Optional raw records can be written outside the tracked artifact with
`CONFLICT_PARITY_RECORDS_OUT=<path>` in the same full-grid command.

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
| Selected actions | совпадение **45.1%** (joint: 25.0%) |
| Transition parity | при совпадении joint-действий **108/108** (payoffs, relations, strategyProfiles байт-в-байт; `learn_from_utility` ≡ kernel step) |

Распределение выбора:

| lane | trust | withhold | betray |
| --- | --- | --- | --- |
| canonical (Gumbel) | 390 (45%) | 252 (29%) | 222 (26%) |
| reference (argmax) | **864 (100%)** | 0 | 0 |

Совпадение по измерениям: temp default **0.375** / cool **0.528**;
rel allied 0.458 / neutral 0.458 / strained 0.438; agents и env — ровно 0.451
каждый; тики 0.31 / 0.54 / 0.50.

## 4. Семантическое чтение

1. **Порядки полезностей совпадают полностью.** На всей сетке
   canonical Q-ранжирование = kernel U-ранжирование = trust > withhold >
   betray (864/864). Матрица `conflict-impact-goal-matrix-v1` × goal energy
   упорядочивает действия так же, как kernel utility — противоречий в
   *направлении* utility на trust_exchange не обнаружено.
2. **Всё расхождение выбора — политика, не utility.** Reference —
   детерминированный argmax; canonical — версионированный seeded Gumbel.
   Наблюдаемые доли совпадают с softmax-предсказанием: при cool
   (T=0.3, ΔQ trust↔withhold ≈ 0.16) P(trust) ≈ 0.52 — измерено 0.528.
   Совпадение зависит только от температуры/сида/тика; пресеты отношений
   двигают его слабо (belief-модуляция меняет |ΔQ|, не порядок).
3. **Несоизмеримость масштабов utility.** Kernel U живёт в диапазоне
   ±2.6; canonical Q на этой сетке остаётся примерно в [−0.43, −0.04].
   Политика Gumbel масштабо-чувствительна через температуру: при живом
   диапазоне температур (T=0.3…1.75) канонический выбор остаётся
   исследовательским там, где kernel всегда жаден. Это **не дефект**, а
   зафиксированное ADR-решение (§2, §6: температурный закон общий, без
   conflict-local поправок) — но масштаб Q надо иметь в виду при чтении
   диверсий.
4. **Belief-модуляция и safety energy живы.** First-write-wins сохраняет
   первый canonical `goal:domain:safety:*` atom, поэтому threat/safety вклад
   больше не обнуляется более поздним duplicate. Ranked traces называют
   конкретный energy atom для каждого использованного goal.
5. **Kernel-сторона на этой сетке никогда не предпочитает betray/withhold**
   — даже def-def × strained × pressured даёт U(trust) > U(withhold) >
   U(betray). Дивергенция «canonical выбрал betray, reference trust» — это
   исследование canonical-линии, а не конфликт оценок.

### Remaining methodology limitation

- Scene evidence статично по тикам роллаута: beliefs не обновляются от
  конфликтных действий (это отдельная миграция belief-update поверх
  kernel-переходов); kernel-память при этом живёт через
  `learn_from_utility`.

## 5. Следствия для очереди

1. **GOALENERGY-UNION-DEFAULT закрыт:** `phase1` включает union; canonical
   first-write-wins и source atom provenance закреплены тестами.
2. **Live wiring провайдера в Conflict Lab UI закрыт:** parity-блокеров нет —
   legal set, trace, transition эквивалентны, ranking согласован. Осознанно
   принять: канонический выбор стохастичен по контракту политики; в UI
   должна быть видна температура и sampling pool (поля уже в трейсе).
3. **Q-scale заметка для R6**: при generalized schema дельты новых механик
   проходят ту же матрицу — держать |ΔQ| в сопоставимом масштабе или
   документировать температурную чувствительность.
4. Duplicate `goal:domain:*` atoms больше не меняют score: canonical array
   order определяет победивший atom, а trace делает выбор проверяемым.

## 6. Изменённые файлы

- `lib/config/runtimeMechanics.ts` — `goalEnergyDomainUnionV1` (+ override).
- `lib/decision/actionCandidateUtils.ts` — union-режим goal-energy map.
- `lib/dilemma/integration/types.ts`, `decisionProvider.ts` — per-candidate
  goal-energy source provenance in ranked Conflict traces.
- `lib/goal-lab/pipeline/runPipelineV1.ts` — проброс флага в S8.
- `lib/dilemma/integration/decisionProvider.ts` — явный opt-in + трейс-поле.
- `lib/dilemma/integration/candidateBridge.ts` — S0 dyad фоллбэк.
- `lib/dilemma/integration/paritySweep.ts` — экстракция/агрегация evidence.
- `docs/unification/evidence/conflict_parity_0.json` — compact aggregate,
  divergence examples, policy/toolchain metadata and source fingerprint.
- `tests/decision/goal_energy_domain_union.test.ts`,
  `tests/dilemma/conflictIntegration.test.ts`,
  `tests/dilemma/conflictParityEvidence.test.ts` — регрессии + харнесс.

## 7. Live migration result (2026-07-12)

- Active UI entrypoint: `runConflictLabSessionV1`.
- Authoritative trust path: per-player GoalLab S8 choice → typed projected
  action → `forcedJointActions(learn_from_utility)` → kernel next state.
- Reference path: autonomous kernel replicator + argmax, retained in every
  `ConflictJointDecisionReportV1`; divergence remains visible data.
- UI/export surfaces expose policy/version, temperature/source, topK, sampling
  pool membership, Q/sample scores, `usedAtomIds` and divergence.
- Non-trust scenarios remain legacy compatibility runs with explicit
  `unsupported_kernel`; no provider failure falls back to the legacy chooser.
- Regression: `tests/dilemma/liveTrustExchangeRuntime.test.ts` covers
  authoritative round/history alignment, multi-round state folding,
  determinism and the unsupported compatibility lane.
