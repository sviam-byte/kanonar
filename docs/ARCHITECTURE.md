# Architecture (Goal Lab)

## Core idea

Один тик/снимок агента проходит staged pipeline S0…S9, который производит атомы (ContextAtom) с trace,
после чего UI визуализирует:
- что получилось на каждой стадии,
- почему цели получили такие веса,
- почему выбрано действие.

## Source of truth (files)

- Pipeline runner: `lib/goal-lab/pipeline/runPipelineV1.ts`
- Stage implementations: `lib/goal-lab/pipeline/*`
- Atom type/trace: `lib/context/v2/types.ts`
- GoalLab-facing consolidated type entrypoint: `lib/goal-lab/types.ts`
- Character lens: `lib/context/lens/characterLens.ts`
- Goal derivation/projection: `lib/goals/*`
- Decision graph builder: `lib/graph/GraphAdapter.ts`
- GoalLab v2 shell: `pages/GoalLabPageV2.tsx`, `components/goal-lab-v2/*`
- Deep analysis panels used by v2: `components/goal-lab/*`

## Data flow (conceptual)

world/obs/mem/rel/life atoms
  → (S0) canonical world/obs/mem/rel/life atoms
  → (S1) quarks
  → (S2) ctx:* (base axes)
  → (S3) ctx:final:* (subjective axes via character lens)
  → (S4) appraisal + emotion atoms
  → (S5) ToM/dyadic policy atoms
  → (S6) drv:* (drivers)
  → (S7) goal:* (goals) + util:* projection
  → (S8) action:* decision
  → (S9) predicted transition + belief persistence when enabled

User-facing runs may select an explicit runtime profile. `legacy` is the
compatibility control; `phase1` enables the validated communication, object,
location, memory, prior-influence, and PAM-v2 mechanisms for that run without
mutating global FormulaConfig. The selected profile is part of trace and must
be included when comparing runs.

## Reading strategy

Если нужно понять “почему это произошло”:
1) Начать с `docs/PIPELINE.md` и определить, какая стадия должна была создать нужный сигнал.
2) Найти атом на соответствующей стадии в Pipeline UI и посмотреть trace.usedAtomIds.
3) Сопоставить usedAtomIds с контрактом стадии.

---

## Agent docs (Character → Lens → ToM → Goal Lab)

Полный том документации для агентов лежит в `docs/agents/00_README.md`.
