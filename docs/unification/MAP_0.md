# MAP-0 — карта лабораторий

Карточка: `docs/LAB_UNIFICATION_PLAN.md` §20. Статус: ACCEPTED 2026-07-11
(предусловие ADR-0 выполнено). Дата карты: 2026-07-10. Read-only: код не менялся.
Метод: статический обход imports от `App.tsx` (HashRouter, 12 активных routes,
4 redirect, 2 динамических entity-route; провайдеры: Branch → Access → Sandbox).

## Обязательные строки

### 1. GoalLab v2 — canonical candidate, живой

- route: `/goal-lab-v2`, `/goal-lab-console-v2` (App.tsx:48–49)
- page: `pages/GoalLabPageV2.tsx`, `pages/GoalLabConsolePageV2.tsx`
- provider/hook: `GoalLabProvider` (`contexts/GoalLabContext.tsx`) →
  `hooks/useGoalLabWorld.ts` + `hooks/useGoalLabEngine.ts`
- input builder: `buildGoalLabContext` (`lib/goals/goalLabContext.ts`),
  `lib/context/v2/scoring.ts`, `locationGoals.ts`
- ToM path: `computeTomGoalsForAgent` (`lib/context/v2/tomGoals.ts`),
  `lib/tom/contextual/*` types; S5 внутри pipeline
- decision runtime: `runGoalLabPipelineV1`
  (`hooks/useGoalLabEngine.ts:23` → `lib/goal-lab/pipeline/runPipelineV1.ts`, S0–S9)
- persistence: `lib/goal-lab/pipeline/beliefPersist.ts`; localStorage
  `goalLab.*` (devMode, goalTuning.v1, headersCollapsed)
- tests: `tests/pipeline/` 17 файлов PASS, `tests/goals/` 16, `tests/decision/` 15
- evidence: pages → GoalLabContext.tsx:imports → useGoalLabEngine.ts:23

### 2. Embedded GoalLab labs — живые, layer violation

- вход: `GoalLabShell` → `components/goal-lab/GoalLabResults.tsx:48–51`
- runtime: `lib/goal-lab/labs/OrchestratorLab.tsx`, `SimulatorLab.tsx`,
  `ProConflictLab.tsx` (React-компоненты внутри `lib/` — violation) +
  `lib/orchestrator/defaultProducers` → `runTick`
- ВАЖНО: **`lib/orchestrator` достижим ТОЛЬКО отсюда** (единственный внешний
  импортёр — GoalLabResults.tsx; `lib/engine/tick.ts` импортирует orchestrator,
  но сам engine/tick никем не импортируется)
- tests: прямых нет (`not found`)

### 3. Conflict Lab / Dilemma — живой

- route: `/conflict-lab` (+`?tab=dilemma`; redirect `/dilemma-lab`, App.tsx:57)
- page: `pages/ConflictLabPage.tsx` → `components/conflict/DilemmaLabPanel.tsx`
- decision runtime: `runDilemmaV2` (`lib/dilemma/runner.ts`) +
  `lib/dilemma/scenarios.ts`, `mechanics.ts`; canonical dynamics через
  `lib/dilemma/dynamics/*` (bridge — предмет CONFLICT-GAP-0)
- ToM path: собственные traits/relations внутри runner, НЕ через `lib/tom`
  (semantic mismatch — вход для CONFLICT-GAP-0)
- persistence: session export (есть `tests/dilemma/sessionExport.test.ts`)
- tests: `tests/dilemma/` 11 файлов PASS за 3 s
- Dilemma и Conflict Lab — одна строка, потому что вкладка одной страницы;
  bridge legacy runner ↔ canonical dynamics описан в
  `lib/dilemma/dynamics/bridge.ts`

### 4. Mafia — живой UI, мёртвый тест

- route: redirect `/mafia-lab` → `/conflict-lab?tab=mafia` (App.tsx:58)
- page: тот же ConflictLabPage → `components/conflict/MafiaLabPanel.tsx` →
  `lib/mafia` (10 файлов)
- tests: **`mafia_test.ts` в корне репозитория НЕ соответствует include-паттерну
  `**/*.test.ts` (суффикс `_test.ts` ≠ `.test.ts`) — vitest его никогда не
  запускал**; unused-scan также числит его недостижимым. Единственное
  упоминание в живых тестах — route-проверка в
  `tests/navigation/route_stabilization.test.ts`
- status: runtime live, test coverage — фактически `not found`

### 5. Live Simulator / SimKit — живой, носитель спайна

