# Артефакты программы объединения лабораторий

Программа: `docs/LAB_UNIFICATION_PLAN.md` (proposal v4).
Здесь лежат результаты выполненных карточек.

| карточка | артефакт | статус | дата |
| --- | --- | --- | --- |
| VERIFY-0 | [VERIFY_0.md](VERIFY_0.md) | DONE | 2026-07-10 |
| TEST-0 | [TEST_0.md](TEST_0.md) | DONE | 2026-07-10 |
| BASELINE-0 | [BASELINE_0.md](BASELINE_0.md) | DONE | 2026-07-10 |
| DETERMINISM-SWEEP-0 | [DETERMINISM_SWEEP_0.md](DETERMINISM_SWEEP_0.md) | DONE | 2026-07-10 |
| MAP-0 | [MAP_0.md](MAP_0.md) | DONE — **ожидает human review** | 2026-07-10 |
| ADR-0 | [ADR_0.md](ADR_0.md) | DONE | 2026-07-11 |
| CONFLICT-GAP-0 | [CONFLICT_GAP_0.md](CONFLICT_GAP_0.md) | DONE — projection decision required before integration | 2026-07-11 |
| TOM-INVENTORY-0 | [TOM_INVENTORY_0.md](TOM_INVENTORY_0.md) | DONE — TOM-SPEC decisions listed | 2026-07-11 |
| METRIC-INVENTORY-0 | [METRIC_INVENTORY_0.md](METRIC_INVENTORY_0.md) | DONE — false zeros and source gaps listed | 2026-07-11 |
| SCENE-INVENTORY-0 | [SCENE_INVENTORY_0.md](SCENE_INVENTORY_0.md) | DONE — ownership ADRs listed | 2026-07-11 |
| OBSERVATION-CONTRACT-0 | [OBSERVATION_CONTRACT_0.md](OBSERVATION_CONTRACT_0.md) | ACCEPTED | 2026-07-11 |
| TOM-SPEC-0 | [TOM_SPEC_0.md](TOM_SPEC_0.md) | ACCEPTED | 2026-07-11 |
| SCENE-OWNERSHIP-ADR-0 | [SCENE_OWNERSHIP_ADR_0.md](SCENE_OWNERSHIP_ADR_0.md) | ACCEPTED | 2026-07-11 |
| CONFLICT-CHOICE-ADR-0 | [CONFLICT_CHOICE_ADR_0.md](CONFLICT_CHOICE_ADR_0.md) | ACCEPTED | 2026-07-11 |

## Открытые тикеты, порождённые R1

1. **GOLDEN-DRIFT — CLOSED, oracle re-scoped 2026-07-11**: semantic sorts
   используют `codeUnitCompare` и защищены
   `tests/determinism/collation_boundary.test.ts`. Верификация 2026-07-11
   (clean worktrees, lockfile не менялся, Node v24.11.1): pin `4352ad74…`
   ЖИВ в env A — воспроизводится байт-в-байт и на 7be8f15 (пин-коммит), и на
   2822bff. `e925be50…` — ТРЕТЬЯ пер-средовая линия (sandbox агента-аудитора
   2026-07-11), рядом с `124e3434…→451edc9d…` (toolchain 07-07/1740492). Три
   стабильные линии доказывают: `factsDigest` (diagnostic/provenance shape)
   не является межсредовым semantic oracle. Поэтому full-row hash понижен до
   same-environment determinism check (byte-equality двух запусков), а
   фиксированный межсредовой pin — applied-dynamics subset
   `tick/agent/action/events/menuCount`: `efa018b311fe889b…` (совпадает во
   всех трёх средах).
2. **MAFIA-TEST-NAME — CLOSED 2026-07-11**: корневой скрипт `mafia_test.ts`
   (не тест: console.log без assertions) портирован в
   `tests/mafia/mafia_game.test.ts` с реальными проверками детерминизма,
   победителя и распределения ролей; корневой файл удалён. Добавлен
   `npm run check` (typecheck + vitest run) — состав из TEST_0.md.
3. **DET-HIGH — CLOSED 2026-07-11**: wall-clock убран из semantic state —
   `touchSeen(edge, tick)`, biography-якорь = последнее событие биографии,
   registry `startTime=0`; регрессия + статический tripwire —
   `tests/determinism/wallclock_regression.test.ts`. Два medium-вхождения
   (world-builders, diagnostics runner) deferred в R8 как route-unreachable
   (DETERMINISM_SWEEP_0.md).

## Реализация после R1 (2026-07-11)

- **TOM-BUILDER/UPDATE core**: `lib/tom/opponentBelief/` (builder, update,
  serialization) + legacy decoder (`legacyDecoder.ts`, `legacy-tom-decoder`
  v1) — TOM_SPEC_0.md §Update.
