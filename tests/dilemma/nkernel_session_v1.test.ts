// NKERNEL-SESSION-0 parity gate. Pins the N = 2 reduction oracle: the N
// live-session runner must reproduce the dyadic runConflictLabSessionV1
// byte-for-byte over the meaningful overlapping fields (per-round choices
// including rngChannelId, canonical/reference actions and step state/outcome,
// divergence, threaded trajectory, initial/final state, metrics). Excluded by
// design: schema-version fields (conflict-nlive-session-v1 vs the V2RunResult
// shape; conflict-njoint-decision-v1 vs conflict-joint-decision-v1), the
// N-step extras (pairwise, N-shaped observations/utilities), and the
// V2RunResult-only confidence/summaries/game.traces. Also pins the ADR §5.5
// scope at session level (default all_others definition fails closed at
// N = 3), a single-target N = 3 end-to-end run, the catalog-lane throw
// invariant (getScenario, not a Result), and determinism.

import { describe, expect, it } from 'vitest';

import { runConflictLabSessionV1 } from '../../lib/dilemma';
import { buildCanonicalInitialState } from '../../lib/dilemma/dynamics/bridge';
import { TRUST_EXCHANGE_ACTION_ORDER } from '../../lib/dilemma/dynamics/trustExchange';
import { getScenario } from '../../lib/dilemma/scenarios';
import {
  buildCanonicalInitialStateNV1,
  runConflictNLabSessionV1,
} from '../../lib/dilemma/integration/nliveSession';

import { mockAgent, mockWorld } from '../pipeline/fixtures';
import { makeSingleTargetDefinitionN3 } from './nkernelFixtures';

function dyadicWorld() {
  return mockWorld([mockAgent('A'), mockAgent('B')]);
}

function triadWorld() {
  return mockWorld([mockAgent('a'), mockAgent('b'), mockAgent('c')]);
}

function runDyadicPair(seed = 17) {
  const config = {
    scenarioId: 'trust_interrogation',
    players: ['A', 'B'] as const,
    totalRounds: 3,
    world: dyadicWorld(),
    seed,
    pressureSchedule: { shape: 'rising', floor: 0.1 } as const,
  };
  const dyadic = runConflictLabSessionV1({ ...config, players: ['A', 'B'] });
  const n = runConflictNLabSessionV1({ ...config, players: ['A', 'B'] });
  return { dyadic, n };
}

