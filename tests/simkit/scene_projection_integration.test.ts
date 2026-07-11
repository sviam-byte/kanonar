// tests/simkit/scene_projection_integration.test.ts
//
// R4 first integration step: a ResolvedSceneInputV1 resolved through the
// observation resolver and projected via adaptResolvedSceneToSimKitV1 must
// apply onto a REAL SimKit world (mvp0 scene) immutably, deterministically,
// and leave the world steppable by the live decider plugin.

import { describe, expect, it } from 'vitest';
import { KANONAR_SYSTEM_VERSION } from '../../lib/goal-lab/versioning';
import { adaptResolvedSceneToSimKitV1, applySimKitSceneProjectionV1 } from '../../lib/scene/adapters/simKit';
import { resolveObservationsV1 } from '../../lib/scene/observation/resolver';
import type { ObservationProvenanceV1, ResolvedSceneInputV1, VisibilityRuleV1 } from '../../lib/scene/observation/types';
import { RUNTIME_PROFILE_FACT_KEY } from '../../lib/config/runtimeMechanics';
import { SimKitSimulator } from '../../lib/simkit/core/simulator';
import { makeGoalLabDeciderPlugin } from '../../lib/simkit/plugins/goalLabDeciderPlugin';
import {
  MVP0_AGENT_A,
  MVP0_AGENT_B,
  MVP0_LOCATION_ID,
  makeMvp0StakesWorld,
} from '../../lib/simkit/scenarios/mvp0Scene';

const provenance = (id: string): ObservationProvenanceV1 => ({ sourceIds: [id], adapterSteps: [{ adapterId: 'integration-test', adapterVersion: 1, inputIds: [id] }] });

function rule(id: string, mode: VisibilityRuleV1['mode'], allow: string[]): VisibilityRuleV1 {
  return { ruleId: id, mode, fieldAllowlist: allow, provenance: provenance(id) };
}

function mvp0Scene(): ResolvedSceneInputV1 {
  return {
    schemaVersion: 1, systemVersion: KANONAR_SYSTEM_VERSION, sceneId: 'mvp0-resolved',
    sourceRefs: [{ kind: 'simkit-scenario', id: 'scenario:mvp0:v1' }], seed: 7, tick: 0,
    cast: [
      { agentId: MVP0_AGENT_A, roleIds: ['participant'], roleVisibility: rule('role-a', 'participants', ['roleIds']) },
      { agentId: MVP0_AGENT_B, roleIds: ['participant'], roleVisibility: rule('role-b', 'participants', ['roleIds']) },
    ],
    povAgentIds: [MVP0_AGENT_A],
    placements: [
      { agentId: MVP0_AGENT_A, locationId: MVP0_LOCATION_ID, x: 1, y: 1, provenance: provenance('p-a') },
      { agentId: MVP0_AGENT_B, locationId: MVP0_LOCATION_ID, x: 2, y: 2, provenance: provenance('p-b') },
    ],
    events: [],
    relationLayers: [{
      layer: 'persistent', fromId: MVP0_AGENT_A, toId: MVP0_AGENT_B,
      values: { trust: 0.6 }, visibilityRuleIds: ['relations'], provenance: provenance('rel-ab'),
    }],
    knowledge: [],
    visibilityRules: [rule('relations', 'participants', ['trust'])],
    tags: ['mvp0'],
  };
}

function projectedWorld() {
  const scene = mvp0Scene();
  const resolution = resolveObservationsV1(scene);
  if (!resolution.ok) throw new Error('mvp0 scene fixture failed validation');
  const projection = adaptResolvedSceneToSimKitV1(scene, resolution.value);
  const base = makeMvp0StakesWorld(7);
  return { scene, resolution: resolution.value, projection, base, applied: applySimKitSceneProjectionV1(base, projection) };
}

