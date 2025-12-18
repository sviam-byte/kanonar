
import { SituationSpec, WorldState, CharacterEntity, EntityType, AgentState, Branch } from '../../types';
import { getEntitiesByType } from '../../data';
import { allScenarioDefs } from '../../data/scenarios/index';
import { FACTIONS } from '../../data/factions';
import { buildDefaultMassNetwork } from '../mass/build';
import { calculateAllCharacterMetrics } from '../metrics';
import { mapCharacterToBehaviorParams } from '../core/character_mapper';
import { makeAgentRNG } from '../core/noise';
import { mapCharacterToCapabilities } from '../capabilities';
import { initTomForCharacters } from '../tom/init';
import { constructGil } from '../gil/apply';
import { GOAL_DEFS } from '../goals/space';
import { computeCharacterGoalWeights } from '../goals/weights';
import { assignRoles } from '../roles/assignment';

// Helper to hydrate a character entity into a full AgentState
function hydrateAgent(char: CharacterEntity, seed: number): AgentState {
    const bp = mapCharacterToBehaviorParams(char);
    
    // Override planning style for the lab environment to ensure System 2 engages
    bp.planningStyle = 'deliberate';

    const fullMetrics = calculateAllCharacterMetrics(char, Branch.Current, []);
    const { latents, quickStates, psych, tomMetrics, v42metrics, tomV2Metrics } = fullMetrics;
    const goalWeights = computeCharacterGoalWeights(char);

    // Initialize Archetype Runtime State
    const archetypeState = {
            mixture: {},
            actualId: char.identity.arch_true_dominant_id || 'H-1-SR',
            actualFit: 0,
            shadowId: null,
            shadowFit: 0,
            shadowActivation: 0,
            self: {
                selfMixture: {},
                selfId: char.identity.arch_self_dominant_id || 'H-1-SR',
                selfConfidence: 1,
                perceivedAxes: {},
                selfShadowId: null,
                selfShadowWeight: 0
            },
            currentMode: 'default',
            phase: 'normal',
            history: {},
            viability: 1
    };

    return {
        ...JSON.parse(JSON.stringify(char)),
        hp: char.body?.acute?.hp ?? 100,
        S: 50,
        temperature: bp.T0,
        gumbelScale: bp.gumbel_beta,
        processNoiseSigma: bp.sigma0,
        baseTemperature: bp.T0,
        kappa_T: bp.kappa_T_sensitivity,
        baseSigmaProc: bp.sigma0,
        rngChannels: { decide: makeAgentRNG(char.entityId, seed), physio: makeAgentRNG(char.entityId, seed + 1), perceive: makeAgentRNG(char.entityId, seed + 2) },
        behavioralParams: bp,
        capabilities: mapCharacterToCapabilities(char),
        w_eff: [], relationships: {}, perceivedStates: new Map(),
        goalWeights, 
        goalIds: Object.keys(GOAL_DEFS),
        wSelfBase: Object.keys(GOAL_DEFS).map(id => goalWeights[id as keyof typeof GOAL_DEFS] || 0),
        actionHistory: [],
        // Ensure body state allows planning (Low stress for lab purposes)
        body: { 
            ...(char.body || {}),
            acute: { 
                ...(char.body?.acute || {}),
                stress: 20, // Force low stress so System 2 works
                fatigue: 10,
                moral_injury: 0 
            } 
        },
        state: char.state || { dark_exposure: 0 },
        
        // Injected Metrics
        tomMetrics: tomMetrics || { toM_Quality: 0.5, toM_Unc: 0.5 },
        v42metrics,
        tomV2Metrics,
        prMonstro: quickStates.prMonstro || 0,
        latents,
        quickStates,
        psych,
        archetype: archetypeState as any, 
        
        // Identity & Narrative tracking
        identityProfile: {
            archetypeObserved: char.identity.arch_true_dominant_id,
            archetypeSelf: char.identity.arch_self_dominant_id,
            tensionSelfObserved: 0,
            archetypePerceivedBy: {}
        },
        failureState: { activeModes: [], atRiskModes: [], history: [] },
        narrativeState: { episodes: [], narrative: [], maxNarrativeLength: 20 },
        
        cognitiveBudget: 100,
        useSystem1: false // Explicitly force System 2 for Planning Lab
        
    } as AgentState;
}

