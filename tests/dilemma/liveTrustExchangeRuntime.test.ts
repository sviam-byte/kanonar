import { describe, expect, it } from 'vitest';

import { runConflictLabSessionV1, TRUST_EXCHANGE_ACTION_ORDER } from '@/lib/dilemma';
import { mockAgent, mockWorld } from '../pipeline/fixtures';

function run(seed = 17) {
  return runConflictLabSessionV1({
    scenarioId: 'trust_interrogation',
    players: ['A', 'B'],
    totalRounds: 3,
    world: mockWorld([mockAgent('A'), mockAgent('B')]),
    seed,
    pressureSchedule: { shape: 'rising', floor: 0.1 },
  });
}

describe('R5 live trust_exchange runtime', () => {
  it('uses GoalLab S8 choices as the authoritative multi-round game and kernel history', () => {
    const result = run();
    expect(result.canonicalSession?.runtime).toBe('canonical_goal_lab_s8');
    expect(result.canonicalSession?.policyId).toBe('goal_lab_s8_gumbel');
    expect(result.game.rounds).toHaveLength(3);
    expect(result.conflictCore?.runtime).toBe('canonical_dynamics');
    if (!result.canonicalSession || result.conflictCore?.runtime !== 'canonical_dynamics') return;

    expect(result.canonicalSession.decisions).toHaveLength(3);
    result.canonicalSession.decisions.forEach((decision, index) => {
      expect(decision.tick).toBe(index);
      expect(result.game.rounds[index]?.choices).toEqual(decision.canonical.actions);
      expect(decision.canonical.step.state.history[index]?.actions).toEqual(decision.canonical.actions);
      for (const playerId of decision.players) {
        expect(TRUST_EXCHANGE_ACTION_ORDER).toContain(decision.canonical.actions[playerId]);
        expect(decision.choices[playerId].samplingPoolCandidateIds.length).toBeGreaterThan(0);
        expect(decision.choices[playerId].usedAtomIds.length).toBeGreaterThan(0);
      }
    });
    expect(result.conflictCore.finalState).toEqual(
      result.canonicalSession.decisions.at(-1)?.canonical.step.state,
    );
  });

  it('is semantically deterministic for the same seed and keeps the reference lane visible', () => {
    const first = run(91);
    const second = run(91);
    expect(first.game.rounds).toEqual(second.game.rounds);
    expect(first.canonicalSession).toEqual(second.canonicalSession);
    expect(first.conflictCore).toEqual(second.conflictCore);
    expect(first.canonicalSession?.decisions.every((decision) => (
      typeof decision.divergence.anyDifference === 'boolean'
      && Object.keys(decision.reference.actions).length === 2
    ))).toBe(true);
  });

  it('keeps unsupported mechanics on an explicit compatibility lane', () => {
    const result = runConflictLabSessionV1({
      scenarioId: 'authority_judgment',
      players: ['A', 'B'],
      totalRounds: 1,
      world: mockWorld([mockAgent('A'), mockAgent('B')]),
      seed: 7,
    });
    expect(result.canonicalSession).toBeUndefined();
    expect(result.conflictCore?.runtime).toBe('unsupported_kernel');
  });
});
