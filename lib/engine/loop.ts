


import { WorldState, SimulationEvent, SceneOutcomeEvent, KanonarReportEvent, Observation, ActionChosenEvent, ActionAppliedEvent, Episode, Action, AgentState, DomainEvent } from '../../types';
import { ActionSystem } from '../systems/ActionSystem';
import { DecisionSystem } from '../systems/DecisionSystem';
import { PerceptionSystem } from '../systems/PerceptionSystem';
import { SocialSystem } from '../systems/SocialSystem';
import { PhysioSystem } from '../systems/PhysioSystem';
import { applyTomDecay } from '../tom/decay';
import { maybeChangeLeader } from '../social/leadership';
import { makeWorldDebugSnapshot } from '../diagnostics/snapshots';
import { updateSystemEntities } from '../system-entities/logic';
import { checkFailureModes } from '../diagnostics/failure';
import { checkArchetypeDrift, updateArchetypeTension } from '../archetypes/drift';
import { SystemObservation } from '../observations/SystemObservation';
import { makeKanonarReport } from '../kanonar/reports';
import { planLeaderStep } from '../social/orders';
import { maybeUpdateDetachment } from '../social/group';
import { updateGoalEcology } from '../goals/scoring';
import { updateMassLayerEI } from '../mass/system_ei'; 
import { buildDefaultMassNetworkEI } from '../mass/build_ei'; 
import { Branch } from '../../types'; 
import { calculateFieldMetrics } from '../archetypes/structural-metrics';
import { recomputeAgentPsychState } from '../metrics/psych-layer';
import { tickContext } from '../context/engine';
import { makeDefaultTickConfig, makeScenarioTickConfig } from '../context/default-config';
import { createEpisode, createObservation } from '../narrative/memory';
import { interpretEpisode } from '../narrative/sensemaking';
import { generateInnerMonologue } from '../narrative/inner_monologue';
import { scenarioInit, scenarioTick } from '../scenario/engine';
import { updateTomGoals } from '../tom/update.goals';
import { updateTomTraits } from '../tom/update.traits';
import { computeToMCore } from '../tom/core';
import { flattenObject } from '../param-utils';
import { findLocation } from '../world/locations';
import { mapSimulationEventsToUnified } from '../events/simulation-bridge';
import { applyAcquaintanceFromEvents } from '../social/acquaintanceFromEvents';

// Helper to map SimulationEvent to DomainEvent for logs
function mapSimEventToDomain(ev: SimulationEvent, world: WorldState): DomainEvent {
    // Basic mapping, can be refined based on event type
    const base: any = {
        id: `evt-${ev.tick}-${Math.random().toString(36).substr(2, 5)}`,
        t: ev.tick,
        intensity: 0.5,
        polarity: 0,
        domain: 'simulation',
        tags: ['sim'],
        meta: { ...ev }
    };
    
    if (ev.kind === 'ActionApplied') {
        const ae = ev as ActionAppliedEvent;
        base.actorId = ae.actorId;
        base.actionId = ae.actionId;
        base.targetId = ae.targetId;
        base.intensity = ae.success;
        base.polarity = ae.success > 0.5 ? 1 : -1;
        base.domain = 'action';
        base.tags.push('action');
        base.locationId = world.agents.find(a => a.entityId === ae.actorId)?.locationId;
    } else if (ev.kind === 'LeaderChanged') {
        const le = ev as any;
        base.actorId = le.newLeaderId;
        base.actionId = 'become_leader';
        base.domain = 'leadership';
        base.tags.push('political');
        base.intensity = 1.0;
    } else {
        base.actorId = 'SYSTEM';
        base.actionId = ev.kind;
    }
    
    return base as DomainEvent;
}

