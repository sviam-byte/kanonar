# CONFLICT-CHOICE-ADR-0 — владелец utility и final choice в Conflict runtime

Статус: ACCEPTED. Дата решения: 2026-07-11. Runtime и tests не изменялись
(doc-only ADR). Входные артефакты: ADR_0.md §1/§8, CONFLICT_GAP_0.md
(строка `choice` gap-матрицы), TOM_SPEC_0.md, OBSERVATION_CONTRACT_0.md.

## Context

В репозитории три живые политики выбора действия, каждая со своей
семантикой и trace:

1. **Canonical kernel** (`lib/dilemma/dynamics/engine.ts:134-169`):
   `evaluateTrustExchangeUtilities` → `updateStrategyProfileReplicator`
   (`p_next ∝ p_prev · exp(η·U)`, нормализация по action order) →
   `selectDominantAction` — детерминированный argmax по вероятностям
   профиля, tie-break порядком протокола. RNG нет; atom-provenance нет;
   входы — kernel-local state, не beliefs.
2. **Legacy runner `runDilemmaV2`** (`lib/dilemma/runner.ts:335-345, 1103-1120`):
   собственный `computeQ`/`scoreActions`, затем seeded Gumbel-max
   `q/T + (−log(−log u)))` с per-player RNG (`makeRng(seed)`,
   `seed·2654435761` для второго игрока) и температурой из оси персонажа
   `T = 0.3 + 1.4·B_decision_temperature`. Q без `usedAtomIds`; отношения
   инициализируются fallback-ами (`initTomForCharacters`/`computePairTrust`).
3. **GoalLab S8** (`lib/decision/decide.ts:134+`,
   `lib/goal-lab/pipeline/runPipelineV1.ts:1203-1220`): ранжирование по Q
   (S8 контракт с `usedAtomIds`/parts), кап пула `topK` (ledger
   TOPK-POOL-CAP), tie-band подпул (`FC.actionScoring.exploration`:
   tieBand/tieTopK/tieTemperatureMultiplier), выбор seeded Gumbel-max
   `qUsed/effT + noise` c полной метадатой сэмпла (qUsed, noise,
   sampleScore, inTieBand, marginFromBest) в trace.

ADR-0 §1 отдал GoalLab cognition/utility, но явно отложил владение финальным
выбором Conflict Lab. CONFLICT-GAP-0 требует «explicit versioned policy» и
dual-run сравнение. Этот ADR закрывает отложенное решение.

## Decision

### 1. Utility владеет GoalLab S8

Каноническая utility конфликтного действия — S8 `Q` из
`runGoalLabPipelineV1`, вычисленная над typed-проекцией legal actions
активной механики (projection row из CONFLICT_GAP_0 §Proposed next
contract; типы — CONFLICT-DEFINITION-0). Входные beliefs — канонические
`tom:belief:final:*` (TOM_SPEC_0), не истинные свойства цели.

`evaluateTrustExchangeUtilities` сохраняется как **reference evaluator**:
он продолжает питать replicator-профиль, canonical dynamics tests и
dual-run сравнение. Он не является второй канонической utility.

### 2. Final choice владеет versioned-политика `goal_lab_s8_gumbel_v1`

Единственная политика, которой разрешено порождать canonical joint action
в интегрированном Conflict runtime, — текущая S8-политика `decideAction`:

```text
policyId: goal_lab_s8_gumbel
policyVersion: 1
ranking: Q (S8 contract)
pool: topK cap → tie-band subpool (FC.actionScoring.exploration)
choice: argmax over pool of qUsed/effectiveT + Gumbel(u), seeded
```

Любое изменение семантики пула, температуры или шума — bump
`policyVersion`, а не молчаливая правка. Политики (1) kernel
replicator+argmax и (2) runner Gumbel получают статус
**reference/compatibility policy** соответственно; ни одна из них не
удаляется этим ADR.

### 3. Шов интеграции — существующий `forcedJointActions`

Внешний выбор входит в kernel через уже существующий механизм:
`resolveProtocolStep(state, protocol, { forcedJointActions })` +
`validateJointAction` (`lib/dilemma/dynamics/engine.ts:205-212`). Kernel
сохраняет полное владение валидацией, joint resolution, payoff, transition
и termination (ADR-0 §2). Изменение формул kernel для интеграции не
требуется; недопустимое действие GoalLab отклоняется валидатором kernel,
а не «подправляется» адаптером.

### 4. Replicator-профиль остаётся state/learning-артефактом

`updateStrategyProfileReplicator` продолжает обновлять strategy profile в
kernel state (это learning-динамика, покрытая canonical dynamics tests).
`selectDominantAction` теряет choice-authority в canonical integrated
mode, но остаётся выбором reference-режима и стороной dual-run сравнения.
Решение о том, остаётся ли replicator-update в интегрированных transitions
или становится trace-only, принимается в CONFLICT-INTEGRATION-0 по
результатам parity (не здесь).

