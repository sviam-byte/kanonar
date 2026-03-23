import type { ContextAtom } from '../../context/v2/types';
import type { DerivedGoalPressure } from '../../goal-lab/pipeline/deriveGoalPressuresV1';

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

/**
 * Transitional projection:
 * GoalSpecV1 pressures become normal goal-atoms, so downstream layers can start
 * "seeing" the new goal dictionary without a full rewrite.
 */
export function projectGoalPressuresToAtoms(
  pressures: DerivedGoalPressure[],
): ContextAtom[] {
  const sorted = [...pressures].sort((a, b) => b.pressure - a.pressure);
  if (sorted.length === 0) return [];

  const atoms: ContextAtom[] = [];

  const top = sorted[0];
  atoms.push({
    id: 'goal:v1:top',
    kind: 'goal.top',
    source: 'system',
    ns: 'goal',
    origin: 'derived',
    magnitude: clamp01(top.pressure),
    label: top.goalId,
    tags: ['goal_v1', 'top_goal'],
    trace: {
      notes: ['GoalSpecV1 top-pressure projection'],
    },
    meta: {
      goalId: top.goalId,
      pressure: top.pressure,
      reasons: top.reasons,
    },
  } as ContextAtom);

  for (const item of sorted) {
    atoms.push({
      id: `goal:v1:active:${item.goalId}`,
      kind: 'goal.active',
      source: 'system',
      ns: 'goal',
      origin: 'derived',
      magnitude: clamp01(item.pressure),
      label: item.goalId,
      tags: ['goal_v1', item.goalId],
      trace: {
        notes: ['Projected from GoalSpecV1 pressure'],
      },
      meta: {
        goalId: item.goalId,
        pressure: item.pressure,
        reasons: item.reasons,
      },
    } as ContextAtom);
  }

  return atoms;
}
