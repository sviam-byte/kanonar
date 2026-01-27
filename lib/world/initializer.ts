



import { WorldState, CharacterEntity, ScenarioId, AgentState, Branch } from '../../types';
import { allScenarioDefs } from '../../data/scenarios/index';
import { FACTIONS } from '../../data/factions';
import { buildDefaultMassNetwork } from '../mass/build';
import { calculateAllCharacterMetrics } from '../metrics';
import { mapCharacterToBehaviorParams } from '../core/character_mapper';
import { getGlobalRunSeed, makeAgentRNG, setGlobalRunSeed } from '../core/noise';
import { mapCharacterToCapabilities } from '../capabilities';
import { GOAL_DEFS } from '../goals/space';
import { computeCharacterGoalWeights } from '../goals/weights';
import { assignRoles } from '../roles/assignment';
import { initTomForCharacters } from '../tom/init';
import { constructGil } from '../gil/apply';
import { allLocations } from '../../data/locations';
import { hydrateLocation } from '../adapters/rich-location';
import { validateLocation } from '../location/validate';
import { defaultBody, defaultIdentity } from '../character-snippet';
import { ensureMapCells } from '../world/ensureMapCells';

function fillDefaults(defaults: any, value: any): any {
    if (value == null) return structuredClone(defaults);

    // массивы/примитивы — как есть
    if (Array.isArray(defaults)) return Array.isArray(value) ? value : structuredClone(defaults);
    if (typeof defaults !== 'object' || defaults === null) return value;

    const out: any = Array.isArray(value) ? value : { ...value };
    for (const k of Object.keys(defaults)) {
        const dv = defaults[k];
        const vv = value?.[k];
        out[k] = vv === undefined ? structuredClone(dv) : fillDefaults(dv, vv);
    }
    return out;
}

function normalizeCharacterForWorld(c: CharacterEntity): CharacterEntity {
    // убираем функции/прочий мусор из сущностей, но сохраняем структуру
    const raw = JSON.parse(JSON.stringify(c)) as any;

    raw.body = fillDefaults(defaultBody, raw.body);
    raw.identity = fillDefaults(defaultIdentity, raw.identity);

    return raw as CharacterEntity;
}

