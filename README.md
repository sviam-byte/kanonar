# Kanonar

Kanonar — исследовательская лаборатория детерминированной агентной симуляции и explainable decision pipelines. Репозиторий объединяет staged GoalLab pipeline, SimKit runtime, слои выбора действий, traceable goal/action derivation и экспериментальные conflict/dilemma surfaces.

## Что делает проект

- Прогоняет staged pipeline от world/context atoms к `ctx:*`, `ctx:final:*`, `drv:*`, `goal:*`, `util:*` и `action:*`.
- Моделирует субъективный контекст через character lens, а не только через «объективные» сигналы мира.
- Поддерживает explainability через `trace.usedAtomIds`, stage snapshots и decision artifacts.
- Даёт площадку для deterministic simulation, conflict/dilemma сценариев и sensitivity/divergence analysis в SimKit-слое.

## Почему это важно

Проект полезен как демонстрация:

- staged decision architecture с явными контрактами стадий;
- детерминированного симуляционного пайплайна с управляемыми коэффициентами;
- explainable goal/action selection без скрытых переходов `goal -> action`;
- нелинейной динамики драйверов, гистерезиса и decision scoring;
- сравнения поведения и trajectory divergence в simulation runtime.

## Quick start

```bash
npm i
npm run dev
npm test
npm run build
```

## Архитектура в 10 строк

```text
world / obs / mem / rel / life
-> S0 canonicalization
-> S1 normalization / helper derivations
-> S2 base context axes (ctx:*)
-> S3 subjective lens (ctx:final:*)
-> S4 appraisal / emotions
-> S5 ToM / dyadic policy
-> S6 drivers / priorities
-> S7 goals / planning / util projection
-> S8 decision / action artifacts
```

Источник истины для этого spine:

- runtime: `lib/goal-lab/pipeline/runPipelineV1.ts`
- stage contract: `docs/PIPELINE.md`
- invariants: `docs/INVARIANTS.md`
- atom/trace types: `lib/context/v2/types.ts`

## Карта документации

### Внешний вход

- `README.md` — быстрый вход в проект и его ограничения.
- `docs/MATH_INDEX.md` — карта математики, runtime paths и test anchors.
- `docs/WALKTHROUGH_ONE_TICK.md` — один минимальный тик от S0 до S8.
- `docs/DOCUMENTATION_STANDARD.md` — контракт, как документировать новые механизмы.

### Канонические repo-level docs

- `docs/unified/README.md` — high-signal индекс по control-plane слою.
- `docs/PIPELINE.md` — контракт стадий `S0...S9`.
- `docs/INVARIANTS.md` — правила, которые нельзя ломать.
- `docs/ORACLES.md` — oracle/check expectations для моделей и explainability.
- `docs/EXPLAINABILITY.md` — что именно UI и trace обязаны показывать.

### Глубокая модельная документация

- `docs/agents/00_README.md` — навигация по model docs.
- `docs/agents/03_CHARACTER_LENS.md` — субъективный `ctx:* -> ctx:final:*`.
- `docs/agents/05_GOAL_LAB_MATH.md` — goals, utilities, modes, hysteresis.
- `docs/agents/06_ENERGY_PROPAGATION.md` — explainability energy/graph layer.
- `docs/agents/07_PIPELINE_SPEC.md` — детальная спецификация стадий.

### Live runtime areas

- GoalLab pipeline: `lib/goal-lab/pipeline/*`
- Drivers: `lib/drivers/*`
- Goals and planning: `lib/goals/*`
- Decision layer: `lib/decision/*`
- SimKit runtime: `lib/simkit/*`
- Dilemma runtime: `lib/dilemma/*`
- Tests: `tests/pipeline/*`, `tests/decision/*`, `tests/simkit/*`, `tests/dilemma/*`

## Текущее состояние

Репозиторий содержит сильный внутренний модельный и контрактный слой, но внешний вход только формируется. Корневой `README.md` и docs-entry слой в этой волне добавляются именно для того, чтобы внешний ревьюер быстрее увидел:

- где канонический runtime;
- где математика;
- где tests/oracles;
- что в проекте уже зафиксировано контрактами, а что остаётся исследовательским.

## Assumptions and limitations

Kanonar — research/prototype simulation system. Переменные вроде trust, fear, stress, resentment, affiliation need или control need — это внутренние симуляционные скаляры. Они не являются клиническими, психометрическими или экспериментально откалиброванными измерениями.

Система полезна для:

- deterministic simulation;
- explainable decision pipelines;
- sensitivity analysis;
- сравнения rule systems;
- прототипирования agent dynamics.

Система не должна описываться как:

- validated psychological model;
- инструмент диагностики реальных людей;
- надёжный предиктор реального социального поведения без внешней валидации.
