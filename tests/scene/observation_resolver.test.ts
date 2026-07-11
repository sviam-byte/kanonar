import { describe, expect, it } from 'vitest';
import { KANONAR_SYSTEM_VERSION } from '../../lib/goal-lab/versioning';
import { resolveObservationsV1, validateResolvedSceneInputV1 } from '../../lib/scene/observation/resolver';
import type { ObservationProvenanceV1, ResolvedSceneInputV1, VisibilityRuleV1 } from '../../lib/scene/observation/types';

function provenance(sourceId: string): ObservationProvenanceV1 {
  return {
    sourceIds: [sourceId],
    adapterSteps: [{ adapterId: 'test-adapter', adapterVersion: 1, inputIds: [sourceId] }],
  };
}

function rule(overrides: Partial<VisibilityRuleV1> & Pick<VisibilityRuleV1, 'ruleId' | 'mode'>): VisibilityRuleV1 {
  return { fieldAllowlist: [], provenance: provenance(overrides.ruleId), ...overrides };
}

function scene(): ResolvedSceneInputV1 {
  const publicEvent = rule({ ruleId: 'event-public', mode: 'public', fieldAllowlist: ['visible'] });
  const privateEvent = rule({ ruleId: 'event-private', mode: 'observer_list', observerIds: ['alice'], fieldAllowlist: ['visible'] });
  const spatial = rule({ ruleId: 'spatial', mode: 'participants', kindFilter: ['spatial_presence'], fieldAllowlist: ['locationId'] });
  const relation = rule({ ruleId: 'relation', mode: 'observer_list', observerIds: ['alice'], fieldAllowlist: ['trust', 'respect'] });
  return {
    schemaVersion: 1,
    systemVersion: KANONAR_SYSTEM_VERSION,
    sceneId: 'scene-1',
    sourceRefs: [{ kind: 'test', id: 'source-scene', schemaVersion: 1 }],
    seed: 42,
    tick: 3,
    cast: [
      { agentId: 'alice', roleIds: ['witness'], roleVisibility: rule({ ruleId: 'role-alice', mode: 'private', fieldAllowlist: ['roleIds'] }) },
      { agentId: 'bob', roleIds: ['guard'], roleVisibility: rule({ ruleId: 'role-bob', mode: 'observer_list', observerIds: ['alice'], fieldAllowlist: ['roleIds'] }) },
    ],
    povAgentIds: ['alice'],
    placements: [
      { agentId: 'alice', locationId: 'hall', nodeId: 'n1', provenance: provenance('placement-alice') },
      { agentId: 'bob', locationId: 'hall', x: 1, y: 2, provenance: provenance('placement-bob') },
    ],
    events: [{
      eventId: 'event-1',
      kind: 'speech',
      tick: 3,
      actorId: 'bob',
      targetIds: ['alice'],
      payload: { visible: 'stop', hiddenPlan: 'leave' },
      visibilityRuleIds: [publicEvent.ruleId, privateEvent.ruleId],
      baseReliability: 0.8,
      provenance: provenance('event-1'),
    }],
    relationLayers: [
      { layer: 'runtime_update', fromId: 'alice', toId: 'bob', values: { trust: 0.9 }, visibilityRuleIds: [relation.ruleId], provenance: provenance('runtime-rel') },
      { layer: 'persistent', fromId: 'alice', toId: 'bob', values: { trust: 0.2, respect: 0.4 }, visibilityRuleIds: [relation.ruleId], provenance: provenance('persistent-rel') },
      { layer: 'scene_override', fromId: 'alice', toId: 'bob', values: { trust: 0.7 }, visibilityRuleIds: [relation.ruleId], provenance: provenance('scene-rel') },
      { layer: 'branch', fromId: 'alice', toId: 'bob', values: { respect: 0.6 }, visibilityRuleIds: [relation.ruleId], provenance: provenance('branch-rel') },
    ],
    knowledge: [{
      assignmentId: 'knowledge-1',
      observerId: 'alice',
      subjectId: 'bob',
      factKind: 'known_fact',
      payload: { fact: 'trained' },
      reliability: 0.75,
      validFromTick: 2,
      provenance: provenance('knowledge-1'),
    }],
    visibilityRules: [publicEvent, privateEvent, spatial, relation],
    tags: ['test'],
  };
}