export function createInitialWorld(
    startTime: number,
    characters: CharacterEntity[],
    scenarioId: ScenarioId,
    customGoalWeights: Record<string, number> = {},
    customRelations: Record<string, any> = {},
    options: {
        runSeed?: number | string;
        decisionTemperature?: number;
        decisionCurvePreset?: 'linear' | 'smoothstep' | 'sqrt' | 'sigmoid' | 'pow2' | 'pow4';
    } = {}
): WorldState | null {
    const scenarioDef = allScenarioDefs[scenarioId];
    if (!scenarioDef) return null;

    if (options?.runSeed !== undefined && options?.runSeed !== null) {
        setGlobalRunSeed(options.runSeed);
    }
    const effectiveSeed = getGlobalRunSeed();

    const agents = characters.map(c => {
        const cNorm = normalizeCharacterForWorld(c);

        const fullMetrics = calculateAllCharacterMetrics(cNorm, Branch.Current, []);
        const bp = mapCharacterToBehaviorParams(cNorm);
        const goalWeights = computeCharacterGoalWeights(cNorm);
        
        // Merge custom goal weights
        Object.assign(goalWeights, customGoalWeights);

        const archetypeState = {
             mixture: {},
             actualId: cNorm.identity?.arch_true_dominant_id || 'H-1-SR',
             actualFit: 0,
             shadowId: null,
             shadowFit: 0,
             shadowActivation: 0,
             self: {
                 selfMixture: {},
                 selfId: cNorm.identity?.arch_self_dominant_id || 'H-1-SR',
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
            ...JSON.parse(JSON.stringify(cNorm)),
            hp: cNorm.body?.acute?.hp ?? 100,
            S: 50,
            temperature: bp.T0,
            gumbelScale: bp.gumbel_beta,
            processNoiseSigma: bp.sigma0,
            baseTemperature: bp.T0,
            kappa_T: bp.kappa_T_sensitivity,
            baseSigmaProc: bp.sigma0,
            rngChannels: { decide: makeAgentRNG(cNorm.entityId, 1), physio: makeAgentRNG(cNorm.entityId, 2), perceive: makeAgentRNG(cNorm.entityId, 3) },
            behavioralParams: bp,
            capabilities: mapCharacterToCapabilities(cNorm),
            w_eff: [], relationships: {}, perceivedStates: new Map(),
            goalWeights,
            goalIds: Object.keys(GOAL_DEFS),
            wSelfBase: Object.keys(GOAL_DEFS).map(id => goalWeights[id as keyof typeof GOAL_DEFS] || 0),
            actionHistory: [],
            body: cNorm.body || { acute: { stress: 0, fatigue: 0, moral_injury: 0 } },
            state: cNorm.state || { dark_exposure: 0 },

            tomMetrics: fullMetrics.tomMetrics,
            v42metrics: fullMetrics.v42metrics,
            tomV2Metrics: fullMetrics.tomV2Metrics,
            prMonstro: fullMetrics.quickStates.prMonstro || 0,
            latents: fullMetrics.latents,
            quickStates: fullMetrics.quickStates,
            psych: fullMetrics.psych,
            archetype: archetypeState,

            identityProfile: {
                archetypeObserved: cNorm.identity?.arch_true_dominant_id,
                archetypeSelf: cNorm.identity?.arch_self_dominant_id,
                tensionSelfObserved: 0,
                archetypePerceivedBy: {}
            },
            failureState: { activeModes: [], atRiskModes: [], history: [] },
            narrativeState: { episodes: [], narrative: [], maxNarrativeLength: 20 },
            
        } as AgentState;
    });

    const normalizedLocations = allLocations.map((loc: any) => {
        const map = loc?.map;
        if (map && Array.isArray(map.cells)) {
            try {
                return { ...loc, map: ensureMapCells(map) };
            } catch {
                // хотя бы выкинем undefined-ячейки
                return { ...loc, map: { ...map, cells: map.cells.filter(Boolean) } };
            }
        }
        return loc;
    });

    const tempWorld = {
        tick: 0,
        agents,
        context: 'sim',
        threats: [],
        tom: {} as any,
        groupGoalId: 'help_wounded', 
        leadership: { currentLeaderId: null, leaderScore: 0, lastChangeTick: 0, changeCount: 0, legitimacy: 0.7, contestLevel: 0.1 },
        factions: FACTIONS,
        initialRelations: customRelations,
        scene: {
            scenarioDef,
            metrics: { tick: 0, ...Object.fromEntries(Object.entries(scenarioDef.metrics).map(([k, v]) => [k, (v as any).initial])) } as any,
            currentPhaseId: scenarioDef.phases?.[0].id,
            tick: 0
        },
        scenario: scenarioDef,
        massNetwork: buildDefaultMassNetwork(Branch.Current),
        locations: normalizedLocations, // Populate from registry
        eventLog: { schemaVersion: 1, events: [] }, // Initialize Event Log
        rngSeed: options.runSeed ?? getGlobalRunSeed(),
        decisionTemperature: options.decisionTemperature ?? 1.0,
        decisionCurvePreset: options.decisionCurvePreset ?? 'smoothstep'
    };

    // Validation
    if (process.env.NODE_ENV !== "production") {
        for (const locEntity of allLocations) {
            try {
                const loc = hydrateLocation(locEntity);
                const res = validateLocation(loc);
                if (!res.ok) {
                    console.warn(
                        "[world-init] Location failed validation:",
                        loc.id,
                        res.issues
                    );
                }
            } catch (e) {
                console.error(
                    "[world-init] Error hydrating location",
                    (locEntity as any).id ?? (locEntity as any).entityId,
                    e
                );
            }
        }
    }

    const roles = assignRoles(agents, scenarioDef, tempWorld as WorldState);
    agents.forEach((a: any) => a.effectiveRole = roles[a.entityId]);
    
    const tom = initTomForCharacters(agents, tempWorld as WorldState);
    const gil = constructGil(agents);

    return { ...tempWorld, tom: tom as any, gilParams: gil, tick: 1 } as WorldState;
}

export function finalizeAgents(world: WorldState): WorldState {
    const agents = world.agents.map((a) => {
        // If metrics are missing, recalculate them
        if (!a.v42metrics || !a.latents) {
            const fullMetrics = calculateAllCharacterMetrics(a, Branch.Current, []);
            return {
                ...a,
                tomMetrics: fullMetrics.tomMetrics,
                v42metrics: fullMetrics.v42metrics,
                tomV2Metrics: fullMetrics.tomV2Metrics,
                prMonstro: fullMetrics.quickStates.prMonstro || 0,
                latents: fullMetrics.latents,
                quickStates: fullMetrics.quickStates,
                psych: fullMetrics.psych,
            };
        }
        return a;
    });

    return { ...world, agents };
}
