// NKERNEL-TRAJECTORY-0 regression. Pins the N trajectory runner and analysis:
// the N = 2 reduction oracles (mixed forced/endogenous 6-step schedule vs
// runConflictTrajectory, and every analysis quantity vs its dyadic original —
// exact toBe equality, which also polices the sanctioned duplication of the
// module-private squared-distance helpers), N = 3 sanity/determinism, and
// fail-closed passthrough. No runtime wiring.

import { describe, expect, it } from 'vitest';

import {
  collapseScore,
  createTrustExchangeProtocol,
  repairCapacity,
  runConflictTrajectory,
  stateDistance,
  trajectoryMetrics,
  type ConflictAction,
  type ConflictActionId,
} from '../../lib/dilemma';
import {
  collapseScoreNV1,
  detectCyclePeriodNV1,
  estimateDivergenceRateNV1,
  repairCapacityNV1,
  stateDistanceNV1,
  trajectoryMetricsNV1,
} from '../../lib/dilemma/nkernel/nanalysis';
import {
  asKernelConflictStateV1,
  buildTrustExchangeProtocolNV1,
  participantSetFromConflictPlayersV1,
} from '../../lib/dilemma/nkernel/nstate';
import { runConflictNTrajectoryV1 } from '../../lib/dilemma/nkernel/ntrajectory';
import type { ConflictStateNV1 } from '../../lib/dilemma/nkernel/types';
import type { ParticipantSetV1 } from '../../lib/dilemma/definition/participantSet';

import { makeStateN } from './nkernelFixtures';

function mustSet(players: readonly string[]): ParticipantSetV1 {
  const res = participantSetFromConflictPlayersV1(players);
  if (res.ok === false) throw new Error('expected participant set ok');
  return res.value;
}

function forced(actions: Readonly<Record<string, ConflictActionId>>): readonly ConflictAction[] {
  return Object.keys(actions).map((playerId) => ({ playerId, actionId: actions[playerId] }));
}

function mustValue<T>(result: { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: unknown }): T {
  if (result.ok === false) throw new Error('expected analysis result ok');
  return result.value;
}

