// tests/pipeline/scene_goal_lab_parity.test.ts
//
// R4 first integration step, GoalLab side: the scene adapter's projection
// (legacy observations + obs:resolved:* atoms) must flow through a full
// pipeline run to the S8 decision stage without contract violations,
// deterministically, and without surfacing payload fields the visibility
// allowlist withheld.

import { describe, expect, it } from 'vitest';

import { runGoalLabPipelineV1 } from '@/lib/goal-lab/pipeline/runPipelineV1';
import { validateAtomContracts } from '@/lib/context/v2/validateAtomContract';
import { adaptResolvedSceneToGoalLabV1 } from '@/lib/scene/adapters/goalLab';
import { resolveObservationsV1 } from '@/lib/scene/observation/resolver';
import { KANONAR_SYSTEM_VERSION } from '@/lib/goal-lab/versioning';
import type { ObservationProvenanceV1, ResolvedSceneInputV1, VisibilityRuleV1 } from '@/lib/scene/observation/types';
import type { ContextAtom } from '@/lib/context/v2/types';
import { arr } from '@/lib/utils/arr';

import { mockAgent, mockWorld } from './fixtures';

const HIDDEN_MARKER = 'HIDDEN_PLAN_MARKER_XYZ';

const provenance = (id: string): ObservationProvenanceV1 => ({ sourceIds: [id], adapterSteps: [{ adapterId: 'parity-test', adapterVersion: 1, inputIds: [id] }] });

function rule(id: string, allow: string[]): VisibilityRuleV1 {
  return { ruleId: id, mode: 'participants', fieldAllowlist: allow, provenance: provenance(id) };
}

function parityScene(): ResolvedSceneInputV1 {
  return {
    schemaVersion: 1, systemVersion: KANONAR_SYSTEM_VERSION, sceneId: 'parity-scene',
    sourceRefs: [{ kind: 'test', id: 'parity' }], seed: 5, tick: 0,
    cast: [
      { agentId: 'A', roleIds: ['participant'], roleVisibility: rule('role-A', ['roleIds']) },
      { agentId: 'B', roleIds: ['participant'], roleVisibility: rule('role-B', ['roleIds']) },
    ],
    povAgentIds: ['A'],
    placements: [
      { agentId: 'A', locationId: 'loc:demo', x: 0, y: 0, provenance: provenance('p-A') },
      { agentId: 'B', locationId: 'loc:demo', x: 1, y: 1, provenance: provenance('p-B') },
    ],
    events: [{
      eventId: 'speech-1', kind: 'speech', tick: 0, actorId: 'B', targetIds: ['A'],
      payload: { visible: 'greeting', hiddenPlan: HIDDEN_MARKER },
      visibilityRuleIds: ['speech'], baseReliability: 0.9, provenance: provenance('speech-1'),
    }],
    relationLayers: [],
    knowledge: [],
    visibilityRules: [rule('speech', ['visible'])],
    tags: ['parity'],
  };
}

function pipelineInput() {
  const scene = parityScene();
  const resolution = resolveObservationsV1(scene);
  if (!resolution.ok) throw new Error('parity scene failed validation');
  const projection = adaptResolvedSceneToGoalLabV1(scene, resolution.value);

  const world = mockWorld([mockAgent('A'), mockAgent('B')]);
  (world as any).observations = projection.observations;
  (world as any).sceneSnapshot = projection.sceneSnapshot;
  return {
    input: {
      world, agentId: 'A', participantIds: ['A', 'B'],
      observeLiteParams: { seed: 1234 },
      manualAtoms: projection.observationAtoms,
    } as any,
    projection,
  };
}

function semanticProjection(p: any) {
  return arr<any>(p?.stages).map((st: any) => ({
    stage: String(st?.stage ?? ''),
    atoms: arr<ContextAtom>(st?.atoms)
      .map((a) => ({
        id: String(a?.id ?? ''),
        magnitude: Number.isFinite(a?.magnitude as number) ? Number(a?.magnitude) : null,
        usedAtomIds: arr<string>(a?.trace?.usedAtomIds).map(String).sort(),
      }))
      .sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0)),
  }));
}

describe('GoalLab scene adapter parity (resolved scene -> pipeline)', () => {
  it('runs to the S8 decision with adapter output and keeps the injected atoms with their provenance', () => {
    const { input, projection } = pipelineInput();
    const p = runGoalLabPipelineV1(input);
    expect(p).not.toBeNull();

    const stages = arr<any>((p as any)?.stages);
    // S9 is conditional (lookahead/predict); S8 is the decision stage every
    // run must reach.
    expect(stages.map((st: any) => st.stage)).toContain('S8');

    const s0Atoms = arr<ContextAtom>(stages.find((st: any) => st.stage === 'S0')?.atoms);
    for (const injected of projection.observationAtoms) {
      const found = s0Atoms.find(atom => atom.id === injected.id);
      expect(found, `injected atom ${injected.id} present in S0`).toBeTruthy();
      expect(found?.trace?.usedAtomIds).toEqual(injected.trace?.usedAtomIds);
    }
  });

  it('produces no namespace contract violations', () => {
    const { input } = pipelineInput();
    const p = runGoalLabPipelineV1(input);
    const atoms = arr<any>((p as any)?.stages).flatMap((st: any) => arr<ContextAtom>(st?.atoms));
    const errors = validateAtomContracts(atoms).filter(w => w.code === 'missing_ns' || w.code === 'unknown_namespace');
    expect(errors).toEqual([]);
  });

  it('is deterministic for identical adapted scenes', () => {
    const p1 = runGoalLabPipelineV1(pipelineInput().input);
    const p2 = runGoalLabPipelineV1(pipelineInput().input);
    expect(semanticProjection(p1)).toEqual(semanticProjection(p2));
  });

  it('never surfaces the payload field withheld by the visibility allowlist', () => {
    const { input, projection } = pipelineInput();
    // The adapter itself already filtered the field...
    expect(JSON.stringify(projection)).not.toContain(HIDDEN_MARKER);
    // ...and no pipeline stage resurrects it from anywhere else.
    const p = runGoalLabPipelineV1(input);
    expect(JSON.stringify((p as any)?.stages ?? [])).not.toContain(HIDDEN_MARKER);
  });
});
