import { describe, expect, it } from 'vitest';

import type { AgentState, WorldState } from '@/types';
import { runMafiaGame } from '@/lib/mafia/runner';
import { buildMafiaFlatTimeline, buildMafiaReplayExport } from '@/lib/mafia/export';

function mkAgent(id: string): AgentState {
  return {
    id,
    entityId: id,
    vector_base: {
      A_Safety_Care: 0.5,
      A_Power_Sovereignty: 0.5,
      A_Liberty_Autonomy: 0.5,
      A_Knowledge_Truth: 0.5,
      A_Tradition_Continuity: 0.5,
      A_Legitimacy_Procedure: 0.5,
      C_reciprocity_index: 0.5,
      C_betrayal_cost: 0.5,
      C_coalition_loyalty: 0.5,
      C_reputation_sensitivity: 0.5,
      C_dominance_empathy: 0.5,
      B_exploration_rate: 0.5,
      B_tolerance_ambiguity: 0.5,
      B_decision_temperature: 0.2,
    },
    relationships: {},
    tom: {},
  } as AgentState;
}

describe('mafia replay export', () => {
  it('builds replay payload with flat timeline and schema marker', () => {
    const agents = ['a', 'b', 'c', 'd', 'e'].map(mkAgent);
    const world = { agents } as WorldState;

    const result = runMafiaGame({
      players: agents.map(a => a.id!),
      roleAssignment: {
        a: 'mafia',
        b: 'mafia',
        c: 'sheriff',
        d: 'doctor',
        e: 'citizen',
      },
      world,
      seed: 22,
      maxCycles: 2,
    });

    const replay = buildMafiaReplayExport(result);
    const timeline = buildMafiaFlatTimeline(result);

    expect(replay.schema).toBe('Kanonar.MafiaLab.Replay.v1');
    expect(replay.flatTimeline.length).toBeGreaterThan(0);
    expect(timeline.some((event) => event.kind === 'game_end')).toBe(true);
    expect(replay.state.suspicionLedger.length).toBeGreaterThan(0);
  });
});
