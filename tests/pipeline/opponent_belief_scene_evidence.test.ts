// tests/pipeline/opponent_belief_scene_evidence.test.ts
//
// TOM-BUILDER-0 live wiring: with the dual-emit flag ON, the S5 belief layer
// combines a legacy-decoder prior with directed evidence from resolved-scene
// envelopes (world.resolvedObservations), and can build beliefs from
// envelopes alone for dyads with no legacy entry. Hidden scene payload stays
// non-interfering end-to-end.

import { describe, expect, it } from 'vitest';

import { runGoalLabPipelineV1 } from '@/lib/goal-lab/pipeline/runPipelineV1';
import { resolveObservationsV1 } from '@/lib/scene/observation/resolver';
import { KANONAR_SYSTEM_VERSION } from '@/lib/goal-lab/versioning';
import type { ObservationProvenanceV1, ResolvedSceneInputV1, VisibilityRuleV1 } from '@/lib/scene/observation/types';
import type { ContextAtom } from '@/lib/context/v2/types';
import { arr } from '@/lib/utils/arr';

import { mockAgent, mockWorld } from './fixtures';

const provenance = (id: string): ObservationProvenanceV1 => ({ sourceIds: [id], adapterSteps: [{ adapterId: 'scene-evidence-test', adapterVersion: 1, inputIds: [id] }] });

function rule(id: string, allow: string[]): VisibilityRuleV1 {
  return { ruleId: id, mode: 'participants', fieldAllowlist: allow, provenance: provenance(id) };
}

function evidenceScene(trustToB: number, hidden = 'none'): ResolvedSceneInputV1 {
  return {
    schemaVersion: 1, systemVersion: KANONAR_SYSTEM_VERSION, sceneId: 'evidence-scene',
    sourceRefs: [{ kind: 'test', id: 'evidence' }], seed: 3, tick: 0,
    cast: ['A', 'B', 'C'].map(id => ({ agentId: id, roleIds: ['participant'], roleVisibility: rule(`role-${id}`, ['roleIds']) })),
    povAgentIds: ['A'],
    placements: ['A', 'B', 'C'].map((id, i) => ({ agentId: id, locationId: 'loc:demo', x: i, y: 0, provenance: provenance(`p-${id}`) })),
    events: [
      { eventId: 'sig-B', kind: 'relation_signal', tick: 0, actorId: 'B', targetIds: ['B'], payload: { trust: trustToB, hiddenPlan: hidden }, visibilityRuleIds: ['signals'], baseReliability: 0.9, provenance: provenance('sig-B') },
      { eventId: 'sig-C', kind: 'relation_signal', tick: 0, actorId: 'C', targetIds: ['C'], payload: { trust: 0.9 }, visibilityRuleIds: ['signals'], baseReliability: 0.9, provenance: provenance('sig-C') },
    ],
    relationLayers: [], knowledge: [],
    visibilityRules: [rule('signals', ['trust'])],
    tags: ['evidence'],
  };
}

function legacyEntryAB() {
  return {
    goals: { goalIds: [], weights: [] },
    traits: {
      trust: 0.8, align: 0.5, respect: 0.5, dominance: 0.5,
      bond: 0.5, fear: 0.5, conflict: 0.5, competence: 0.5,
      reliability: 0.5, obedience: 0.5, uncertainty: 0.5,
    },
    uncertainty: 0.5, lastUpdatedTick: 0, lastInteractionTick: 0,
  };
}

function pipelineInput(opts: { withEnvelopes?: boolean; trustToB?: number; hidden?: string; flagOn?: boolean } = {}) {
  const { withEnvelopes = true, trustToB = 0.4, hidden = 'none', flagOn = true } = opts;
  const world = mockWorld([mockAgent('A'), mockAgent('B'), mockAgent('C')]);
  // Legacy entry exists only for A->B; A->C is envelope-only.
  (world as any).tom = { A: { B: legacyEntryAB() } };
  if (withEnvelopes) {
    const resolution = resolveObservationsV1(evidenceScene(trustToB, hidden));
    if (!resolution.ok) throw new Error('evidence scene failed validation');
    (world as any).resolvedObservations = resolution.value.observationsByCharacterId;
  }
  return {
    world, agentId: 'A', participantIds: ['A', 'B', 'C'],
    observeLiteParams: { seed: 1234 },
    sceneControl: {
      enableToM: true,
      runtimeProfile: flagOn ? { profileId: 'legacy', opponentBeliefS5V1: true } : 'legacy',
    },
  } as any;
}

