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
import { makeContestGame, makeDefectionGame, makeCoerciveOrderGame, type Game, type PayoffPair } from './game';

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
  /**
   * Scorer-facing payoff descriptor (Step 1). NOT consumed by
   * runGoalLabPipelineV1 — the agent does appraisal→drive→act:prior, it does
   * not maximize EV over a matrix. The payoff is read by the held-out scorer
   * (CaSiNo bridge / Step-1 evaluation), computed FROM the chosen action.
   * `outcomes` maps an outcome label to a [self, other] value pair.
   */
  payoff?: { resource?: string; total?: number; outcomes: Record<string, [number, number]> };
  /**
   * T1 outcome scorer (observable B, game.ts): the action→outcome map + payoff
   * matrix over this scene's payoff.outcomes. Consumed by runProbe post-loop
   * from the CHOSEN action; still not a pipeline input.
   */
  game?: Game;
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

// --- Step 1: payoff scenes (S_contest / S_defection) ---------------------
//
// These surface a contested allocation so negotiation verbs become expressible.
// Affordances are injected the SAME way the working scenes inject them — as
// scene METRICS / location TAGS that the pipeline derives ctx:* from
// (worldFacts.ts reads sceneSnapshot.metrics; goalLabContext.ts reads location
// tags for isFormal) — NOT as raw ctx:* atoms, which do not survive to the
// possibility stage (verified empirically 2026-06-19).
//
// OBSERVABLE LIMIT (verified 2026-06-19): the act:prior vocabulary
// (deriveActionPriors base ∪ PERSONALITY_ACTION_MAP) is prosocial-biased. It
// has negotiate / propose_trade / share_resource / command / threaten / accuse
// / confront / help / harm / avoid — but NO betray / deceive / loot / defend_ally.
// So defection is only observable here as REDUCED cooperation + harm/avoid/
// confront, not as a native betray verb. See FALSIFICATION_LEDGER row OBS-VOCAB.

/** Mutate a built world to carry scene metrics + extra location tags, the
 *  derivation source for ctx:scarcity / ctx:isFormal etc. */
function withSceneAffordance(
  w: WorldState,
  metrics: Record<string, number>,
  extraLocationTags: string[] = [],
): WorldState {
  const snap = (w as any).sceneSnapshot ?? ((w as any).sceneSnapshot = {});
  snap.metrics = { ...(snap.metrics ?? {}), ...metrics };
  const loc = (w.locations as any)[0];
  if (loc) loc.tags = uniqTags([...(loc.tags ?? []), ...extraLocationTags]);
  return w;
}

function uniqTags(tags: string[]): string[] {
  return Array.from(new Set(tags.filter(Boolean)));
}

/** Frozen payoff magnitudes (2026-06-19) — the single source; game wraps them. */
const CONTEST_PAYOFF: NonNullable<ProbeScene['payoff']> = {
  resource: 'contested_supply',
  total: 10,
  outcomes: { fair_split: [5, 5], self_favoring: [8, 2], concede: [3, 7], no_deal: [0, 0] },
};

const DEFECTION_PAYOFF: NonNullable<ProbeScene['payoff']> = {
  // PD-like; scorer-facing only. The defect rows are scored from reduced
  // cooperation / harm, not a betray verb (observable limit).
  outcomes: { both_cooperate: [3, 3], i_defect: [5, 0], they_defect: [0, 5], both_defect: [1, 1] },
};

export const S_contest: ProbeScene = {
  id: 'S_contest',
  description: 'A scarce, contested resource with a formal split to negotiate with B. Power / Justice / reciprocity over allocation.',
  targetConstructs: ['A_Power_Sovereignty', 'A_Justice_Fairness', 'C_reciprocity_index', 'A_Safety_Care'],
  layers: ['S8'],
  affordance: 'scene metric scarcity=0.7 + resourceAccess=0.2 + location tag formal; verbs available: negotiate/propose_trade/share_resource vs command/threaten/confront',
  participants: ['B'],
  payoff: CONTEST_PAYOFF,
  game: makeContestGame(CONTEST_PAYOFF.outcomes as Record<string, PayoffPair>),
  build(self) {
    const b = buildOther({ clearance: 1 });
    const w = withSceneAffordance(world([self, b]), { scarcity: 0.7, resourceAccess: 0.2 }, ['formal']);
    return { world: w, agentId: self.entityId, participantIds: [self.entityId, 'B'] };
  },
};

export const S_defection: ProbeScene = {
  id: 'S_defection',
  description: 'A resource-incentive frame with B present: cooperate (share/trade/help) vs disengage. betrayal_cost / coalition_loyalty / reciprocity — observed as cooperation tendency, since native defect verbs are not on the act:prior observable (see OBSERVABLE LIMIT above).',
  targetConstructs: ['C_betrayal_cost', 'C_coalition_loyalty', 'C_reciprocity_index'],
  layers: ['S8'],
  affordance: 'scene metric scarcity=0.6 (private-gain incentive); cooperate verbs (share_resource/propose_trade/praise/help/guard) vs harm/avoid/confront. NO native betray/deceive/loot on this observable.',
  participants: ['B'],
  payoff: DEFECTION_PAYOFF,
  game: makeDefectionGame(DEFECTION_PAYOFF.outcomes as Record<string, PayoffPair>),
  build(self) {
    const b = buildOther({ clearance: 1 });
    const w = withSceneAffordance(world([self, b]), { scarcity: 0.6 });
    return { world: w, agentId: self.entityId, participantIds: [self.entityId, 'B'] };
  },
};

