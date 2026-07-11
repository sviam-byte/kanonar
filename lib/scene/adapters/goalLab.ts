import type { Observation } from '../../../types';
import type { ContextAtom } from '../../context/v2/types';
import { codeUnitCompare } from '../../utils/compare';
import type { ObservationEnvelopeV1, ObservationResolutionV1, ResolvedSceneInputV1 } from '../observation/types';

export type GoalLabSceneProjectionV1 = {
  schemaVersion: 1;
  sceneId: string;
  seed: number;
  tick: number;
  sceneSnapshot: {
    schemaVersion: 1;
    sceneId: string;
    participants: string[];
    placements: ResolvedSceneInputV1['placements'];
    sourceRefs: ResolvedSceneInputV1['sourceRefs'];
  };
  observations: Record<string, Observation[]>;
  observationAtoms: ContextAtom[];
  /**
   * Raw resolver envelopes per observer — the input for the directed
   * OpponentBelief builder. Callers wire it as `world.resolvedObservations`.
   */
  observationEnvelopes: ObservationResolutionV1['observationsByCharacterId'];
};

function legacyKind(envelope: ObservationEnvelopeV1): Observation['kind'] {
  if (envelope.kind === 'speech' || envelope.kind === 'knowledge_assignment') return 'share_info';
  if (envelope.kind === 'direct_event') return 'event';
  return 'perception';
}

export function adaptResolvedSceneToGoalLabV1(scene: ResolvedSceneInputV1, resolution: ObservationResolutionV1): GoalLabSceneProjectionV1 {
  if (scene.sceneId !== resolution.sceneId || scene.tick !== resolution.tick) throw new Error('goal_lab_scene_resolution_mismatch');
  const observations: Record<string, Observation[]> = {};
  const observationAtoms: ContextAtom[] = [];
  for (const observerId of Object.keys(resolution.observationsByCharacterId).sort()) {
    observations[observerId] = resolution.observationsByCharacterId[observerId].map(envelope => {
      observationAtoms.push({
        id: `obs:resolved:${envelope.observationId}`,
        kind: 'observation', ns: 'obs', origin: 'obs', source: 'observationExtractor',
        magnitude: envelope.reliability, confidence: envelope.reliability,
        subject: envelope.subjectId, target: envelope.targetId,
        trace: { usedAtomIds: [...envelope.provenance.sourceIds], notes: ['GoalLab scene adapter V1'], parts: { sceneId: scene.sceneId, observationId: envelope.observationId, ruleIds: envelope.visibility.ruleIds } },
      });
      return {
        id: envelope.observationId, tick: envelope.tick, t: envelope.tick,
        observerId: envelope.observerId, subjectId: envelope.subjectId,
        receiverId: envelope.targetId, kind: legacyKind(envelope), payload: envelope.payload,
        visibility: 1, noise: 1 - envelope.reliability,
        channel: envelope.kind === 'speech' ? 'auditory' : 'direct',
        context: { source: envelope.source, provenance: envelope.provenance, visibility: envelope.visibility },
      };
    });
  }
  observationAtoms.sort((a, b) => codeUnitCompare(String(a.id), String(b.id)));
  return {
    schemaVersion: 1, sceneId: scene.sceneId, seed: scene.seed, tick: scene.tick,
    sceneSnapshot: { schemaVersion: 1, sceneId: scene.sceneId, participants: scene.cast.map(item => item.agentId).sort(), placements: scene.placements, sourceRefs: scene.sourceRefs },
    observations, observationAtoms,
    observationEnvelopes: resolution.observationsByCharacterId,
  };
}
