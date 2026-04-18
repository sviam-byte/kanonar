// test.ts — smoke test for MafiaLab.
// Runs one game with 7 synthetic characters + a 30-game batch.

import { buildMafiaReplayExport, runMafiaGame, runMafiaBatch } from './lib/mafia';
import type { AgentState, WorldState } from './types';

function mkAgent(id: string, traits: Record<string, number>, rels: Record<string, Partial<{ trust: number; bond: number; conflict: number; familiarity: number }>> = {}): AgentState {
  const relationships: Record<string, any> = {};
  for (const [otherId, r] of Object.entries(rels)) {
    relationships[otherId] = {
      trust: r.trust ?? 0.5,
      bond: r.bond ?? 0.3,
      conflict: r.conflict ?? 0,
      align: 0.5,
      respect: 0.5,
      fear: 0,
      familiarity: r.familiarity ?? 0.4,
    };
  }
  return {
    id,
    entityId: id,
    vector_base: {
      A_Safety_Care: 0.5, A_Power_Sovereignty: 0.5, A_Liberty_Autonomy: 0.5,
      A_Knowledge_Truth: 0.5, A_Tradition_Continuity: 0.5, A_Legitimacy_Procedure: 0.5,
      C_reciprocity_index: 0.5, C_betrayal_cost: 0.5, C_coalition_loyalty: 0.5,
      C_reputation_sensitivity: 0.5, C_dominance_empathy: 0.5,
      B_exploration_rate: 0.4, B_tolerance_ambiguity: 0.5, B_decision_temperature: 0.3,
      ...traits,
    },
    relationships,
    tom: {},
  } as AgentState;
}

const rel = (trust: number, bond: number, conflict = 0, familiarity = 0.5) =>
  ({ trust, bond, conflict, familiarity });

