# BASELINE-0 — снимок состояния репозитория

Карточка: `docs/LAB_UNIFICATION_PLAN.md` §19. Статус: DONE.
Дата: 2026-07-10. Ревизия: 1740492 (+ незакоммиченные docs).
Read-only: код не менялся, решений об удалении нет.
Toolchain: Node v24.11.1 (`ms-playwright-go/1.57.0/node.exe`), инструменты из
`node_modules` напрямую (см. `VERIFY_0.md`).

## Verification outcome (из TEST_0.md)

| проверка | команда | итог |
| --- | --- | --- |
| typecheck | `tsc --noEmit --pretty false` | 0 ошибок, 26 s |
| tests | `vitest run` | первично 387 pass / 1 fail / 10 skip; после закрытия GOLDEN-DRIFT — 388 pass / 10 skip, 42.25 s |
| build | `vite build` | успех, ~20 s |

## Масштаб

Команда: `find . -path ./node_modules -prune -o -path ./dist -prune -o
\( -name "*.ts" -o -name "*.tsx" \) -print | xargs wc -l`

- **1059 ts/tsx файлов, 171 863 строки** (вне node_modules/dist);
- `lib/` — **103 590 строк**;
- **52 файла длиннее 500 строк**;
- крупнейшие: `types.ts` (корень) 3261, `lib/simkit/actions/specs.ts` 2231,
  `lib/goals/goalLabContext.ts` 1979, `lib/possibilities/defs.ts` 1888,
  `components/goal-lab/GoalLabResults.tsx` 1855, `lib/dilemma/runner.ts` 1682,
  `lib/goal-lab/pipeline/runPipelineV1.ts` 1594, `lib/tom/noncontextTom.ts` 1357.

## Обход типовой системы (вне тестов)

Команды: `grep -rn "as any" …`, `grep -rn ": any|any\[\]|<any>" …`

- `as any`: **2252** (lib+components+pages+hooks+contexts);
- всех any-паттернов: lib ~2563, components ~853, hooks ~136, pages ~45;
- корневой `types.ts`: ~350 импортёров (`from '@/types'` + относительные);
- non-null assertions: грубый паттерн дал 0 — методика внешнего аудита (209)
  не воспроизведена, оставлено как **needs re-measurement** с их методикой.

## Unreachable candidates

Команда: `node scripts/find-unused.mjs` (тесты — отдельные entrypoints).
**273 недостижимых файла**: lib 191, components 40, data 35, pages 4
(DiagnosticsPage, EventsPage, MassNetworkPage, SocialEventsListPage),
прочее 3. Полный список — вывод команды (282 строки).

Перекрёстно подтверждено ручным grep (0 импортёров вне себя):
`lib/solver` (5 файлов), `lib/simulations` (5), `lib/ai` (deprecated stub),
`lib/tom/compat.ts`. Плюс `archive/` — 47 ts/tsx (reference only по TRUST_MAP)
и мёртвый define `GEMINI_API_KEY` в `vite.config.ts` (0 использований).

Статусы (`false positive`/`safe delete`/…) НЕ назначаются в этой карточке —
это R8 по отдельным delete packages.

## Production bundle (vite build, 2026-07-10)

| chunk | size | gzip |
| --- | --- | --- |
| `index` (главный) | 2 026.69 kB | 565.96 kB |
| `react-force-graph-3d` | 1 324.37 kB | 357.12 kB |
| `GoalLabResults` | 516.28 kB | 147.19 kB |
| `perceptionMemoryPlugin` | 180.79 kB | 52.88 kB |
| `ConflictLabPage` | 171.07 kB | 48.93 kB |
| `GoalLabShell` | 132.37 kB | 39.72 kB |

Vite предупреждает о чанках >500 kB. Числа внешнего аудита подтверждены.

## Dependency advisories

**Environment blocker**: npm отсутствует в среде (есть только node.exe из
Playwright-бандла) — `npm audit` локально не выполним. Единственный источник —
внешний аудит: 3 moderate / 1 high / 1 critical (critical — Vitest 2.1.8,
dev-dep). Первый кандидат dependency-upgrade пакета в R8 — Vitest.

## UI внутри lib (layer violation, фиксация)

`lib/goal-lab/labs/OrchestratorLab.tsx`, `ProConflictLab.tsx`,
`SimulatorLab.tsx` (до ~1092 строк) — React-компоненты в `lib/`.

## Acceptance карточки

- [x] каждое число сопровождено командой;
- [x] unreachable candidates имеют tool/grep-evidence;
- [x] advisories — честный blocker, не изобретены;
- [x] код не изменён, решений об удалении нет.
