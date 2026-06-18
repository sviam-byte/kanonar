// lib/goal-lab/probe/scenes.ts
//
// Phase 1 of the static-basis sign-audit (docs/agents/05_GOAL_LAB_MATH.md):
// the scene battery. Each scene carries an AFFORDANCE so a given construct can
// express itself. Without affordances half the basis falsely reads "dead": a
// neutral room gives Power nothing to act on. Scenes are pure transforms over
// the world-contract (geometry / hazards / access.clearance / body / status of
// a second agent B), mirroring tests/pipeline/fixtures.ts so they stay
// stage0-compatible and pass the placement gate.
//
// NOTE: which affordance actually "lands" (vs reads dead) is an empirical
// question answered by the first sweep (Phase 3 triage), not asserted here.

import type { AgentState, WorldState } from '../../../types';

export type ProbeLayer = 'S7' | 'S8';

export interface ProbeScene {
  id: string;
  description: string;
  /** Constructs this scene is designed to make expressible. */
  targetConstructs: string[];
  /** Readout layers expected to differentiate in this scene. */
  layers: ProbeLayer[];
  /** Affordance summary (human-readable), for triage notes. */
  affordance: string;
  /** Extra participant ids beyond self (e.g. ['B']). */
  participants: string[];
  /** Build the world for this scene around a configured self agent. */
  build(self: AgentState): { world: WorldState; agentId: string; participantIds: string[] };
  /** Optional manual atoms injected at S0 to guarantee an affordance hint. */
  manualAtoms?(selfId: string): any[];
}

export const PROBE_LOCATION_ID = 'loc:probe';

const ROOM = {
  entityId: PROBE_LOCATION_ID,
  kind: 'location',
  name: 'Probe Room',
  tags: ['probe'],
  access: { isPublic: true },
  hazards: [] as any[],
  geometry: { w: 20, h: 20, walls: [], doors: [], exits: [] },
};

/** Base self agent — mirrors tests/pipeline/fixtures.ts mockAgent, with the
 *  sign-table axes pre-seeded at 0.5 so a sweep can move one at a time. */
export function buildProbeAgent(id = 'A', axisOverrides: Record<string, number> = {}): AgentState {
  return {
    entityId: id,
    name: id,
    locationId: ROOM.entityId,
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
      C_coalition_loyalty: 0.5,
      B_tolerance_ambiguity: 0.5,
      B_decision_temperature: 0.5,
      B_discount_rate: 0.5,
      D_HPA_reactivity: 0.5,
      A_Care_Compassion: 0.5,
      A_Safety_Care: 0.5,
      A_Power_Sovereignty: 0.5,
      A_Procedure_Formalism: 0.5,
      A_Tradition_Order: 0.5,
      A_Liberty_Autonomy: 0.5,
      A_Knowledge_Truth: 0.5,
      ...axisOverrides,
    },
    context: { age: 30 },
    identity: { clearance_level: 1 },
  } as any;
}

/** A second agent B, configurable for vulnerable / hierarchy / threat scenes. */
function buildOther(opts: {
  pain?: number;
  energy?: number;
  clearance?: number;
  hostile?: boolean;
}): AgentState {
  return {
    entityId: 'B',
    name: 'B',
    locationId: ROOM.entityId,
    pos: { x: 7, y: 5 },
    memory: { beliefAtoms: [] },
    lifeGoals: [],
    body: {
      acute: { pain: opts.pain ?? 0, fatigue: 0, stress: opts.hostile ? 0.5 : 0 },
      reserves: { energy: opts.energy ?? 1, sleep_debt_h: 0 },
      regulation: { arousal: opts.hostile ? 0.7 : 0.4 },
    },
    vector_base: { A_Power_Sovereignty: opts.hostile ? 0.8 : 0.5 },
    context: { age: 30 },
    identity: { clearance_level: opts.clearance ?? 1 },
  } as any;
}

function world(agents: AgentState[], extra: Partial<WorldState> = {}): WorldState {
  return {
    tick: 0,
    rngSeed: 0,
    agents,
    locations: [{ ...ROOM, hazards: [...ROOM.hazards] }],
    sceneSnapshot: {
      presetId: 'scene:probe',
      participants: agents.map(a => ({ entityId: a.entityId })),
    },
    eventLog: { events: [] },
    mods: {},
    ...extra,
  } as any;
}

