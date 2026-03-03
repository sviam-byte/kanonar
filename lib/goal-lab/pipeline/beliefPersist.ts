/**
 * Belief Persistence Layer — closes the POMDP feedback loop.
 *
 * Takes S8 output (chosen action) + S9 output (transition prediction) and
 * produces belief atoms to persist in agent.memory.beliefAtoms.
 * On the next tick, S0 reads these, enabling:
 *
 * 1. Surprise detection: predicted z₁ vs actual z₀
 * 2. Goal reprioritization via feasibility history
 * 3. Persistent belief drift (learning-like adaptation)
 *
 * The caller (runGoalLabPipelineV1 or SimKit orchestrator) MUST take
 * the returned atoms and write them to agent.memory.beliefAtoms.
 * The pipeline itself does NOT mutate agent state.
 */

import type { ContextAtom } from '../../context/v2/types';
import type { TransitionSnapshotLite, FeatureKey } from './lookahead';
import { normalizeAtom } from '../../context/v2/infer';
import { clamp01 } from '../../util/math';

export type BeliefPersistInput = {
  selfId: string;
  tick: number;
  chosenAction: {
    id: string;
    kind: string;
    targetId?: string | null;
    q: number;
  } | null;
  goalEnergy: Record<string, number>;
  transition: TransitionSnapshotLite | null;
  prevBeliefAtoms?: ContextAtom[];
  /** Driver pressure values (final drv:* magnitudes) to persist for next tick accumulation. */
  driverPressure?: Record<string, number>;
};

export type BeliefPersistOutput = {
  /** Atoms to persist in agent.memory.beliefAtoms for next tick. */
  beliefAtoms: ContextAtom[];
  /** Surprise signals (predicted vs actual). Empty on first tick. */
  surpriseAtoms: ContextAtom[];
  debug: {
    predictedFeatureCount: number;
    feasibilityCount: number;
    surpriseCount: number;
  };
};

