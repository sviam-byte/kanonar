import { KANONAR_SYSTEM_VERSION } from '../../goal-lab/versioning';
import { codeUnitCompare } from '../../utils/compare';
import {
  OBSERVATION_SCHEMA_VERSION,
  type ObservationEnvelopeV1,
  type ObservationEnvelopeDecodeResultV1,
  type ObservationKindV1,
  type ObservationProvenanceV1,
  type ObservationResolutionResultV1,
  type ObservationValidationErrorV1,
  type ObservationValidationReportV1,
  type RelationLayerInputV1,
  type RelationLayerNameV1,
  type RelationResolutionV1,
  type ResolvedSceneInputV1,
  type VisibilityRuleV1,
} from './types';

const OBSERVATION_KINDS: ReadonlySet<string> = new Set<ObservationKindV1>([
  'direct_event', 'spatial_presence', 'speech', 'scene_fact',
  'relation_signal', 'role_signal', 'knowledge_assignment',
]);

const LAYER_ORDER: Record<RelationLayerNameV1, number> = {
  persistent: 0,
  branch: 1,
  scene_override: 2,
  runtime_update: 3,
};

const MODE_RESTRICTIVENESS: Record<VisibilityRuleV1['mode'], number> = {
  private: 0,
  observer_list: 1,
  participants: 2,
  public: 3,
};

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validProvenance(value: unknown): value is ObservationProvenanceV1 {
  if (!isRecord(value) || !Array.isArray(value.sourceIds) || !Array.isArray(value.adapterSteps)) return false;
  return value.sourceIds.length > 0
    && value.sourceIds.every(nonEmpty)
    && value.adapterSteps.length > 0
    && value.adapterSteps.every(step => isRecord(step)
      && nonEmpty(step.adapterId)
      && Number.isInteger(step.adapterVersion)
      && Number(step.adapterVersion) >= 0
      && Array.isArray(step.inputIds)
      && step.inputIds.every(nonEmpty));
}

