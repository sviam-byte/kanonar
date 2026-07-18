// NKERNEL-SESSION-0 parity gate. Pins the N = 2 reduction oracle: the N
// live-session runner must reproduce the dyadic runConflictLabSessionV1
// byte-for-byte over the meaningful overlapping fields (per-round choices
// including rngChannelId, canonical/reference actions and step state/outcome,
// divergence, threaded trajectory, initial/final state, metrics). Excluded by
// design: schema-version fields (conflict-nlive-session-v1 vs the V2RunResult
// shape; conflict-njoint-decision-v1 vs conflict-joint-decision-v1), the
// N-step extras (pairwise, N-shaped observations/utilities), and the
// V2RunResult-only confidence/summaries/game.traces. Also pins the repaired
// dyad-only N>2 boundary, strict 1..30 round budget, catalog-lane throw
// invariant for valid dyads, and determinism.

import { describe, expect, it } from 'vitest';

import { runConflictLabSessionV1 } from '../../lib/dilemma';
import { buildCanonicalInitialState } from '../../lib/dilemma/dynamics/bridge';
import { getScenario } from '../../lib/dilemma/scenarios';
import {
  buildCanonicalInitialStateNV1,
  runConflictNLabSessionV1,
} from '../../lib/dilemma/integration/nliveSession';

import { mockAgent, mockWorld } from '../pipeline/fixtures';

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

  it('rejects N > 2 before scenario, world, definition, or decision work', () => {
    const result = runConflictNLabSessionV1({
      scenarioId: 'no_such_scenario',
      players: ['a', 'b', 'c'],
      totalRounds: 2,
      world: triadWorld(),
      seed: 29,
    });
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.error.code).toBe('n_live_requires_dyad');
    }
  });

  it('returns a typed error for invalid round budgets', () => {
    for (const totalRounds of [0, 1.5, 31, Number.NaN, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]) {
      const result = runConflictNLabSessionV1({
        scenarioId: 'trust_interrogation',
        players: ['A', 'B'],
        totalRounds,
        world: dyadicWorld(),
      });
      expect(result.ok).toBe(false);
      if (result.ok === false) expect(result.error.code).toBe('invalid_round_budget');
    }
    for (const totalRounds of [1, 30]) {
      const result = runConflictNLabSessionV1({
        scenarioId: 'authority_judgment',
        players: ['A', 'B'],
        totalRounds,
        world: dyadicWorld(),
      });
      expect(result.ok).toBe(false);
      if (result.ok === false) expect(result.error.code).toBe('unsupported_mechanic');
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
