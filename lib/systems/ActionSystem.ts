
// lib/systems/ActionSystem.ts

import { AgentState, Intention, Action, GoalMeta, Proposal, WorldState, SceneMetrics, SocialActionId, Order, CharacterGoalId, ActionOutcome, RoleAssignedEvent, RoleClaimedEvent, RoleProposedEvent, RoleResponseEvent, SceneRoleId, HelpOffer } from '../../types';
import { generateNarrativeLine } from '../narrative/generator';
import { guardIntent } from '../engine/guards';
import { entityMap } from '../../data';
import { updateArchetypeFromAction } from '../archetypes/system';
import { getActiveOrdersFor, createOrderForLeader } from '../social/orders';
import { assignRole, getAgentRole } from '../social/role_mechanics';
import { ContextWorldState, FactAtom, OfferAtom, ContextSlice, CommitmentAtom, PlanAtom } from '../context/types';
import { socialActions } from '../../data/actions-social';
import { registerCommitmentAtom } from '../context/engine';
import { createPlanFromSteps } from '../planning/engine';
import { listify } from '../utils/listify';

const SIGNIFICANT_CHANGE_THRESHOLD = 0.1;

function applyActionToObligations(
  world: WorldState,
  actionId: SocialActionId,
  actorId: string,
  targetId?: string
): void {
  if (!world.orders) world.orders = [];
  
  switch (actionId) {
    case "acknowledge_order":
    case "accept_order": {
      const orders = getActiveOrdersFor(world, actorId);
      if (!orders.length) break;
      orders.forEach(o => (o.status = "accepted"));
      break;
    }

    case "refuse_order": {
      const orders = getActiveOrdersFor(world, actorId);
      if (!orders.length) break;
      orders.forEach(o => (o.status = "refused"));

      // Penalty to leader legitimacy
      if (world.leadership) {
          world.leadership.legitimacy = Math.max(0, (world.leadership.legitimacy ?? 0.5) - 0.05);
      }
      break;
    }
  }
}

