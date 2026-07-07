// lib/simkit/scenarios/mvp0Scene.ts
//
// MVP-0 scene (I-1.1) — THE one scene of the vertical slice, untouchable by
// simplicity (KANONAR_TZ Шаг I-1): 2 live agents (goalLabDeciderPlugin),
// 1 location with a map (test.safe_room from data/locations), 1 object v0
// (resource token in facts), 5–20 ticks. No config zoo: the only inputs are
// seed (and tick count at the runner level).

import type { SimWorld } from '../core/types';
import { makeSimWorldFromSelection } from '../adapters/fromKanonarEntities';
import { objectFactKey } from '../actions/objectSpec';
import { allLocations } from '../../../data/locations';

export const mvp0ScenarioId = 'scenario:mvp0:v1';

export const MVP0_LOCATION_ID = 'test.safe_room';
// Agent ids must not contain ':' — possibility ids are colon-delimited
// (`sim:<kind>:<actor>:<target>:<idx>`), and a colon inside an id corrupts
// target parsing downstream (observed in MVP-0 assembly).
export const MVP0_AGENT_A = 'mvp0A';
export const MVP0_AGENT_B = 'mvp0B';
export const MVP0_OBJECT_ID = 'token';

/** Neutral 0.5-baseline agent entity (probe-agent convention: axes at the
 *  basis baseline so behavior differences come from the WORLD, not the cast). */
function mvp0AgentEntity(entityId: string, title: string): any {
  return {
    entityId,
    title,
    name: title,
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
  };
}

/**
 * Build the MVP-0 SimWorld for a seed. Deterministic: same seed ⇒ same world.
 * The object token starts UNHELD on the floor of the shared location, so the
 * first tick's menu contains `take` for both agents (I-1.2 menu claim).
 */
export function makeMvp0World(seed: number): SimWorld {
  const location = allLocations.find((l: any) => l?.entityId === MVP0_LOCATION_ID);
  if (!location) throw new Error(`mvp0Scene: location ${MVP0_LOCATION_ID} not found in data/locations`);

  const world = makeSimWorldFromSelection({
    seed,
    locations: [location],
    characters: [
      mvp0AgentEntity(MVP0_AGENT_A, 'MVP0 Agent A'),
      mvp0AgentEntity(MVP0_AGENT_B, 'MVP0 Agent B'),
    ] as any,
    placements: {
      [MVP0_AGENT_A]: MVP0_LOCATION_ID,
      [MVP0_AGENT_B]: MVP0_LOCATION_ID,
    },
  });

  world.facts[objectFactKey(MVP0_OBJECT_ID)] = { holderId: null, locId: MVP0_LOCATION_ID };
  return world;
}

/**
 * Staked C1 variant (I-2.3): same world, but agent B HOLDS the token — the
 * ТЗ's own С1 is a threat over an OBJECT. With FC.objects.contextAxesV1 ON,
 * B gets resourceAccess 0.9 (a stake to protect/yield: `give` is in B's menu)
 * and A gets scarcity 0.7 (rival holds).
 */
export function makeMvp0StakesWorld(seed: number): SimWorld {
  const world = makeMvp0World(seed);
  world.facts[objectFactKey(MVP0_OBJECT_ID)] = { holderId: MVP0_AGENT_B, locId: MVP0_LOCATION_ID };
  return world;
}