- route: `/simulator` (App.tsx:51)
- page: `pages/SimulatorPage.tsx` → `components/sim/LiveSimulator.tsx`
- runtime: `SimKitSimulator` (`lib/simkit/core/simulator.ts`) + plugins:
  `goalLabDeciderPlugin`, `goalLabPipelinePlugin` (мост к GoalLab pipeline),
  `perceptionMemoryPlugin` (спайн I-2.5: threat memory), профиль
  `lib/config/runtimeMechanics.ts` (`RUNTIME_PROFILE_FACT_KEY`)
- input builder: `makeSimWorldFromSelection`
  (`lib/simkit/adapters/fromKanonarEntities.ts`)
- persistence: snapshot export (`lib/simkit/core/export.ts`)
- tests: `tests/simkit/` 31 файл; golden-дрейф закрыт доказанным provenance
  re-pin, полный suite зелёный (6 environment-guarded SimKit-файлов skipped)
  (см. TEST_0.md), остальное PASS

### 6. Relations Lab — view (подтверждено)

- route: `/relations-lab` (App.tsx:52)
- page: `pages/RelationsLabPage.tsx` → static `data/` + `SandboxContext` +
  `components/ThinkingSimilarityPanel.tsx` → `lib/metrics`
  (`calculateAllCharacterMetrics`), `lib/cognition/hybrid.ts`
- decision runtime: **нет** — расчётно-визуальная поверхность.
  Допущение ADR-0 «Relations Lab — view» получает evidence
- tests: `not found` (прямых)

### 7. Entity Detail — живой; метрики без сцены

- route: `/:entityType/:entityId` (App.tsx:61)
- page: `pages/EntityDetailPage.tsx` → `hooks/useCharacterCalculations.ts` →
  `lib/metrics.ts` (`calculateAllCharacterMetrics`, `applyAging`),
  `lib/archetypes/metrics.ts`, `lib/metrics/psych-layer.ts`
- отображение: `components/MetricsDashboard.tsx`; **placeholder evidence:
  `linterIssues={[]}` захардкожен (EntityDetailPage.tsx:454)** — вход для
  METRIC-INVENTORY-0
- persistence: `SandboxContext` (`kanonar-sandbox-v1` в localStorage)
- tests: `tests/metrics/` — 1 файл на весь домен

### 8. Narrative — статическая страница

`/narrative` → `pages/NarrativePage.tsx`: самодостаточный статический контент,
runtime-импортов нет. Status: view/doc.

### 9. Legacy / redirects

`/goal-lab` → v2, `/goal-lab-console` → v2, `/dilemma-lab` → tab=dilemma,
`/mafia-lab` → tab=mafia (App.tsx:55–58). Собственного кода нет.

## A-priori runtime candidates — атрибуция

| контур | статус | evidence |
| --- | --- | --- |
| `lib/goal-lab/pipeline` | live (строки 1, 5) | useGoalLabEngine.ts:23; goalLabPipelinePlugin |
| `lib/dilemma` | live (строка 3) | DilemmaLabPanel imports |
| `lib/simkit` | live (строка 5) | LiveSimulator imports |
| `lib/orchestrator` | live только через embedded labs (строка 2) | GoalLabResults.tsx:51 |
| `lib/mafia` | live (строка 4), тестов нет | MafiaLabPanel |
| `lib/context/v2` | live (строка 1: scoring/tomGoals/locationGoals) | useGoalLabEngine imports |
| `lib/engine` | **live-path not found**: `engine/tick.ts` никем не импортируется; импортёры engine (`lib/context/actions/*`, `lib/diagnostics`, `lib/dilemma/analysis.ts`) сами не на живых путях; 41 файл engine+context в 273 unreachable | grep + unused-scan |
| `lib/context` (не-v2: v4, actions, catalog) | смешанный; значительная часть в unreachable | unused-scan |
| `lib/simulate.ts`, `lib/sde.ts`, `lib/negotiation` | live-path not found (negotiation/choose → simulate; сам negotiation не достигнут от routes) | grep |

## Второстепенные surfaces (не обязательные строки — page-level trace)

`/` Home, `/access`, `/archetypes`, `/archetype-relations`, `/builder`,
`/location-constructor`, `/:entityType` list — прослежены до page,
runtime не разбирался: `not traced (secondary)`. Unreachable-страницы вне
routes: DiagnosticsPage, EventsPage, MassNetworkPage, SocialEventsListPage
(BASELINE_0).

## Acceptance карточки

- [x] у каждой активной route есть runtime/test evidence либо явный
  `not found` / `not traced (secondary)`;
- [x] Dilemma/Conflict Lab объединены в строку с описанием bridge;
- [x] status назначен только по evidence (пути указаны);
- [x] код не изменён.
