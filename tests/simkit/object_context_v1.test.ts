// tests/simkit/object_context_v1.test.ts
//
// I-2.3 Object v1 context axes — units + mechanism smoke.
// OFF (default): no atoms produced; the pinned MVP-0 golden hash is the
// whole-engine byte-identity witness. ON: hand-computed values against the
// frozen v1 constants and the untouched deriveAxes sockets.

import { describe, it, expect } from 'vitest';
import { FC } from '../../lib/config/formulaConfig';
import { deriveObjectContextAtoms, OBJECT_CONTEXT_V1 } from '../../lib/context/sources/objectContextAtoms';
import { deriveAxes } from '../../lib/context/axes/deriveAxes';
import { normalizeAtom } from '../../lib/context/v2/infer';
import { SimKitSimulator } from '../../lib/simkit/core/simulator';
import { makeGoalLabDeciderPlugin } from '../../lib/simkit/plugins/goalLabDeciderPlugin';
import { makeGoalLabPipelinePlugin } from '../../lib/simkit/plugins/goalLabPipelinePlugin';
import { makePerceptionMemoryPlugin } from '../../lib/simkit/plugins/perceptionMemoryPlugin';
import { makeMvp0StakesWorld, MVP0_AGENT_A, MVP0_AGENT_B } from '../../lib/simkit/scenarios/mvp0Scene';

const worldOf = (facts: Record<string, unknown>, agents: Array<{ id: string; loc: string }>) => ({
  agents: agents.map((a) => ({ entityId: a.id, locationId: a.loc })),
  sceneSnapshot: { simkit: { facts } },
});

describe('objectContext producer (frozen v1 constants)', () => {
  const A = { id: 'A', loc: 'L' };
  const B = { id: 'B', loc: 'L' };

  it('holding: resourceAccess 0.9 / scarcity 0.0', () => {
    const w = worldOf({ 'obj:v0:token': { holderId: 'B', locId: 'L' } }, [A, B]);
    const out = deriveObjectContextAtoms({ selfId: 'B', world: w, atoms: [] }).atoms;
    expect(out.map((a) => [a.id, a.magnitude])).toEqual([
      ['ctx:src:scene:resourceAccess:B', OBJECT_CONTEXT_V1.holding.resourceAccess],
      ['ctx:src:scene:scarcity:B', OBJECT_CONTEXT_V1.holding.scarcity],
    ]);
  });

  it('rival holds in my location: resourceAccess 0.1 / scarcity 0.7', () => {
    const w = worldOf({ 'obj:v0:token': { holderId: 'B', locId: 'L' } }, [A, B]);
    const out = deriveObjectContextAtoms({ selfId: 'A', world: w, atoms: [] }).atoms;
    expect(out.map((a) => [a.id, a.magnitude])).toEqual([
      ['ctx:src:scene:resourceAccess:A', OBJECT_CONTEXT_V1.rivalHolds.resourceAccess],
      ['ctx:src:scene:scarcity:A', OBJECT_CONTEXT_V1.rivalHolds.scarcity],
    ]);
  });

  it('unheld object here: resourceAccess 0.5 / scarcity 0.35; elsewhere/none: no atoms', () => {
    const here = worldOf({ 'obj:v0:token': { holderId: null, locId: 'L' } }, [A]);
    expect(deriveObjectContextAtoms({ selfId: 'A', world: here, atoms: [] }).atoms.map((a) => a.magnitude)).toEqual([
      OBJECT_CONTEXT_V1.unheldHere.resourceAccess,
      OBJECT_CONTEXT_V1.unheldHere.scarcity,
    ]);
    const elsewhere = worldOf({ 'obj:v0:token': { holderId: null, locId: 'M' } }, [A]);
    expect(deriveObjectContextAtoms({ selfId: 'A', world: elsewhere, atoms: [] }).atoms).toHaveLength(0);
    expect(deriveObjectContextAtoms({ selfId: 'A', world: worldOf({}, [A]), atoms: [] }).atoms).toHaveLength(0);
  });

  it('best access wins across objects; defers to existing scene metrics', () => {
    const w = worldOf(
      {
        'obj:v0:a': { holderId: 'A', locId: 'L' }, // holding (0.9)
        'obj:v0:b': { holderId: 'B', locId: 'L' }, // rivalHolds (0.1)
      },
      [A, B],
    );
    const out = deriveObjectContextAtoms({ selfId: 'A', world: w, atoms: [] }).atoms;
    expect(out[0].magnitude).toBe(OBJECT_CONTEXT_V1.holding.resourceAccess);

    const existing = normalizeAtom({ id: 'ctx:src:scene:resourceAccess:A', kind: 'ctx_input', magnitude: 0.2 });
    const deferred = deriveObjectContextAtoms({ selfId: 'A', world: w, atoms: [existing] }).atoms;
    expect(deferred.map((a) => a.id)).toEqual(['ctx:src:scene:scarcity:A']);
  });

  it('deriveAxes join, hand-computed: rivalHolds ⇒ scarcity 0.75·0.7+0.25·(1−0.1)=0.75', () => {
    const w = worldOf({ 'obj:v0:token': { holderId: 'B', locId: 'L' } }, [A, B]);
    const src = deriveObjectContextAtoms({ selfId: 'A', world: w, atoms: [] }).atoms;
    const { atoms } = deriveAxes({ selfId: 'A', atoms: src });
    const scarcity = atoms.find((a) => a.id === 'ctx:scarcity:A')!;
    expect(scarcity.magnitude).toBeCloseTo(0.75 * 0.7 + 0.25 * (1 - 0.1), 12);
    // holder side: scarcity = 0.75·0 + 0.25·(1−0.9) = 0.025; control gains 0.2·0.9
    const srcB = deriveObjectContextAtoms({ selfId: 'B', world: w, atoms: [] }).atoms;
    const axB = deriveAxes({ selfId: 'B', atoms: srcB }).atoms;
    expect(axB.find((a) => a.id === 'ctx:scarcity:B')!.magnitude).toBeCloseTo(0.025, 12);
    expect(axB.find((a) => a.id === 'ctx:control:B')!.magnitude).toBeCloseTo(0.2 * 0.9, 12);
  });
});