export async function runSimulationTick(world: WorldState): Promise<SimulationEvent[]> {
    const events: SimulationEvent[] = [];

    events.push({ kind: 'TickStart', tick: world.tick });

    // Initialize scenario if needed
    if (world.scenario && (!world.scene || world.scene.scenarioDef.id !== world.scenario.id)) {
        scenarioInit(world, world.scenario);
    }

    // Cleanup help offers
    if (world.helpOffers) {
        world.helpOffers = world.helpOffers.filter(o => world.tick - o.tick <= 3);
    }

    if (!world.massNetwork_ei) {
        world.massNetwork_ei = buildDefaultMassNetworkEI(Branch.Current);
    }

    // Perception
    world.agents.forEach(agent => PerceptionSystem.perceive(agent, world));

    // Social Dynamics
    world.agents.forEach(agent => SocialSystem.updateBeliefs(agent, world));
    
    // Leadership
    const leaderChangeEvent = maybeChangeLeader(world);
    if (leaderChangeEvent) events.push(leaderChangeEvent);
    planLeaderStep(world);

    // Goal Ecology
    world.agents.forEach(agent => updateGoalEcology(agent, world));

    // Context Tick
    const mode = world.engineMode ?? 'context';
    if (mode === 'context' || mode === 'hybrid') {
        const ctxWorld = world as any as import('../context/types').ContextWorldState;
        
        if (!ctxWorld.contextEx && world.scenario?.contextConfig) {
             const locationOf: Record<string, string> = {};

             // Populate location data
             for (const agent of world.agents) {
                 const charId = agent.entityId;
                 const locId = (agent as any).locationId; 

                 if (locId) {
                     locationOf[charId] = locId;
                 }
             }

             ctxWorld.contextEx = {
                metrics: {},
                locationOf, 
                contextAtoms: {},
                agentViews: {},
                conflicts: {},
                mandates: {},
                stageId: 'default',
                scenarioId: world.scenario.id,
                scenarioConfig: world.scenario.contextConfig as any,
                logs: [],
                agentLocationTags: {}
            };
        }
        
        if (ctxWorld.contextEx) {
             const cfg = ctxWorld.contextEx.scenarioConfig
                ? makeScenarioTickConfig(ctxWorld)
                : makeDefaultTickConfig(ctxWorld);
             tickContext(ctxWorld, cfg);
        }
    }

    // Decision Making
    const intentions = world.agents.map(agent => {
        const { intention, details } = DecisionSystem.formulateIntention(agent, world);
        if (intention) {
            maybeUpdateDetachment(world, agent, intention.id as any, details.topGoalId);
            updateArchetypeTension(agent, intention.tags || [], details.topGoalId);
        }
        return { agent, intention, details };
    });
    
    intentions.forEach(({ agent, intention, details }) => {
        events.push({
            kind: 'ActionChosen', tick: world.tick, actorId: agent.entityId, actionId: intention.id,
            targetId: intention.targetId, topGoalId: details.topGoalId, probability: details.probability,
            goalContribs: details.goalContribs, scoreBreakdown: details.scoreBreakdown, alpha: details.scoreBreakdown.alpha,
            archetypeContext: details.archetypeContext, qTotal: details.scoreBreakdown.total, args: intention.args,
            planId: intention.planId ?? null, causeAtomId: intention.causeAtomId ?? null,
        } as ActionChosenEvent);
    });

    // Execution & Feedback
    const outcomes: { agent: AgentState; outcome: any }[] = [];
    const executedActions: { actorId: string, actionId: string }[] = [];
    
    for (const { agent, intention } of intentions) {
        const outcome = ActionSystem.execute(agent, intention, world, world.allGoals || []);
        outcomes.push({ agent, outcome });
        if (intention) {
            executedActions.push({ actorId: agent.entityId, actionId: intention.id });
        }
        
        events.push({
            kind: 'ActionApplied',
            tick: world.tick,
            actorId: agent.entityId,
            actionId: outcome.intention?.id || intention?.id,
            targetId: intention?.targetId,
            success: outcome.success,
            bodyDelta: outcome.bodyDelta,
            outcome: outcome,
            args: intention?.args,
            planId: intention?.planId,
            causeAtomId: intention?.causeAtomId
        } as ActionAppliedEvent);
        
        // Narrative
        const obs = createObservation(world, agent, outcome, agent);
        if (obs) {
            const episode = createEpisode(world, [obs]);
            if (episode) {
                 const { slot } = interpretEpisode(agent, episode, world);
                 if (!agent.narrativeState) agent.narrativeState = { episodes: [], narrative: [], maxNarrativeLength: 20 };
                 agent.narrativeState.episodes.push(episode);
                 agent.narrativeState.narrative.push(slot);
            }
        }
        const thought = generateInnerMonologue(agent, world.tick);
        if (thought && agent.narrativeState) agent.narrativeState.narrative.push(thought);
        
        PhysioSystem.update(agent);
        checkArchetypeDrift(agent);

        // --- ToM Updates (Bayesian) ---
        world.agents.forEach(observer => {
            if (observer.entityId === agent.entityId) return;

            // Calculate Core metrics for alpha_update
            // We need flat params. In loop we work with object, so flatten on fly or cache
            const flatParams = flattenObject(observer);
            const tomCore = computeToMCore({
                latents: observer.latents,
                v42: observer.v42metrics!,
                params: {
                    metacog: observer.vector_base?.G_Metacog_accuracy ?? 0.5,
                    evidenceQuality: observer.evidence.evidence_quality,
                    obsNoise: observer.observation.noise,
                    reportNoise: observer.observation.report_noise,
                    darkExposure: (observer.state.dark_exposure ?? 0)/100,
                    modelCalibration: observer.vector_base?.E_Model_calibration ?? 0.5,
                    memoryFidelity: observer.vector_base?.A_Memory_Fidelity ?? 0.5,
                    networkCl: observer.latents.CL ?? 0.5,
                    infoHyg: observer.v42metrics?.InfoHyg_t ?? 0.5
                }
            });

            // Update Goal Belief
            const goalObs = {
                observerId: observer.entityId, targetId: agent.entityId,
                actionId: intention.id as any, success: outcome.success,
                world, tomCore
            };
            const { goalDelta } = updateTomGoals(world.tom, goalObs);

            // Update Traits
            const traitObs = {
                observerId: observer.entityId, targetId: agent.entityId,
                actionId: intention.id as any, success: outcome.success, world, tomCore
            };
            const { traitDelta } = updateTomTraits(world.tom, traitObs);
            
            // Log update event
            if (Object.keys(traitDelta).length > 0 || Object.keys(goalDelta).length > 0) {
                 const entry = world.tom[observer.entityId][agent.entityId];
                 events.push({
                    kind: 'TomUpdated', tick: world.tick, observerId: observer.entityId, targetId: agent.entityId,
                    newTrust: entry.traits.trust, newBond: entry.traits.bond, newAlign: entry.traits.align,
                    newDominance: entry.traits.dominance, newVulnerability: entry.traits.vulnerability,
                    newUncertainty: entry.uncertainty
                 } as any); // Simplified typing for log
            }
            
            // Fallback to SocialSystem for legacy/simple fields not covered by Bayesian
            SocialSystem.updateRelationships(observer, outcome, world);
        });
    }

    // --- Сценарный слой: обновление метрик и возможное завершение сцены ---
    if (world.scenario && world.scene) {
        const wasDone = !!world.scene.done;
        scenarioTick({ world, actionsExecuted: executedActions });

        if (world.scene.done && !wasDone && world.scene.outcome) {
            const o = world.scene.outcome;
            const success = o.outcome !== 'failure';
            events.push({
                kind: 'SceneOutcome',
                tick: world.tick,
                meta: {
                    success,
                    reason: o.summary,
                },
            } as SceneOutcomeEvent);

            // Можно завершать основную симуляцию, если сцена закончилась
            world.simulationEnded = true;
        }
    }

    // System updates
    updateSystemEntities(world);
    world.agents.forEach(agent => checkFailureModes(agent, world));
    SystemObservation.captureWorldEpisode(world, events);

    // --- Psych layer recompute (includes thinking/activityCaps) ---
    // UI reads psych from debug snapshots; keep it fresh each tick.
    for (const agent of world.agents) {
        const trauma = (agent as any).trauma || { self: 0, others: 0, world: 0, system: 0 };
        const fieldMetrics = calculateFieldMetrics(agent as any, trauma);
        agent.psych = recomputeAgentPsychState(
            agent.psych,
            agent as any,
            fieldMetrics,
            agent.identityProfile?.archetypeObserved || null,
            agent.archetype?.phase || 'normal',
            agent.narrativeState?.episodes || []
        );
    }
    
    // --- Update Event Log ---
    if (world.eventLog) {
        // Filter out low-level ticks if too spammy, or include all
        const domainEvents = events.map(e => mapSimEventToDomain(e, world));
        // Feed interaction events into recognition/acquaintance updates.
        applyAcquaintanceFromEvents(world, domainEvents);
        world.eventLog.events.push(...domainEvents);
        
        // Limit log size if needed
        if (world.eventLog.events.length > 2000) {
            world.eventLog.events = world.eventLog.events.slice(-1500);
        }
    }
    
    if (world.tick % 10 === 0) {
        const report = makeKanonarReport(world, { windowSize: 50 });
        if (report) {
             if (!world.kanonarReports) world.kanonarReports = [];
             world.kanonarReports.push(report);
             events.push({ kind: 'KanonarReport', tick: world.tick, report } as KanonarReportEvent);
        }
    }
    
    updateMassLayerEI(world, world.agents, undefined, 0.1);
    if (!world.debugSnapshots) world.debugSnapshots = [];
    world.debugSnapshots.push(makeWorldDebugSnapshot(world));
    applyTomDecay(world, world.tick);

    world.tick++;
    return events;
}
