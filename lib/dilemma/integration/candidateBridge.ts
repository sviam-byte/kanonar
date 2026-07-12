import type { ContextAtom } from '../../context/v2/types';
import type { Possibility } from '../../possibilities/catalog';
import { clamp11 } from '../../util/math';
import { getAtom } from '../../util/atoms';
import type { ActionImpact } from '../learningMemory';
import { actionImpactForTrustExchange } from '../dynamics/actionImpact';
import type { ConflictActionProjectionRow } from '../definition/types';

// Bridge from typed projection rows to GoalLab action candidates.
//
// Vocabulary discipline (CONFLICT-GAP-0): kernel actions are never renamed to
// GoalLab social keys. Goal deltas derive from the mechanic's own typed
// ActionImpact through the versioned matrix below, and enter the candidate
// via the meta.sim.deltaGoals channel that buildActionCandidates already
// blends for external (SimKit) offers.

export const CONFLICT_IMPACT_GOAL_MATRIX_VERSION = 'conflict-impact-goal-matrix-v1' as const;

type ImpactDimension = keyof ActionImpact;

// coefficient per (impact dimension -> goal domain); deltas are the
// impact-weighted sums, clamped to [-1, 1].
export const CONFLICT_IMPACT_GOAL_MATRIX_V1: Readonly<Partial<Record<ImpactDimension, Readonly<Record<string, number>>>>> = {
  support: { affiliation: 0.6, safety: 0.1 },
  repair: { affiliation: 0.5 },
  submission: { status: -0.3, control: -0.2 },
  withdrawal: { safety: 0.3, affiliation: -0.3 },
  protection: { safety: 0.6 },
  harm: { affiliation: -0.4, control: 0.2 },
  dominance: { control: 0.5, status: 0.3 },
  betrayal: { affiliation: -0.6, control: 0.2, safety: -0.1 },
  deception: { affiliation: -0.2, control: 0.2 },
  humiliation: { affiliation: -0.3, status: 0.2 },
  threat: { control: 0.3, safety: -0.2 },
};

export const CONFLICT_BELIEF_MODULATION_VERSION = 'conflict-belief-modulation-v1' as const;

export interface ConflictBeliefSignals {
  readonly trust: number;
  readonly threat: number;
  readonly usedAtomIds: readonly string[];
}

// Directed belief read, canonical belief atoms first (TOM_SPEC_0 / audit fix:
// decisions read beliefs, not the counterparty's true fields).
function readBeliefMetric(
  atoms: readonly ContextAtom[],
  selfId: string,
  targetId: string,
  metric: string,
): { value: number; atomId: string | null } {
  const candidates = [
    `tom:belief:final:${selfId}:${targetId}:${metric}`,
    `tom:dyad:final:${metric}:${selfId}:${targetId}`,
    `rel:state:${metric}:${selfId}:${targetId}`,
    `tom:dyad:${metric}:${selfId}:${targetId}`,
  ];
  for (const id of candidates) {
    const atom = getAtom(atoms as ContextAtom[], id);
    const value = Number(atom?.magnitude ?? Number.NaN);
    if (Number.isFinite(value)) return { value: Math.max(0, Math.min(1, value)), atomId: id };
  }
  return { value: 0.5, atomId: null };
}

export function readConflictBeliefSignals(
  atoms: readonly ContextAtom[],
  selfId: string,
  targetId: string,
): ConflictBeliefSignals {
  const trust = readBeliefMetric(atoms, selfId, targetId, 'trust');
  const threat = readBeliefMetric(atoms, selfId, targetId, 'threat');
  return {
    trust: trust.value,
    threat: threat.value,
    usedAtomIds: [trust.atomId, threat.atomId].filter(Boolean) as string[],
  };
}

// Belief modulation v1, neutral at belief = 0.5:
// - reciprocity: positive affiliation contributions of `support` scale with
//   believed trust (betting on reciprocation);
// - retaliation: negative safety contributions of `betrayal`/`threat` scale
//   with believed threat (expected escalation).
function modulation(
  dimension: ImpactDimension,
  goalId: string,
  coefficient: number,
  beliefs: ConflictBeliefSignals,
): number {
  if (dimension === 'support' && goalId === 'affiliation' && coefficient > 0) {
    return 0.4 + 1.2 * beliefs.trust;
  }
  if ((dimension === 'betrayal' || dimension === 'threat') && goalId === 'safety' && coefficient < 0) {
    return 0.6 + 0.8 * beliefs.threat;
  }
  return 1;
}

export function conflictDeltaGoalsV1(
  impact: ActionImpact,
  beliefs: ConflictBeliefSignals,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const dimension of Object.keys(CONFLICT_IMPACT_GOAL_MATRIX_V1) as ImpactDimension[]) {
    const weight = Number(impact[dimension] ?? 0);
    if (Math.abs(weight) < 1e-9) continue;
    const goalRow = CONFLICT_IMPACT_GOAL_MATRIX_V1[dimension];
    if (!goalRow) continue;
    for (const [goalId, coefficient] of Object.entries(goalRow)) {
      out[goalId] = (out[goalId] ?? 0) + weight * coefficient * modulation(dimension, goalId, coefficient, beliefs);
    }
  }
  for (const goalId of Object.keys(out)) out[goalId] = clamp11(out[goalId]);
  return out;
}

export function buildConflictPossibilities(args: {
  rows: readonly ConflictActionProjectionRow[];
  atoms: readonly ContextAtom[];
  selfId: string;
}): { possibilities: Possibility[]; beliefSignalsByTarget: Record<string, ConflictBeliefSignals> } {
  const beliefSignalsByTarget: Record<string, ConflictBeliefSignals> = {};
  const possibilities = args.rows.map((row): Possibility => {
    const targetId = row.targetIds[0];
    if (!beliefSignalsByTarget[targetId]) {
      beliefSignalsByTarget[targetId] = readConflictBeliefSignals(args.atoms, args.selfId, targetId);
    }
    const beliefs = beliefSignalsByTarget[targetId];
    const impact = actionImpactForTrustExchange(row.kernelActionId);
    const deltaGoals = conflictDeltaGoalsV1(impact, beliefs);
    return {
      // id === utilityCandidateId so the chosen candidate resolves back into
      // the kernel by exact match only (fail-closed projection gate).
      id: row.utilityCandidateId,
      kind: 'con',
      label: row.kernelActionId,
      magnitude: 0,
      confidence: 1,
      cost: 0,
      subjectId: args.selfId,
      targetId,
      trace: {
        usedAtomIds: [...beliefs.usedAtomIds],
        notes: ['conflict-candidate-bridge-v1'],
        parts: {
          kernelActionId: row.kernelActionId,
          protocolId: row.protocolId,
          phaseId: row.phaseId,
          impact,
          matrixVersion: CONFLICT_IMPACT_GOAL_MATRIX_VERSION,
          beliefModulationVersion: CONFLICT_BELIEF_MODULATION_VERSION,
          beliefSignals: { trust: beliefs.trust, threat: beliefs.threat },
        },
      },
      meta: { sim: { deltaGoals }, conflict: { projectionRow: row } },
    };
  });
  return { possibilities, beliefSignalsByTarget };
}