- **S5 dual-emit seam**: `runtimeMechanics.opponentBeliefS5V1` (OFF на всех
  профилях, включая phase1; opt-in объектной формой runtimeProfile);
  `s5DualEmitLayer.ts` мерджится последним слоем S5 (docs/PIPELINE.md,
  docs/INVARIANTS.md).
- **Обязательная пара оракулов TOM_SPEC_0**:
  `tests/tom/opponent_belief_oracles.test.ts` (resolver→builder→S5) и
  `tests/pipeline/opponent_belief_s5_dual_emit.test.ts` (pipeline, флаг ON;
  hidden-инвариантность до S8 ranked включительно).
- **R4 первый шаг**: интеграция scene-адаптеров —
  `tests/simkit/scene_projection_integration.test.ts` (mvp0-мир steppable
  после применения resolved-сцены) и
  `tests/pipeline/scene_goal_lab_parity.test.ts` (S8 достигается, allowlist
  не протекает).

- **TOM-BUILDER live wiring (2026-07-11)**: S5 belief-слой комбинирует
  decoder-prior и envelope-evidence resolved-сцены
  (`world.resolvedObservations`; SimKit — fact `scene:observations:v1`);
  envelope-only диады получают belief; end-to-end через SimKitSimulator —
  `tests/pipeline/opponent_belief_scene_evidence.test.ts`,
  `tests/simkit/scene_projection_integration.test.ts`.

- **TOM live-wiring audit repair (2026-07-11)**: исправлена направленность
  subject/counterparty для speech/event evidence, добавлен fail-closed decode
  persisted envelopes, полный belief/evidence ledger сохранён в S5 artifact,
  а canonical `tom:belief:final:*` теперь достигает S8 target modulation и Q
  provenance. Регрессии находятся в
  `tests/tom/opponent_belief_v1.test.ts` и
  `tests/pipeline/opponent_belief_scene_evidence.test.ts`.

- **CONFLICT-DEFINITION-0 (2026-07-12)**: `lib/dilemma/definition/` —
  замороженный (`deepFreeze`) runtime-контракт `TRUST_EXCHANGE_DEFINITION`
  (roles/phases/actions/termination + bound kernel functions, без
  ре-имплементации; termination v1 = external_round_budget) и typed
  projection contract (`projectLegalActions`, fail-closed
  `resolveProjectedChoice` по exact-match candidate ID). Пять обязательных
  тестов CONFLICT-GAP-0 —
  `tests/dilemma/conflictActionProjection.test.ts`; non-interference и
  immutability — `tests/dilemma/conflictDefinition.test.ts`. Barrel
  `lib/dilemma/index.ts` не расширялся.

- **CONFLICT-INTEGRATION-0 CORE (2026-07-12)**: `lib/dilemma/integration/` —
  `runConflictJointDecisionV1`: per-player GoalLab pipeline (S8-атомы с
  beliefs) → conflict-кандидаты из projection rows (goal-deltas из typed
  `ActionImpact` механики через версионированную матрицу
  `conflict-impact-goal-matrix-v1` + belief-модуляция
  `conflict-belief-modulation-v1`, канонические `tom:belief:final:*` первыми)
  → `decideAction` (= goal_lab_s8_gumbel_v1, fail-closed rng-канал) →
  exact-match resolve → `forcedJointActions` (mode `learn_from_utility`:
  memory/learning/hysteresis/trace живут) + dual-run reference lane
  (replicator+argmax) с записью divergence. Тесты —
  `tests/dilemma/conflictIntegration.test.ts` (e2e от resolved scene,
  детерминизм, fail-closed rng, parity reference-lane, sign/belief оракулы).
  Live-замена `runDilemmaV2` на provider — отдельная миграция после
  накопления dual-run parity evidence.

- **R2-METRIC-FIXES-0 (2026-07-12)**: четыре решения METRIC-INVENTORY-0
  исполнены. goalTension/frustration: у `deriveGoalCatalog` НЕТ реального
  вычисления (константные нули) → honest unknown (`number | null`, продюсер
  null, dashboard `N/A` с объяснением; сценовый источник — R2b).
  `linterIssues` скрыт (мёртвый контракт). Scenario `warn` рендерится как
  warn (`scenarioStatusPresentation`), не как fail. RAP получает live SDE
  `Pv` (`lib/metrics/liveV42.ts` + `useEntityMetrics`); Pv=0 воспроизводит
  legacy-значения байт-в-байт (формула не менялась). Регрессии —
  `tests/metrics/entity_detail_fixes.test.ts`.

Очередь дальше: решение о включении dual-emit по умолчанию, R6 generalized
schema; live wiring provider в Conflict Lab UI — после parity evidence;
R2b metric catalog — после сценового goal-conflict runtime.