export const S_neutral: ProbeScene = {
  id: 'S_neutral',
  description: 'Empty control room, self alone. Should give ~0 differentiation.',
  targetConstructs: [],
  layers: ['S7'],
  affordance: 'none (control — catches leaky scenes)',
  participants: [],
  build(self) {
    return { world: world([self]), agentId: self.entityId, participantIds: [self.entityId] };
  },
};

export const S_vulnerable: ProbeScene = {
  id: 'S_vulnerable',
  description: 'A wounded, low-status B present. Care/affiliation; Power-as-exploitation.',
  targetConstructs: ['A_Care_Compassion', 'affiliation', 'A_Power_Sovereignty'],
  layers: ['S7', 'S8'],
  affordance: 'B wounded (high pain, low energy) + low clearance',
  participants: ['B'],
  build(self) {
    const b = buildOther({ pain: 0.8, energy: 0.2, clearance: 0 });
    return {
      world: world([self, b], { leadership: { currentLeaderId: self.entityId } } as any),
      agentId: self.entityId,
      participantIds: [self.entityId, 'B'],
    };
  },
  manualAtoms(selfId) {
    // Affordance hint: mark B as a care-need / wounded target in self's frame.
    return [
      {
        id: `obs:wounded:B`,
        ns: 'obs',
        kind: 'wounded',
        origin: 'world',
        source: 'probe_scene',
        subject: selfId,
        target: 'B',
        magnitude: 0.8,
        confidence: 1,
        tags: ['probe', 'wounded', 'care_need'],
        label: 'B wounded',
      },
    ];
  },
};

export const S_hierarchy: ProbeScene = {
  id: 'S_hierarchy',
  description: 'B is the authority (higher clearance, leader). Power / Autonomy / Procedure / Tradition.',
  targetConstructs: ['A_Power_Sovereignty', 'A_Liberty_Autonomy', 'A_Procedure_Formalism', 'A_Tradition_Order'],
  layers: ['S8'],
  affordance: 'B clearance 3 + current leader; self clearance 1',
  participants: ['B'],
  build(self) {
    const b = buildOther({ clearance: 3 });
    return {
      world: world([self, b], { leadership: { currentLeaderId: 'B' } } as any),
      agentId: self.entityId,
      participantIds: [self.entityId, 'B'],
    };
  },
};

export const S_threat: ProbeScene = {
  id: 'S_threat',
  description: 'Environmental hazard + hostile B. Safety_Care, betrayal_cost, HPA_reactivity.',
  targetConstructs: ['A_Safety_Care', 'C_betrayal_cost', 'D_HPA_reactivity', 'safety'],
  layers: ['S7', 'S8'],
  affordance: 'location hazard (fire, intensity 0.8) + hostile B',
  participants: ['B'],
  build(self) {
    const b = buildOther({ hostile: true, clearance: 1 });
    const w = world([self, b]);
    // Inject a hazard into the location via the world-contract.
    (w.locations as any)[0].hazards = [
      { id: 'haz:fire', kind: 'fire', pos: { x: 10, y: 5 }, intensity: 0.8, radius: 6 },
    ];
    return { world: w, agentId: self.entityId, participantIds: [self.entityId, 'B'] };
  },
  manualAtoms(selfId) {
    // Affordance hint: a hostile-intent belief toward B, so threat appraisal can express.
    return [
      {
        id: `obs:hostile:B`,
        ns: 'obs',
        kind: 'hostile',
        origin: 'world',
        source: 'probe_scene',
        subject: selfId,
        target: 'B',
        magnitude: 0.7,
        confidence: 1,
        tags: ['probe', 'hostile', 'threat'],
        label: 'B hostile',
      },
    ];
  },
};

export const PROBE_SCENES: ProbeScene[] = [S_neutral, S_vulnerable, S_hierarchy, S_threat];

export function sceneById(id: string): ProbeScene | undefined {
  return PROBE_SCENES.find(s => s.id === id);
}
