// tests/simkit/location_props_v1.test.ts
//
// I-2.4 Location v1 properties passthrough — units + mechanism smoke.
// OFF (default): the adapter emits NO `properties` key (the pinned MVP-0
// golden hash is the whole-engine byte-identity witness). ON: the location
// entity's properties reach the pipeline; world:loc:privacy hits the frozen
// endpoints (private→1, public→0 — curve01-invariant), and the UNTOUCHED
// deriveAxes formulas move the privacy/publicness axes the frozen way:
//   privacy    = 0.7·locPrivacy + 0.3·normPrivacy
//   publicness = 0.7·(1−locPrivacy) + 0.3·normPublicExposure

import { describe, it, expect } from 'vitest';
import { FC } from '../../lib/config/formulaConfig';
import { buildWorldStateFromSim } from '../../lib/simkit/plugins/goalLabWorldState';
import { buildSnapshot } from '../../lib/simkit/core/world';
import { deriveAxes } from '../../lib/context/axes/deriveAxes';
import { normalizeAtom } from '../../lib/context/v2/infer';
import { SimKitSimulator } from '../../lib/simkit/core/simulator';
import { makeGoalLabDeciderPlugin } from '../../lib/simkit/plugins/goalLabDeciderPlugin';
import { makeGoalLabPipelinePlugin } from '../../lib/simkit/plugins/goalLabPipelinePlugin';
import { makePerceptionMemoryPlugin } from '../../lib/simkit/plugins/perceptionMemoryPlugin';
import { makeMvp0World, MVP0_AGENT_B, MVP0_LOCATION_ID } from '../../lib/simkit/scenarios/mvp0Scene';
import { setLocationPrivacyTransform } from '../../lib/simkit/mvp0/runTwins';

const flag = () => FC.location.propsV1 as { enabled: boolean };

function adapterLocations(world: any) {
  const ws = buildWorldStateFromSim(world, buildSnapshot(world));
  return (ws as any).locations as any[];
}

describe('location propsV1 adapter passthrough', () => {
  it('OFF (default): adapter emits no properties key', () => {
    expect(flag().enabled).toBe(false);
    const privateWorld = makeMvp0World(1);
    const publicWorld = setLocationPrivacyTransform('public')(privateWorld);
    const privateLocations = adapterLocations(privateWorld);
    const publicLocations = adapterLocations(publicWorld);

    expect(privateLocations.length).toBeGreaterThan(0);
    for (const location of privateLocations) expect('properties' in location).toBe(false);
    expect(JSON.stringify(publicLocations)).toBe(JSON.stringify(privateLocations));
  });

  it('ON: the location entity properties reach the pipeline location', () => {
    flag().enabled = true;
    try {
      const locs = adapterLocations(makeMvp0World(1));
      const room = locs.find((l) => l.entityId === MVP0_LOCATION_ID);
      expect(room?.properties?.privacy).toBe('private');

      const pub = adapterLocations(setLocationPrivacyTransform('public')(makeMvp0World(1)));
      expect(pub.find((l) => l.entityId === MVP0_LOCATION_ID)?.properties?.privacy).toBe('public');
    } finally {
      flag().enabled = false;
    }
  });
});

describe('deriveAxes join, hand-computed (formulas untouched)', () => {
  const locAtom = (v: number) =>
    normalizeAtom({ id: 'world:loc:privacy:A', ns: 'world', kind: 'world_fact', magnitude: v, confidence: 1 });

  it('locPrivacy 1 ⇒ privacy 0.7, publicness 0.0 (norm sources absent)', () => {
    const { atoms } = deriveAxes({ selfId: 'A', atoms: [locAtom(1)] });
    expect(atoms.find((a) => a.id === 'ctx:privacy:A')!.magnitude).toBeCloseTo(0.7 * 1, 12);
    expect(atoms.find((a) => a.id === 'ctx:publicness:A')!.magnitude).toBeCloseTo(0.7 * (1 - 1), 12);
  });

  it('locPrivacy 0 ⇒ privacy 0.0, publicness 0.7; intimacy = 0.7·privacy + 0.3·(1−surv)', () => {
    const { atoms } = deriveAxes({ selfId: 'A', atoms: [locAtom(0)] });
    expect(atoms.find((a) => a.id === 'ctx:privacy:A')!.magnitude).toBeCloseTo(0, 12);
    expect(atoms.find((a) => a.id === 'ctx:publicness:A')!.magnitude).toBeCloseTo(0.7, 12);
    // private: surveillance=0. Public: publicness=0.7 feeds surveillance=0.2·0.7=0.14.
    const priv = deriveAxes({ selfId: 'A', atoms: [locAtom(1)] }).atoms;
    expect(priv.find((a) => a.id === 'ctx:intimacy:A')!.magnitude).toBeCloseTo(0.7 * 0.7 + 0.3, 12);
    expect(atoms.find((a) => a.id === 'ctx:intimacy:A')!.magnitude).toBeCloseTo(0.3 * (1 - 0.14), 12);
  });
});

describe('location propsV1 mechanism smoke (flag ON, live pipeline)', () => {
  function s3AtomsOfB(world: any, seed: number) {
    const sim = new SimKitSimulator({
      scenarioId: 'locsmoke',
      seed,
      initialWorld: world,
      plugins: [
        makeGoalLabDeciderPlugin({ storePipeline: true }),
        makeGoalLabPipelinePlugin(),
        makePerceptionMemoryPlugin(),
      ],
    });
    sim.step();
    // lastPipeline belongs to the last agent in sorted order = mvp0B.
    const pipeline: any = (sim.world.facts as any)['sim:goalLab:lastPipeline'];
    return ((pipeline?.stages ?? []).find((s: any) => s.stage === 'S3')?.atoms ?? []) as any[];
  }
  const mag = (atoms: any[], id: string) => Number(atoms.find((a) => a.id === id)?.magnitude ?? NaN);

  it('private room: world:loc:privacy=1 in the pool; public twin flips the axes', () => {
    flag().enabled = true;
    try {
      const priv = s3AtomsOfB(makeMvp0World(3), 3);
      const pub = s3AtomsOfB(setLocationPrivacyTransform('public')(makeMvp0World(3)), 3);

      expect(mag(priv, `world:loc:privacy:${MVP0_AGENT_B}`)).toBe(1);
      expect(mag(pub, `world:loc:privacy:${MVP0_AGENT_B}`)).toBe(0);
      // Axis signs (values include norm-source contributions; signs are the claim):
      expect(mag(priv, `ctx:privacy:${MVP0_AGENT_B}`)).toBeGreaterThan(mag(pub, `ctx:privacy:${MVP0_AGENT_B}`));
      expect(mag(pub, `ctx:publicness:${MVP0_AGENT_B}`)).toBeGreaterThan(mag(priv, `ctx:publicness:${MVP0_AGENT_B}`));
      expect(mag(priv, `ctx:intimacy:${MVP0_AGENT_B}`)).toBeGreaterThan(mag(pub, `ctx:intimacy:${MVP0_AGENT_B}`));
    } finally {
      flag().enabled = false;
    }
  }, 240000);
});