describe('NKERNEL-SESSION-0 conflict-nlive-session-v1', () => {
  it('N = 2 initial-state parity: per-pair merge reproduces buildCanonicalInitialState byte-for-byte', () => {
    const scenario = getScenario('trust_interrogation');
    for (const institutionalPressure of [undefined, 0.8]) {
      const world = dyadicWorld();
      const dyadic = buildCanonicalInitialState({
        scenario,
        players: ['A', 'B'],
        totalRounds: 1,
        world,
        institutionalPressure,
      });
      const n = buildCanonicalInitialStateNV1({
        scenario,
        players: ['A', 'B'],
        world,
        institutionalPressure,
      });
      if (n.ok === false) throw new Error(`expected N initial state ok, got ${n.error.code}`);
      expect(n.value).toEqual(dyadic);
    }
  });

  it('N = 2 session reduction oracle: reproduces runConflictLabSessionV1 byte-for-byte', () => {
    const { dyadic, n } = runDyadicPair();
    if (n.ok === false) throw new Error(`expected N session ok, got ${n.error.code}: ${n.error.message}`);
    if (!dyadic.canonicalSession || dyadic.conflictCore?.runtime !== 'canonical_dynamics') {
      throw new Error('expected dyadic canonical session + core');
    }

    expect(n.value.decisions).toHaveLength(dyadic.canonicalSession.decisions.length);
    n.value.decisions.forEach((decision, index) => {
      const dyadicDecision = dyadic.canonicalSession!.decisions[index];
      expect(decision.tick).toBe(index);
      expect(decision.choices).toEqual(dyadicDecision.choices);
      expect(decision.canonical.actions).toEqual(dyadicDecision.canonical.actions);
      expect(decision.canonical.step.state).toEqual(dyadicDecision.canonical.step.state);
      expect(decision.canonical.step.outcome).toEqual(dyadicDecision.canonical.step.outcome);
      expect(decision.reference.actions).toEqual(dyadicDecision.reference.actions);
      expect(decision.reference.step.state).toEqual(dyadicDecision.reference.step.state);
      expect(decision.reference.step.outcome).toEqual(dyadicDecision.reference.step.outcome);
      expect(decision.divergence).toEqual(dyadicDecision.divergence);
      expect(decision.canonical.actions).toEqual(dyadic.game.rounds[index]?.choices);
    });

    expect(n.value.initialState).toEqual(dyadic.conflictCore.initialState);
    expect(n.value.finalState).toEqual(dyadic.conflictCore.finalState);
    expect(n.value.trajectory).toEqual(dyadic.conflictCore.trajectory);
    expect(n.value.metrics).toEqual(dyadic.conflictCore.metrics);
    expect(n.value.definitionSource).toBe('default_trust_exchange_all_others');
  });

  it('shares the dyadic rng channel-id format (trace label, not a registry key)', () => {
    const { n } = runDyadicPair();
    if (n.ok === false) throw new Error('expected N session ok');
    expect(n.value.decisions[0]?.choices['A']?.rngChannelId).toBe('conflict-live:trust_interrogation:17:A');
    expect(n.value.decisions[0]?.choices['B']?.rngChannelId).toBe('conflict-live:trust_interrogation:17:B');
  });

  it('runs end-to-end at N = 3 with a single-target definition override', () => {
    const result = runConflictNLabSessionV1({
      scenarioId: 'trust_interrogation',
      players: ['a', 'b', 'c'],
      totalRounds: 2,
      world: triadWorld(),
      seed: 29,
      definition: makeSingleTargetDefinitionN3(),
    });
    if (result.ok === false) throw new Error(`expected N=3 session ok, got ${result.error.code}: ${result.error.message}`);
    const report = result.value;

    expect(report.definitionSource).toBe('caller_override');
    expect(report.players).toEqual(['a', 'b', 'c']);
    expect(report.decisions).toHaveLength(2);
    expect(report.trajectory).toHaveLength(3);
    report.decisions.forEach((decision, index) => {
      expect(decision.tick).toBe(index);
      expect(decision.players).toEqual(['a', 'b', 'c']);
      expect(decision.canonical.step.pairwise).toHaveLength(3); // N=3 -> 3 unordered pairs
      for (const playerId of ['a', 'b', 'c']) {
        expect(TRUST_EXCHANGE_ACTION_ORDER.includes(decision.canonical.actions[playerId])).toBe(true);
        expect(decision.choices[playerId]?.ranked.length).toBe(TRUST_EXCHANGE_ACTION_ORDER.length);
        expect(decision.reference.actions[playerId]).toBeDefined();
      }
      // Threaded history: round i's post-step state has i+1 entries.
      expect(decision.canonical.step.state.history).toHaveLength(index + 1);
    });
    expect(report.finalState).toEqual(report.trajectory[report.trajectory.length - 1]);
  });

  it('is deterministic at N = 3 for the same seed', () => {
    const config = {
      scenarioId: 'trust_interrogation',
      players: ['a', 'b', 'c'] as const,
      totalRounds: 2,
      world: triadWorld(),
      seed: 29,
      definition: makeSingleTargetDefinitionN3(),
    };
    const first = runConflictNLabSessionV1({ ...config, players: ['a', 'b', 'c'] });
    const second = runConflictNLabSessionV1({ ...config, players: ['a', 'b', 'c'] });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('fails closed at N = 3 on the default all_others definition (ADR §5.5 surfaced at session level)', () => {
    const result = runConflictNLabSessionV1({
      scenarioId: 'trust_interrogation',
      players: ['a', 'b', 'c'],
      totalRounds: 2,
      world: triadWorld(),
      seed: 29,
    });
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.error.code).toBe('decision_failed');
      if (result.error.code === 'decision_failed') {
        expect(result.error.round).toBe(0);
        expect(result.error.cause.code).toBe('multi_target_not_supported');
      }
    }
  });

  it('preserves the catalog-lane invariant: getScenario throws on unknown and disabled ids', () => {
    expect(() => runConflictNLabSessionV1({
      scenarioId: 'no_such_scenario',
      players: ['A', 'B'],
      totalRounds: 1,
      world: dyadicWorld(),
    })).toThrow(/Unknown active scenario/);
    // opacity_deal is disabled in SCENARIO_PRESETS and filtered out of the
    // active catalog — same throw path as unknown ids (R6 canonical-lane rule).
    expect(() => runConflictNLabSessionV1({
      scenarioId: 'opacity_deal',
      players: ['A', 'B'],
      totalRounds: 1,
      world: dyadicWorld(),
    })).toThrow(/Unknown active scenario/);
  });

  it('keeps non-trust mechanics fail-closed with no compatibility fallback', () => {
    const result = runConflictNLabSessionV1({
      scenarioId: 'authority_judgment',
      players: ['A', 'B'],
      totalRounds: 1,
      world: dyadicWorld(),
    });
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.error.code).toBe('unsupported_mechanic');
  });
});