describe('objectContext mechanism smoke (flag ON, staked scene)', () => {
  it('B (holder) and A (rival) get their object axes inside the live pipeline', () => {
    const flag = (FC.objects as any).contextAxesV1;
    flag.enabled = true;
    try {
      const sim = new SimKitSimulator({
        scenarioId: 'smoke',
        seed: 3,
        initialWorld: makeMvp0StakesWorld(3),
        plugins: [
          makeGoalLabDeciderPlugin({ storePipeline: true }),
          makeGoalLabPipelinePlugin(),
          makePerceptionMemoryPlugin(),
        ],
      });
      sim.step();
      // lastPipeline belongs to the last agent in sorted order = mvp0B (holder).
      const pipeline: any = (sim.world.facts as any)['sim:goalLab:lastPipeline'];
      const s3 = (pipeline?.stages ?? []).find((s: any) => s.stage === 'S3')?.atoms ?? [];
      const ra = s3.find((a: any) => a.id === `ctx:src:scene:resourceAccess:${MVP0_AGENT_B}`);
      expect(ra?.magnitude).toBe(0.9);
      expect(s3.find((a: any) => a.id === `ctx:scarcity:${MVP0_AGENT_B}`)?.magnitude).toBeCloseTo(0.025, 6);
      // A's axes are in A's pipeline run; assert through A's trace drivers being
      // finite (full A-side axis values are covered by the unit above).
      const trA: any = (sim.world.facts as any)[`sim:trace:${MVP0_AGENT_A}`];
      expect(Number.isFinite(Number(trA?.drivers?.controlNeed))).toBe(true);
    } finally {
      flag.enabled = false;
    }
  }, 240000);
});
