// R7-FOUNDATION-0 §3.2 observation-view-v1 regression. Pins the typed
// per-observer selector over a resolved scene and carries the hidden-field
// non-interference oracle to N = 3: a mutation on one participant's private
// channel changes ONLY that participant's view, byte-for-byte. No runtime wiring.

import { describe, expect, it } from 'vitest';

import { KANONAR_SYSTEM_VERSION } from '../../lib/goal-lab/versioning';
import {
  selectAllObservationViewsV1,
  selectObservationViewV1,
} from '../../lib/scene/observation/observationView';
import { resolveObservationsV1 } from '../../lib/scene/observation/resolver';
import type {
  ObservationProvenanceV1,
  ObservationResolutionV1,
  ResolvedSceneInputV1,
  VisibilityRuleV1,
} from '../../lib/scene/observation/types';

function provenance(sourceId: string): ObservationProvenanceV1 {
  return {
    sourceIds: [sourceId],
    adapterSteps: [{ adapterId: 'test-adapter', adapterVersion: 1, inputIds: [sourceId] }],
  };
}

function rule(overrides: Partial<VisibilityRuleV1> & Pick<VisibilityRuleV1, 'ruleId' | 'mode'>): VisibilityRuleV1 {
  return { fieldAllowlist: [], provenance: provenance(overrides.ruleId), ...overrides };
}

// N = 3 scene: one public event, one alice-only event, carol-only relation
// values, and one private knowledge assignment each for alice and carol.
function scene3(): ResolvedSceneInputV1 {
  const publicEvent = rule({ ruleId: 'event-public', mode: 'public', fieldAllowlist: ['visible'] });
  const aliceEvent = rule({ ruleId: 'event-alice', mode: 'observer_list', observerIds: ['alice'], fieldAllowlist: ['visible'] });
  const spatial = rule({ ruleId: 'spatial', mode: 'participants', kindFilter: ['spatial_presence'], fieldAllowlist: ['locationId'] });
  const relationCarol = rule({ ruleId: 'relation-carol', mode: 'observer_list', observerIds: ['carol'], fieldAllowlist: ['trust'] });
  return {
    schemaVersion: 1,
    systemVersion: KANONAR_SYSTEM_VERSION,
    sceneId: 'scene-n3',
    sourceRefs: [{ kind: 'test', id: 'source-scene', schemaVersion: 1 }],
    seed: 42,
    tick: 3,
    cast: [
      { agentId: 'alice', roleIds: ['witness'], roleVisibility: rule({ ruleId: 'role-alice', mode: 'private', fieldAllowlist: ['roleIds'] }) },
      { agentId: 'bob', roleIds: ['guard'], roleVisibility: rule({ ruleId: 'role-bob', mode: 'observer_list', observerIds: ['alice'], fieldAllowlist: ['roleIds'] }) },
      { agentId: 'carol', roleIds: ['envoy'], roleVisibility: rule({ ruleId: 'role-carol', mode: 'public', fieldAllowlist: ['roleIds'] }) },
    ],
    povAgentIds: ['alice'],
    placements: [
      { agentId: 'alice', locationId: 'hall', nodeId: 'n1', provenance: provenance('placement-alice') },
      { agentId: 'bob', locationId: 'hall', x: 1, y: 2, provenance: provenance('placement-bob') },
      { agentId: 'carol', locationId: 'yard', nodeId: 'n2', provenance: provenance('placement-carol') },
    ],
    events: [
      {
        eventId: 'event-pub',
        kind: 'speech',
        tick: 3,
        actorId: 'bob',
        targetIds: ['carol'],
        payload: { visible: 'halt', hiddenPlan: 'retreat' },
        visibilityRuleIds: [publicEvent.ruleId],
        baseReliability: 0.8,
        provenance: provenance('event-pub'),
      },
      {
        eventId: 'event-priv',
        kind: 'speech',
        tick: 3,
        actorId: 'carol',
        targetIds: ['alice'],
        payload: { visible: 'psst' },
        visibilityRuleIds: [aliceEvent.ruleId],
        baseReliability: 0.9,
        provenance: provenance('event-priv'),
      },
    ],
    relationLayers: [
      { layer: 'runtime_update', fromId: 'bob', toId: 'carol', values: { trust: 0.3 }, visibilityRuleIds: [relationCarol.ruleId], provenance: provenance('runtime-rel') },
    ],
    knowledge: [
      {
        assignmentId: 'knowledge-alice',
        observerId: 'alice',
        subjectId: 'bob',
        factKind: 'known_fact',
        payload: { fact: 'armed' },
        reliability: 0.75,
        validFromTick: 2,
        provenance: provenance('knowledge-alice'),
      },
      {
        assignmentId: 'knowledge-carol',
        observerId: 'carol',
        subjectId: 'alice',
        factKind: 'known_fact',
        payload: { fact: 'nervous' },
        reliability: 0.6,
        validFromTick: 2,
        provenance: provenance('knowledge-carol'),
      },
    ],
    visibilityRules: [publicEvent, aliceEvent, spatial, relationCarol],
    tags: ['test'],
  };
}

