
// data/diagnostics/scenarios.ts
import { DiagnosticScenario } from '../../lib/diagnostics/types';
import { createFittedCharacterFromArchetype } from '../../lib/archetypes/fitter';
import { allScenarioDefs } from '../scenarios/index';
import { mapCharacterToBehaviorParams } from '../../lib/core/character_mapper';
import { makeAgentRNG } from '../../lib/core/noise';
import { AgentState } from '../../types';
import { GOAL_DEFS } from '../../lib/goals/space';

export const negotiationStressTest: DiagnosticScenario = {
  id: "negotiation_stress_test",
  label: "Переговоры под давлением",
  description: "Персонаж X ведет переговоры с жёстким прагматиком при высокой ставке и ограниченном времени.",
  ticks: 50,
  setup({ world, characterIds }) {
    const subjectId = characterIds[0];
    const counterpartArchetype = createFittedCharacterFromArchetype('H', 4, 'ON'); // ON/Верификатор as Pragmatist
    if (!counterpartArchetype) return;
    
    counterpartArchetype.entityId = 'diagnostic-counterpart';
    counterpartArchetype.title = 'Прагматик-Функционер';
    
    // Fully initialize the agent state required by the simulation engine
    const behavioralParams = mapCharacterToBehaviorParams(counterpartArchetype);
    const seed = 9999;
    const rngChannels = {
        decide: makeAgentRNG(counterpartArchetype.entityId, seed),
        physio: makeAgentRNG(counterpartArchetype.entityId, seed + 1),
        perceive: makeAgentRNG(counterpartArchetype.entityId, seed + 2)
    };

    const counterpartAgent: AgentState = {
        ...counterpartArchetype,
        // FIX: Added id and pos to comply with AgentState interface.
        id: counterpartArchetype.entityId,
        pos: { x: 0, y: 0 },
        hp: 100,
        behavioralParams,
        rngChannels,
        S: 50,
        v: 0, 
        xi: 0, 
        sigma_xi_sq: 0.1,
        temperature: behavioralParams.T0,
        gumbelScale: behavioralParams.gumbel_beta,
        processNoiseSigma: behavioralParams.sigma0,
        baseTemperature: behavioralParams.T0,
        kappa_T: behavioralParams.kappa_T_sensitivity,
        baseSigmaProc: behavioralParams.sigma0,
        w_eff: [],
        relationships: {},
        perceivedStates: new Map(),
        pendingProposals: [],
        W_S: [], W_L: [], W_S_hat: [], W_L_hat: [], W_S_lag: [], W_L_lag: [],
        phiS_vec: [], phiL_vec: [], masksS: [], masksL: [], alphaL: [], alphaS: [],
        goalIds: Object.keys(GOAL_DEFS),
        wSelfBase: [],
        drivingGoalState: {},
        actionHistory: [],
        flags: {},
        route_belief: 0,
        route_source: 'none',
        // Flatten nested properties for easier access if needed, though they exist on the object
        ...counterpartArchetype.state,
        ...counterpartArchetype.body.acute,
        latents: {}, // Default empty
        quickStates: {}, // Default empty
        influence: 0,
        prMonstro: 0,
        N_ema: 0.5, H_ema: 0.5, C_ema: 0.5 // Added EMA initials
    } as unknown as AgentState;
    
    // Add counterpart to the world
    world.agents.push(counterpartAgent);

    // Set a scenario that involves negotiation
    world.scenario = allScenarioDefs['council_simple'];
    world.groupGoalId = 'maintain_legitimacy';
  },
  focusPairs: [
    // This is a placeholder; runner will auto-generate pairs
  ]
};

export const blackSwanBreakdown: DiagnosticScenario = {
  id: "black_swan_breakdown",
  label: "Чёрный лебедь и срыв",
  description: "Персонаж живет в относительно стабильном мире, потом ловит резкий катастрофический удар.",
  ticks: 80,
  setup({ world, characterIds }) {
    world.meta = world.meta || {};
    world.meta.blackSwanTick = world.tick + 40;
    world.agents.forEach(agent => {
        if (characterIds.includes(agent.entityId)) {
            agent.body.acute.stress = 20;
        }
    });
  },
};

export const allDiagnosticScenarios: DiagnosticScenario[] = [
    negotiationStressTest,
    blackSwanBreakdown,
];
