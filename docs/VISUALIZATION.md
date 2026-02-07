# Visualization (DecisionGraph / GoalLab UI)

## Where it lives

- Main view: `components/goal-lab/DecisionGraphView.tsx`
- Nodes/edges: `components/goal-lab/*` + `lib/graph/GraphAdapter.ts`

## What “weights” mean

В UI встречаются разные числа:
- contribution weight: вклад конкретного фактора в цель
- edge weight: агрегированный вес ребра на графе
- flow/spread: визуализационное “течение энергии” (если включено)

## How to debug “edge exists but unclear why”

1) Найти ребро (source → target)
2) Сверить, откуда оно собралось в `lib/graph/GraphAdapter.ts`
3) Проверить meta на ребре (atomId/source/formula/explanation), если доступно
4) В GoalExplanationPanel сверить contributions для соответствующей цели

## Typical problems

- “Каша” в графе: слишком много узлов/рёбер → включить коллапс/пороги/ограничения
- “ctx:base vs ctx:final непонятно”: использовать dual-layer режим
- “узлы пропадают при spread”: проверять, что визуализация не фильтрует по energy=0 и не пересоздаёт layout каждый тик
