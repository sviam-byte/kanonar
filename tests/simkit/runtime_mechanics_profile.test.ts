import { describe, expect, it } from 'vitest';

import { FC } from '../../lib/config/formulaConfig';
import {
  RUNTIME_PROFILE_FACT_KEY,
  resolveRuntimeMechanics,
} from '../../lib/config/runtimeMechanics';
import { runGoalLabPipelineV1 } from '../../lib/goal-lab/pipeline/runPipelineV1';
import { arr } from '../../lib/utils/arr';
import { buildSnapshot } from '../../lib/simkit/core/world';
import { SimKitSimulator } from '../../lib/simkit/core/simulator';
import { makeGoalLabDeciderPlugin } from '../../lib/simkit/plugins/goalLabDeciderPlugin';
import { makeGoalLabPipelinePlugin } from '../../lib/simkit/plugins/goalLabPipelinePlugin';
import { makePerceptionMemoryPlugin } from '../../lib/simkit/plugins/perceptionMemoryPlugin';
import { buildWorldStateFromSim } from '../../lib/simkit/plugins/goalLabWorldState';
import {
  makeMvp0StakesWorld,
  MVP0_AGENT_A,
  MVP0_AGENT_B,
  MVP0_LOCATION_ID,
} from '../../lib/simkit/scenarios/mvp0Scene';
import { injectSpeechAtomTransform } from '../../lib/simkit/mvp0/runTwins';
import { mockWorld } from '../pipeline/fixtures';