describe('NKERNEL-TRAJECTORY-0', () => {
  it('N = 2 reduction oracle: a mixed forced/endogenous 6-step schedule reproduces runConflictTrajectory', () => {
    const schedule = [
      forced({ a: 'trust', b: 'betray' }),
      undefined,
      forced({ a: 'withhold', b: 'withhold' }),
      undefined,
      undefined,
      forced({ a: 'betray', b: 'trust' }),
    ];

    const protocol2 = createTrustExchangeProtocol(['a', 'b']);
    const ref = runConflictTrajectory(
      asKernelConflictStateV1(makeStateN(2)),
      protocol2,
      schedule.length,
      schedule as unknown as readonly (readonly ConflictAction[])[],
    );
    const stateN = makeStateN(2);
    const runN = runConflictNTrajectoryV1({
      initialState: stateN,
      protocol: buildTrustExchangeProtocolNV1(mustSet(stateN.players)),
      steps: schedule.length,
      forcedActionsByStep: schedule,
    });

    if (ref.ok === false || runN.ok === false) throw new Error('expected both trajectories ok');
    expect(runN.value).toHaveLength(ref.value.length);
    ref.value.forEach((refStep, i) => {
      const nStep = runN.value[i];
      expect(nStep.actions).toEqual(refStep.actions);
      expect(nStep.outcome).toEqual(refStep.outcome);
      expect(nStep.state).toEqual(refStep.state);
      expect(nStep.strategyProfiles).toEqual(refStep.strategyProfiles);
    });
  });

  it('N = 2 reduction oracle: every analysis quantity equals its dyadic original exactly', () => {
    const stateN = makeStateN(2);
    const protocolN = buildTrustExchangeProtocolNV1(mustSet(stateN.players));
    const baseline = runConflictNTrajectoryV1({ initialState: stateN, protocol: protocolN, steps: 4 });
    if (baseline.ok === false) throw new Error('expected trajectory ok');

    const statesN: readonly ConflictStateNV1[] = [stateN, ...baseline.value.map((step) => step.state)];
    const statesDyad = statesN.map((state) => asKernelConflictStateV1(state));

    for (let i = 1; i < statesN.length; i++) {
      expect(mustValue(stateDistanceNV1(statesN[0], statesN[i]))).toBe(stateDistance(statesDyad[0], statesDyad[i]));
      expect(mustValue(collapseScoreNV1(statesN[i]))).toBe(collapseScore(statesDyad[i]));
      expect(mustValue(repairCapacityNV1(statesN[i]))).toBe(repairCapacity(statesDyad[i]));
    }

    // A perturbed twin for the divergence-rate branch.
    const perturbedStart: ConflictStateNV1 = {
      ...stateN,
      relations: {
        ...stateN.relations,
        a: { ...stateN.relations['a'], b: { ...stateN.relations['a']['b'], trust: 0.9 } },
      },
    };
    const perturbed = runConflictNTrajectoryV1({ initialState: perturbedStart, protocol: protocolN, steps: 4 });
    if (perturbed.ok === false) throw new Error('expected perturbed trajectory ok');
    const perturbedN: readonly ConflictStateNV1[] = [perturbedStart, ...perturbed.value.map((step) => step.state)];
    const perturbedDyad = perturbedN.map((state) => asKernelConflictStateV1(state));

    const metricsN = mustValue(trajectoryMetricsNV1(statesN, { perturbed: perturbedN }));
    const metricsDyad = trajectoryMetrics(statesDyad, { perturbed: perturbedDyad });
    expect(metricsN).toEqual(metricsDyad);
  });

  it('N = 3: endogenous trajectory runs, metrics stay bounded, cycle detection sees an exact revisit', () => {
    const stateN = makeStateN(3);
    const protocol = buildTrustExchangeProtocolNV1(mustSet(stateN.players));
    const run = runConflictNTrajectoryV1({ initialState: stateN, protocol, steps: 5 });
    if (run.ok === false) throw new Error('expected trajectory ok');

    expect(run.value).toHaveLength(5);
    run.value.forEach((step, i) => {
      expect(step.state.tick).toBe(i + 1);
      expect(step.state.history).toHaveLength(i + 1);
    });

    const states: readonly ConflictStateNV1[] = [stateN, ...run.value.map((step) => step.state)];
    const metrics = mustValue(trajectoryMetricsNV1(states));
    expect(metrics.distanceFromStart).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(metrics.distanceFromStart)).toBe(true);
    expect(metrics.collapseScore).toBeGreaterThanOrEqual(0);
    expect(metrics.collapseScore).toBeLessThanOrEqual(1);
    expect(metrics.repairCapacity).toBeGreaterThanOrEqual(0);
    expect(metrics.repairCapacity).toBeLessThanOrEqual(1);

    // Appending an exact copy of an earlier state is a distance-0 revisit:
    // the copy lands at index 6, the original sits at index 3 → period 3.
    const looped = [...states, states[states.length - 3]];
    expect(mustValue(detectCyclePeriodNV1(looped, 1e-9))).toBe(3);
    expect(mustValue(estimateDivergenceRateNV1(states, states))).toBeUndefined(); // d0 = 0
  });

  it('N = 3: trajectories are deterministic and mixed schedules respect per-step modes', () => {
    const protocol = buildTrustExchangeProtocolNV1(mustSet(['a', 'b', 'c']));
    const schedule = [forced({ a: 'trust', b: 'betray', c: 'withhold' }), undefined, undefined];
    const run = () => runConflictNTrajectoryV1({
      initialState: makeStateN(3),
      protocol,
      steps: 3,
      forcedActionsByStep: schedule,
    });

    const first = run();
    const second = run();
    if (first.ok === false || second.ok === false) throw new Error('expected both trajectories ok');
    expect(first.value).toEqual(second.value);

    // Forced step 0 froze profiles (normalized pass-through of uniform 1/3);
    // the endogenous steps learn — profiles move away from uniform.
    const uniform = first.value[0].strategyProfiles['a'].probabilities;
    expect(uniform.trust).toBeCloseTo(1 / 3, 12);
    const learned = first.value[1].strategyProfiles['a'].probabilities;
    expect(learned.trust).not.toBeCloseTo(1 / 3, 6);
    expect(first.value[0].actions).toEqual({ a: 'trust', b: 'betray', c: 'withhold' });
  });

  it('fails closed on the first bad step and passes the error through', () => {
    const broken = runConflictNTrajectoryV1({
      initialState: { ...makeStateN(2), players: ['a', 'b', 'a'] },
      protocol: buildTrustExchangeProtocolNV1(mustSet(['a', 'b'])),
      steps: 2,
    });
    expect(broken.ok).toBe(false);
    if (broken.ok === false) expect(broken.error.code).toBe('invalid_participants');

    const badForced = runConflictNTrajectoryV1({
      initialState: makeStateN(2),
      protocol: buildTrustExchangeProtocolNV1(mustSet(['a', 'b'])),
      steps: 2,
      forcedActionsByStep: [forced({ a: 'trust' })],
    });
    expect(badForced.ok).toBe(false);
    if (badForced.ok === false) expect(badForced.error.code).toBe('missing_player');
  });

  it('returns typed analysis errors for invalid states, participant mismatch, empty metrics, and bad epsilon', () => {
    const invalid = collapseScoreNV1({ ...makeStateN(2), players: ['a', 'a'] });
    expect(invalid.ok).toBe(false);
    if (invalid.ok === false) expect(invalid.error.code).toBe('invalid_state');

    const mismatch = stateDistanceNV1(makeStateN(2), makeStateN(3));
    expect(mismatch.ok).toBe(false);
    if (mismatch.ok === false) expect(mismatch.error.code).toBe('participant_set_mismatch');

    const empty = trajectoryMetricsNV1([]);
    expect(empty.ok).toBe(false);
    if (empty.ok === false) expect(empty.error.code).toBe('empty_trajectory');

    const epsilon = detectCyclePeriodNV1([makeStateN(2)], Number.NaN);
    expect(epsilon.ok).toBe(false);
    if (epsilon.ok === false) expect(epsilon.error.code).toBe('invalid_epsilon');
  });
});