describe('SimKit scene projection integration (mvp0)', () => {
  it('applies placements and scene facts without mutating the source world', () => {
    const { base, applied, resolution } = projectedWorld();

    expect(applied.characters[MVP0_AGENT_A].locId).toBe(MVP0_LOCATION_ID);
    expect(applied.characters[MVP0_AGENT_A].pos).toEqual({ nodeId: null, x: 1, y: 1 });
    expect(applied.characters[MVP0_AGENT_B].pos).toEqual({ nodeId: null, x: 2, y: 2 });
    expect(applied.seed).toBe(7);
    expect(applied.tickIndex).toBe(0);

    expect(applied.facts['scene:id']).toBe('mvp0-resolved');
    expect(applied.facts['scene:observations:v1']).toEqual(resolution.observationsByCharacterId);
    expect(applied.facts['scene:relationResolution:v1']).toEqual(resolution.relationResolution);
    // Pre-existing mvp0 facts (the object token) survive the merge.
    expect(applied.facts['obj:token']).toEqual(base.facts['obj:token']);

    expect(base.characters[MVP0_AGENT_A].pos).not.toEqual({ nodeId: null, x: 1, y: 1 });
    expect(base.facts['scene:id']).toBeUndefined();
  });

  it('is deterministic across repeated applications', () => {
    const first = projectedWorld();
    const second = projectedWorld();
    expect(JSON.stringify(second.applied)).toBe(JSON.stringify(first.applied));
  });

  it('the applied world is steppable and replays the same applied actions', () => {
    const run = () => {
      const sim = new SimKitSimulator({
        scenarioId: 'scene-projection-integration',
        seed: 7,
        initialWorld: projectedWorld().applied,
        plugins: [makeGoalLabDeciderPlugin({ storePipeline: false })],
      });
      const record = sim.step();
      return (record.trace.actionsApplied ?? []).map((action: any) => `${action.actorId}:${action.kind}:${action.targetId ?? ''}`);
    };
    const first = run();
    const second = run();
    expect(first.length).toBeGreaterThan(0);
    expect(second).toEqual(first);
  });

  it('feeds resolved-scene envelopes into S5 beliefs when the dual-emit flag is on', () => {
    const world = projectedWorld().applied;
    world.facts[RUNTIME_PROFILE_FACT_KEY] = { profileId: 'legacy', opponentBeliefS5V1: true };

    const sim = new SimKitSimulator({
      scenarioId: 'scene-projection-belief',
      seed: 7,
      initialWorld: world,
      plugins: [makeGoalLabDeciderPlugin({ storePipeline: true })],
    });
    sim.step();

    const pipeline = sim.world.facts['sim:goalLab:lastPipeline'] as any;
    const s5 = (pipeline?.stages ?? []).find((st: any) => st?.stage === 'S5');
    // mvp0 worlds carry no legacy world.tom, so the single belief per agent
    // comes purely from the resolved-scene envelopes stored as a fact.
    expect(s5?.artifacts?.opponentBeliefDualEmit).toMatchObject({ enabled: true, beliefCount: 1, atomCount: 24, skipped: [] });
    const beliefAtoms = (s5?.atoms ?? []).filter((atom: any) => String(atom?.id).startsWith('tom:belief:'));
    expect(beliefAtoms).toHaveLength(24);
  });

  it('fails closed on unknown characters, unknown locations and identity mismatch', () => {
    const { scene, resolution, projection, base } = projectedWorld();
    expect(() => applySimKitSceneProjectionV1(base, {
      ...projection,
      placements: [{ agentId: 'ghost', locationId: MVP0_LOCATION_ID, x: 0, y: 0, provenance: provenance('ghost') }],
    })).toThrow('simkit_scene_unknown_character:ghost');
    expect(() => applySimKitSceneProjectionV1(base, {
      ...projection,
      placements: [{ agentId: MVP0_AGENT_A, locationId: 'nowhere', x: 0, y: 0, provenance: provenance('nowhere') }],
    })).toThrow('simkit_scene_unknown_location:nowhere');
    expect(() => adaptResolvedSceneToSimKitV1(scene, { ...resolution, sceneId: 'other' })).toThrow('simkit_scene_resolution_mismatch');
  });
});
