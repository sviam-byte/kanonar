
// lib/systems/DecisionSystem.ts
import { AgentState, Intention, Action, GoalId, WorldState, SocialActionId, ScenarioDef, CharacterGoalId } from '../../types';
import { socialActions } from '../../data/actions-social';
import { GOAL_DEFS } from '../goals/space';
import { computeQ, topGoalFromContribs } from '../choice/qvalue';
import { computeEffectiveBehaviorProfile } from '../archetypes/behavior';
import { planForGoal } from '../context/Planner';
import { effectiveAtomConfidence } from '../context/engine';
import { OfferAtom, FactAtom } from '../context/types';
import { isPlanActive, isPlanExhausted, advancePlanStep, failPlan } from '../planning/engine';
import { listify } from '../utils/listify';

// Сколько тиков предложение помощи считается "актуальным" для отказа.
const HELP_OFFER_TTL_TICKS = 5;
const SYSTEM_2_THRESHOLD = 0.6; // Stress threshold
const COGNITIVE_COST_PLANNING = 10;

// Helper to get action definition from ID
function getActionDef(id: string): Action | undefined {
    return socialActions.find(a => a.id === id);
}

// Helper to check if action tags match scenario phase constraints
function isActionAllowedByPhase(action: Action, world: WorldState): boolean {
    if (!world.scene || !world.scene.currentPhaseId || !world.scenario) return true;
    
    const phase = world.scenario.phases?.find(p => p.id === world.scene!.currentPhaseId);
    if (!phase) return true;
    
    const actionTags = action.tags || [];

    // 1. Blacklist check
    if (phase.bannedActionTags && phase.bannedActionTags.length > 0) {
        const isBanned = actionTags.some(tag => phase.bannedActionTags?.includes(tag));
        if (isBanned) return false;
    }
    
    // 2. Whitelist check (if defined)
    if (phase.allowedActionTags && phase.allowedActionTags.length > 0) {
        const isAllowed = actionTags.some(tag => phase.allowedActionTags?.includes(tag));
        // Special case: 'wait' and 'observe' are usually allowed unless banned explicitly
        if (!isAllowed && action.id !== 'wait' && action.id !== 'observe') return false;
    }
    
    return true;
}

export const listPossibleActions = (agent: AgentState, world: WorldState): Action[] => {
    // Add wait action by default
    const allPossibleActions: Action[] = [];

    // Iterate through all defined social actions and generate specific instances based on targetMode
    socialActions.forEach(actionDef => {
        if (actionDef.targetMode === 'character') {
            // Generate an action for each potential target in the world
            world.agents.forEach(other => {
                if (other.entityId !== agent.entityId) {
                    // Special filtering for context-sensitive targets
                    if (actionDef.id === 'accept_leadership') {
                         const hasProposal = agent.pendingProposals?.some(p => p.type === 'propose_leadership' && p.from === other.entityId);
                         if (!hasProposal) return;
                    }
                    
                    allPossibleActions.push({ 
                        ...actionDef, 
                        targetId: other.entityId, 
                        name: `${actionDef.name} ${other.title}` 
                    });
                }
            });
        } else if (actionDef.targetMode === 'role') {
             // Specifically for assigning roles
            if (actionDef.id === 'assign_role') {
                 world.agents.forEach(other => {
                    if (other.entityId !== agent.entityId) {
                        allPossibleActions.push({
                            ...actionDef,
                            targetId: other.entityId,
                            name: `${actionDef.name} -> ${other.title}`
                        });
                    }
                 });
            } else {
                 allPossibleActions.push({ ...actionDef, name: actionDef.name });
            }
        } else {
             allPossibleActions.push({ ...actionDef, name: actionDef.name });
        }
    });

    // De-duplicate actions
    const uniqueActions = Array.from(new Map(allPossibleActions.map(a => [`${a.id}:${a.targetId || ''}`, a])).values());

    const stress = (agent.body?.acute?.stress ?? 0) / 100;
    const shame = agent.psych?.moral?.shame ?? 0;
    const agents = listify(world.agents);
    const nAgents = agents.length;
    const nowTick = world.tick ?? 0;

    // Filter actions
    const availableActions = uniqueActions.filter(action => {
        // Global Scenario Phase Filter
        if (!isActionAllowedByPhase(action, world)) {
            return false;
        }
        
        // Special case for refuse_help: only if help was offered
        if (action.id === 'refuse_help') {
            const hasRecentOffer = listify(world.helpOffers).some((offer) => {
                // Поля HelpOffer: fromId, toId, actionId, tick, kind.
                if (offer.toId !== agent.entityId) return false;

                // TTL по тикам.
                const age = nowTick - (offer.tick ?? 0);
                if (HELP_OFFER_TTL_TICKS > 0 && age > HELP_OFFER_TTL_TICKS) {
                    return false;
                }

                const offerActor = agents.find(a => a.entityId === offer.fromId);
                if (!offerActor) return false;
                
                return true;
            });

            if (!hasRecentOffer) {
              return false;
            }
        }
        
        // Requirement check: requires.fact using context confidence
        if (action.requires?.fact) {
             const required = action.requires.fact;
             const atoms = Object.values(world.contextEx?.contextAtoms ?? {});
             const minConf = 0.1; 

             if (required === 'help_offered') {
                  const helpAtoms = atoms.filter(
                    (a): a is OfferAtom =>
                      (a as any).kind === 'offer' &&
                      (a as any).offerKind === 'help' &&
                      (a as any).targetId === agent.entityId
                  );

                  if (helpAtoms.length === 0) return false;

                  const ok = helpAtoms.some((atom) => {
                    const eff = effectiveAtomConfidence(atom as any, nowTick);
                    return eff >= minConf;
                  });
                  if (!ok) return false;

             } else {
                  // General fact check
                  const ok = atoms.some((a): a is FactAtom => {
                    if ((a as any).kind !== 'fact') return false;
                    const fa = a as FactAtom;
                    if (fa.prop !== required) return false;
                    const eff = effectiveAtomConfidence(fa, nowTick);
                    return eff >= minConf;
                  });
                  if (!ok) return false;
             }
        }
        
        // Specific One-time checks
        if (action.id === 'accept_plan') {
             const atoms = Object.values(world.contextEx?.contextAtoms ?? {});
             // Check for any PlanAtom proposed to me or shared
             const hasPlan = atoms.some(a => 
                 (a as any).kind === 'plan' && 
                 ((a as any).status === 'proposed') && 
                 (!(a as any).toId || (a as any).toId === agent.entityId)
             );
             if (!hasPlan) return false;
        }

        if (action.isAvailable) {
            const target = action.targetId ? world.agents.find(a => a.entityId === action.targetId) : undefined;
            if (!action.isAvailable({ actor: agent, world, target })) return false;
        }
        
        return true;
    });
    
    if (availableActions.length === 0) {
        return [socialActions.find(a => a.id === 'wait')!];
    }

    return availableActions;
};

