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

## Открытые тикеты, порождённые R1

1. **GOLDEN-DRIFT — CLOSED (root cause), диагноз уточнён 2026-07-11**:
   динамика byte-stable (semantic subset `b9a06aef…` стабилен 626c4d3 →
   7b68c1e → 1740492), но «ошибочных» пинов не было — существовали ДВЕ
   стабильные линии хешей по окружениям (эта машина: `73eaf2ce…→4352ad74…`;
   toolchain аудита 07-07 и коммита 1740492: `124e3434…→451edc9d…`).
   Причина: ICU-зависимый `localeCompare` в семантических сортировках.
   Исправлено: все семантические пути переведены на `codeUnitCompare`
   (`lib/utils/compare.ts`), gate —
   `tests/determinism/collation_boundary.test.ts`. Пин `4352ad74…` не
   изменился в этом окружении и ожидается каноническим кросс-платформенно;
   подтверждение на втором toolchain — при следующем его прогоне.
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

Очередь дальше: TOM-BUILDER от resolved-сцены в живом контуре (не legacy),
CONFLICT-CHOICE-ADR-0, R2 metric-фиксы, решение о включении dual-emit.