function s5Atoms(p: any): ContextAtom[] {
  return arr<ContextAtom>(arr<any>(p?.stages).find((st: any) => st?.stage === 'S5')?.atoms);
}

function beliefMagnitude(p: any, id: string): number | undefined {
  return s5Atoms(p).find(atom => atom.id === id)?.magnitude;
}

describe('S5 opponent-belief from resolved-scene evidence', () => {
  it('builds an envelope-only belief for a dyad with no legacy entry', () => {
    const p = runGoalLabPipelineV1(pipelineInput());
    // A->C has no world.tom entry: prior is neutral (confidence 0), so the
    // single trust signal lands verbatim.
    expect(beliefMagnitude(p, 'tom:belief:final:A:C:trust')).toBeCloseTo(0.9, 12);
    const beliefAtoms = s5Atoms(p).filter(atom => String(atom.id).startsWith('tom:belief:'));
    expect(beliefAtoms).toHaveLength(48); // A->B and A->C, 24 each
  });

  it('layers envelope evidence over the legacy-decoder prior', () => {
    const decoderOnly = runGoalLabPipelineV1(pipelineInput({ withEnvelopes: false }));
    const combined = runGoalLabPipelineV1(pipelineInput());

    const legacyOnlyTrust = beliefMagnitude(decoderOnly, 'tom:belief:final:A:B:trust');
    const combinedTrust = beliefMagnitude(combined, 'tom:belief:final:A:B:trust');
    expect(legacyOnlyTrust).toBeCloseTo(0.8, 12);
    // The 0.4 envelope signal pulls the belief off the legacy prior, landing
    // strictly between the two sources.
    expect(combinedTrust).toBeLessThan(0.8);
    expect(combinedTrust).toBeGreaterThan(0.4);

    // The evidence ledger cites both the decoder and the scene observation.
    const artifacts = arr<any>((combined as any)?.stages).find((st: any) => st?.stage === 'S5')?.artifacts;
    expect(artifacts?.opponentBeliefDualEmit).toMatchObject({ enabled: true, beliefCount: 2, skipped: [] });
    const trustAtom = s5Atoms(combined).find(atom => atom.id === 'tom:belief:final:A:B:trust');
    const used = arr<string>(trustAtom?.trace?.usedAtomIds).map(String);
    expect(used.some(id => id.includes('legacy-tom'))).toBe(true);
    expect(used.some(id => id.includes('evidence-scene'))).toBe(true);
  });

  it('hidden scene payload stays non-interfering end-to-end', () => {
    const baseline = runGoalLabPipelineV1(pipelineInput({ hidden: 'loyal' }));
    const mutated = runGoalLabPipelineV1(pipelineInput({ hidden: 'planning-betrayal' }));
    const project = (p: any) => arr<any>(p?.stages).map((st: any) => ({
      stage: String(st?.stage ?? ''),
      atoms: arr<ContextAtom>(st?.atoms)
        .map(a => ({ id: String(a?.id ?? ''), magnitude: a?.magnitude ?? null, usedAtomIds: arr<string>(a?.trace?.usedAtomIds).map(String).sort() }))
        .sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0)),
    }));
    expect(project(mutated)).toEqual(project(baseline));
  });

  it('visible scene evidence reaches the emitted magnitude', () => {
    const low = runGoalLabPipelineV1(pipelineInput({ trustToB: 0.1 }));
    const high = runGoalLabPipelineV1(pipelineInput({ trustToB: 0.9 }));
    expect(beliefMagnitude(low, 'tom:belief:final:A:B:trust'))
      .not.toBeCloseTo(beliefMagnitude(high, 'tom:belief:final:A:B:trust') as number, 6);
  });

  it('emits nothing when the flag is off, envelopes present or not', () => {
    const p = runGoalLabPipelineV1(pipelineInput({ flagOn: false }));
    expect(s5Atoms(p).filter(atom => String(atom.id).startsWith('tom:belief:'))).toHaveLength(0);
  });
});