function resolve3(input: ResolvedSceneInputV1 = scene3()): ObservationResolutionV1 {
  const result = resolveObservationsV1(input);
  if (result.ok === false) throw new Error('expected the N=3 scene to resolve');
  return result.value;
}

function view(resolution: ObservationResolutionV1, observerId: string) {
  const result = selectObservationViewV1(resolution, observerId);
  if (result.ok === false) throw new Error(`expected a view for ${observerId}`);
  return result.value;
}

describe('R7 observation-view-v1', () => {
  it('selects exactly one observer slot with scene identity attached', () => {
    const resolution = resolve3();
    const alice = view(resolution, 'alice');
    expect(alice.sceneId).toBe('scene-n3');
    expect(alice.tick).toBe(3);
    expect(alice.observations).toEqual(resolution.observationsByCharacterId.alice);
    expect(alice.observations.every((item) => item.observerId === 'alice')).toBe(true);
    // The private channels actually land where intended.
    expect(alice.observations.some((item) => item.source.sourceId === 'event-priv')).toBe(true);
    const bob = view(resolution, 'bob');
    expect(bob.observations.some((item) => item.source.sourceId === 'event-priv')).toBe(false);
  });

  it('returns one view per resolved observer, sorted by observer id', () => {
    const resolution = resolve3();
    const result = selectAllObservationViewsV1(resolution);
    if (result.ok === false) throw new Error('expected all views');
    expect(result.value.map((item) => item.observerId)).toEqual(['alice', 'bob', 'carol']);
    for (const item of result.value) {
      expect(item.observations).toEqual(resolution.observationsByCharacterId[item.observerId]);
    }
  });

  it('fails closed on an observer the resolution does not know', () => {
    const result = selectObservationViewV1(resolve3(), 'mallory');
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.errors.some((e) => e.code === 'unknown_observer')).toBe(true);
    }
  });

  it('fails closed when a slot is polluted with another observer envelope', () => {
    const resolution = resolve3();
    resolution.observationsByCharacterId.bob.push(resolution.observationsByCharacterId.alice[0]);
    const single = selectObservationViewV1(resolution, 'bob');
    expect(single.ok).toBe(false);
    if (single.ok === false) {
      expect(single.errors.some((e) => e.code === 'foreign_envelope')).toBe(true);
    }
    // All-or-nothing: the polluted slot fails the whole selection too.
    expect(selectAllObservationViewsV1(resolution).ok).toBe(false);
  });

  it('fails closed on a resolution carrying a failed validation report', () => {
    const resolution = resolve3();
    const tampered = { ...resolution, validation: { valid: false, errors: [] } };
    const result = selectObservationViewV1(tampered, 'alice');
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.errors.some((e) => e.code === 'invalid_resolution')).toBe(true);
    }
  });

  it('re-decodes envelopes and rejects stale scene, tick, and payload validation', () => {
    const wrongScene = resolve3();
    wrongScene.observationsByCharacterId.alice[0].sceneId = 'other-scene';
    expect(selectObservationViewV1(wrongScene, 'alice').ok).toBe(false);

    const wrongTick = resolve3();
    wrongTick.observationsByCharacterId.alice[0].tick = 4;
    expect(selectObservationViewV1(wrongTick, 'alice').ok).toBe(false);

    const malformed = resolve3();
    malformed.observationsByCharacterId.alice[0].reliability = 2;
    expect(selectObservationViewV1(malformed, 'alice').ok).toBe(false);

    const leaked = resolve3();
    leaked.observationsByCharacterId.alice[0].payload.injectedSecret = 'attack';
    expect(selectObservationViewV1(leaked, 'alice').ok).toBe(false);
  });

  it('fails closed on a null envelope slot', () => {
    const resolution = resolve3();
    (resolution.observationsByCharacterId.alice as unknown[])[0] = null;
    const selected = selectObservationViewV1(resolution, 'alice');
    expect(selected.ok).toBe(false);
  });

  it('returns envelope, payload, and provenance copies owned by the view', () => {
    const resolution = resolve3();
    const alice = view(resolution, 'alice');
    const source = resolution.observationsByCharacterId.alice[0];
    const selected = alice.observations[0];
    expect(selected).not.toBe(source);
    expect(selected.payload).not.toBe(source.payload);
    expect(selected.provenance).not.toBe(source.provenance);

    const before = structuredClone(selected);
    source.payload.visible = 'changed-after-selection';
    source.provenance.sourceIds.push('changed-after-selection');
    expect(selected).toEqual(before);
  });

  it('N=3 non-interference: a hidden field outside every allowlist reaches no view', () => {
    const baseline = resolve3();
    const mutated = scene3();
    mutated.events[0].payload.hiddenPlan = 'attack';
    const resolution = resolve3(mutated);
    for (const observerId of ['alice', 'bob', 'carol']) {
      expect(view(resolution, observerId)).toEqual(view(baseline, observerId));
    }
  });

  it('N=3 non-interference: an alice-only channel mutation changes only the alice view', () => {
    const baseline = resolve3();
    const mutated = scene3();
    mutated.events[1].payload.visible = 'run';
    const resolution = resolve3(mutated);
    expect(view(resolution, 'alice')).not.toEqual(view(baseline, 'alice')); // the oracle has teeth
    expect(view(resolution, 'bob')).toEqual(view(baseline, 'bob'));
    expect(view(resolution, 'carol')).toEqual(view(baseline, 'carol'));
  });

  it('N=3 non-interference: a carol-only knowledge mutation changes only the carol view', () => {
    const baseline = resolve3();
    const mutated = scene3();
    mutated.knowledge[1].payload.fact = 'calm';
    const resolution = resolve3(mutated);
    expect(view(resolution, 'carol')).not.toEqual(view(baseline, 'carol'));
    expect(view(resolution, 'alice')).toEqual(view(baseline, 'alice'));
    expect(view(resolution, 'bob')).toEqual(view(baseline, 'bob'));
  });

  it('N=3 non-interference: a carol-only relation mutation changes only the carol view', () => {
    const baseline = resolve3();
    const mutated = scene3();
    mutated.relationLayers[0].values.trust = 0.9;
    const resolution = resolve3(mutated);
    expect(view(resolution, 'carol')).not.toEqual(view(baseline, 'carol'));
    expect(view(resolution, 'alice')).toEqual(view(baseline, 'alice'));
    expect(view(resolution, 'bob')).toEqual(view(baseline, 'bob'));
  });
});