const characters: AgentState[] = [
  mkAgent('tegan', {
    A_Knowledge_Truth: 0.85, C_reputation_sensitivity: 0.7,
    B_decision_temperature: 0.2, A_Power_Sovereignty: 0.6,
  }, {
    krystar: rel(0.75, 0.6, 0.0, 0.8), tamir: rel(0.65, 0.5, 0.0, 0.7),
    vestar: rel(0.45, 0.3, 0.2, 0.5), sektor: rel(0.55, 0.3, 0.0, 0.5),
    maera: rel(0.70, 0.5, 0.0, 0.6), bernard: rel(0.60, 0.4, 0.0, 0.6),
  }),
  mkAgent('krystar', {
    A_Power_Sovereignty: 0.9, C_coalition_loyalty: 0.75, C_betrayal_cost: 0.55, B_decision_temperature: 0.25,
  }, {
    tegan: rel(0.75, 0.6, 0.0, 0.8), tamir: rel(0.50, 0.3, 0.0, 0.5),
    vestar: rel(0.65, 0.55, 0.0, 0.7), sektor: rel(0.40, 0.2, 0.15, 0.4),
    maera: rel(0.55, 0.35, 0.0, 0.5), bernard: rel(0.45, 0.25, 0.1, 0.4),
  }),
  mkAgent('tamir', {
    A_Knowledge_Truth: 0.8, A_Power_Sovereignty: 0.2,
    C_reputation_sensitivity: 0.25, A_Liberty_Autonomy: 0.7, B_decision_temperature: 0.4,
  }, {
    tegan: rel(0.65, 0.5, 0.0, 0.7), krystar: rel(0.50, 0.3, 0.0, 0.5),
    vestar: rel(0.35, 0.2, 0.25, 0.4), sektor: rel(0.60, 0.4, 0.0, 0.6),
    maera: rel(0.75, 0.55, 0.0, 0.75), bernard: rel(0.55, 0.4, 0.0, 0.55),
  }),
  mkAgent('vestar', {
    A_Power_Sovereignty: 0.8, A_Liberty_Autonomy: 0.2,
    C_coalition_loyalty: 0.9, C_betrayal_cost: 0.7, B_decision_temperature: 0.15,
  }, {
    tegan: rel(0.45, 0.3, 0.2, 0.5), krystar: rel(0.65, 0.55, 0.0, 0.7),
    tamir: rel(0.35, 0.2, 0.25, 0.4), sektor: rel(0.70, 0.6, 0.0, 0.75),
    maera: rel(0.40, 0.25, 0.1, 0.45), bernard: rel(0.55, 0.4, 0.0, 0.55),
  }),
  mkAgent('sektor', {
    C_dominance_empathy: 0.3, B_tolerance_ambiguity: 0.8,
    A_Legitimacy_Procedure: 0.7, B_decision_temperature: 0.35,
  }, {
    tegan: rel(0.55, 0.3, 0.0, 0.5), krystar: rel(0.40, 0.2, 0.15, 0.4),
    tamir: rel(0.60, 0.4, 0.0, 0.6), vestar: rel(0.70, 0.6, 0.0, 0.75),
    maera: rel(0.50, 0.3, 0.0, 0.5), bernard: rel(0.65, 0.5, 0.0, 0.65),
  }),
  mkAgent('maera', {
    A_Liberty_Autonomy: 0.85, C_reputation_sensitivity: 0.15,
    A_Knowledge_Truth: 0.7, B_decision_temperature: 0.3,
  }, {
    tegan: rel(0.70, 0.5, 0.0, 0.6), krystar: rel(0.55, 0.35, 0.0, 0.5),
    tamir: rel(0.75, 0.55, 0.0, 0.75), vestar: rel(0.40, 0.25, 0.1, 0.45),
    sektor: rel(0.50, 0.3, 0.0, 0.5), bernard: rel(0.60, 0.45, 0.0, 0.6),
  }),
  mkAgent('bernard', {
    A_Safety_Care: 0.8, C_coalition_loyalty: 0.8,
    A_Power_Sovereignty: 0.25, B_decision_temperature: 0.45,
  }, {
    tegan: rel(0.60, 0.4, 0.0, 0.6), krystar: rel(0.45, 0.25, 0.1, 0.4),
    tamir: rel(0.55, 0.4, 0.0, 0.55), vestar: rel(0.55, 0.4, 0.0, 0.55),
    sektor: rel(0.65, 0.5, 0.0, 0.65), maera: rel(0.60, 0.45, 0.0, 0.6),
  }),
];

const world: WorldState = { agents: characters } as WorldState;
const players = characters.map(c => c.id!);
const roleDistribution = { mafia: 2, sheriff: 1, doctor: 1, citizen: 3 } as const;

console.log('═══ SINGLE GAME ═══');
const result = runMafiaGame({
  players,
  roleAssignment: 'random',
  roleDistribution,
  world,
  seed: 42,
});

console.log(`Winner: ${result.analysis.winner}`);

console.log('\n═══ BATCH (100 games) ═══');
const batch = runMafiaBatch({
  players,
  roleDistribution,
  nGames: 100,
  world,
  baseSeed: 1000,
});

console.log(`Town wins:   ${(batch.aggregate.townWinRate * 100).toFixed(1)}%`);
console.log(`Mafia wins:  ${(batch.aggregate.mafiaWinRate * 100).toFixed(1)}%`);

console.log('\n═══ DETERMINISM CHECK ═══');
const r1 = runMafiaGame({ players, roleAssignment: 'random', roleDistribution, world, seed: 777 });
const r2 = runMafiaGame({ players, roleAssignment: 'random', roleDistribution, world, seed: 777 });
const same =
  r1.analysis.winner === r2.analysis.winner &&
  r1.analysis.cycles === r2.analysis.cycles &&
  JSON.stringify(r1.state.roles) === JSON.stringify(r2.state.roles) &&
  r1.state.history.days.length === r2.state.history.days.length;
console.log(same ? '✓ Deterministic — same seed produces identical game' : '✗ NON-DETERMINISTIC');

console.log('\n═══ EXPORT CHECK ═══');
const replay = buildMafiaReplayExport(result);
console.log(replay.schema, replay.flatTimeline.length > 0 ? '✓ timeline' : '✗ no timeline');