### 5. Wire-контракт choice trace

Canonical choice обязан нести:

```text
policyId + policyVersion
seed / named rng-channel id
temperature + источник температуры
pool membership (topK cap, tie-band, effectiveT)
per-candidate: qUsed, noise, sampleScore, inTieBand, marginFromBest
usedAtomIds (S8 provenance)
projected kernelActionId + protocolId + phaseId (projection row)
schemaVersion
```

Это соединяет S8 candidate ↔ kernel action ↔ outcome в один joined trace
(required gap 4 из CONFLICT-GAP-0).

### 6. Seed и температура — fail-closed

- RNG только из именованных seeded-каналов хоста (SimKit decide channel
  или явный seed прогона). Текущий neutral-fallback `() => 0.5` в
  pipeline допустим для лабораторных прогонов GoalLab, но в canonical
  Conflict-режиме отсутствие decide-канала — validation error
  (fail-closed), не тихая детерминизация.
- Температура берётся из compiled behavioral params наблюдателя через
  S8-вход (та же зависимость, что у GoalLab/SimKit), а не из
  conflict-локальной формулы. Runner-формула `0.3 + 1.4·B_decision_temperature`
  остаётся compatibility-деталью runner-а.

### 7. Dual-run parity mode (CONFLICT-6.3) — обязательный этап миграции

До объявления parity оба контура выполняются рядом: canonical policy
выбирает, reference-политики вычисляются и записываются. Сравниваются
legal actions, ranking, selected action, transition, полнота trace.
Расхождение — данные для анализа, не повод молча предпочесть один
результат (ADR-0 §8). Цель — понять семантические различия, а не добиться
идентичного выбора.

## Alternatives considered

### Kernel replicator+argmax как canonical choice

Rejected. Нет atom-provenance и belief-входа (нарушает ADR-0 §1 и
TOM_SPEC_0: решение должно зависеть от beliefs, не от истинных свойств);
детерминированный argmax скрывает near-tie структуру, которую измеряют
спайновые гейты; появился бы второй владелец cognition.

### Runner seeded Gumbel как canonical choice

Rejected. `runDilemmaV2` — compatibility boundary (ADR-0 §8): приватный
Q без provenance, fallback-инициализация отношений из истинных свойств
(CONFLICT_GAP_0 §Traits and relations). Семейство политики при этом то же
(Gumbel-max), поэтому миграция сохраняет поведенческий характер выбора.

### Новая, третья политика «специально для конфликтов»

Rejected для V1. Это добавило бы третью семантику до того, как первые две
сравнены dual-run-ом. Versioned policy contract (§2) оставляет место для
эволюции без молчаливых замен.

### Детерминированный argmax только для конфликтов

Rejected. Разорвал бы сравнимость поведения с GoalLab/SimKit прогонами
тех же персонажей; tie-band пул уже даёт ограниченную и трассируемую
эксплорацию.

## Tests

Замороженные (не меняются этим ADR и не должны меняться интеграцией):

- `tests/dilemma/conflictDynamics.test.ts`, `dynamicsCore.test.ts`,
  `mechanicProtocols.test.ts`, `canonicalBridge.test.ts` — kernel
  reference-режим обязан проходить их без перекалибровки.

Новые (реализуются в CONFLICT-INTEGRATION-0, не здесь):

- determinism: same scene + beliefs + policyVersion + seed ⇒ same
  projected joint action;
- fail-closed: отсутствие rng-канала в canonical conflict-режиме — ошибка;
- projection round-trip `trust | withhold | betray` (из CONFLICT-GAP-0);
- dual-run артефакт: обе политики записаны, расхождение видно в trace;
- trace completeness: policyId/Version, usedAtomIds, sample-метадата
  присутствуют у выбранного действия.

Изменяемых существующих tests этим ADR — ноль (doc-only).

## Consequences

Positive: один владелец utility и выбора; kernel остаётся чистым
владельцем механики; существующий `forcedJointActions` делает интеграцию
адаптерной, без правки формул; политика версионирована и заменяема.

Costs: до parity живут три политики (canonical + два reference) — это
осознанная цена дисциплины ADR-0 §8; canonical Conflict-режим требует
seeded-канал (лабораторные страницы должны его прокидывать).

## Unblocked / order

Этот ADR разблокирует `CONFLICT-DEFINITION-0` (typed projection row +
immutable runtime contract для `trust_exchange`), затем
`CONFLICT-INTEGRATION-0` (адаптер DecisionProvider поверх шва §3 +
dual-run). Generalized schema/constructor — R6, после.

## Acceptance evidence

- Все три политики описаны с точными путями и семантикой формул.
- Решения utility/choice/seam/versioning/trace приняты явно;
  открытое (судьба replicator-update в transitions) названо и адресовано
  CONFLICT-INTEGRATION-0.
- Альтернативы отклонены с причинами, ссылающимися на принятые ADR.
- `git diff` подтверждает: runtime и существующие tests не тронуты.
