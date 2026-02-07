# Architecture (Goal Lab)

## Core idea

Один тик/снимок агента проходит staged pipeline S0…S8, который производит атомы (ContextAtom) с trace,
после чего UI визуализирует:
- что получилось на каждой стадии,
- почему цели получили такие веса,
- почему выбрано действие.

## Source of truth (files)

- Pipeline runner: `lib/goal-lab/pipeline/runPipelineV1.ts`
- Stage implementations: `lib/goal-lab/pipeline/*`
- Atom type/trace: `lib/context/v2/types.ts`
- Character lens: `lib/context/lens/characterLens.ts`
- Goal derivation/projection: `lib/goals/*`
- Decision graph builder: `lib/graph/GraphAdapter.ts`
- GoalLab UI: `components/goal-lab/*`

## Data flow (conceptual)

world/obs/mem/rel/life atoms
  → (S1) quarks
  → (S2) ctx:* (base axes)
  → (S3) ctx:final:* (subjective axes via character lens)
  → (S6) drv:* (drivers)
  → (S7) goal:* (goals) + util:* projection
  → (S8) action:* decision

## Reading strategy

Если нужно понять “почему это произошло”:
1) Начать с `docs/PIPELINE.md` и определить, какая стадия должна была создать нужный сигнал.
2) Найти атом на соответствующей стадии в Pipeline UI и посмотреть trace.usedAtomIds.
3) Сопоставить usedAtomIds с контрактом стадии.
