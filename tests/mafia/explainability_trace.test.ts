import { describe, expect, it } from 'vitest';

import type { AgentState, WorldState } from '@/types';
import { createGame } from '@/lib/mafia/engine';
import { decideClaim } from '@/lib/mafia/decisions/claim';
import { decideVote } from '@/lib/mafia/decisions/vote';
import { decideDoctorHeal, decideSheriffCheck } from '@/lib/mafia/decisions/night';
import { makeRng } from '@/lib/mafia/helpers';
import { updateFromPublicClaim } from '@/lib/mafia/suspicion';

function mkAgent(id: string): AgentState {
  return {
    id,
    entityId: id,
    vector_base: {
      A_Safety_Care: 0.5,
      A_Power_Sovereignty: 0.5,
      A_Liberty_Autonomy: 0.5,
      A_Knowledge_Truth: 0.6,
      A_Tradition_Continuity: 0.5,
      A_Legitimacy_Procedure: 0.5,
      C_reciprocity_index: 0.5,
      C_betrayal_cost: 0.5,
      C_coalition_loyalty: 0.5,
      C_reputation_sensitivity: 0.5,
      C_dominance_empathy: 0.5,
      B_exploration_rate: 0.4,
      B_tolerance_ambiguity: 0.5,
      B_decision_temperature: 0.25,
    },
    relationships: {},
    tom: {},
  } as AgentState;
}

describe('mafia explainability traces', () => {
  it('records perception, candidates, sampling and suspicion ledger', () => {
    const agents = ['a', 'b', 'c', 'd', 'e'].map(mkAgent);
    const world = { agents } as WorldState;
    const game = createGame({
      players: agents.map(a => a.id!),
      roleAssignment: {
        a: 'sheriff',
        b: 'doctor',
        c: 'mafia',
        d: 'mafia',
        e: 'citizen',
      },
      world,
      seed: 123,
    }, Object.fromEntries(agents.map(a => [a.id!, a])));

    expect(game.suspicionLedger.length).toBeGreaterThan(0);

    const rng = makeRng(123);
    const claimRes = decideClaim(game, Object.fromEntries(agents.map(a => [a.id!, a])), 'a', [], rng);
    expect(claimRes.trace.perception.aliveOrder.length).toBe(5);
    expect(claimRes.trace.candidates.length).toBeGreaterThan(0);
    expect(claimRes.trace.sampling.chosenKey.length).toBeGreaterThan(0);

    const beforeClaimUpdate = game.suspicionLedger.length;
    updateFromPublicClaim(game, Object.fromEntries(agents.map(a => [a.id!, a])), claimRes.claim);
    expect(game.suspicionLedger.length).toBeGreaterThanOrEqual(beforeClaimUpdate);
    if (claimRes.claim.kind === 'accuse' || claimRes.claim.kind === 'defend') {
      expect(game.suspicionLedger.some(d => d.reason === 'public_accusation' || d.reason === 'public_defense')).toBe(true);
    }

    const voteRes = decideVote(game, Object.fromEntries(agents.map(a => [a.id!, a])), 'b', [claimRes.claim], rng);
    expect(voteRes.trace.perception.publicField.claimCount).toBe(1);
    expect(Object.keys(voteRes.trace.sampling.probabilities).length).toBeGreaterThan(0);

    const sheriffRes = decideSheriffCheck(game, Object.fromEntries(agents.map(a => [a.id!, a])), 'a', rng);
    expect(sheriffRes.trace.candidates.every(c => c.included)).toBe(true);
    expect(sheriffRes.trace.perception.phase).toBe('night');

    const doctorRes = decideDoctorHeal(game, Object.fromEntries(agents.map(a => [a.id!, a])), 'b', rng);
    expect(doctorRes.trace.sampling.chosenKey.length).toBeGreaterThan(0);
    expect(doctorRes.trace.ranked.length).toBe(5);
  });
});
