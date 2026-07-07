import { describe, expect, it } from 'vitest';
import { FC } from '../../lib/config/formulaConfig';
import { buildSnapshot } from '../../lib/simkit/core/world';
import {
  buildBeliefAtomsForTick,
  buildDecayingMemoryAtomsForAgent,
  persistDecayingMemoryToFacts,
  type BeliefAtom,
} from '../../lib/simkit/post/perceiveActions';
import { buildWorldStateFromSim } from '../../lib/simkit/plugins/goalLabWorldState';
import { makeMvp0World, MVP0_AGENT_A, MVP0_AGENT_B } from '../../lib/simkit/scenarios/mvp0Scene';

const flag = () => FC.memory.threatTraceV1 as { enabled: boolean } & typeof FC.memory.threatTraceV1;

function acceptedThreat(world: ReturnType<typeof makeMvp0World>, tick: number) {
  world.tickIndex = tick;
  (world.facts as any)[`agentAtoms:${MVP0_AGENT_B}`] = [{
    id: `speech:${MVP0_AGENT_A}:${MVP0_AGENT_B}:danger`,
    magnitude: 0.7,
    confidence: 0.45,
    meta: { from: MVP0_AGENT_A, act: 'threaten', tickIndex: tick, origin: { from: MVP0_AGENT_A, tickIndex: tick } },
  }];
}

describe('memory threatTraceV1', () => {
  it('OFF (default): accepted speech does not enter the decaying-memory builder', () => {
    expect(flag().enabled).toBe(false);
    const world = makeMvp0World(1);
    acceptedThreat(world, 0);
    const atoms = buildBeliefAtomsForTick(world, [], { includeAcceptedThreatSpeech: false });
    expect(atoms[MVP0_AGENT_B].some((atom) => atom.id.startsWith('mem:speech:threat:'))).toBe(false);
  });

  it('ON: accepted threaten speech becomes one traceable decaying atom', () => {
    const world = makeMvp0World(1);
    acceptedThreat(world, 4);
    const atoms = buildBeliefAtomsForTick(world, [], { includeAcceptedThreatSpeech: true });
    const memory = atoms[MVP0_AGENT_B].find((atom) => atom.id === `mem:speech:threat:${MVP0_AGENT_B}:${MVP0_AGENT_A}`);
    expect(memory).toMatchObject({ magnitude: 0.7, confidence: 0.45 });
    expect(memory?.meta).toMatchObject({ from: MVP0_AGENT_A, act: 'threaten', observedTick: 4 });
    expect(memory?.trace?.usedAtomIds).toContain(`speech:${MVP0_AGENT_A}:${MVP0_AGENT_B}:danger`);
  });

  it('absolute-age decay matches c0*0.97^age and the frozen half-life', () => {
    const cfg = flag();
    const world = makeMvp0World(1);
    const atom: BeliefAtom = {
      id: `mem:speech:threat:${MVP0_AGENT_B}:${MVP0_AGENT_A}`,
      magnitude: 0.7,
      confidence: 0.6,
      tags: ['memory', 'speech', 'threat', 'decaying'],
      trace: { parts: { atomKey: `speech-threat:${MVP0_AGENT_B}:${MVP0_AGENT_A}` } },
    };
    persistDecayingMemoryToFacts(world, { [MVP0_AGENT_B]: [atom], [MVP0_AGENT_A]: [] }, {
      ...cfg,
      absoluteAgeDecayV1: true,
    });

    world.tickIndex = 23;
    persistDecayingMemoryToFacts(world, { [MVP0_AGENT_B]: [], [MVP0_AGENT_A]: [] }, {
      ...cfg,
      absoluteAgeDecayV1: true,
    });
    const live = buildDecayingMemoryAtomsForAgent(world, MVP0_AGENT_B, cfg);
    expect(live).toHaveLength(1);
    expect(live[0].confidence).toBeCloseTo(0.6 * Math.pow(0.97, 23), 12);

    const predictedHalfLife = Math.log(0.5) / Math.log(cfg.decayPerTick);
    expect(predictedHalfLife).toBeCloseTo(22.7566, 3);
    expect(23 / predictedHalfLife).toBeGreaterThanOrEqual(0.5);
    expect(23 / predictedHalfLife).toBeLessThanOrEqual(2);
  });

  it('ON adapter uses decaying threat memory after the raw carrier expires', () => {
    const cfg = flag();
    cfg.enabled = true;
    try {
      const world = makeMvp0World(1);
      acceptedThreat(world, 0);
      const atoms = buildBeliefAtomsForTick(world, [], { includeAcceptedThreatSpeech: true });
      persistDecayingMemoryToFacts(world, atoms, { ...cfg, absoluteAgeDecayV1: true });
      world.tickIndex = 2;

      const state = buildWorldStateFromSim(world, buildSnapshot(world));
      const agent = state.agents.find((candidate) => candidate.entityId === MVP0_AGENT_B)!;
      const beliefs = (agent.memory?.beliefAtoms ?? []) as any[];
      expect(beliefs.some((atom) => atom.id === `speech:${MVP0_AGENT_A}:${MVP0_AGENT_B}:danger`)).toBe(false);
      const memory = beliefs.find((atom) => atom.id === `mem:speech:threat:${MVP0_AGENT_B}:${MVP0_AGENT_A}`);
      expect(memory?.confidence).toBeCloseTo(0.45 * Math.pow(0.97, 2), 12);
    } finally {
      cfg.enabled = false;
    }
  });
});