describe('runtime mechanics profile', () => {
  it('keeps config defaults implicit and resolves explicit profiles without mutating FC', () => {
    const before = JSON.stringify({
      communication: FC.communication.speechThreatV1.enabled,
      objects: FC.objects.contextAxesV1.enabled,
      location: FC.location.propsV1.enabled,
      memory: FC.memory.threatTraceV1.enabled,
      prior: FC.actionScoring.priorInfluence.enabled,
      pamV2: FC.actionScoring.pamV2.enabled,
    });

    const config = resolveRuntimeMechanics();
    const legacy = resolveRuntimeMechanics('legacy');
    const phase1 = resolveRuntimeMechanics('phase1');

    expect(config.profileId).toBe('config');
    expect(config.source).toBe('formulaConfig');
    expect(legacy.activeMechanisms).toEqual([]);
    expect(phase1.activeMechanisms).toEqual([
      'communication.speechThreatV1',
      'objects.contextAxesV1',
      'location.propsV1',
      'memory.threatTraceV1',
      'actionScoring.priorInfluence',
      'actionScoring.pamV2',
    ]);
    expect(JSON.stringify({
      communication: FC.communication.speechThreatV1.enabled,
      objects: FC.objects.contextAxesV1.enabled,
      location: FC.location.propsV1.enabled,
      memory: FC.memory.threatTraceV1.enabled,
      prior: FC.actionScoring.priorInfluence.enabled,
      pamV2: FC.actionScoring.pamV2.enabled,
    })).toBe(before);
  });

  it('keeps opponentBeliefS5V1 OFF on every named profile and honors the explicit override', () => {
    expect(resolveRuntimeMechanics('legacy').opponentBeliefS5V1).toBe(false);
    expect(resolveRuntimeMechanics('phase1').opponentBeliefS5V1).toBe(false);
    expect(resolveRuntimeMechanics().opponentBeliefS5V1).toBe(false);

    const optIn = resolveRuntimeMechanics({ profileId: 'legacy', opponentBeliefS5V1: true });
    expect(optIn.opponentBeliefS5V1).toBe(true);
    expect(optIn.source).toBe('runtimeProfile');
    expect(optIn.activeMechanisms).toEqual(['tom.opponentBeliefS5V1']);
    expect(FC.opponentBeliefV1.s5DualEmit.enabled).toBe(false);
  });

  it('emits profile metadata only for an explicit run profile', () => {
    const implicit = runGoalLabPipelineV1({
      world: mockWorld(),
      agentId: 'A',
      participantIds: ['A'],
    });
    const explicit = runGoalLabPipelineV1({
      world: mockWorld(),
      agentId: 'A',
      participantIds: ['A'],
      sceneControl: { runtimeProfile: 'phase1' },
    });

    const s0Implicit = arr((implicit as any)?.stages).find((stage: any) => stage?.stage === 'S0');
    const s0Explicit = arr((explicit as any)?.stages).find((stage: any) => stage?.stage === 'S0');
    expect(s0Implicit?.artifacts).not.toHaveProperty('runtimeMechanics');
    expect(s0Explicit?.artifacts?.runtimeMechanics?.profileId).toBe('phase1');

    const legacySim = new SimKitSimulator({
      scenarioId: 'implicit-profile-shape',
      seed: 3,
      initialWorld: makeMvp0StakesWorld(3),
      plugins: [
        makeGoalLabDeciderPlugin({ storePipeline: false }),
        makeGoalLabPipelinePlugin(),
        makePerceptionMemoryPlugin(),
      ],
    });
    const record = legacySim.step();
    expect((record.plugins as any)?.perceptionMemory).not.toHaveProperty('runtimeMechanics');
    expect(legacySim.world.facts[`sim:trace:${MVP0_AGENT_A}`]).not.toHaveProperty('runtimeMechanics');
  });

  it('threads phase1 through SimKit, exposes causal readouts, and preserves the global config', () => {
    const seed = 3;
    const world = injectSpeechAtomTransform({
      from: MVP0_AGENT_A,
      to: MVP0_AGENT_B,
      magnitude: 0.7,
    })(makeMvp0StakesWorld(seed));
    world.facts[RUNTIME_PROFILE_FACT_KEY] = 'phase1';

    const adapted = buildWorldStateFromSim(world, buildSnapshot(world));
    const room = adapted.locations.find((location) => location.entityId === MVP0_LOCATION_ID);
    expect(room?.properties?.privacy).toBe('private');

    const sim = new SimKitSimulator({
      scenarioId: 'runtime-profile-smoke',
      seed,
      initialWorld: world,
      plugins: [
        makeGoalLabDeciderPlugin({ storePipeline: true }),
        makeGoalLabPipelinePlugin(),
        makePerceptionMemoryPlugin(),
      ],
      maxRecords: 8,
    });

    sim.step();
    sim.step();

    const trace = sim.world.facts[`sim:trace:${MVP0_AGENT_B}`] as any;
    expect(trace?.runtimeMechanics?.profileId).toBe('phase1');
    expect(trace?.contextAxes?.privacy).toBeGreaterThan(0.5);
    expect(trace?.contextAxes?.resourceAccess).toBeGreaterThan(0.5);
    expect(Number.isFinite(trace?.tension?.channels?.total)).toBe(true);

    const pipeline = sim.world.facts['sim:goalLab:lastPipeline'] as any;
    const s2Atoms = arr<any>(arr<any>(pipeline?.stages).find((stage) => stage?.stage === 'S2')?.atoms);
    expect(s2Atoms.some((atom) => atom?.id === `ctx:src:comm:threat:${MVP0_AGENT_B}`)).toBe(true);
    expect(s2Atoms.some((atom) => atom?.id === `ctx:src:scene:resourceAccess:${MVP0_AGENT_B}`)).toBe(true);

    const memory = sim.world.facts[`mem:memory:${MVP0_AGENT_B}`] as Record<string, any>;
    expect(Object.values(memory ?? {}).some((entry) => entry?.atom?.id?.startsWith('mem:speech:threat:'))).toBe(true);
    expect(FC.communication.speechThreatV1.enabled).toBe(false);
    expect(FC.memory.threatTraceV1.enabled).toBe(false);

    const firstTension = trace.tension;
    sim.reset(seed);
    sim.step();
    sim.step();
    const resetTrace = sim.world.facts[`sim:trace:${MVP0_AGENT_B}`] as any;
    expect(resetTrace?.tension).toEqual(firstTension);
  }, 120000);
});
