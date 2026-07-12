// tests/pipeline/opponent_belief_s5_dual_emit.test.ts
//
// Pipeline-level contract for the flag-gated S5 dual-emit
// (runtimeMechanics.opponentBeliefS5V1): OFF emits nothing; ON emits the
// approved tom:belief:* grammar from world.tom; hidden/unmapped legacy
// fields and reverse-direction dyads never reach the semantic projection
// or the S8 decision trace; visible trust changes do.

import { describe, expect, it } from 'vitest';

import { runGoalLabPipelineV1 } from '@/lib/goal-lab/pipeline/runPipelineV1';
import type { ContextAtom } from '@/lib/context/v2/types';
import { arr } from '@/lib/utils/arr';

import { mockAgent, mockWorld } from './fixtures';

function tomEntry(traits: Record<string, number>) {
  return {
    goals: { goalIds: [], weights: [] },
    traits: {
      trust: 0.5, align: 0.5, respect: 0.5, dominance: 0.5,
      bond: 0.5, fear: 0.5, conflict: 0.5, competence: 0.5,
      reliability: 0.5, obedience: 0.5, uncertainty: 0.5,
      ...traits,
    },
    uncertainty: 0.5,
    lastUpdatedTick: 0,
    lastInteractionTick: 0,
  };
}

function fixedInput(tomOverrides: { ab?: Record<string, number>; ba?: Record<string, number> } = {}, flagOn = true) {
  const world = mockWorld([mockAgent('A'), mockAgent('B'), mockAgent('C')]);
  (world as any).tom = {
    A: { B: tomEntry(tomOverrides.ab ?? { trust: 0.2 }), C: tomEntry({ trust: 0.6 }) },
    B: { A: tomEntry(tomOverrides.ba ?? { trust: 0.5 }) },
  };
  return {
    world,
    agentId: 'A',
    participantIds: ['A', 'B', 'C'],
    observeLiteParams: { seed: 1234 },
    sceneControl: {
      enableToM: true,
      runtimeProfile: flagOn
        ? 'phase1'
        : { profileId: 'phase1', opponentBeliefS5V1: false },
    },
  } as any;
}

function stageAtoms(p: any, stage: string): ContextAtom[] {
  return arr<ContextAtom>(arr<any>(p?.stages).find((st: any) => st?.stage === stage)?.atoms);
}

function stageArtifacts(p: any, stage: string): any {
  return arr<any>(p?.stages).find((st: any) => st?.stage === stage)?.artifacts;
}

// Local copy of the determinism-oracle semantic projection (that test's
// helpers are file-local by design).
function semanticProjection(p: any) {
  return arr<any>(p?.stages).map((st: any) => ({
    stage: String(st?.stage ?? ''),
    atoms: arr<ContextAtom>(st?.atoms)
      .map((a) => ({
        id: String(a?.id ?? ''),
        ns: String(a?.ns ?? ''),
        kind: String(a?.kind ?? ''),
        origin: String(a?.origin ?? ''),
        magnitude: Number.isFinite(a?.magnitude as number) ? Number(a?.magnitude) : null,
        confidence: Number.isFinite(a?.confidence as number) ? Number(a?.confidence) : null,
        usedAtomIds: arr<string>(a?.trace?.usedAtomIds).map(String).sort(),
      }))
      .sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0)),
  }));
}

describe('S5 opponent-belief dual emit (pipeline level)', () => {
  it('emits no tom:belief:* atoms when the flag is off', () => {
    const p = runGoalLabPipelineV1(fixedInput({}, false));
    const beliefAtoms = stageAtoms(p, 'S5').filter(atom => String(atom.id).startsWith('tom:belief:'));
    expect(beliefAtoms).toHaveLength(0);
    expect(stageArtifacts(p, 'S5')?.opponentBeliefDualEmit).toMatchObject({ enabled: false, atomCount: 0, beliefCount: 0 });
  });

  it('emits exactly 24 atoms per decodable dyad when the flag is on', () => {
    const p = runGoalLabPipelineV1(fixedInput());
    const beliefAtoms = stageAtoms(p, 'S5').filter(atom => String(atom.id).startsWith('tom:belief:'));
    // A has tom entries for B and C: 2 dyads x 8 axes x 3 atom kinds.
    expect(beliefAtoms).toHaveLength(48);
    expect(stageArtifacts(p, 'S5')?.opponentBeliefDualEmit).toMatchObject({ enabled: true, atomCount: 48, beliefCount: 2, skipped: [] });
    expect(beliefAtoms.find(atom => atom.id === 'tom:belief:final:A:B:trust')?.magnitude).toBeCloseTo(0.2, 12);
    expect(beliefAtoms.find(atom => atom.id === 'tom:belief:final:A:C:trust')?.magnitude).toBeCloseTo(0.6, 12);
  });

  it('hidden legacy fields and reverse dyads do not reach the semantic projection or S8', () => {
    const baseline = runGoalLabPipelineV1(fixedInput());
    const mutated = runGoalLabPipelineV1(fixedInput({
      // competence/obedience/reliability are read by NEITHER the legacy S0
      // dyad extractor NOR the decoder's mapped axes; the reverse dyad
      // (B's view of A) is invisible to A's run entirely.
      ab: { trust: 0.2, competence: 0.05, obedience: 0.95, reliability: 0.05 },
      ba: { trust: 0.01, align: 0.99, bond: 0.99 },
    }));
    expect(semanticProjection(mutated)).toEqual(semanticProjection(baseline));
    expect(stageArtifacts(mutated, 'S8')?.ranked).toEqual(stageArtifacts(baseline, 'S8')?.ranked);
  });

  it('visible trust changes reach the emitted magnitude', () => {
    const low = runGoalLabPipelineV1(fixedInput({ ab: { trust: 0.2 } }));
    const high = runGoalLabPipelineV1(fixedInput({ ab: { trust: 0.9 } }));
    const magnitude = (p: any) => stageAtoms(p, 'S5').find(atom => atom.id === 'tom:belief:final:A:B:trust')?.magnitude;
    expect(magnitude(low)).toBeCloseTo(0.2, 12);
    expect(magnitude(high)).toBeCloseTo(0.9, 12);
  });

  it('flag-on run is deterministic', () => {
    const p1 = runGoalLabPipelineV1(fixedInput());
    const p2 = runGoalLabPipelineV1(fixedInput());
    expect(semanticProjection(p1)).toEqual(semanticProjection(p2));
  });
});