function validReliability(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function addError(
  errors: ObservationValidationErrorV1[],
  code: ObservationValidationErrorV1['code'],
  path: string,
  value?: unknown,
  sourceId?: string,
): void {
  errors.push({ code, path, value, sourceId });
}

/** Decode persisted/resumed envelopes as a fail-closed wire boundary. */
export function decodeObservationEnvelopesV1(
  input: unknown,
  expectedObserverId: string,
): ObservationEnvelopeDecodeResultV1 {
  const errors: ObservationValidationErrorV1[] = [];
  if (!Array.isArray(input)) {
    addError(errors, 'invalid_observation_envelope', 'observations', input);
    return { ok: false, validation: { valid: false, errors } };
  }

  input.forEach((item, index) => {
    const path = `observations[${index}]`;
    if (!isRecord(item)) {
      addError(errors, 'invalid_observation_envelope', path, item);
      return;
    }
    if (item.schemaVersion !== OBSERVATION_SCHEMA_VERSION) addError(errors, 'invalid_schema_version', `${path}.schemaVersion`, item.schemaVersion);
    if (item.systemVersion !== KANONAR_SYSTEM_VERSION) addError(errors, 'invalid_system_version', `${path}.systemVersion`, item.systemVersion);
    if (!nonEmpty(item.observationId) || !nonEmpty(item.sceneId)) addError(errors, 'invalid_observation_envelope', path, item);
    if (item.observerId !== expectedObserverId) addError(errors, 'invalid_observation_envelope', `${path}.observerId`, item.observerId);
    if (item.subjectId !== undefined && !nonEmpty(item.subjectId)) addError(errors, 'invalid_observation_envelope', `${path}.subjectId`, item.subjectId);
    if (item.targetId !== undefined && !nonEmpty(item.targetId)) addError(errors, 'invalid_observation_envelope', `${path}.targetId`, item.targetId);
    if (!OBSERVATION_KINDS.has(String(item.kind ?? ''))) addError(errors, 'unknown_event_kind', `${path}.kind`, item.kind);
    if (!isRecord(item.payload)) addError(errors, 'invalid_observation_envelope', `${path}.payload`, item.payload);
    if (!validReliability(item.reliability)) addError(errors, 'invalid_reliability', `${path}.reliability`, item.reliability);
    if (!Number.isInteger(item.tick) || Number(item.tick) < 0) addError(errors, 'invalid_tick', `${path}.tick`, item.tick);
    if (!isRecord(item.source) || !nonEmpty(item.source.sourceKind) || !nonEmpty(item.source.sourceId)) {
      addError(errors, 'invalid_observation_envelope', `${path}.source`, item.source);
    }
    if (!isRecord(item.visibility)
      || !Array.isArray(item.visibility.ruleIds)
      || !item.visibility.ruleIds.every(nonEmpty)
      || !Array.isArray(item.visibility.allowedFields)
      || !item.visibility.allowedFields.every(nonEmpty)
      || !Object.hasOwn(MODE_RESTRICTIVENESS, String(item.visibility.mode ?? ''))) {
      addError(errors, 'invalid_observation_envelope', `${path}.visibility`, item.visibility);
    }
    if (!validProvenance(item.provenance)) addError(errors, 'missing_provenance', `${path}.provenance`, item.provenance, String(item.observationId ?? ''));
  });

  if (errors.length > 0) return { ok: false, validation: { valid: false, errors } };
  return { ok: true, value: input as ObservationEnvelopeV1[] };
}

/** Decode the observer-indexed persisted container before selecting a slot. */
export function decodeObservationEnvelopeMapForObserverV1(
  input: unknown,
  expectedObserverId: string,
): ObservationEnvelopeDecodeResultV1 {
  if (!isRecord(input)) {
    return {
      ok: false,
      validation: {
        valid: false,
        errors: [{ code: 'invalid_observation_envelope', path: 'resolvedObservations', value: input }],
      },
    };
  }
  if (!Object.hasOwn(input, expectedObserverId)) {
    return {
      ok: false,
      validation: {
        valid: false,
        errors: [{ code: 'invalid_observation_envelope', path: `resolvedObservations.${expectedObserverId}` }],
      },
    };
  }
  return decodeObservationEnvelopesV1(input[expectedObserverId], expectedObserverId);
}

export function validateResolvedSceneInputV1(input: ResolvedSceneInputV1): ObservationValidationReportV1 {
  const errors: ObservationValidationErrorV1[] = [];
  if (input.schemaVersion !== OBSERVATION_SCHEMA_VERSION) addError(errors, 'invalid_schema_version', 'schemaVersion', input.schemaVersion);
  if (input.systemVersion !== KANONAR_SYSTEM_VERSION) addError(errors, 'invalid_system_version', 'systemVersion', input.systemVersion);
  if (!Number.isSafeInteger(input.seed)) addError(errors, 'invalid_seed', 'seed', input.seed);
  if (!Number.isInteger(input.tick) || input.tick < 0) addError(errors, 'invalid_tick', 'tick', input.tick);
  if (!nonEmpty(input.sceneId)) addError(errors, 'unknown_agent_reference', 'sceneId', input.sceneId);

  const castIds = new Set<string>();
  input.cast.forEach((member, index) => {
    if (!nonEmpty(member.agentId) || castIds.has(member.agentId)) {
      addError(errors, 'duplicate_cast_id', `cast[${index}].agentId`, member.agentId);
    } else castIds.add(member.agentId);
    if (member.roleIds.some(role => !nonEmpty(role))) addError(errors, 'invalid_role_reference', `cast[${index}].roleIds`, member.roleIds, member.agentId);
    if (!validProvenance(member.roleVisibility.provenance)) addError(errors, 'missing_provenance', `cast[${index}].roleVisibility.provenance`, undefined, member.roleVisibility.ruleId);
  });

  input.povAgentIds.forEach((id, index) => {
    if (!castIds.has(id)) addError(errors, 'unknown_pov', `povAgentIds[${index}]`, id);
  });

  const placementCounts = new Map<string, number>();
  input.placements.forEach((placement, index) => {
    placementCounts.set(placement.agentId, (placementCounts.get(placement.agentId) ?? 0) + 1);
    if (!castIds.has(placement.agentId)) addError(errors, 'unknown_agent_reference', `placements[${index}].agentId`, placement.agentId);
    if (!nonEmpty(placement.locationId)) addError(errors, 'unknown_location', `placements[${index}].locationId`, placement.locationId, placement.agentId);
    const nodeSpecified = nonEmpty(placement.nodeId);
    const coordinatesSpecified = Number.isFinite(placement.x) && Number.isFinite(placement.y);
    if (!nodeSpecified && !coordinatesSpecified) addError(errors, 'invalid_placement', `placements[${index}]`, placement, placement.agentId);
    if (!validProvenance(placement.provenance)) addError(errors, 'missing_provenance', `placements[${index}].provenance`, undefined, placement.agentId);
  });
  for (const id of castIds) {
    const count = placementCounts.get(id) ?? 0;
    if (count === 0) addError(errors, 'missing_placement', 'placements', id, id);
    else if (count !== 1) addError(errors, 'invalid_placement', 'placements', id, id);
  }

  const rules = new Map<string, VisibilityRuleV1>();
  const allRules = [...input.visibilityRules, ...input.cast.map(member => member.roleVisibility)];
  allRules.forEach((rule, index) => {
    if (!nonEmpty(rule.ruleId) || rules.has(rule.ruleId)) addError(errors, 'invalid_visibility_rule', `visibilityRules[${index}].ruleId`, rule.ruleId);
    else rules.set(rule.ruleId, rule);
    if (rule.observerIds?.some(id => !castIds.has(id))) addError(errors, 'unknown_agent_reference', `visibilityRules[${index}].observerIds`, rule.observerIds, rule.ruleId);
    if (rule.subjectIds?.some(id => !castIds.has(id))) addError(errors, 'unknown_agent_reference', `visibilityRules[${index}].subjectIds`, rule.subjectIds, rule.ruleId);
    if (rule.reliabilityMultiplier !== undefined && !validReliability(rule.reliabilityMultiplier)) addError(errors, 'invalid_reliability', `visibilityRules[${index}].reliabilityMultiplier`, rule.reliabilityMultiplier, rule.ruleId);
    if (!validProvenance(rule.provenance)) addError(errors, 'missing_provenance', `visibilityRules[${index}].provenance`, undefined, rule.ruleId);
  });

  const checkRuleRefs = (ids: string[], path: string, sourceId: string): void => {
    if (ids.length === 0) addError(errors, 'unknown_visibility_reference', path, ids, sourceId);
    ids.forEach((id, index) => {
      if (!rules.has(id)) addError(errors, 'unknown_visibility_reference', `${path}[${index}]`, id, sourceId);
    });
  };

  const eventIds = new Set<string>();
  input.events.forEach((event, index) => {
    if (!nonEmpty(event.eventId) || eventIds.has(event.eventId)) {
      addError(errors, 'duplicate_event_id', `events[${index}].eventId`, event.eventId, event.eventId);
    } else eventIds.add(event.eventId);
    if (!OBSERVATION_KINDS.has(event.kind)) addError(errors, 'unknown_event_kind', `events[${index}].kind`, event.kind, event.eventId);
    if (!Number.isInteger(event.tick) || event.tick < 0) addError(errors, 'invalid_tick', `events[${index}].tick`, event.tick, event.eventId);
    if (!validReliability(event.baseReliability)) addError(errors, 'invalid_reliability', `events[${index}].baseReliability`, event.baseReliability, event.eventId);
    if (event.actorId !== undefined && !castIds.has(event.actorId)) addError(errors, 'unknown_agent_reference', `events[${index}].actorId`, event.actorId, event.eventId);
    event.targetIds.forEach((id, targetIndex) => {
      if (!castIds.has(id)) addError(errors, 'unknown_agent_reference', `events[${index}].targetIds[${targetIndex}]`, id, event.eventId);
    });
    checkRuleRefs(event.visibilityRuleIds, `events[${index}].visibilityRuleIds`, event.eventId);
    if (!validProvenance(event.provenance)) addError(errors, 'missing_provenance', `events[${index}].provenance`, undefined, event.eventId);
  });

  input.relationLayers.forEach((layer, index) => {
    if (!(layer.layer in LAYER_ORDER) || layer.fromId === layer.toId || !castIds.has(layer.fromId) || !castIds.has(layer.toId)) addError(errors, 'invalid_relation_layer', `relationLayers[${index}]`, layer, `${layer.fromId}:${layer.toId}`);
    if (Object.entries(layer.values).some(([key, value]) => !nonEmpty(key) || !Number.isFinite(value))) addError(errors, 'invalid_relation_layer', `relationLayers[${index}].values`, layer.values, `${layer.fromId}:${layer.toId}`);
    checkRuleRefs(layer.visibilityRuleIds, `relationLayers[${index}].visibilityRuleIds`, `${layer.fromId}:${layer.toId}`);
    if (!validProvenance(layer.provenance)) addError(errors, 'missing_provenance', `relationLayers[${index}].provenance`, undefined, `${layer.fromId}:${layer.toId}`);
  });

  const assignmentIds = new Set<string>();
  input.knowledge.forEach((item, index) => {
    if (nonEmpty(item.assignmentId) && assignmentIds.has(item.assignmentId)) {
      addError(errors, 'duplicate_assignment_id', `knowledge[${index}].assignmentId`, item.assignmentId, item.assignmentId);
    } else if (nonEmpty(item.assignmentId)) assignmentIds.add(item.assignmentId);
    const refs = [item.observerId, item.subjectId, item.targetId].filter((id): id is string => id !== undefined);
    if (!nonEmpty(item.assignmentId) || !nonEmpty(item.factKind) || refs.some(id => !castIds.has(id)) || !Number.isInteger(item.validFromTick) || item.validFromTick < 0 || (item.validUntilTick !== undefined && (!Number.isInteger(item.validUntilTick) || item.validUntilTick < item.validFromTick))) addError(errors, 'invalid_knowledge_assignment', `knowledge[${index}]`, item, item.assignmentId);
    if (!validReliability(item.reliability)) addError(errors, 'invalid_reliability', `knowledge[${index}].reliability`, item.reliability, item.assignmentId);
    if (!validProvenance(item.provenance)) addError(errors, 'missing_provenance', `knowledge[${index}].provenance`, undefined, item.assignmentId);
  });

  return { valid: errors.length === 0, errors };
}

function ruleMatchesScope(rule: VisibilityRuleV1, subjectId: string | undefined, kind: ObservationKindV1): boolean {
  if (rule.subjectIds && (!subjectId || !rule.subjectIds.includes(subjectId))) return false;
  if (rule.kindFilter && !rule.kindFilter.includes(kind)) return false;
  return true;
}

function ruleAllows(rule: VisibilityRuleV1, observerId: string, subjectId: string | undefined, castIds: Set<string>): boolean {
  if (rule.mode === 'public') return true;
  if (rule.mode === 'participants') return castIds.has(observerId);
  if (rule.mode === 'observer_list') return !!rule.observerIds?.includes(observerId);
  return observerId === subjectId || !!rule.observerIds?.includes(observerId);
}

function selectRule(ruleIds: string[], rules: Map<string, VisibilityRuleV1>, observerId: string, subjectId: string | undefined, kind: ObservationKindV1, castIds: Set<string>): VisibilityRuleV1 | undefined {
  const selected = ruleIds
    .map(id => rules.get(id))
    .filter((rule): rule is VisibilityRuleV1 => !!rule && ruleMatchesScope(rule, subjectId, kind))
    .sort((a, b) => MODE_RESTRICTIVENESS[a.mode] - MODE_RESTRICTIVENESS[b.mode])[0];
  return selected && ruleAllows(selected, observerId, subjectId, castIds) ? selected : undefined;
}

function filterPayload(payload: Record<string, unknown>, rule: VisibilityRuleV1): Record<string, unknown> {
  const allowed = new Set(rule.fieldAllowlist ?? []);
  return Object.fromEntries(Object.keys(payload).sort().filter(key => allowed.has(key)).map(key => [key, payload[key]]));
}

function mergeProvenance(...items: ObservationProvenanceV1[]): ObservationProvenanceV1 {
  return {
    sourceIds: [...new Set(items.flatMap(item => item.sourceIds))].sort(),
    adapterSteps: items.flatMap(item => item.adapterSteps),
  };
}

function foldRelations(layers: RelationLayerInputV1[]): RelationResolutionV1[] {
  const groups = new Map<string, RelationLayerInputV1[]>();
  layers.forEach(layer => {
    const key = `${layer.fromId}\u0000${layer.toId}`;
    groups.set(key, [...(groups.get(key) ?? []), layer]);
  });
  return [...groups.values()].map(group => {
    const sorted = group.map((layer, index) => ({ layer, index })).sort((a, b) => LAYER_ORDER[a.layer.layer] - LAYER_ORDER[b.layer.layer] || a.index - b.index);
    const values: Record<string, number> = {};
    const winningSourceByKey: Record<string, string> = {};
    sorted.forEach(({ layer }) => Object.keys(layer.values).sort().forEach(key => {
      values[key] = layer.values[key];
      winningSourceByKey[key] = layer.provenance.sourceIds[0];
    }));
    return {
      fromId: group[0].fromId,
      toId: group[0].toId,
      values,
      winningSourceByKey,
      provenance: mergeProvenance(...sorted.map(item => item.layer.provenance)),
    };
  }).sort((a, b) => codeUnitCompare(a.fromId, b.fromId) || codeUnitCompare(a.toId, b.toId));
}

export function resolveObservationsV1(input: ResolvedSceneInputV1): ObservationResolutionResultV1 {
  const validation = validateResolvedSceneInputV1(input);
  if (!validation.valid) return { ok: false, validation };

  const castIds = new Set(input.cast.map(member => member.agentId));
  const rules = new Map([...input.visibilityRules, ...input.cast.map(member => member.roleVisibility)].map(rule => [rule.ruleId, rule]));
  const observationsByCharacterId: Record<string, ObservationEnvelopeV1[]> = Object.fromEntries([...castIds].sort().map(id => [id, []]));

  const emit = (args: {
    observerId: string; subjectId?: string; targetId?: string; kind: ObservationKindV1;
    payload: Record<string, unknown>; rule: VisibilityRuleV1; reliability: number;
    sourceKind: string; sourceId: string; sourceKey?: string; tick: number; provenance: ObservationProvenanceV1;
  }): void => {
    observationsByCharacterId[args.observerId].push({
      schemaVersion: OBSERVATION_SCHEMA_VERSION,
      systemVersion: KANONAR_SYSTEM_VERSION,
      observationId: `obs:${input.sceneId}:${args.kind}:${args.sourceKey ?? args.sourceId}:${args.observerId}${args.targetId ? `:${args.targetId}` : ''}`,
      sceneId: input.sceneId,
      observerId: args.observerId,
      subjectId: args.subjectId,
      targetId: args.targetId,
      kind: args.kind,
      payload: filterPayload(args.payload, args.rule),
      visibility: { ruleIds: [args.rule.ruleId], mode: args.rule.mode, allowedFields: [...new Set(args.rule.fieldAllowlist ?? [])].sort() },
      reliability: args.reliability * (args.rule.reliabilityMultiplier ?? 1),
      source: { sourceKind: args.sourceKind, sourceId: args.sourceId },
      tick: args.tick,
      provenance: mergeProvenance(args.provenance, args.rule.provenance),
    });
  };

  for (const event of input.events) for (const observerId of castIds) {
    const rule = selectRule(event.visibilityRuleIds, rules, observerId, event.actorId, event.kind, castIds);
    if (!rule) continue;
    const targets: Array<string | undefined> = event.targetIds.length > 0 ? event.targetIds : [undefined];
    targets.forEach(targetId => emit({ observerId, subjectId: event.actorId, targetId, kind: event.kind, payload: event.payload, rule, reliability: event.baseReliability, sourceKind: 'scene_event', sourceId: event.eventId, tick: event.tick, provenance: event.provenance }));
  }

  for (const member of input.cast) for (const observerId of castIds) {
    const rule = selectRule([member.roleVisibility.ruleId], rules, observerId, member.agentId, 'role_signal', castIds);
    if (rule) emit({ observerId, subjectId: member.agentId, kind: 'role_signal', payload: { roleIds: [...member.roleIds].sort() }, rule, reliability: 1, sourceKind: 'cast_role', sourceId: member.agentId, tick: input.tick, provenance: member.roleVisibility.provenance });
  }

  // Placements have no explicit rule binding, so only rules that opt in via an
  // explicit kindFilter participate — otherwise a rule attached for an event
  // would silently govern spatial visibility too.
  for (const placement of input.placements) for (const observerId of castIds) {
    const matchingRuleIds = input.visibilityRules.filter(rule => (!rule.subjectIds || rule.subjectIds.includes(placement.agentId)) && !!rule.kindFilter?.includes('spatial_presence')).map(rule => rule.ruleId);
    const rule = selectRule(matchingRuleIds, rules, observerId, placement.agentId, 'spatial_presence', castIds);
    if (rule) emit({ observerId, subjectId: placement.agentId, kind: 'spatial_presence', payload: { locationId: placement.locationId, nodeId: placement.nodeId, x: placement.x, y: placement.y }, rule, reliability: 1, sourceKind: 'placement', sourceId: placement.agentId, tick: input.tick, provenance: placement.provenance });
  }

  for (const knowledge of input.knowledge) {
    if (input.tick < knowledge.validFromTick || (knowledge.validUntilTick !== undefined && input.tick > knowledge.validUntilTick)) continue;
    const directRule: VisibilityRuleV1 = { ruleId: `knowledge:${knowledge.assignmentId}`, mode: 'private', observerIds: [knowledge.observerId], fieldAllowlist: Object.keys(knowledge.payload), provenance: knowledge.provenance };
    emit({ observerId: knowledge.observerId, subjectId: knowledge.subjectId, targetId: knowledge.targetId, kind: 'knowledge_assignment', payload: knowledge.payload, rule: directRule, reliability: knowledge.reliability, sourceKind: knowledge.factKind, sourceId: knowledge.assignmentId, tick: input.tick, provenance: knowledge.provenance });
  }

  input.relationLayers.forEach((relation) => {
    for (const observerId of castIds) {
      const rule = selectRule(relation.visibilityRuleIds, rules, observerId, relation.fromId, 'relation_signal', castIds);
      if (rule) emit({ observerId, subjectId: relation.fromId, targetId: relation.toId, kind: 'relation_signal', payload: relation.values, rule, reliability: 1, sourceKind: `relation_${relation.layer}`, sourceId: relation.provenance.sourceIds[0], sourceKey: `${relation.layer}:${relation.fromId}:${relation.toId}:${relation.provenance.sourceIds.join('|')}`, tick: input.tick, provenance: relation.provenance });
    }
  });

  Object.values(observationsByCharacterId).forEach(items => items.sort((a, b) => codeUnitCompare(a.observationId, b.observationId)));
  return { ok: true, value: { schemaVersion: OBSERVATION_SCHEMA_VERSION, systemVersion: KANONAR_SYSTEM_VERSION, sceneId: input.sceneId, tick: input.tick, observationsByCharacterId, relationResolution: foldRelations(input.relationLayers), validation } };
}
