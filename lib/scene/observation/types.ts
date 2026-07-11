import type { KanonarSystemVersion } from '../../goal-lab/versioning';

export const OBSERVATION_SCHEMA_VERSION = 1 as const;

export type ObservationKindV1 =
  | 'direct_event'
  | 'spatial_presence'
  | 'speech'
  | 'scene_fact'
  | 'relation_signal'
  | 'role_signal'
  | 'knowledge_assignment';

export type ObservationProvenanceV1 = {
  sourceIds: string[];
  adapterSteps: Array<{
    adapterId: string;
    adapterVersion: number;
    inputIds: string[];
    note?: string;
  }>;
};

export type VisibilityRuleV1 = {
  ruleId: string;
  mode: 'public' | 'participants' | 'observer_list' | 'private';
  observerIds?: string[];
  subjectIds?: string[];
  kindFilter?: ObservationKindV1[];
  fieldAllowlist?: string[];
  reliabilityMultiplier?: number;
  provenance: ObservationProvenanceV1;
};

export type SceneEventInputV1 = {
  eventId: string;
  kind: ObservationKindV1;
  tick: number;
  actorId?: string;
  targetIds: string[];
  payload: Record<string, unknown>;
  visibilityRuleIds: string[];
  baseReliability: number;
  provenance: ObservationProvenanceV1;
};

export type RelationLayerNameV1 =
  | 'persistent'
  | 'branch'
  | 'scene_override'
  | 'runtime_update';

export type RelationLayerInputV1 = {
  layer: RelationLayerNameV1;
  fromId: string;
  toId: string;
  values: Record<string, number>;
  visibilityRuleIds: string[];
  provenance: ObservationProvenanceV1;
};

export type KnowledgeAssignmentV1 = {
  assignmentId: string;
  observerId: string;
  subjectId?: string;
  targetId?: string;
  factKind: string;
  payload: Record<string, unknown>;
  reliability: number;
  validFromTick: number;
  validUntilTick?: number;
  provenance: ObservationProvenanceV1;
};

export type ResolvedSceneInputV1 = {
  schemaVersion: typeof OBSERVATION_SCHEMA_VERSION;
  systemVersion: KanonarSystemVersion;
  sceneId: string;
  sourceRefs: Array<{ kind: string; id: string; schemaVersion?: number }>;
  seed: number;
  tick: number;
  cast: Array<{
    agentId: string;
    roleIds: string[];
    roleVisibility: VisibilityRuleV1;
  }>;
  povAgentIds: string[];
  placements: Array<{
    agentId: string;
    locationId: string;
    nodeId?: string | null;
    x?: number;
    y?: number;
    provenance: ObservationProvenanceV1;
  }>;
  events: SceneEventInputV1[];
  relationLayers: RelationLayerInputV1[];
  knowledge: KnowledgeAssignmentV1[];
  visibilityRules: VisibilityRuleV1[];
  tags: string[];
};

export type ObservationEnvelopeV1 = {
  schemaVersion: typeof OBSERVATION_SCHEMA_VERSION;
  systemVersion: KanonarSystemVersion;
  observationId: string;
  sceneId: string;
  observerId: string;
  subjectId?: string;
  targetId?: string;
  kind: ObservationKindV1;
  payload: Record<string, unknown>;
  visibility: {
    ruleIds: string[];
    mode: VisibilityRuleV1['mode'];
    allowedFields: string[];
  };
  reliability: number;
  source: { sourceKind: string; sourceId: string };
  tick: number;
  provenance: ObservationProvenanceV1;
};

export type ObservationValidationCodeV1 =
  | 'invalid_schema_version'
  | 'invalid_system_version'
  | 'invalid_seed'
  | 'duplicate_cast_id'
  | 'duplicate_event_id'
  | 'duplicate_assignment_id'
  | 'unknown_pov'
  | 'unknown_agent_reference'
  | 'missing_placement'
  | 'invalid_placement'
  | 'unknown_location'
  | 'invalid_role_reference'
  | 'invalid_visibility_rule'
  | 'unknown_visibility_reference'
  | 'invalid_reliability'
  | 'invalid_tick'
  | 'invalid_knowledge_assignment'
  | 'invalid_relation_layer'
  | 'unknown_event_kind'
  | 'missing_provenance';

export type ObservationValidationErrorV1 = {
  code: ObservationValidationCodeV1;
  path: string;
  value?: unknown;
  sourceId?: string;
};

export type ObservationValidationReportV1 = {
  valid: boolean;
  errors: ObservationValidationErrorV1[];
};

export type RelationResolutionV1 = {
  fromId: string;
  toId: string;
  values: Record<string, number>;
  winningSourceByKey: Record<string, string>;
  provenance: ObservationProvenanceV1;
};

export type ObservationResolutionV1 = {
  schemaVersion: typeof OBSERVATION_SCHEMA_VERSION;
  systemVersion: KanonarSystemVersion;
  sceneId: string;
  tick: number;
  observationsByCharacterId: Record<string, ObservationEnvelopeV1[]>;
  relationResolution: RelationResolutionV1[];
  validation: ObservationValidationReportV1;
};

export type ObservationResolutionResultV1 =
  | { ok: true; value: ObservationResolutionV1 }
  | { ok: false; validation: ObservationValidationReportV1 };