export const DecisionSystem = {
    formulateIntention: (agent: AgentState, world: WorldState, options?: { forcedTopGoalId?: CharacterGoalId, debug?: boolean }): { intention: Intention, details: any } => {
        
        // 1. Determine Driving Goal (Heuristic or from previous tick or forced)
        let topGoalId = options?.forcedTopGoalId || agent.drivingGoalId;
        if (!topGoalId || !agent.goalEcology?.execute.find(g => g.id === topGoalId)) {
             // Fallback: pick top priority
             topGoalId = agent.goalEcology?.execute[0]?.id as CharacterGoalId;
        }

        // 2. Check Active Plan (Execution Loop)
        if (isPlanActive(agent.planState)) {
             // Get current step
             const { step } = advancePlanStep(agent); // This advances cursor, assuming we will try to do it
             // If step is valid
             if (step) {
                 const actionDef = getActionDef(step.actionId);
                 const target = step.targetId ? world.agents.find(a => a.entityId === step.targetId) : undefined;
                 
                 // Validate Action Availability
                 const isAvailable = actionDef && (!actionDef.isAvailable || actionDef.isAvailable({ actor: agent, world, target }));
                 
                 if (isAvailable && actionDef) {
                      // SUCCESS: Execute plan step
                      agent.currentAction = { ...actionDef, targetId: step.targetId };
                      return {
                         intention: {
                             id: step.actionId,
                             targetId: step.targetId,
                             tags: actionDef.tags,
                             name: actionDef.name,
                             narrative_verb: actionDef.narrative_verb,
                             cost: actionDef.cost,
                             planId: agent.planState ? `plan-${agent.planState.builtAtTick}` : null,
                             args: step.args
                         },
                         details: {
                             actionId: step.actionId,
                             topGoalId: topGoalId || 'plan_execution',
                             probability: 1.0,
                             scoreBreakdown: { total: 100, fromGoals: 100, fromRole: 50 }, 
                             goalContribs: { [topGoalId || 'plan']: 1.0 }
                         }
                     };
                 } else {
                     // FAILURE: Plan blocked
                     agent.planState = { ...agent.planState!, status: 'failed' };
                     // Fall through to System 2/1
                 }
             }
        }

        // 3. System 2: Replanning (If budget allows and stress is low, or if forced deliberate style)
        const stress = (agent.body?.acute?.stress ?? 0) / 100;
        const budget = agent.cognitiveBudget ?? 100;
        
        const planningStyle = agent.behavioralParams?.planningStyle ?? 'deliberate';
        const allowPlanning = planningStyle !== 'instinctive' && (!agent.useSystem1 && stress < SYSTEM_2_THRESHOLD);
        
        // Force planning if deliberate style is explicitly set and budget allows, even if stress is moderate
        const forcePlan = planningStyle === 'deliberate' && budget >= COGNITIVE_COST_PLANNING;
        
        const canPlan = (allowPlanning || forcePlan) && budget >= COGNITIVE_COST_PLANNING;
        let planFailReason: string | null = null;

        if (canPlan && topGoalId) {
             const maxDepth = planningStyle === 'simple' ? 1 : undefined;
             const newPlan = planForGoal(agent, world, topGoalId, maxDepth);
             
             if (newPlan && newPlan.steps.length > 0) {
                 // Success: Adopt new plan
                 agent.cognitiveBudget = Math.max(0, budget - COGNITIVE_COST_PLANNING);
                 agent.planState = newPlan;
                 
                 // Immediately execute first step
                 const { step } = advancePlanStep(agent);
                 const actionDef = getActionDef(step!.actionId);
                 
                 if (actionDef) {
                     agent.currentAction = { ...actionDef, targetId: step!.targetId };
                     return {
                         intention: {
                             id: step!.actionId,
                             targetId: step!.targetId,
                             tags: actionDef.tags,
                             name: actionDef.name,
                             narrative_verb: actionDef.narrative_verb,
                             cost: actionDef.cost,
                             planId: `plan-${newPlan.builtAtTick}`,
                             args: step!.args
                         },
                         details: {
                             actionId: step!.actionId,
                             topGoalId: topGoalId,
                             probability: 1.0,
                             scoreBreakdown: { total: 95, fromGoals: 95 },
                             goalContribs: { [topGoalId]: 1.0 }
                         }
                     };
                 }
             } else {
                 planFailReason = `Planner found no path for goal ${topGoalId}`;
             }
        } else {
            if (!canPlan) planFailReason = "Insufficient cognitive budget or high stress";
            else if (!topGoalId) planFailReason = "No driving goal identified";
        }

        // 4. System 1: Reactive Choice (Fallback)
        const possibleActions = listPossibleActions(agent, world);
        
        // Compute archetype behavior profile once for this agent/tick
        const effProfile = computeEffectiveBehaviorProfile(agent);

        const results = possibleActions.map(action => {
            const result = computeQ(world, agent, action, effProfile);
            return { action, breakdown: result, goalContribs: result.goalContribs };
        });

        const utilities = results.map(r => r.breakdown.total);
        const T = agent.temperature > 0.01 ? agent.temperature : 0.01;

        const maxU = Math.max(...utilities);
        const logits = utilities.map(u => (u - maxU) / T);
        const exp = logits.map(Math.exp);
        const Z = exp.reduce((acc, x) => acc + x, 0);
        const probs = exp.map(x => x / (Z || 1));

        let draw = agent.rngChannels.decide.nextFloat();
        let chosenIndex = -1;
        for (let k = 0; k < probs.length; k++) {
            draw -= probs[k];
            if (draw <= 0) {
                chosenIndex = k;
                break;
            }
        }
        if (chosenIndex === -1) chosenIndex = probs.length -1;

        const { action: chosenAction, breakdown, goalContribs } = results[chosenIndex];
        const reactiveTopGoalId = topGoalFromContribs(goalContribs);

        agent.currentAction = chosenAction;
        agent.drivingGoalId = reactiveTopGoalId as CharacterGoalId;

        // Update action history for repetition penalty
        if (!agent.actionHistory) agent.actionHistory = [];
        agent.actionHistory.push({ id: chosenAction.id as SocialActionId, targetId: chosenAction.targetId });
        if (agent.actionHistory.length > 10) {
            agent.actionHistory.shift();
        }

        if (world.actionsThisTick) {
            world.actionsThisTick.push(chosenAction.id as SocialActionId);
        }
        
        const archetypeContext = agent.archetype ? {
            alpha: breakdown.alpha ?? 0,
            shadowActivation: agent.archetype.shadowActivation,
            selfId: agent.archetype.self.selfId,
            shadowId: agent.archetype.shadowId,
            actualId: agent.archetype.actualId,
        } : undefined;

        const fullDetails = {
            actionId: chosenAction?.id || 'none',
            targetId: chosenAction?.targetId,
            topGoalId: reactiveTopGoalId,
            probability: probs[chosenIndex],
            goalContribs: goalContribs,
            scoreBreakdown: breakdown,
            archetypeContext,
            // Attach debug reason if planning failed
            planningDebug: planFailReason 
        };

        const intention: Intention = {
            id: chosenAction.id,
            targetId: chosenAction.targetId,
            tags: chosenAction.tags,
            name: chosenAction.name,
            narrative_verb: chosenAction.narrative_verb,
            cost: chosenAction.cost,
            
            // Populate new fields
            args: chosenAction.generateArgs 
                ? chosenAction.generateArgs({ actor: agent, world, topGoalId: reactiveTopGoalId })
                : undefined,
            planId: null,
            causeAtomId: null
        };

        return { intention, details: fullDetails };
    }
};
