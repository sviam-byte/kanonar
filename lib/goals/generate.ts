import { CharacterEntity, GoalEcology, GoalState, GoalLayer, CharacterGoalId, V42Metrics, ToMV2DashboardMetrics, GoalKind, WorldState, GoalDomainId, AgentState } from '../../types';
import { GOAL_DEFS } from './space';
import { computeGoalPriorities } from '../goal-planning';
import { getPlanningGoals } from './adapter';
import { ConcreteGoalInstance } from '../life-goals/v4-types';

const kindToLayerMap: Record<string, GoalLayer> = {
    'protect_others': 'social', 'self_preservation': 'survival', 'redemption': 'identity',
    'self_punishment': 'impulse', 'preserve_system': 'social', 'reputation': 'social',
    'revenge': 'impulse', 'escape': 'survival', 'truth': 'mission', 'care': 'social',
    'discipline': 'security', 'self': 'survival', 'epistemic': 'learn', 'mission': 'mission',
    'affect': 'body', 'status': 'social', 'power': 'social', 'identity': 'identity',
    'social': 'social', 'body': 'body', 'security': 'security',
};

export const deriveGoalCatalog = (
    character: CharacterEntity, 
    flatParamValues: Record<string, number>,
    latents: Record<string, number>,
    quickStates: Record<string, number>,
    v42metrics: V42Metrics | null,
    goalActivationDeltas: Record<string, number>,
    baseGoalBoosts: Record<string, number>, 
    psychGoalModifiers?: Partial<Record<GoalKind, number>>,
    archetypeGoalBoosts?: Partial<Record<string, number>>,
    tomV2Metrics?: ToMV2DashboardMetrics | null,
    worldState?: WorldState,
    concreteGoals?: ConcreteGoalInstance[] // NEW: V4 Goals
): GoalEcology => {

    // 1. Construct a minimal AgentState wrapper
    const agentWrapper = {
        ...character,
        vector_base: character.vector_base, 
        lifeGoals: character.lifeGoals,     
        goalEcology: null,                  
        effectiveRole: character.roles?.global[0] || 'any',
        psych: (character as any).psych
    } as unknown as AgentState;

    // 2. Construct WorldState if missing
    const world = worldState || {
        tick: 0,
        agents: [agentWrapper],
        context: 'static_view',
        threats: [],
        tom: {} as any,
        leadership: { currentLeaderId: null, leaderScore: 0, lastChangeTick: 0, changeCount: 0, legitimacy: 0.7, contestLevel: 0 },
        initialRelations: {},
        scene: {
            metrics: { threat: 10, timer: 100, discipline: 50, wounded_total: 0, wounded_unsorted: 0, wounded_stable: 0, wounded_evacuated: 0, wounded_dead: 0 } as any,
            scenarioDef: { id: 'routine' } as any,
            currentPhaseId: 'default'
        },
        factions: [],
        massNetwork: { nodes: {}, nodeOrder: [], W: [] } as any
    } as WorldState;

    let goalStates: GoalState[] = [];
    let lifeGoalDebug: any = undefined;

    // 3. Strategy: If concreteGoals provided (V4), use them. Else fallback to V3/Legacy.
    if (concreteGoals && concreteGoals.length > 0) {
        // --- V4 ENGINE PATH ---
        // Concrete goals are already prioritized and specific.
        // We map them to GoalState format.
        goalStates = concreteGoals.map(cg => {
            return {
                id: cg.id as CharacterGoalId, // e.g. c_reduce_tension
                layer: cg.layer,
                name: cg.label,
                base: cg.contribs.base,
                dynamic: cg.score, // Using normalized score as dynamic value
                tension: 0,
                frustration: 0,
                sacred: false,
                blocked: false,
                priority: cg.score,
                weight: cg.score,
                activation_score: cg.logit,
                deonticFit: 1,
                conflictingGoalIds: [],
                domain: cg.domain,
                origin: 'v4_engine',
                is_active: false,
                satisfaction: 0.5,
                targetId: cg.targetId
            };
        });
    } else {
        // --- V3 / LEGACY PATH ---
        const planningGoals = getPlanningGoals();
        const { priorities, activations, debug, lifeGoalDebug: dbg } = computeGoalPriorities(agentWrapper, planningGoals, world, { skipBioShift: true });
        lifeGoalDebug = dbg;
        
        const maxActivation = Math.max(...activations, 1e-6);
        
        goalStates = planningGoals.map((pg, idx) => {
            const def = GOAL_DEFS[pg.id as CharacterGoalId];
            const priority = priorities[idx];
            const activation = activations[idx];
            const relativeMagnitude = Math.min(1, activation / maxActivation);

            const eventMod = goalActivationDeltas[pg.id] ?? 0;
            const archMod = archetypeGoalBoosts?.[pg.id] ?? 1.0;
            const psychMod = psychGoalModifiers?.[def.kind as GoalKind] ?? 0;

            let finalPriority = priority * archMod + eventMod + psychMod;
            
            return {
                id: pg.id,
                layer: kindToLayerMap[def.kind as GoalKind] || 'mission',
                name: def.label_ru,
                base: debug.b_ctx[idx] || 0, 
                dynamic: relativeMagnitude,
                tension: 0,
                frustration: 0,
                sacred: character.identity?.sacred_set?.some((s: any) => s.obj === pg.id) ?? false,
                blocked: false,
                priority: Math.max(0, finalPriority),
                weight: relativeMagnitude,
                activation_score: finalPriority,
                deonticFit: 1,
                conflictingGoalIds: [],
                domain: def.kind.toUpperCase(),
                origin: 'system',
                is_active: false,
                satisfaction: 0.5
            };
        });
    }

    // Sort
    const sorted = goalStates.sort((a, b) => b.priority - a.priority);

    // For V4, since we generate many candidates, we might want to filter low priority
    // But keep them in latent for completeness.

    const ecology: GoalEcology = {
        execute: sorted.slice(0, 5).map(g => ({...g, is_active: true})),
        latent: sorted.slice(5).map(g => ({...g, is_active: false})),
        drop: sorted.filter(g => g.blocked),
        queue: [],
        tension: 0,
        frustration: 0,
        conflictMatrix: {},
        groupGoals: [],
        cascade: null, 
        lifeGoalDebug: lifeGoalDebug
    };
    
    ecology.queue = ecology.latent;

    return ecology;
};