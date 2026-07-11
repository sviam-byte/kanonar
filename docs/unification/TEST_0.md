# TEST-0 — baseline завершаемости

Карточка: `docs/LAB_UNIFICATION_PLAN.md` §18. Статус: DONE.
Дата: 2026-07-10. Ревизия: 1740492 (+ незакоммиченные docs).
Toolchain: Node v24.11.1 (`ms-playwright-go/1.57.0/node.exe`, PATH-node
отсутствует); установленный vitest 2.1.9 напрямую:
`<node> node_modules/vitest/vitest.mjs`.
Внешний timeout на каждый запуск (GNU `timeout`). Семантика не менялась,
skip/fake timers не добавлялись.

## Первичные результаты аудита

| scope | command | duration | exit | files | tests | first failure | hangs? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| tests/pipeline | `vitest run tests/pipeline` (timeout 240s) | 16s | 0 | 17 pass | 74 pass | — | нет |
| tests/simkit | `vitest run tests/simkit` (timeout 300s) | 35s | 1 | 24 pass / **1 fail** / 6 skip | 110 pass / 1 fail / 6 skip | `mvp0_golden.test.ts` | нет |
| tests/dilemma | `vitest run tests/dilemma` (timeout 240s) | **3s** | 0 | 11 pass | 74 pass | — | **нет** |
| полный | `vitest run` (timeout 360s) | **51s** | 1 | 91 pass / 1 fail / 6 skip (98) | 387 pass / 1 fail / 10 skip (398) | тот же golden | **нет** |
| typecheck | `tsc --noEmit --pretty false` (timeout 300s) | 26s | 0 | — | 0 ошибок | — | — |
| build | `vite build` (timeout 480s) | 20s | 0 | built in 19.05s | — | — | — |

## Первичный semantic failure и решение

> **Поправка 2026-07-11.** `451edc9d…` не был «ошибочно записанным»: это
> честный результат другого toolchain. Аудит показал две стабильные линии
> хешей по окружениям (`73eaf2ce…→4352ad74…` здесь против
> `124e3434…→451edc9d…` там) из-за ICU-зависимого `localeCompare` в
> семантических сортировках. Причина устранена переходом на
> `codeUnitCompare` (`lib/utils/compare.ts`); см. GOLDEN-DRIFT в README.

Первичный прогон дал `4352ad740f0c5cb8…` вместо ошибочно записанного
`451edc9d952ed05a…`. Изолированное сравнение `1740492` с родителем `7b68c1e`
показало одинаковый hash прикладной динамики (`actions + events + menuCount`):
`efa018b311fe889b…`. Изменились provenance (`usedAtomIds`) и digest всего
`world.facts`: `sim:trace.best` теперь указывает на seeded Gumbel winner, а trace
получил `chosen`, `contextAxes` и `topByQ`. Это намеренное изменение формы
trace, не изменение применённых действий или переходов. Golden перепинован на
`4352ad740f0c5cb8…` с provenance-комментарием в тесте.

## Проверка после закрытия GOLDEN-DRIFT

Повторная проверка на том же Node/Vitest toolchain:

| scope | outcome |
| --- | --- |
| golden + runtime profile | 2 файла, 5 тестов passed |
| typecheck | exit 0, ошибок нет |
| полный Vitest | 92 файла passed / 6 skipped; 388 тестов passed / 10 skipped |
| production build | exit 0, built in 18.13 s; только существующее предупреждение о крупных chunks |

R1 verification gate зелёный. Медленные environment-guarded observation cells
остаются skipped по своему существующему контракту и не являются регрессией.

Прочее: 6 skipped файлов в tests/simkit и 4 skipped теста вне simkit —
уже существующие `.skip` в репозитории, не добавлены этой карточкой.

## Проверка заявлений внешнего аудита

- «`npm test` не завершается за 120–300 s» — **не воспроизводится**:
  полный прогон завершился за 51 s с итоговым отчётом.
- «Barrel `lib/dilemma/index.ts` вешает `dynamicsCore.test.ts`» —
  **не воспроизводится**: файл проходит за ~10 ms при живом barrel-импорте,
  весь tests/dilemma — за 3 s.
- Возможные причины расхождения: другой Node/npm toolchain у аудитора,
  CPU-контеншн, либо принятие медленной фазы collect (113 s CPU-времени на
  воркерах) за зависание. Barrel остаётся широким (13 re-exports) —
  архитектурная претензия в силе, поведенческая (hang) в этой среде не
  подтверждена.

## Предложение состава `npm run check` (не внедрено)

`typecheck` (26s) + `vitest run` (51s) ≈ 77s суммарно — пригодно как единый
гейт после закрытия golden-тикета. Доменные aliases (`test:dilemma` и т.п.)
не обязательны: и полный прогон быстрый.

## Acceptance карточки

- [x] четыре test scopes имеют измеренный outcome (без environment blockers);
- [x] semantic failure (golden drift) отделён от hang/tooling failure
  (hang-ов не обнаружено);
- [x] состав `npm run check` предложен, не внедрён.
