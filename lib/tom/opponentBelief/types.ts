import type { KanonarSystemVersion } from '../../goal-lab/versioning';
import type { ObservationProvenanceV1 } from '../../scene/observation/types';

export const OPPONENT_BELIEF_SCHEMA_VERSION = 1 as const;
export const APPROVED_BELIEF_KEYS_V1 = ['trust', 'threat', 'support', 'attachment', 'respect', 'dominance', 'predictability', 'alignment'] as const;
export type ApprovedBeliefKeyV1 = typeof APPROVED_BELIEF_KEYS_V1[number];

export type EstimateV1 = { value: number; confidence: number; uncertainty: number; evidenceIds: string[]; updatedAtTick: number };
export type BeliefEvidenceKindV1 = 'observation' | 'relation_snapshot' | 'role_status' | 'faction_signal' | 'behavior_event' | 'speech' | 'scene_fact' | 'compatibility_prior';
export type BeliefEvidenceV1 = {
  schemaVersion: 1; evidenceId: string; kind: BeliefEvidenceKindV1;
  observerId: string; targetId: string; observationId?: string;
  payload: Record<string, unknown>; reliability: number; tick: number;
  provenance: ObservationProvenanceV1;
};
export type BeliefUpdateTraceV1 = {
  traceId: string; tick: number; observerId: string; targetId: string;
  beforeDigest: string; evidenceIds: string[];
  axisChanges: Array<{ key: ApprovedBeliefKeyV1; before: EstimateV1; after: EstimateV1; ruleId: string; contributorIds: string[] }>;
  afterDigest: string; adapterSteps: ObservationProvenanceV1['adapterSteps'];
};
export type OpponentBeliefV1 = {
  schemaVersion: 1; systemVersion: KanonarSystemVersion; beliefId: string;
  observerId: string; targetId: string;
  estimates: Record<ApprovedBeliefKeyV1, EstimateV1>;
  inferredGoals: Array<{ goalId: string; probability: number; confidence: number; evidenceIds: string[] }>;
  predictedPolicy: Array<{ actionCategory: string; probability: number; confidence: number; evidenceIds: string[] }>;
  evidence: BeliefEvidenceV1[];
  summary: { confidence: number; uncertainty: number };
  lastUpdateTrace?: BeliefUpdateTraceV1;
  updatedAtTick: number;
};
