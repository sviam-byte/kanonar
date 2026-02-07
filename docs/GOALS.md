# Goals (catalog + explanation)

## Source of truth

- Goal catalog / descriptors: `lib/goals/*` (см. `describeGoal(...)`)
- Goal computation: `lib/context/*` (деривация goal atoms и contributions)
- UI explain: `components/goal-lab/GoalExplanationPanel.tsx`

## What should be documented for each goal id

Рекомендуемый минимум:
- title (человеческое имя)
- description (1–3 абзаца: что это значит)
- notes (короткие оговорки, edge cases)

## How a goal score is formed (conceptually)

- входные сигналы: `ctx:final:*` + `drv:*` + (опционально) память/отношения
- каждая цель собирает “contributions” (какие факторы и с какими весами)
- итог: logit / probability (в зависимости от модели)

## How to add a new goal

1) Добавить описание в каталог (там, где реализован `describeGoal`)
2) Добавить вычисление/вклад (там, где формируются goal atoms)
3) Убедиться, что есть contributions (чтобы UI мог объяснять)
4) Добавить тест, если цель вводит новый инвариант или новую ось
