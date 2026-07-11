import { FC } from '../../config/formulaConfig';
import { KANONAR_SYSTEM_VERSION } from '../../goal-lab/versioning';
import type { ContextAtom } from '../../context/v2/types';
import type { ObservationEnvelopeV1 } from '../../scene/observation/types';
import { codeUnitCompare } from '../../utils/compare';
import { updateOpponentBeliefV1 } from './update';
import { APPROVED_BELIEF_KEYS_V1, OPPONENT_BELIEF_SCHEMA_VERSION, type BeliefEvidenceKindV1, type BeliefEvidenceV1, type OpponentBeliefV1 } from './types';

function evidenceKind(observation: ObservationEnvelopeV1): BeliefEvidenceKindV1 {
  if (observation.kind === 'speech') return 'speech';
  if (observation.kind === 'scene_fact') return 'scene_fact';
  if (observation.kind === 'relation_signal') return 'relation_snapshot';
  if (observation.kind === 'role_signal') return 'role_status';
  if (observation.kind === 'direct_event') return 'behavior_event';
  return 'observation';
}

export function makeNeutralOpponentBeliefPriorV1(args: { observerId: string; targetId: string; tick: number }): OpponentBeliefV1 {
  if (!args.observerId || !args.targetId || args.observerId === args.targetId) throw new Error('self_target_forbidden');
  const estimates = Object.fromEntries(APPROVED_BELIEF_KEYS_V1.map(key => [key, {
    value: FC.opponentBeliefV1.priorValue,
    confidence: FC.opponentBeliefV1.priorConfidence,
    uncertainty: FC.opponentBeliefV1.priorUncertainty,
    evidenceIds: [], updatedAtTick: args.tick,
  }])) as OpponentBeliefV1['estimates'];
  return {
    schemaVersion: OPPONENT_BELIEF_SCHEMA_VERSION, systemVersion: KANONAR_SYSTEM_VERSION,
    beliefId: `belief:opponent:${args.observerId}:${args.targetId}`,
    observerId: args.observerId, targetId: args.targetId, estimates,
    inferredGoals: [], predictedPolicy: [], evidence: [],
    summary: { confidence: FC.opponentBeliefV1.priorConfidence, uncertainty: FC.opponentBeliefV1.priorUncertainty },
    updatedAtTick: args.tick,
  };
}

export function buildOpponentBeliefV1(args: { observerId: string; targetId: string; observations: ObservationEnvelopeV1[]; tick: number }): OpponentBeliefV1 {
  const prior = makeNeutralOpponentBeliefPriorV1(args);
  const evidence: BeliefEvidenceV1[] = args.observations
    .filter(item => item.observerId === args.observerId && (item.targetId === args.targetId || (!item.targetId && item.subjectId === args.targetId)))
    .map(item => ({ schemaVersion: 1 as const, evidenceId: `belief:evidence:${item.sceneId}:${item.observationId}`, kind: evidenceKind(item), observerId: args.observerId, targetId: args.targetId, observationId: item.observationId, payload: item.payload, reliability: item.reliability, tick: item.tick, provenance: item.provenance }))
    .sort((a, b) => a.tick - b.tick || codeUnitCompare(a.evidenceId, b.evidenceId));
  return updateOpponentBeliefV1(prior, evidence, args.tick);
}

export function projectOpponentBeliefToS5AtomsV1(belief: OpponentBeliefV1): ContextAtom[] {
  const traceId = belief.lastUpdateTrace?.traceId;
  return APPROVED_BELIEF_KEYS_V1.flatMap(key => {
    const estimate = belief.estimates[key];
    const common = { source: 'tom' as const, ns: 'tom', origin: 'belief' as const, subject: belief.observerId, target: belief.targetId, confidence: estimate.confidence, trace: { usedAtomIds: [belief.beliefId, ...estimate.evidenceIds], notes: ['OpponentBeliefV1 S5 projection'], parts: { beliefId: belief.beliefId, key, tick: estimate.updatedAtTick, traceId } } };
    return [
      { ...common, id: `tom:belief:final:${belief.observerId}:${belief.targetId}:${key}`, kind: 'tom_belief_final', magnitude: estimate.value },
      { ...common, id: `tom:belief:confidence:${belief.observerId}:${belief.targetId}:${key}`, kind: 'tom_belief_confidence', magnitude: estimate.confidence },
      { ...common, id: `tom:belief:uncertainty:${belief.observerId}:${belief.targetId}:${key}`, kind: 'tom_belief_uncertainty', magnitude: estimate.uncertainty },
    ];
  });
}
