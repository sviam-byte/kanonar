// tests/simkit/mvp0_twins.test.ts
//
// I-1.5 twin API contract + the proto observations of A3/A4/A5.
//
// Frozen readout (with this file, BEFORE observation): divergence = first tick
// where any agent's APPLIED ACTION differs; attribution = usedAtomIds
// symmetric diff of the diverging agent at that tick.
//
// Honest-verdict note: whether wipeMemory/removeObject actually flip decisions
// is an EMPIRICAL observation recorded per seed (memory can be real in state
// yet behaviorally decorative under q-dominance — that outcome must surface,
// not fail the gate). The hard contract asserted here is the mechanism:
// transforms do what they claim and the injected atom reaches the twin's S0.

import { describe, it, expect } from 'vitest';
import { makeMvp0World, MVP0_AGENT_A, MVP0_AGENT_B, MVP0_OBJECT_ID } from '../../lib/simkit/scenarios/mvp0Scene';
import { objectFactKey } from '../../lib/simkit/actions/objectSpec';
import {
  runTwins,
  removeObjectTransform,
  wipeMemoryTransform,
  injectSpeechAtomTransform,
} from '../../lib/simkit/mvp0/runTwins';

describe('MVP-0 twin transforms (pure)', () => {
  it('removeObject: deletes the object fact, input world untouched', () => {
    const world = makeMvp0World(1);
    const before = JSON.stringify(world);
    const twin = removeObjectTransform(MVP0_OBJECT_ID)(world);
    expect(JSON.stringify(world)).toBe(before);
    expect((twin.facts as any)[objectFactKey(MVP0_OBJECT_ID)]).toBeUndefined();
  });

  it('wipeMemory: clears the mem:* stores and accepted atoms', () => {
    const world = makeMvp0World(1);
    (world.facts as any)[`mem:beliefAtoms:${MVP0_AGENT_B}`] = [{ id: 'x' }];
    (world.facts as any)[`mem:memory:${MVP0_AGENT_B}`] = { entries: [1] };
    (world.facts as any)[`mem:episodic:${MVP0_AGENT_B}`] = [{ id: 'e' }];
    (world.facts as any)[`agentAtoms:${MVP0_AGENT_B}`] = [{ id: 'a' }];
    const twin = wipeMemoryTransform(MVP0_AGENT_B)(world);
    for (const key of [
      `mem:beliefAtoms:${MVP0_AGENT_B}`,
      `mem:memory:${MVP0_AGENT_B}`,
      `mem:episodic:${MVP0_AGENT_B}`,
      `agentAtoms:${MVP0_AGENT_B}`,
    ]) {
      expect((twin.facts as any)[key], key).toBeUndefined();
    }
    // Untouched agent keeps everything.
    expect((world.facts as any)[`mem:beliefAtoms:${MVP0_AGENT_B}`]).toBeDefined();
  });

  it('injectSpeechAtom: enqueues one speech:v1 threaten event', () => {
    const world = makeMvp0World(1);
    const twin = injectSpeechAtomTransform({ from: MVP0_AGENT_A, to: MVP0_AGENT_B })(world);
    const evt = (twin.events || []).find((e) => e.type === 'speech:v1');
    expect(evt).toBeDefined();
    expect(evt?.payload).toMatchObject({ actorId: MVP0_AGENT_A, targetId: MVP0_AGENT_B, act: 'threaten' });
    expect(world.events).toHaveLength(0);
  });
});

describe('MVP-0 twin runs (A2 divergence contract)', () => {
  it('injectSpeechAtom: twins diverge and the diff names the divergence tick + atoms', () => {
    const d = runTwins({
      seed: 7,
      ticks: 4,
      intervention: { kind: 'injectSpeechAtom', from: MVP0_AGENT_A, to: MVP0_AGENT_B },
    });
    expect(d.firstDivergenceTick).not.toBeNull();
    expect(d.divergedAgentId).not.toBeNull();
    // The attribution carries actual atom ids from the diverging choice.
    expect(d.divergedAtoms.onlyBase.length + d.divergedAtoms.onlyTwin.length).toBeGreaterThan(0);
    // The injected threaten event is visible in the twin's used atoms at the
    // divergence (the atom→S0→decision chain, Communication v0).
    const twinSide = d.divergedAtoms.onlyTwin.join(' ');
    expect(twinSide).toMatch(/threaten|speech/);
  }, 600000);

  it('removeObject: menu shrinks at tick 0 for both agents (A4 menu proto)', () => {
    const d = runTwins({ seed: 7, ticks: 2, intervention: { kind: 'removeObject' } });
    for (const id of [MVP0_AGENT_A, MVP0_AGENT_B]) {
      const base = d.baseRows.find((r) => r.tick === 0 && r.agentId === id)!;
      const twin = d.twinRows.find((r) => r.tick === 0 && r.agentId === id)!;
      expect(twin.menuCount, `menu of ${id}`).toBeLessThan(base.menuCount);
    }
  }, 600000);

  it('wipeMemory: mechanism runs tick-locked; divergence is an observation, not a gate', () => {
    const d = runTwins({
      seed: 7,
      ticks: 10,
      intervention: { kind: 'wipeMemory', agentId: MVP0_AGENT_B, atTick: 4 },
    });
    expect(d.interventionTick).toBe(4);
    // Pre-intervention prefix must be identical (twin discipline).
    const pre = (rows: typeof d.baseRows) => rows.filter((r) => r.tick < 4).map((r) => r.action);
    expect(JSON.stringify(pre(d.twinRows))).toBe(JSON.stringify(pre(d.baseRows)));
    if (d.firstDivergenceTick !== null) {
      expect(d.firstDivergenceTick).toBeGreaterThanOrEqual(4);
      console.log('wipeMemory diverged at tick', d.firstDivergenceTick, 'agent', d.divergedAgentId);
    } else {
      // Proto-A3 observation to record in the run report: memory wiped but
      // behavior unchanged on this seed (state-real, behavior-decorative).
      console.log('wipeMemory: NO divergence on seed 7 over 10 ticks (record in report)');
    }
  }, 600000);
});
