# DETERMINISM-SWEEP-0 — wall-clock и RNG в семантических путях

Карточка: `docs/LAB_UNIFICATION_PLAN.md` §26. Статус: DONE.
Дата: 2026-07-10. Read-only: код не менялся.
Метод: полный grep `Date.now` / `new Date(` / `performance.now` / `seedrandom`
по `lib/` (вне тестов) + чтение контекста каждого вхождения.
`Math.random` в `lib/` — 0 вхождений (5 совпадений grep — комментарии
«без Math.random»).

## SEMANTIC — wall-clock попадает в состояние/идентичность (нарушения)

| path:line | использование | downstream | предложение | severity |
| --- | --- | --- | --- | --- |
| `lib/social/acquaintance.ts:59` | `t = world.tick ?? world.time ?? Date.now()` в `touchSeen` | `edge.lastSeenAt` — persisted acquaintance state; влияет на familiarity/tier | **RESOLVED 2026-07-11**: `touchSeen(edge, tick, opts)` — tick обязателен, все 7 колл-сайтов обновлены | **high** |
| `lib/biography.ts:197` | `now = character.storyTime ?? Date.now()` | `computeBiographyLatent(bio, now)` → effectiveVector → axisDeltas персонажа | **RESOLVED 2026-07-11**: fallback = время последнего события биографии (детерминированный якорь; events непусты на этом пути) | **high** |
| `lib/scenario/registry.ts:27` | `createInitialWorld(Date.now(), …)` — первый арг = `startTime` мира | база времени мира wall-clock (seed отдельно: `options.runSeed`) | **RESOLVED 2026-07-11**: `startTime = 0` (параметр телом initializer не читается) | medium |
| `lib/planning/world-builders.ts:121` | `hydrateAgent(char, Date.now())` | время гидрации агента в state | передавать scenario start tick; **deferred в R8** — не достижим с живых routes (sandbox-функции никем не импортируются) | medium |
| `lib/diagnostics/runner.ts:147` | `historicalEvents.push({… t: Date.now() …})` | событие «Катастрофа» в historicalEvents агента | t из world.tick; **deferred в R8** — DiagnosticsPage не в роутинге App.tsx | medium |
| `lib/biography/history-formalizer.ts:150` | `t: Date.now(), // Mock time` (сам признаётся) | биографическое событие | реальный story-time источник | medium |
| `lib/character-snippet.ts:205` | `temp-${Date.now()}-counter` fallback-ID | идентичность сущности недетерминирована при отсутствии meta.id | детерминированный hash содержимого | low |

## METADATA — допустимо по инварианту («wall-clock metadata не участвует в выборе»)

| path:line | использование | заметка |
| --- | --- | --- |
| `lib/debug/buildFullDebugDump.ts:36` | `exportedAt` ISO | экспорт-метка |
| `lib/goal-lab/sceneDump.ts:106` | `exportedAt` ISO | экспорт-метка |
| `lib/orchestrator/runTick.ts:10,12` | `nowIso`/`nowMs` (perf) | тайминги trace; в semantic equality не входят |
| `lib/simkit/core/world.ts:7` (`buildSnapshot.time`) | ISO в snapshot | **с оговоркой**: поле живёт в persisted snapshot — replay обязан его игнорировать (инвариант §4 versioning это уже требует) |
| `lib/simkit/core/export.ts:6` | ISO в export | экспорт-метка |
| `lib/simkit/plugins/{fullOrchestratorPlugin:186, goalLabActionBridge:68, goalLabDeciderPlugin:60, orchestratorPlugin:349}` | `time: ISO` в emit-ах | **с оговоркой**: проверить, что консьюмеры событий не читают `time` как семантику — runtime probe required |
| `lib/utils/arr.ts:27`, `lib/utils/listify.ts:20` | `t: Date.now()` | диагностический ring-buffer `__KANONAR_DIAG__` (best-effort), не state |
| `lib/context/overrides/types.ts:11` | комментарий к `updatedAt` | только doc |

## RNG

| path:line | использование | вердикт |
| --- | --- | --- |
| `lib/simulate.ts:138` | `seedrandom(String((cfg.rngSeed ?? 1) + r))` | детерминирован (seed из конфига + индекс) |
| `lib/negotiation/simulate.ts:18` | `seedrandom(String(r))` | детерминирован (индекс повторения) |
| `lib/sde.ts:183` | `rng` приходит параметром | детерминирован при seeded-вызове (вызывает `lib/simulate.ts`) |

## Итог

7 семантических вхождений (2 high / 4 medium / 1 low) — каждому предложен
источник-замена; ни одно не чинится в этом пакете. 2 вхождения с оговоркой
«runtime probe required» (simkit snapshot.time, plugin event.time).
Metadata-вхождения соответствуют инварианту. RNG-контуры seeded и чисты.
Приоритетный ticket: `acquaintance.ts` + `biography.ts` (оба high трогают
belief-смежное состояние персонажа — прямо зона R3).

## Acceptance карточки

- [x] каждое вхождение классифицировано;
- [x] semantic-вхождения имеют предложение или `runtime probe required`;
- [x] runtime не изменён.