export const ActionSystem = {
    execute: (agent: AgentState, intention: Intention, world: WorldState, allGoals: GoalMeta[]): ActionOutcome => {
        if (agent.lastActionId === intention?.id) {
          agent.repeatCount = (agent.repeatCount ?? 1) + 1;
        } else {
          agent.lastActionId = intention?.id as any;
          agent.repeatCount = 1;
        }

        if (!intention) {
            const explanation = generateNarrativeLine(agent, null, allGoals);
            return {
                actorId: agent.entityId,
                intention,
                result: 'failure',
                description: "Действие не удалось: намерение не сформировано.",
                explanation,
                success: 0,
            };
        }

        // Safe cast intention to Action for functions that need it
        const actionDef = socialActions.find((a: Action) => a.id === intention.id);

        const actionObject: Action = {
            id: intention.id,
            targetId: intention.targetId,
            tags: intention.tags,
            cost: intention.cost,
            name: intention.name || intention.id, // Fallback name
            narrative_verb: intention.narrative_verb,
            goalImpact: {}, // Provide default if missing
            satisfies: actionDef?.satisfies
        };

        let success_val: number = 1.0;
        let description = `Действие "${intention.id}" выполнено.`;
        const target = world.agents.find(a => a.entityId === intention.targetId);
        let ordersIssued: Order[] = [];

        // --- Capture state before mutation ---
        const beforeMetrics = world.scene ? { ...world.scene.metrics } : undefined;
        const beforeBody = agent.body?.acute ? { ...agent.body.acute } : { stress: 0, fatigue: 0, hp: 100 };
        const beforeHP = agent.hp;
        
        // Initialize flags if missing (add property to agent or handle via meta)
        // Since flags is on AgentState now based on new type def, we use agent.flags
        if (!agent.flags) agent.flags = {};
        
        // Initialize ContextEx if missing (for FactAtom generation)
        if (!world.contextEx) {
            world.contextEx = {
                metrics: {},
                locationOf: {},
                contextAtoms: {},
                agentViews: {},
                conflicts: {},
                mandates: {},
                stageId: 'default',
                scenarioId: world.scenario?.id || 'default',
                logs: []
            };
        }

        // --- Mutate World State based on Action ---
        
        // Apply obligation logic
        applyActionToObligations(world, intention.id as SocialActionId, agent.entityId, intention.targetId);
        
        // --- Context Logic: Create Commitments on Acceptance ---
        if (intention.id === 'accept_order' || intention.id === 'acknowledge_order') {
             // If accept/ack order, create commitment atom
             const leaderId = world.leadership?.currentLeaderId;
             if (leaderId) {
                 registerCommitmentAtom(world as ContextWorldState, {
                     commitmentKind: 'obey_order',
                     fromId: agent.entityId,
                     toId: leaderId,
                     createdTick: world.tick,
                     decayPerTick: 0.05 // Decays over time if not reinforced
                 });
             }
        }
        
        // --- PLAN COMMMUNICATION ---
        if (intention.id === 'propose_plan') {
            // Create a PlanAtom with the current plan steps summary
            if (agent.planState && agent.planState.steps.length > 0) {
                 const planSummary = agent.planState.steps.map(s => ({
                     actionId: s.actionId,
                     targetId: s.targetId,
                     description: s.explanation
                 }));
                 
                 const planAtom: PlanAtom = {
                     id: `plan-proposal-${world.tick}-${agent.entityId}`,
                     kind: 'plan',
                     scope: 'shared',
                     createdTick: world.tick,
                     confidence: 1,
                     source: 'action',
                     planId: `shared-plan-${world.tick}`,
                     fromId: agent.entityId,
                     toId: intention.targetId, // Specific target or undefined (group)
                     steps: planSummary,
                     status: 'proposed',
                     goalId: agent.drivingGoalId
                 };
                 
                 // Add atom to context
                 (world as ContextWorldState).contextEx.contextAtoms[planAtom.id] = planAtom;
                 
                 // Add fact that plan was proposed
                 (world as ContextWorldState).contextEx.contextAtoms[`fact-plan_proposed`] = {
                     id: `fact-plan_proposed-${world.tick}`,
                     kind: 'fact',
                     scope: 'shared',
                     createdTick: world.tick,
                     confidence: 1,
                     source: 'action',
                     prop: 'plan_proposed',
                     label: 'Plan was proposed'
                 } as FactAtom;
                 
                 description = `${agent.title} предлагает план действий.`;
            } else {
                description = `${agent.title} пытается предложить план, но сам не знает, что делать.`;
                success_val = 0.5;
            }
        }

        if (intention.id === 'accept_plan') {
             // Find the proposed PlanAtom
             const atoms = Object.values((world as ContextWorldState).contextEx.contextAtoms);
             const proposal = atoms.find(a => 
                 (a as any).kind === 'plan' && 
                 (a as any).status === 'proposed' && 
                 (!(a as any).toId || (a as any).toId === agent.entityId)
             ) as PlanAtom | undefined;
             
             if (proposal) {
                 // Adopt the plan!
                 // Convert PlanSummary back to PlanStep (simplified)
                 const newSteps = proposal.steps.map((s, idx) => ({
                     id: `shared-step-${idx}`,
                     actionId: s.actionId,
                     targetId: s.targetId,
                     explanation: s.description || 'Shared plan step'
                 }));
                 
                 agent.planState = createPlanFromSteps(agent, world, newSteps, 'shared');
                 
                 // Update atom status (if specific to this agent, or just create commitment)
                 // We don't consume the atom if it's group-wide, but we can mark it accepted by us via commitment
                 registerCommitmentAtom(world as ContextWorldState, {
                     commitmentKind: 'execute_plan',
                     fromId: agent.entityId,
                     toId: proposal.fromId, // Committed to the proposer
                     createdTick: world.tick,
                     strength: 1
                 });

                 description = `${agent.title} принимает предложенный план.`;
             } else {
                 description = `${agent.title} хочет принять план, но не находит предложений.`;
                 success_val = 0.5;
             }
        }
        
        if (intention.id === 'reject_plan') {
             description = `${agent.title} отвергает предложенный план.`;
             // Could find and mark atom as rejected if it was directed specifically at this agent
        }

        // --- Generate Fact if Action Satisfies Proposition ---
        if (success_val > 0.5 && actionObject.satisfies) {
             const { prop, scope } = actionObject.satisfies;
             // For now, we only support 'per_scenario' scope which maps to shared context atoms
             if (scope === 'per_scenario' || scope === 'global') {
                 const atom: FactAtom = {
                    id: `fact-${prop}-${world.tick}`,
                    kind: 'fact',
                    scope: 'shared',
                    createdTick: world.tick,
                    confidence: 1,
                    decayPerTick: 0,
                    source: 'system', // or 'action'
                    prop: prop,
                    label: `Fact: ${prop}`
                 };
                 // Safety: contextEx initialized above
                 const ctx = world.contextEx as ContextSlice;
                 ctx.contextAtoms[prop] = atom; // Key by prop for uniqueness in this simple model
             }
        }
        
        // --- Handle Information Sharing (Transfer Atoms) ---
        if (intention.id === 'share_information' && intention.args?.factId) {
             const factId = intention.args.factId;
             const ctx = world.contextEx as ContextSlice;
             const originalAtom = Object.values(ctx.contextAtoms).find(a => a.id === factId || ((a as any).kind === 'fact' && (a as FactAtom).prop === factId));
             
             if (originalAtom && target) {
                 if (originalAtom.scope !== 'shared') {
                     originalAtom.scope = 'shared';
                 }
                 const atomLabel = (originalAtom as any).label || ((originalAtom as any).kind === 'fact' ? (originalAtom as FactAtom).prop : 'unknown');
                 description = `${agent.title} делится фактом "${atomLabel}" с ${target.title}.`;
                 
                 // Boost confidence/validity as it is reinforced by sharing
                 originalAtom.confidence = Math.min(1, originalAtom.confidence + 0.1);
             } else {
                 if (!originalAtom) {
                     description = `${agent.title} пытается поделиться информацией, но забывает детали.`;
                 } else {
                     description = `${agent.title} делится информацией в пустоту.`;
                 }
                 success_val = 0.5;
             }
        }

        // Manage Help Offers: пишем и в WorldState, и в ContextAtoms
        if (intention.id === 'offer_private_support' || intention.id === 'offer_practical_help') {
            const worldState = world;
            worldState.helpOffers = listify(worldState.helpOffers);

            const newOffer: HelpOffer = {
                id: `${worldState.tick}-${agent.entityId}-${intention.id}`,
                fromId: agent.entityId,
                toId: intention.targetId!,
                tick: worldState.tick,
                actionId: intention.id as any,
                kind: intention.id === 'offer_private_support' ? 'emotional' : 'practical',
            };
            worldState.helpOffers.push(newOffer);

            const ctx = worldState.contextEx as ContextSlice | undefined;
            if (ctx) {
                // 1) Legacy факт "мне предложили помощь" (для старого кода).
                const factId = `fact:help_offered:${newOffer.toId}`;
                const fact: FactAtom = {
                    id: factId,
                    scope: 'shared',
                    createdTick: worldState.tick,
                    confidence: 1,
                    source: 'action',
                    kind: 'fact',
                    prop: 'help_offered',
                    payload: {
                        fromId: newOffer.fromId,
                        toId: newOffer.toId,
                        actionId: newOffer.actionId,
                    },
                    label: 'Help Offered Fact'
                };
                ctx.contextAtoms[factId] = fact;

                // 2) Новый OfferAtom, который читает контекстный gate requiresFact('help_offered').
                const offerAtomId = `offer:help:${newOffer.id}`;
                const offerAtom: OfferAtom = {
                    id: offerAtomId,
                    scope: 'shared',
                    createdTick: worldState.tick,
                    confidence: 1,
                    // decayPerTick можно настроить позже сценарием;
                    // пока не задаём — предложение "вечное", пока его не погасит отказ.
                    source: 'action',
                    kind: 'offer',
                    offerKind: 'help',
                    fromId: newOffer.fromId,
                    targetId: newOffer.toId,
                    payload: {
                        actionId: newOffer.actionId,
                    },
                };
                ctx.contextAtoms[offerAtomId] = offerAtom;
            }
        }
        
        switch(intention.id) {
            case 'aid_ally':
            case 'triage_wounded': {
                const targetId = intention.targetId;
                if (targetId) {
                     const offer: HelpOffer = {
                        id: `${world.tick}_${agent.entityId}_${targetId}_practical`,
                        fromId: agent.entityId,
                        toId: targetId,
                        kind: 'practical',
                        tick: world.tick ?? 0,
                        actionId: intention.id,
                    };
                    world.helpOffers = listify(world.helpOffers);
                    world.helpOffers.push(offer);
                }
                break;
            }
            case 'refuse_help': {
                // Clean up offers to this agent in legacy system
                 const actorId = agent.entityId;
                 if (world.helpOffers && actorId) {
                    world.helpOffers = listify(world.helpOffers).filter(
                        (o) => o.toId !== actorId
                    );
                 }
                 
                 // Одновременно гасим контекстные OfferAtom для этого агента.
                 const ctx = world.contextEx as ContextSlice | undefined;
                 if (ctx) {
                    ctx.contextAtoms = Object.fromEntries(
                        Object.entries(ctx.contextAtoms).filter(([_, atom]) => {
                            if ((atom as any).kind !== 'offer') return true;
                            const o = atom as OfferAtom;
                            return !(o.offerKind === 'help' && o.targetId === agent.entityId);
                        })
                    );
                 }
                 break;
            }
        }

        switch (intention.id) {
            case 'triage_wounded': {
                if (world.scene) {
                    const s = world.scene.metrics;
                    const care = agent.vector_base?.ARCH_CARE ?? 0.5;
                    const successProb = 0.6 + 0.4 * care;
        
                    if (s.wounded_unsorted > 0 && agent.rngChannels.decide.nextFloat() < successProb) {
                        s.wounded_unsorted = Math.max(0, s.wounded_unsorted - 1);
                        s.wounded_stable += 1;
                        s.discipline = Math.min(100, s.discipline + 3);
                        description = `${agent.title} умело оказывает помощь раненому, стабилизируя его состояние.`;
                    } else {
                        s.timer = Math.max(0, s.timer - 1); // Wasted time
                        s.discipline = Math.max(0, s.discipline - 2);
                        success_val = 0.0;
                        description = `${agent.title} пытается оказать помощь, но из-за небрежности делает только хуже или раненых больше нет.`;
                    }
                }
                break;
            }
            case 'evacuate_wounded': {
                if (world.scene) {
                    const s = world.scene.metrics;
                    const care = agent.vector_base?.ARCH_CARE ?? 0.5;
                    const successProb = 0.5 + 0.5 * care;
        
                    if (s.wounded_stable > 0) {
                        s.wounded_stable = Math.max(0, s.wounded_stable - 1); 
                        if (agent.rngChannels.decide.nextFloat() < successProb) {
                            s.wounded_evacuated += 1;
                            description = `${agent.title} успешно эвакуирует раненого.`;
                        } else {
                            s.wounded_dead += 1;
                            s.discipline = Math.max(0, s.discipline - 5);
                            success_val = 0.0;
                            description = `При попытке эвакуации ${agent.title} совершает ошибку, и раненый погибает!`;
                        }
                        s.timer = Math.max(0, s.timer - 2);
                        s.threat = Math.min(150, s.threat + 5);
                    } else {
                        success_val = 0.0;
                        description = `${agent.title} хочет эвакуировать, но стабильных раненых нет.`;
                    }
                }
                break;
            }
            case 'search_route': { 
                if (world.scene) {
                    const s = world.scene.metrics;
                    const base = 0.15;
                    const bonusFromTime = Math.min(0.25, world.tick * 0.01);
                    const penaltyFromPanic = 0.2 * (s.threat / 100);
                    const scoutBonus = (agent.capabilities?.navigation ?? 0.5) * 0.2;
                    let pFind = base + bonusFromTime - penaltyFromPanic + scoutBonus;
                    
                    if (agent.rngChannels.decide.nextFloat() < (0.05 + s.threat / 500)) {
                        pFind = 0;
                        s.threat = Math.min(world.scenario.metrics.threat.max, s.threat + 2);
                        description = `${agent.title} в ходе разведки натыкается на новую угрозу!`;
                    }

                    if (agent.rngChannels.decide.nextFloat() < pFind) {
                        success_val = 1.0;
                        s.route_known = Math.min(100, s.route_known + 15); // Reduced chunk size for smoother progression
                        description = `${agent.title} успешно находит часть маршрута.`;
                    } else if (success_val > 0) { 
                        success_val = 0.5; 
                        s.route_known = Math.min(100, s.route_known + 2);
                        description = `${agent.title} ищет маршрут, но с небольшим успехом.`;
                    } else {
                        success_val = 0.0;
                    }
                    agent.route_belief = 1 - (1 - (agent.route_belief ?? 0)) * (1 - (pFind * 0.4));
                    agent.route_source = 'self';
                }
                break;
            }
            // --- New Action Logic ---
            case 'broadcast_plan':
                if (world.leadership) {
                    world.leadership.legitimacy = Math.min(1, (world.leadership.legitimacy ?? 0.5) + 0.05);
                    if (world.scene) world.scene.metrics.discipline = Math.min(100, world.scene.metrics.discipline + 5);
                    description = `${agent.title} озвучивает четкий план действий, повышая боевой дух.`;
                }
                break;
            case 'assign_role':
                if (target) {
                    // Heuristic to pick a role if not specified in intention (though generic picker might default to something)
                    // For now, let's assume we assign 'coordinator' or 'medic' based on target's skills
                    let roleToAssign: SceneRoleId = 'free';
                    if ((target.capabilities?.medical_skill ?? 0) > 0.7) roleToAssign = 'medic';
                    else if ((target.capabilities?.command ?? 0) > 0.6) roleToAssign = 'coordinator';
                    else roleToAssign = 'guard';
                    
                    assignRole(world, target.entityId, roleToAssign);
                    description = `${agent.title} назначает ${target.title} на роль ${roleToAssign}.`;
                }
                break;
            case 'claim_role':
                // Agent tries to take a role
                const desiredRole = 'coordinator'; // Simplified default, ideally from intention metadata
                assignRole(world, agent.entityId, desiredRole);
                description = `${agent.title} берет на себя роль ${desiredRole}.`;
                break;
            case 'reassure_group':
                 if (world.scene) world.scene.metrics.discipline = Math.min(100, world.scene.metrics.discipline + 3);
                 description = `${agent.title} успокаивает группу.`;
                 break;
            case 'search_exit_alone':
                 if (world.scene) {
                     // Selfish search finds route but damages cohesion
                     world.scene.metrics.route_known = Math.min(100, world.scene.metrics.route_known + 10);
                     world.scene.metrics.cohesion = Math.max(0, world.scene.metrics.cohesion - 2);
                     agent.route_belief = 1.0; // Personal knowledge
                     description = `${agent.title} ищет выход самостоятельно, игнорируя остальных.`;
                 }
                 break;
            case 'hide':
                 description = `${agent.title} прячется, избегая опасности.`;
                 break;
            case 'delegate_leadership':
                 if (target && world.leadership?.currentLeaderId === agent.entityId) {
                     world.leadership.currentLeaderId = target.entityId;
                     world.leadership.legitimacy = Math.max(0.3, (world.leadership.legitimacy ?? 0.5) - 0.1); 
                     world.leadership.changeCount++;
                     description = `${agent.title} передает полномочия лидера ${target.title}.`;
                     if(agent.flags) agent.flags['leadership_delegated'] = true;
                 }
                 break;
            case 'issue_order': {
                if (target) {
                    const order = createOrderForLeader(agent, intention, world);
                    if (order) {
                        world.orders?.push(order);
                        ordersIssued.push(order);
                        description = `${agent.title} отдает приказ ${target.title}: ${order.summary || order.kind}`;
                    } else {
                         description = `${agent.title} пытается отдать приказ ${target.title}, но не находит слов.`;
                    }
                }
                break;
            }
            case 'acknowledge_order': {
                description = `${agent.title} подтверждает получение приказа.`;
                if(world.leadership) world.leadership.legitimacy = Math.min(1, (world.leadership.legitimacy ?? 0.5) + 0.02);
                break;
            }
            case 'accept_order': {
                 description = `${agent.title} принимает приказ к исполнению.`;
                 break;
            }
            case 'refuse_order': {
                description = `${agent.title} отказывается выполнять приказ!`;
                break;
            }
            case 'sharp_command': {
                if (target) {
                     const order = createOrderForLeader(agent, intention, world);
                     if (order) {
                        world.orders?.push(order);
                        ordersIssued.push(order);
                        description = `${agent.title} жестко приказывает ${target.title}: ${order.summary}`;
                     }
                }
                break;
            }
            case 'humiliate_in_public':
                if (target) {
                    if(world.scene) world.scene.metrics.cohesion = Math.max(0, world.scene.metrics.cohesion - 10);
                    description = `${agent.title} публично унижает ${target.title}, требуя полного повиновения.`;
                }
                break;
            case 'mock_obedience':
                 description = `${agent.title} издевательски подчиняется, подрывая авторитет.`;
                 break;
            case 'hyper_compliance':
                 description = `${agent.title} выполняет приказ с пугающим фанатизмом.`;
                 break;
            case 'freeze_and_disassociate':
                 description = `${agent.title} замирает и выпадает из реальности.`;
                 break;
            case 'snap_at_ally':
                 if (target) {
                      if(world.scene) world.scene.metrics.cohesion = Math.max(0, world.scene.metrics.cohesion - 5);
                      description = `${agent.title} срывается на ${target.title}!`;
                 }
                 break;
            case 'share_information':
                if (target) {
                    if ((agent.route_belief ?? 0) > (target.route_belief ?? 0) + 0.2) {
                        const trust = world.tom[target.entityId]?.[agent.entityId]?.traits.trust ?? 0.5;
                        const lambda_info = 0.2;
                        target.route_belief = (target.route_belief ?? 0) + lambda_info * trust * ((agent.route_belief ?? 0) - (target.route_belief ?? 0));
                        target.route_source = world.leadership?.currentLeaderId === agent.entityId ? 'leader' : 'ally';
                    }
                    // If we didn't hit the specific generateArgs flow above, use generic description
                    if (!intention.args?.factId) {
                        description = `${agent.title} делится информацией с ${target.title}.`;
                    }
                }
                break;
            case 'propose_leadership':
                if(target) {
                    world.leadershipOffers = listify(world.leadershipOffers);
                    world.leadershipOffers.push({ from: agent.entityId, to: target.entityId, tick: world.tick });
                    description = `${agent.title} предлагает лидерство ${target.title}.`;
                    if(world.flags) world.flags['leadership_proposed'] = true;
                }
                break;
            case 'accept_leadership':
                 const offer = listify(world.leadershipOffers).find(o => o.to === agent.entityId);
                 if (offer && world.leadership) {
                    world.leadership.currentLeaderId = agent.entityId;
                    description = `${agent.title} принимает предложение и становится лидером.`;
                    world.leadershipOffers = listify(world.leadershipOffers).filter(o => o.from !== offer.from || o.to !== offer.to);
                    if(world.flags) world.flags['leadership_accepted'] = true;
                 } else {
                     success_val = 0.0;
                     description = `${agent.title} пытается принять лидерство, но предложения не было.`;
                 }
                break;
            case 'support_leader':
                if (world.leadership) {
                    world.leadership.legitimacy = Math.min(1, (world.leadership.legitimacy ?? 0.5) + 0.04);
                    world.leadership.contestLevel = Math.max(0, (world.leadership.contestLevel ?? 0.2) - 0.02);
                    if(world.flags) {
                        world.flags['leader_supported_publicly'] = true;
                        if (agent.entityId === 'character-tegan-nots') {
                            world.flags['tegan_supported'] = true;
                        }
                    }
                }
                break;
            case 'intimidate':
                if (intention.targetId === world.leadership?.currentLeaderId && world.leadership) {
                    world.leadership.legitimacy = Math.max(0, (world.leadership.legitimacy ?? 0.5) - 0.05);
                    world.leadership.contestLevel = Math.min(1, (world.leadership.contestLevel ?? 0.2) + 0.06);
                }
                break;
            case 'challenge_leader':
                if (world.leadership) {
                    world.leadership.contestLevel = Math.min(1, (world.leadership.contestLevel ?? 0.2) + 0.1);
                }
                break;
            case 'refuse_help':
                description = `${agent.title} отказывается от помощи.`;
                break;
            default:
                // Only update description if not already set by special handlers
                if (!description.includes(intention.id)) {
                     description = `${agent.title} выполняет действие ${intention.id}.`;
                }
                break;
        }
        
        updateArchetypeFromAction(agent, actionObject);

        // --- Apply Scene & Body Effects and calculate Deltas ---
        const sceneDelta: Partial<SceneMetrics> = {};
        const bodyDelta: Partial<{ stress: number, fatigue: number, hp: number }> = {};

        if (success_val > 0.5 && world.scene && beforeMetrics) {
            const actionEffect = world.scenario.actionEffects.find(ae => ae.actionId === intention.id);

            if (actionEffect) {
                const INTEGER_COUNT_METRICS: (keyof SceneMetrics)[] = [
                    'wounded_total', 'wounded_unsorted', 'wounded_stable',
                    'wounded_evacuated', 'wounded_dead', 'evac_total', 'evac_done', 'evac_missed',
                ];

                const bonus = actionEffect.roleBonus?.[agent.effectiveRole!];
                const bonusProc = bonus && agent.rngChannels.decide.nextFloat() < bonus;

                if (actionEffect.metricDelta) {
                    for (const key in actionEffect.metricDelta) {
                        const metricKey = key as keyof SceneMetrics;
                        const deltaValue = actionEffect.metricDelta[metricKey];

                        if (typeof deltaValue === 'number') {
                            let delta: number = deltaValue;
                            const isCountMetric = INTEGER_COUNT_METRICS.includes(metricKey);
    
                            if (isCountMetric && bonusProc) {
                                delta *= 2;
                            } else if (!isCountMetric && bonus) {
                                delta *= (1 + bonus);
                            }
    
                            const metricDef = world.scenario.metrics[metricKey];
                            const currentValue = world.scene.metrics[metricKey] as number;
                            let newValue = currentValue + delta;
                            
                            (world.scene.metrics[metricKey] as number) = Math.max(metricDef.min, Math.min(metricDef.max, newValue));
                        } else if (deltaValue !== undefined) {
                            (world.scene.metrics as any)[metricKey] = deltaValue;
                        }
                    }
                }
            }

            if (intention.applyScene) {
                intention.applyScene({ actor: agent, world, target });
            }
            // Calculate final scene delta
            for (const key in world.scene.metrics) {
                const k = key as keyof SceneMetrics;
                if (k === 'evac_started') {
                    if (world.scene.metrics.evac_started !== beforeMetrics.evac_started) {
                        sceneDelta.evac_started = world.scene.metrics.evac_started;
                    }
                } else {
                    const currentValue = world.scene.metrics[k];
                    const beforeValue = beforeMetrics[k];
                    if (typeof currentValue === 'number' && typeof beforeValue === 'number') {
                        const change = currentValue - beforeValue;
                        if (Math.abs(change) > 1e-6) {
                            (sceneDelta as any)[k] = change;
                        }
                    }
                }
            }
        }
        
        // Calculate body delta from costs
        const cost = intention.cost || {};
        if (agent.body?.acute) {
            if (cost.energy) {
                agent.body.acute.fatigue += cost.energy * 10;
            }
        }
        if (cost.injury) {
            agent.hp -= cost.injury * 10;
        }

        // Calculate final body delta
        if(agent.body?.acute) {
            const stressChange = agent.body.acute.stress - beforeBody.stress;
            if (Math.abs(stressChange) > 1e-6) bodyDelta.stress = stressChange;
            
            const fatigueChange = agent.body.acute.fatigue - beforeBody.fatigue;
            if (Math.abs(fatigueChange) > 1e-6) bodyDelta.fatigue = fatigueChange;
        }
        
        const hpChange = agent.hp - beforeHP;
        if (Math.abs(hpChange) > 1e-6) bodyDelta.hp = hpChange;
        
        let sceneDeltaMagnitude = 0;
        for (const value of Object.values(sceneDelta)) {
            if (typeof value === 'number') {
                sceneDeltaMagnitude += Math.abs(value);
            } else if (typeof value === 'boolean' && value) {
                sceneDeltaMagnitude += 1;
            }
        }
        const bodyDeltaMagnitude = Object.values(bodyDelta).reduce((sum, v) => sum + Math.abs(v || 0), 0);
        const totalDelta = sceneDeltaMagnitude + bodyDeltaMagnitude;
        
        if(totalDelta > SIGNIFICANT_CHANGE_THRESHOLD) {
            agent.lastSignificantTick = world.tick;
        }

        const explanation = generateNarrativeLine(agent, actionObject, allGoals);

        return {
            actorId: agent.entityId,
            intention,
            result: success_val > 0.5 ? 'success' : 'failure',
            description,
            explanation,
            success: success_val,
            sceneDelta,
            bodyDelta,
            ordersIssued: ordersIssued.length > 0 ? ordersIssued : undefined
        };
    }
};