export function buildBeliefPersistAtoms(input: BeliefPersistInput): BeliefPersistOutput {
  const { selfId, tick, chosenAction, goalEnergy, transition, prevBeliefAtoms, driverPressure } = input;
  const beliefAtoms: ContextAtom[] = [];
  const surpriseAtoms: ContextAtom[] = [];

  // 1) Predicted feature vector (z₁) for the chosen action.
  //    Next tick: S0 reads these, compare with actual z₀ → surprise.
  if (transition && chosenAction) {
    const chosenEval = (transition.perAction || []).find(
      (ev) => String(ev.actionId) === String(chosenAction.id)
    );

    if (chosenEval?.z1) {
      for (const [fk, val] of Object.entries(chosenEval.z1)) {
        beliefAtoms.push(normalizeAtom({
          id: `belief:predicted:${fk}:${selfId}`,
          ns: 'belief' as any,
          kind: 'belief_predicted_feature',
          origin: 'derived',
          source: 'beliefPersist',
          subject: selfId,
          magnitude: clamp01(Number(val)),
          confidence: 0.7,
          tags: ['belief', 'predicted', fk],
          label: `predicted.${fk}:${Math.round(clamp01(Number(val)) * 100)}%`,
          meta: { tick, actionId: chosenAction.id, feature: fk },
          trace: {
            usedAtomIds: [],
            notes: [`S9 prediction for ${fk} after ${chosenAction.kind}`],
            parts: { tick, actionKind: chosenAction.kind, predictedValue: val },
          },
        } as any));
      }
    }
  }

  // 2) Chosen action belief — what the agent decided and why.
  if (chosenAction) {
    beliefAtoms.push(normalizeAtom({
      id: `belief:chosen:${selfId}`,
      ns: 'belief' as any,
      kind: 'belief_chosen_action',
      origin: 'derived',
      source: 'beliefPersist',
      subject: selfId,
      magnitude: clamp01(chosenAction.q),
      confidence: 1,
      tags: ['belief', 'chosen'],
      label: `chosen:${chosenAction.kind}`,
      meta: {
        tick,
        actionId: chosenAction.id,
        kind: chosenAction.kind,
        targetId: chosenAction.targetId ?? null,
        q: chosenAction.q,
      },
      trace: { usedAtomIds: [], notes: ['persisted chosen action for next tick'], parts: { tick } },
    } as any));
  }

  // 3) Goal feasibility beliefs — which goals can be advanced.
  if (transition) {
    const bestAction = (transition.perAction || [])[0];
    if (bestAction?.v1PerGoal) {
      for (const [goalId, contrib] of Object.entries(bestAction.v1PerGoal)) {
        const v0 = Number(bestAction.v0PerGoal?.[goalId] ?? 0);
        const delta = Number(contrib) - v0;
        const energyWeight = clamp01(Number(goalEnergy[goalId] ?? 0.5));
        const feasibility = clamp01((0.5 + delta * 2) * (0.6 + 0.4 * energyWeight));
        beliefAtoms.push(normalizeAtom({
          id: `belief:feasibility:${goalId}:${selfId}`,
          ns: 'belief' as any,
          kind: 'belief_goal_feasibility',
          origin: 'derived',
          source: 'beliefPersist',
          subject: selfId,
          magnitude: feasibility,
          confidence: 0.6,
          tags: ['belief', 'feasibility', goalId],
          label: `feasibility.${goalId}:${Math.round(feasibility * 100)}%`,
          meta: { tick, goalId, delta, v0, v1: Number(contrib), energyWeight },
          trace: {
            usedAtomIds: [],
            notes: [`goal feasibility from S9: delta=${delta.toFixed(3)}`],
            parts: { tick, goalId, delta },
          },
        } as any));
      }
    }
  }

  // 4) Surprise detection: compare prev tick predictions with current z₀.
  if (prevBeliefAtoms && transition?.z0) {
    for (const prev of prevBeliefAtoms) {
      const id = String((prev as any)?.id || '');
      if (!id.startsWith('belief:predicted:') || !id.endsWith(`:${selfId}`)) continue;
      const fk = id.split(':')[2] as FeatureKey;
      const predicted = clamp01(Number((prev as any)?.magnitude ?? 0));
      const actual = clamp01(Number((transition.z0.z as any)?.[fk] ?? 0));
      const surprise = Math.abs(actual - predicted);
      if (surprise > 0.05) {
        surpriseAtoms.push(normalizeAtom({
          id: `belief:surprise:${fk}:${selfId}`,
          ns: 'belief' as any,
          kind: 'belief_surprise',
          origin: 'derived',
          source: 'beliefPersist',
          subject: selfId,
          magnitude: clamp01(surprise),
          confidence: 0.8,
          tags: ['belief', 'surprise', fk],
          label: `surprise.${fk}:${Math.round(surprise * 100)}%`,
          meta: { tick, feature: fk, predicted, actual, surprise },
          trace: {
            usedAtomIds: [(prev as any)?.id],
            notes: [`predicted=${predicted.toFixed(2)}, actual=${actual.toFixed(2)}, surprise=${surprise.toFixed(2)}`],
            parts: { tick, feature: fk, predicted, actual },
          },
        } as any));
      }
    }
  }


  // 5) Persist driver pressure for S6 temporal accumulation in the next tick.
  if (driverPressure) {
    for (const [driverKey, value] of Object.entries(driverPressure)) {
      const pressure = clamp01(Number(value));
      beliefAtoms.push(normalizeAtom({
        id: `belief:pressure:${driverKey}:${selfId}`,
        ns: 'belief' as any,
        kind: 'belief_driver_pressure',
        origin: 'derived',
        source: 'beliefPersist',
        subject: selfId,
        magnitude: pressure,
        confidence: 0.9,
        tags: ['belief', 'pressure', driverKey],
        label: `pressure.${driverKey}:${Math.round(pressure * 100)}%`,
        meta: { tick, driverKey, pressure },
        trace: {
          usedAtomIds: [],
          notes: ['persisted S6 driver pressure for temporal accumulation'],
          parts: { tick, driverKey, pressure },
        },
      } as any));
    }
  }

  // Persist surprise atoms with belief state so next tick S0 can feed S6 drivers.
  return {
    beliefAtoms: [...beliefAtoms, ...surpriseAtoms],
    surpriseAtoms,
    debug: {
      predictedFeatureCount: beliefAtoms.filter(a => (a as any)?.kind === 'belief_predicted_feature').length,
      feasibilityCount: beliefAtoms.filter(a => (a as any)?.kind === 'belief_goal_feasibility').length,
      surpriseCount: surpriseAtoms.length,
    },
  };
}
