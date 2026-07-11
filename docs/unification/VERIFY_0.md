# VERIFY-0 — реестр проверок

Карточка: `docs/LAB_UNIFICATION_PLAN.md` §17. Статус: DONE.
Дата: 2026-07-10. Ревизия: 1740492 (+ незакоммиченные правки docs).
Режим: read-only; runtime/config файлы не изменялись.

## Таблица команд

| name | exact command | configured scope | exists? | safe for automation? | needs measurement? | notes |
| --- | --- | --- | --- | --- | --- | --- |
| dev | `vite` | dev server :3000, host 0.0.0.0 | да | нет (long-running) | нет | интерактивный сервер |
| build | `vite build` | production bundle | да | да | да (TEST-0) | deploy-preview ветка через env CONTEXT/NETLIFY |
| preview | `vite preview` | serve built bundle | да | нет (long-running) | нет | |
| unused | `node scripts/find-unused.mjs` | статический reachability-анализ | да | да (read-only) | да (BASELINE-0) | тесты считаются entrypoints |
| prune:stubs | `node scripts/prune-deleted-stubs.mjs` | **мутирует** рабочее дерево | да | **нет** | нет | не запускать в audit-карточках |
| test | `vitest run` | все `**/*.test.ts`, environment=node | да | условно | да (TEST-0) | известный hang (barrel lib/dilemma) |
| typecheck | `tsc --noEmit --pretty false` | весь проект | да | да | да (TEST-0) | |
| test:watch | `vitest` | watch mode | да | нет (long-running) | нет | |
| lint | — | — | **нет** | — | — | AGENTS.md честно говорит «lint if configured»; не сконфигурирован |
| check | — | — | **нет** | — | — | нигде не заявлен; создавать только после TEST-0 |
| test:unit / test:dilemma | — | — | **нет** | — | — | доменные aliases отсутствуют; создавать после измерения |

## Vitest-конфигурация

Единственный источник: блок `test` в `vite.config.ts` (строки 12–15):
один project, `environment: 'node'`, `include: ['**/*.test.ts']`.
Отдельных `vitest.config.*` / `vitest.workspace.*` нет (проверено).
Alias `@` → корень репозитория (`vite.config.ts` resolve.alias).

## CI

`.github/workflows` отсутствует. `netlify.toml`, `.gitlab-ci.yml`,
`azure-pipelines.yml` в корне отсутствуют. Единственный след CI —
env-ветвление в `vite.config.ts` (`CONTEXT === 'deploy-preview'`,
`NETLIFY === 'true'`): деплой Netlify сконфигурирован вне репозитория.
Незадокументированная в репо конфигурация помечена: **unknown, внешний tooling**
(стоп-условие карточки применено к CI, не к локальным командам).

## Toolchain среды (2026-07-10)

- `node` / `npm` в PATH **отсутствуют**.
- Рабочий Node: `C:\Users\ЬШ\AppData\Local\ms-playwright-go\1.57.0\node.exe`
  (v24.11.1). npm в бандле нет — команды запускаются напрямую:
  - vitest: `<node> node_modules/vitest/vitest.mjs run <scope>`
  - tsc: `<node> node_modules/typescript/bin/tsc --noEmit --pretty false`
  - vite build: `<node> node_modules/vite/bin/vite.js build`
- Следствие: `npm audit` локально недоступен (нет npm) — для BASELINE-0
  фиксируется как environment blocker; данные внешнего аудита
  (3 moderate / 1 high / 1 critical) остаются единственным источником.

## Docs, называющие команды

README.md:44–47 (`dev`, `typecheck`, `test`, `build`) — все существуют.
AGENTS.md:169–180 (`dev`, `test`, `typecheck`, `build`, `test:watch`,
`unused`, `prune:stubs`) — все существуют; упомянутый lint — «if configured»,
т.е. отсутствие не замаскировано. docs/unified/02_AGENT_QUICKSTART.md:101–103 —
существуют. Заявленных, но отсутствующих скриптов не найдено.

## Acceptance карточки

- [x] один Vitest project, `environment=node`, include `**/*.test.ts` — записано;
- [x] отсутствие lint/check не маскируется;
- [x] ни один runtime/config файл не изменён.
