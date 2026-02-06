import type { AgentState, WorldState } from '@/types';

export function mockAgent(id = 'A', locId = 'loc:demo'): AgentState {
  // NOTE: GoalLab pipeline is tolerant to missing optional fields.
  // These fixtures intentionally keep the agent minimal but stage0-compatible.
  return {
    entityId: id,
    name: id,
    locationId: locId,
    pos: { x: 5, y: 5 },
    memory: { beliefAtoms: [] },
    lifeGoals: [],
    body: {
      acute: { pain: 0, fatigue: 0, stress: 0 },
      reserves: { energy: 1, sleep_debt_h: 0 },
      regulation: { arousal: 0.5 },
    },
    vector_base: {
      C_betrayal_cost: 0.5,
      C_reputation_sensitivity: 0.5,
      B_tolerance_ambiguity: 0.5,
      D_HPA_reactivity: 0.5,
      B_decision_temperature: 0.5,
      B_discount_rate: 0.5,
      A_Care_Compassion: 0.5,
      A_Safety_Care: 0.5,
      A_Power_Sovereignty: 0.5,
      A_Procedure_Formalism: 0.5,
      A_Tradition_Order: 0.5,
      A_Liberty_Autonomy: 0.5,
      A_Knowledge_Truth: 0.5,
    },
    context: { age: 30 },
    identity: { clearance_level: 0 },
  } as any;
}

export function mockWorld(agents: AgentState[] = [mockAgent()]): WorldState {
  const location = {
    entityId: 'loc:demo',
    kind: 'location',
    name: 'Demo Room',
    tags: ['demo'],
    access: { isPublic: true },
    hazards: [],
    geometry: {
      w: 20,
      h: 20,
      walls: [],
      doors: [],
      exits: [],
    },
  };

  return {
    tick: 0,
    agents,
    locations: [location],
    sceneSnapshot: { presetId: 'scene:demo', participants: [{ entityId: agents[0]?.entityId ?? 'A' }] },
    eventLog: { events: [] },
    mods: {},
  } as any;
}