// --- T1.5: pressure scenes + coercive order (2026-07-02) -------------------
//
// The T1 kill test fired (ledger B-POWER-OUTCOME): in STATIC scenes the
// coercive possibilities never spawn because their gates are event-first
// (collectSocialEventGate reads recent event:* atoms — lib/possibilities/
// defs.ts:277-322 — and a probe world has eventLog: []). These scenes inject
// event pressure through the LEGITIMATE contract channel: world.eventLog
// → atomizeEvents → event:* atoms with meta.event → the gate. Old scenes stay
// untouched (frozen negative-control cells of the v3 factorial).

/** Push recent-event pressure into a built world (tick 0 = no decay). */
function withEvents(
  w: WorldState,
  events: Array<{ id: string; kind: string; actorId: string; targetId: string; magnitude: number }>,
): WorldState {
  const log = ((w as any).eventLog ?? ((w as any).eventLog = { events: [] }));
  log.events = [...(log.events ?? []), ...events.map(e => ({ ...e, tick: 0 }))];
  return w;
}

export const S_contest_pressure: ProbeScene = {
  id: 'S_contest_pressure',
  description: 'S_contest + live pressure: B has just claimed the resource with a threat, and the formal setting grants self standing (authority). Coercive verbs become possible.',
  targetConstructs: ['A_Power_Sovereignty', 'A_Justice_Fairness', 'C_reciprocity_index'],
  layers: ['S8'],
  affordance: 'scarcity 0.7 + authority 0.5 (→ctx:authority, unlocks command gate) + event B→self kind=threat 0.7 (→otherCausedTrouble/conflict, unlocks threaten/confront/accuse)',
  participants: ['B'],
  payoff: CONTEST_PAYOFF,
  game: makeContestGame(CONTEST_PAYOFF.outcomes as Record<string, PayoffPair>),
  build(self) {
    const b = buildOther({ clearance: 1 });
    const w = withSceneAffordance(
      world([self, b]),
      { scarcity: 0.7, resourceAccess: 0.2, authority: 0.5 },
      ['formal'],
    );
    withEvents(w, [
      { id: 'ev:contest:claim', kind: 'threat', actorId: 'B', targetId: self.entityId, magnitude: 0.7 },
    ]);
    return { world: w, agentId: self.entityId, participantIds: [self.entityId, 'B'] };
  },
};

export const S_defection_pressure: ProbeScene = {
  id: 'S_defection_pressure',
  description: 'S_defection + live pressure: B has just acted against self (betrayal-flavored harm event). Defect verbs become possible; cooperation is now a costly choice, not the only option.',
  targetConstructs: ['C_betrayal_cost', 'C_coalition_loyalty', 'C_reciprocity_index', 'A_Care_Compassion'],
  layers: ['S8'],
  affordance: 'scarcity 0.6 + event B→self kind=betray 0.6 (→conflict/otherCausedTrouble, unlocks threaten/confront/accuse; betray/deceive possibilities are ungated and native here)',
  participants: ['B'],
  payoff: DEFECTION_PAYOFF,
  game: makeDefectionGame(DEFECTION_PAYOFF.outcomes as Record<string, PayoffPair>),
  build(self) {
    const b = buildOther({ clearance: 1 });
    const w = withSceneAffordance(world([self, b]), { scarcity: 0.6 });
    withEvents(w, [
      { id: 'ev:defect:hist', kind: 'betray', actorId: 'B', targetId: self.entityId, magnitude: 0.6 },
    ]);
    return { world: w, agentId: self.entityId, participantIds: [self.entityId, 'B'] };
  },
};

/** Frozen payoff (2026-07-02, T1.5): response to a coercive order. */
const COERCIVE_PAYOFF: NonNullable<ProbeScene['payoff']> = {
  outcomes: { defied: [3, 1], complied: [1, 3], negotiated_terms: [2, 2], evaded: [0, 0] },
};

export const S_coercive_order: ProbeScene = {
  id: 'S_coercive_order',
  description: 'B (clearance 3, leader) has just issued a coercive order to self. Defy / comply / negotiate terms / evade. The SCENE_BATTERY §4 discriminator for A_Liberty_Autonomy (AX-DEAD).',
  targetConstructs: ['A_Liberty_Autonomy', 'A_Power_Sovereignty', 'A_Legitimacy_Procedure'],
  layers: ['S8'],
  affordance: 'B clearance 3 + leader + event B→self kind=command 0.8 (→topicPressure); challenge needs tom dominance ≥0.55 from the hierarchy — whether it spawns is itself the AX-DEAD test',
  participants: ['B'],
  payoff: COERCIVE_PAYOFF,
  game: makeCoerciveOrderGame(COERCIVE_PAYOFF.outcomes as Record<string, PayoffPair>),
  build(self) {
    const b = buildOther({ clearance: 3 });
    const w = world([self, b], { leadership: { currentLeaderId: 'B' } } as any);
    withEvents(w, [
      { id: 'ev:order:issued', kind: 'command', actorId: 'B', targetId: self.entityId, magnitude: 0.8 },
    ]);
    return { world: w, agentId: self.entityId, participantIds: [self.entityId, 'B'] };
  },
};

export const PROBE_SCENES: ProbeScene[] = [
  S_neutral,
  S_vulnerable,
  S_hierarchy,
  S_threat,
  S_contest,
  S_defection,
  S_contest_pressure,
  S_defection_pressure,
  S_coercive_order,
];

export function sceneById(id: string): ProbeScene | undefined {
  return PROBE_SCENES.find(s => s.id === id);
}
