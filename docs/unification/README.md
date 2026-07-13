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
| CONFLICT-PARITY-0 | [CONFLICT_PARITY_0.md](CONFLICT_PARITY_0.md) | DONE — evidence 432 решений, 2 дефекта исправлено | 2026-07-12 |

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
- **S5 dual-emit seam**: `runtimeMechanics.opponentBeliefS5V1` (default ON у
  `phase1`, OFF у `legacy` и no-profile/config; object-form opt-in/rollback);
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

- **R5 LIVE CONFLICT PROVIDER WIRING (2026-07-12)**:
  `runConflictLabSessionV1` is the active UI boundary. Multi-round
  `trust_exchange` sessions now use canonical GoalLab S8 decisions as the
  authoritative action history and typed-kernel next state. The versioned
  choice reports preserve policy, effective temperature/source, sampling pool,
  `usedAtomIds`, kernel reference actions and divergence in UI/export.
  `runDilemmaV2` remains a callable compatibility runner; non-trust cards stay
  explicitly `unsupported_kernel` and are not promoted to canonical mechanics.
  Regression: `tests/dilemma/liveTrustExchangeRuntime.test.ts`.

- **R7-FOUNDATION-0 — inventory + contract PROPOSAL (2026-07-13)**: multi-agent
  foundation prep. Inventory found the primitives are already directed/per-observer
  (`SceneEventInputV1.targetIds`, `OpponentBeliefV1` observer→target,
  `s5DualEmitLayer` `otherIds: string[]`); dyadic hardness is concentrated in
  `ConflictDefinitionV2` (`playerCount: 2` literal, "exactly two roles", binary
  `target`), the missing self-belief, and the missing typed belief graph with an
  `N·(N−1)` bound. Proposes additive contracts (`participant-set-v1`,
  `observation-view-v1`, `belief-graph-v1`, `conflict-definition-v3`) that keep
  the dyadic kernel execution and golden identity intact. ADR-reserved decisions
  (self-belief shape, multi-target semantics, ordering) await author sign-off. No
  code changed. Doc: `docs/unification/R7_FOUNDATION_0.md`.

- **R6 CATALOG WIRING — step 4 (2026-07-13)**: the Conflict Lab catalog is now
  driven by the typed `CONFLICT_SCENARIO_INVENTORY` via the pure
  `conflictCatalogLane(kind, runnable)` classifier, not the ad-hoc `disabled`
  flag. `trust_interrogation` is the sole canonical lane; the eight runnable
  non-kernel presets stay selectable as an explicit "compatibility — no typed
  kernel" lane (badged with inventory kind + reason and run on the
  legacy/`unsupported_kernel` path); disabled presets render as unavailable.
  Presentation never promotes a card into an executable mechanic and no runnable
  behavior is removed. R6 steps 1–3/5 (schema/validator/inventory/constructor)
  landed with `CONFLICT-LIVE-0`; step 6 (schema editor v2) stays gated behind a
  stable validation report. Regression: `tests/dilemma/conflictCatalog.test.ts`.

- **R2-METRIC-FIXES-0 (2026-07-12)**: четыре решения METRIC-INVENTORY-0
  исполнены. goalTension/frustration: у `deriveGoalCatalog` НЕТ реального
  вычисления (константные нули) → honest unknown (`number | null`, продюсер
  null, dashboard `N/A` с объяснением; сценовый источник — R2b).
  `linterIssues` скрыт (мёртвый контракт). Scenario `warn` рендерится как
  warn (`scenarioStatusPresentation`), не как fail. RAP получает live SDE
  `Pv` (`lib/metrics/liveV42.ts` + `useEntityMetrics`); Pv=0 воспроизводит
  legacy-значения байт-в-байт (формула не менялась). Регрессии —
  `tests/metrics/entity_detail_fixes.test.ts`.

- **CONFLICT-PARITY-0 (2026-07-12)**: dual-run parity evidence собран —
  432 joint decisions по сетке rel × agents × env × temp × seed × tick
  (`docs/unification/CONFLICT_PARITY_0.md`, JSON в `evidence/`). Ранжирования
  Q↔U согласованы на 100%, transition parity 102/102, всё расхождение выбора
  (55.6%) — политика (argmax vs seeded Gumbel), масштабируется температурой.
  Попутно найдены и исправлены: плоский Q конфликтных кандидатов
  (goal-energy словарь затенял доменные дельты → механика
  `goalEnergyDomainUnionV1`, теперь default ON только у `phase1`, провайдер
  также включает явно) и
  belief-слепота моста без S5-слоя (S0 dyad фоллбэк в `readBeliefMetric`).

`GOALENERGY-UNION-DEFAULT` закрыт: `phase1` включает union, а `legacy` и
no-profile/config сохраняют прежнюю семантику; object-form override остаётся
двусторонним. Live wiring provider в Conflict Lab UI завершён. R6 steps 1–5
(schema/validator/inventory/constructor + step 4 catalog wiring) закрыты;
внутри R6 остаётся только gated step 6 — schema editor v2 после стабильного
validation report. По gate-порядку дальше R2b (после сценового goal-conflict
runtime), затем R7 multi-agent foundation.

## Phase1 OpponentBelief default (2026-07-12)

`phase1` теперь включает S5 `OpponentBelief` dual-emit по умолчанию. `legacy`
и no-profile/config остаются OFF; object-form override `true|false` сохраняет
явный opt-in/rollback. Глобальный `FC.opponentBeliefV1.s5DualEmit.enabled`
не изменён.
## Audit repair Conflict Integration (2026-07-12)

Непрозрачные ID больше не определяют семантику действия: типизированный
`actionKey` сохраняет `trust|withhold|betray`, projection ID связывает
tick/history, а допустимый набор оценивается и выбирается внутри реального S8 в
режиме replace. Choice trace содержит effective temperature и фактическое
membership в sampling pool.
Conflict seam удаляет UI-only `force_action`, использует один input для
baseline beliefs и боевого S8 и записывает фактический `topK` из pipeline.