export function buildWorldForSituation(spec: SituationSpec, sandboxCharacters: CharacterEntity[] = []): { world: WorldState, focusAgentIndex: number } {
    const scenarioDef = allScenarioDefs[spec.scenarioId];
    if (!scenarioDef) {
        throw new Error(`Scenario ${spec.scenarioId} not found`);
    }

    const baseChars = (getEntitiesByType(EntityType.Character) as CharacterEntity[]).concat(getEntitiesByType(EntityType.Essence) as CharacterEntity[]);
    
    // Merge static and sandbox characters
    const charMap = new Map<string, CharacterEntity>();
    [...baseChars, ...sandboxCharacters].forEach(c => charMap.set(c.entityId, c));

    const agents = spec.initialEntities.map(id => {
        const char = charMap.get(id);
        if (!char) throw new Error(`Character ${id} not found`);
        return hydrateAgent(char, Date.now());
    });

    // Initialize Scene
    const scenarioState = {
        scenarioDef,
        metrics: { tick: 0, ...Object.fromEntries(Object.entries(scenarioDef.metrics).map(([k, v]) => [k, (v as any).initial])) } as any,
        currentPhaseId: scenarioDef.phases?.[0].id,
        tick: 0 // Added tick explicitly
    };

    const tempWorld = { 
        tick: 0,
        agents,
        context: 'sim',
        threats: [],
        tom: {} as any,
        groupGoalId: 'help_wounded', 
        leadership: { currentLeaderId: null, leaderScore: 0, lastChangeTick: 0, changeCount: 0, legitimacy: 0.7, contestLevel: 0.1 },
        factions: FACTIONS,
        initialRelations: {},
        scene: scenarioState,
        scenario: scenarioDef,
        massNetwork: buildDefaultMassNetwork(Branch.Current),
        locations: [],
    };

    // Assign Roles
    const roles = assignRoles(agents, scenarioDef, tempWorld as WorldState);
    agents.forEach((a: any) => a.effectiveRole = roles[a.entityId]);
    
    // Init ToM & GIL
    const tom = initTomForCharacters(agents, tempWorld as WorldState);
    const gil = constructGil(agents);

    const world: WorldState = { 
        ...tempWorld, 
        tom: tom as any, 
        gilParams: gil, 
        tick: 0,
        contextEx: {
             metrics: {}, locationOf: {}, contextAtoms: {}, agentViews: {}, conflicts: {}, mandates: {}, stageId: 'default', scenarioId: spec.scenarioId, logs: []
        }
    };
    
    // Seed context atoms if provided
    if (spec.initialContextAtoms) {
        spec.initialContextAtoms.forEach(atom => {
             world.contextEx!.contextAtoms[atom.id] = atom;
        });
    }
    
    // Set global leader if specified in situation logic (hardcoded here for Council)
    if (spec.id === 'council_meeting') {
        const tegan = agents.find(a => a.entityId === 'character-tegan-nots');
        if (tegan) world.leadership.currentLeaderId = tegan.entityId;
        
        // Manually inject an active order for Krystar to create the "refuse order" opportunity
        const krystar = agents.find(a => a.entityId === 'character-krystar-mann');
        if (tegan && krystar && !world.orders) {
             world.orders = [{
                 id: 'init-order-silence',
                 tickIssued: 0,
                 fromId: tegan.entityId,
                 toId: krystar.entityId,
                 requiredActionId: 'wait',
                 linkedGoalId: 'immediate_compliance',
                 priority: 0.9,
                 deadlineTick: 20,
                 status: 'pending',
                 kind: 'discipline',
                 summary: 'Молчать и ждать.',
                 createdAtTick: 0
             }];
        }
    }

    // By default focus on first agent if not specified otherwise (handled by caller)
    return { world, focusAgentIndex: 0 };
}