describe('observation resolver v1', () => {
  it('fails closed and accumulates reference, placement and reliability errors', () => {
    const input = scene();
    input.seed = 1.5;
    input.povAgentIds = ['unknown'];
    input.placements = input.placements.filter(item => item.agentId !== 'bob');
    input.events[0].baseReliability = 2;
    input.events[0].targetIds = ['unknown'];

    const validation = validateResolvedSceneInputV1(input);
    expect(validation.valid).toBe(false);
    expect(validation.errors.map(error => error.code)).toEqual(expect.arrayContaining([
      'invalid_seed', 'unknown_pov', 'missing_placement', 'invalid_reliability', 'unknown_agent_reference',
    ]));
    expect(resolveObservationsV1(input)).toEqual({ ok: false, validation });
  });

  it('uses the most restrictive matching visibility rule and filters payload fields', () => {
    const result = resolveObservationsV1(scene());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const aliceSpeech = result.value.observationsByCharacterId.alice.find(item => item.kind === 'speech');
    expect(aliceSpeech?.payload).toEqual({ visible: 'stop' });
    expect(aliceSpeech?.visibility.ruleIds).toEqual(['event-private']);
    expect(result.value.observationsByCharacterId.bob.some(item => item.kind === 'speech')).toBe(false);
  });

  it('folds relation layers by contract priority and records the winning source per key', () => {
    const result = resolveObservationsV1(scene());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.relationResolution).toEqual([expect.objectContaining({
      fromId: 'alice',
      toId: 'bob',
      values: { trust: 0.9, respect: 0.6 },
      winningSourceByKey: { trust: 'runtime-rel', respect: 'branch-rel' },
    })]);
  });

  it('is deterministic and hidden target fields do not affect observer output', () => {
    const firstInput = scene();
    const secondInput = scene();
    secondInput.events[0].payload.hiddenPlan = 'attack';

    const first = resolveObservationsV1(firstInput);
    const replay = resolveObservationsV1(scene());
    const hiddenMutation = resolveObservationsV1(secondInput);
    expect(first).toEqual(replay);
    expect(hiddenMutation).toEqual(first);
  });

  it('resolves spatial presence through the kind-filtered rule, not through event rules', () => {
    const result = resolveObservationsV1(scene());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const observer of ['alice', 'bob'] as const) {
      const spatialObs = result.value.observationsByCharacterId[observer].filter(item => item.kind === 'spatial_presence');
      // 'event-private' has no kindFilter and must not hijack placements even
      // though it is more restrictive than the dedicated 'spatial' rule.
      expect(spatialObs.map(item => item.visibility.ruleIds)).toEqual([['spatial'], ['spatial']]);
      expect(spatialObs.map(item => item.subjectId).sort()).toEqual(['alice', 'bob']);
      for (const item of spatialObs) expect(item.payload).toEqual({ locationId: 'hall' });
    }
  });

  it('emits role signals only to observers allowed by the role visibility rule', () => {
    const result = resolveObservationsV1(scene());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const aliceRoles = result.value.observationsByCharacterId.alice.filter(item => item.kind === 'role_signal');
    expect(aliceRoles.map(item => [item.subjectId, item.payload])).toEqual([
      ['alice', { roleIds: ['witness'] }],
      ['bob', { roleIds: ['guard'] }],
    ]);
    // role-bob is observer_list ['alice'], so bob does not even see his own role.
    expect(result.value.observationsByCharacterId.bob.some(item => item.kind === 'role_signal')).toBe(false);
  });

  it('rejects duplicate event and knowledge assignment IDs', () => {
    const input = scene();
    input.events = [input.events[0], { ...input.events[0] }];
    input.knowledge = [input.knowledge[0], { ...input.knowledge[0] }];

    const validation = validateResolvedSceneInputV1(input);
    expect(validation.valid).toBe(false);
    expect(validation.errors.map(error => error.code)).toEqual(expect.arrayContaining([
      'duplicate_event_id', 'duplicate_assignment_id',
    ]));
  });

  it('keeps relation observationIds unique across layers sharing a source', () => {
    const input = scene();
    input.relationLayers = input.relationLayers.map(layer => ({
      ...layer,
      provenance: provenance('shared-source'),
    }));

    const result = resolveObservationsV1(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const relationObs = result.value.observationsByCharacterId.alice.filter(item => item.kind === 'relation_signal');
    expect(relationObs).toHaveLength(input.relationLayers.length);
    expect(new Set(relationObs.map(item => item.observationId)).size).toBe(input.relationLayers.length);
    for (const item of relationObs) expect(item.source.sourceId).toBe('shared-source');
  });

  it('keeps relation observation IDs stable when precedence-distinct layers are reordered', () => {
    const first = resolveObservationsV1(scene());
    const reorderedInput = scene();
    reorderedInput.relationLayers.reverse();
    const reordered = resolveObservationsV1(reorderedInput);
    expect(first.ok).toBe(true);
    expect(reordered.ok).toBe(true);
    if (!first.ok || !reordered.ok) return;
    expect(reordered.value.relationResolution).toEqual(first.value.relationResolution);
    expect(reordered.value.observationsByCharacterId).toEqual(first.value.observationsByCharacterId);
  });

  it('emits active private knowledge only to its observer', () => {
    const result = resolveObservationsV1(scene());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.observationsByCharacterId.alice.some(item => item.kind === 'knowledge_assignment')).toBe(true);
    expect(result.value.observationsByCharacterId.bob.some(item => item.kind === 'knowledge_assignment')).toBe(false);
  });
});
