# Kanonar / Goal Lab

## Quickstart

Requirements:
- Node.js (современный, совместимый с Vite 6)

Install:
```bash
npm i
```

Run dev:
```bash
npm run dev
```

Build:
```bash
npm run build
```

Preview build:
```bash
npm run preview
```

Tests:
```bash
npm test
```

Watch:
```bash
npm run test:watch
```

## Repo map (high-level)

- `lib/goal-lab/pipeline/runPipelineV1.ts` — staged pipeline S0…S8 (orchestrator)
- `lib/context/*` — контекст, оси `ctx:*`, линза персонажа, эмоции, ToM, drivers
- `lib/goals/*` + `data/goals/catalog.ts` — каталог целей и логика goal→util
- `lib/graph/*` — графы и распространение энергии/вкладов по trace
- `components/goal-lab/*` — Goal Lab UI (Pipeline, DecisionGraph, explain)
- `tests/*` — vitest

## Docs (must-read)

- `AGENTS.md` — протокол работы “агента” по этому репо
- `docs/PIPELINE.md` — контракты стадий + строгие зависимости
- `docs/MODELS.md` — матмодели (линза, энергия, цели) + критерии корректности
- `docs/ORACLES.md` — численные оракулы (ε/δ/монотонность/масса/изоляция)
- `docs/INVARIANTS.md` — неизменяемые правила (изоляция goal/action, ctx:final, trace)
- `docs/GOALS.md` — что такое цели, откуда берутся описания и как объясняются в UI
- `docs/VISUALIZATION.md` — как читать граф и как дебажить “почему так”
- `docs/AXES_AND_CHANNELS.md` — справочник осей/каналов + маппинги/критерии
- `docs/IDS_AND_NAMESPACES.md` — грамматика id и правила неймспейсов
- `docs/DECISION_AND_HYSTERESIS.md` — модель выбора/режимов/инерции (формулы)
- `docs/EXPLAINABILITY.md` — спецификация “объяснений” (какие данные UI обязана давать)
- `docs/REPRO.md` — воспроизводимость: seed, дампы, минимальные repro-сценарии
