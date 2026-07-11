import { describe, expect, it } from 'vitest';
import { KANONAR_SYSTEM_VERSION } from '../../lib/goal-lab/versioning';
import { adaptResolvedSceneToGoalLabV1 } from '../../lib/scene/adapters/goalLab';
import { adaptResolvedSceneToConflictV1 } from '../../lib/scene/adapters/conflict';
import { adaptResolvedSceneToSimKitV1, applySimKitSceneProjectionV1 } from '../../lib/scene/adapters/simKit';
import { resolveObservationsV1 } from '../../lib/scene/observation/resolver';
import type { ObservationProvenanceV1, ResolvedSceneInputV1, VisibilityRuleV1 } from '../../lib/scene/observation/types';
import type { SimWorld } from '../../lib/simkit/core/types';

const provenance = (id: string): ObservationProvenanceV1 => ({ sourceIds: [id], adapterSteps: [{ adapterId: 'test', adapterVersion: 1, inputIds: [id] }] });
const visibility = (id: string, observerIds?: string[]): VisibilityRuleV1 => ({ ruleId: id, mode: observerIds ? 'observer_list' : 'participants', observerIds, fieldAllowlist: ['trust', 'visible'], provenance: provenance(id) });

function fixture(): { scene: ResolvedSceneInputV1; resolution: ReturnType<typeof resolveObservationsV1> } {
  const relationRule = visibility('relation', ['a']);
  const eventRule = visibility('event', ['a']);
  const scene: ResolvedSceneInputV1 = {
    schemaVersion: 1, systemVersion: KANONAR_SYSTEM_VERSION, sceneId: 's', sourceRefs: [{ kind: 'test', id: 's' }], seed: 7, tick: 4,
    cast: [
      { agentId: 'a', roleIds: ['participant'], roleVisibility: visibility('role-a') },
      { agentId: 'b', roleIds: ['participant'], roleVisibility: visibility('role-b') },
    ],
    povAgentIds: ['a'],
    placements: [
      { agentId: 'a', locationId: 'l', x: 1, y: 2, provenance: provenance('pa') },
      { agentId: 'b', locationId: 'l', x: 3, y: 4, provenance: provenance('pb') },
    ],
    events: [{ eventId: 'e', kind: 'direct_event', tick: 4, actorId: 'b', targetIds: ['a'], payload: { visible: 1, hidden: 2 }, visibilityRuleIds: ['event'], baseReliability: 0.8, provenance: provenance('e') }],
    relationLayers: [{ layer: 'persistent', fromId: 'a', toId: 'b', values: { trust: 0.6 }, visibilityRuleIds: ['relation'], provenance: provenance('rel') }],
    knowledge: [], visibilityRules: [relationRule, eventRule], tags: [],
  };
  return { scene, resolution: resolveObservationsV1(scene) };
}

function accepted() {
  const value = fixture();
  if (!value.resolution.ok) throw new Error('invalid fixture');
  return { scene: value.scene, resolution: value.resolution.value };
}

describe('scene adapters V1', () => {
  it('projects GoalLab observations and atoms without hidden payload fields', () => {
    const { scene, resolution } = accepted();
    const projection = adaptResolvedSceneToGoalLabV1(scene, resolution);
    const event = projection.observations.a.find(item => item.id.includes(':direct_event:'));
    expect(event?.payload).toEqual({ visible: 1 });
    expect(projection.observations.b.some(item => item.id.includes(':direct_event:'))).toBe(false);
    expect(projection.observationAtoms.every(atom => atom.trace?.usedAtomIds.length)).toBe(true);
  });

  it('projects only directed resolved evidence to Conflict and does not alter mechanic state', () => {
    const { scene, resolution } = accepted();
    const projection = adaptResolvedSceneToConflictV1(scene, resolution);
    expect(projection.players).toEqual(['a', 'b']);
    expect(projection.observationsByPlayerId.b.some(item => item.source.sourceId === 'e')).toBe(false);
    expect(Object.keys(projection)).not.toContain('actions');
    expect(Object.keys(projection)).not.toContain('payoffs');
  });

  it('applies SimKit placement/seed/facts immutably and preserves the event queue', () => {
    const { scene, resolution } = accepted();
    const projection = adaptResolvedSceneToSimKitV1(scene, resolution);
    const world: SimWorld = {
      tickIndex: 0, seed: 1,
      characters: {
        a: { id: 'a', name: 'A', locId: 'l', stress: 0, health: 1, energy: 1 },
        b: { id: 'b', name: 'B', locId: 'l', stress: 0, health: 1, energy: 1 },
      },
      locations: { l: { id: 'l', name: 'L', neighbors: [] } },
      facts: { existing: true }, events: [{ id: 'old', type: 'old' }],
    };
    const next = applySimKitSceneProjectionV1(world, projection);
    expect(next.seed).toBe(7);
    expect(next.tickIndex).toBe(4);
    expect(next.characters.a.pos).toEqual({ nodeId: null, x: 1, y: 2 });
    expect(world.characters.a.pos).toBeUndefined();
    expect(next.events).toEqual(world.events);
    expect(next.facts['scene:observations:v1']).toEqual(resolution.observationsByCharacterId);
  });

  it('rejects mismatched resolution identity in every adapter', () => {
    const { scene, resolution } = accepted();
    const mismatch = { ...resolution, sceneId: 'other' };
    expect(() => adaptResolvedSceneToGoalLabV1(scene, mismatch)).toThrow('mismatch');
    expect(() => adaptResolvedSceneToConflictV1(scene, mismatch)).toThrow('mismatch');
    expect(() => adaptResolvedSceneToSimKitV1(scene, mismatch)).toThrow('mismatch');
  });
});
