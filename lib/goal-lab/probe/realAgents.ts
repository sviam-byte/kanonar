// lib/goal-lab/probe/realAgents.ts
//
// Load the REAL character roster (data/entities/character-*.ts) as pipeline-ready
// AgentStates, so the sign-audit runs on the populated basis (~52 axes, real
// archetypes/biography/life-goals) instead of the synthetic 0.5 toy agent.
//
// The entity->agent mapping REUSES the canonical personality->params helpers
// exported from the SimKit adapter (deriveLifeGoals/deriveGoalTuning/...), so we
// do not maintain a second mapping.

import type { AgentState, CharacterEntity } from '../../../types';
import { makeAgentRNG } from '../../core/noise';
import {
  deriveLifeGoals,
  deriveGoalTuning,
  deriveDriverCurves,
  deriveInhibitionOverrides,
  deriveDriverInertia,
} from '../../simkit/plugins/goalLabWorldState';
import { PROBE_LOCATION_ID } from './scenes';

export interface RosterMember {
  id: string;
  agent: AgentState;
  /** The character's true vector_base values (the δ-sweep anchors). */
  baseline: Record<string, number>;
}

/** Build a pipeline-ready AgentState from a raw CharacterEntity. */
export function buildAgentFromEntity(entity: CharacterEntity): AgentState {
  const e = entity as any;
  const id = String(e.entityId ?? e.id ?? 'char');
  return {
    entityId: id,
    type: e.type,
    title: String(e.title ?? id),
    name: String(e.title ?? id),
    locationId: PROBE_LOCATION_ID,
    pos: { x: 5, y: 5 },
    memory: { beliefAtoms: [] },
    vector_base: { ...(e.vector_base ?? {}) },
    body: e.body ?? { acute: { pain: 0, fatigue: 0, stress: 0 }, reserves: { energy: 1 }, regulation: { arousal: 0.5 } },
    identity: e.identity ?? { clearance_level: 1 },
    context: e.context ?? { age: 30 },
    lifeGoals: deriveLifeGoals(entity),
    goalTuning: e.goalTuning ?? deriveGoalTuning(entity),
    driverCurves: e.driverCurves ?? deriveDriverCurves(entity),
    inhibitionOverrides: e.inhibitionOverrides ?? deriveInhibitionOverrides(entity),
    driverInertia: e.driverInertia ?? deriveDriverInertia(entity),
    // Seeded RNG channels (matches buildWorldStateFromSim); runProbe overrides
    // the decide channel per seed for multi-seed S8 sampling.
    rngChannels: {
      decide: makeAgentRNG(id, 1),
      physio: makeAgentRNG(id, 2),
      perceive: makeAgentRNG(id, 3),
      goals: makeAgentRNG(id, 4),
    },
    temperature: 1.0,
    behavioralParams: { T0: 1.0 },
  } as any;
}

// Vite/vitest static glob of the character entity files (default exports).
const CHAR_MODULES = import.meta.glob('../../../data/entities/character-*.ts', { eager: true });

export function loadRosterEntities(): CharacterEntity[] {
  const out: CharacterEntity[] = [];
  for (const mod of Object.values(CHAR_MODULES) as any[]) {
    const ent = mod?.default;
    if (ent && typeof ent === 'object' && ent.entityId && ent.vector_base) {
      out.push(ent as CharacterEntity);
    }
  }
  return out.sort((a: any, b: any) => String(a.entityId).localeCompare(String(b.entityId)));
}

export function loadRosterAgents(): RosterMember[] {
  return loadRosterEntities().map((e) => {
    const agent = buildAgentFromEntity(e);
    return { id: agent.entityId, agent, baseline: { ...((agent as any).vector_base ?? {}) } };
  });
}

/** Union of vector_base axis keys present across the roster (the canonical
 *  sweepable vocabulary, guaranteed real for at least one character). */
export function rosterAxes(members: RosterMember[]): string[] {
  const seen = new Set<string>();
  for (const m of members) for (const k of Object.keys(m.baseline)) seen.add(k);
  return [...seen].sort();
}
