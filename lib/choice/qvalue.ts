
import { AgentState, Action, QBreakdown, WorldState, CharacterGoalId, SocialActionId, AgentGoalState } from '../../types';
import { getTomView } from '../tom/view';
import { computeCost } from './cost';
import { system1Weight } from '../psych/system1';
import { EffectiveBehaviorProfile } from '../archetypes/behavior';
import { Q_WEIGHTS, Q_LIMITS } from '../social/tuning';
import { clamp } from '../util/math';
import { computeSelfGap } from '../archetypes/system';
import { computeGoalContribution } from '../goals/scoring';
import { computeOrderInfluence } from '../social/orders';
import { adjustForGroupAlignment } from '../social/group';
import { computeArchetypeEffects } from '../archetypes/effects';
import { getMassFieldForAgentMulti } from '../mass/context_multi';
import { getAgentRole, ACTIONS_FOR_ROLE } from '../social/role_mechanics';
import { goalUtility } from '../context/engine'; 

function normalizeComponent(raw: number, [min, max]: [number, number]): number {
  return clamp(raw, min, max);
}

function weightedQ(components: any): { total: number, weighted: any } {
  const goals = normalizeComponent(components.fromGoals, Q_LIMITS.goals) * Q_WEIGHTS.goals;
  const scenario = normalizeComponent(components.fromScenario, Q_LIMITS.scenario) * Q_WEIGHTS.scenario;
  const relations = normalizeComponent(components.fromRelations, Q_LIMITS.relations) * Q_WEIGHTS.relations;
  // Procedure and Faction weights retained but their inputs will be minimized
  const procedure = normalizeComponent(components.fromProcedure, Q_LIMITS.procedure) * Q_WEIGHTS.procedure;
  const faction = normalizeComponent(components.fromFaction, Q_LIMITS.faction) * Q_WEIGHTS.faction;
  const risk = normalizeComponent(components.fromRisk, Q_LIMITS.risk) * Q_WEIGHTS.risk;
  
  const psych = components.fromPsych || 0;
  const archetype = components.fromArchetype || 0;
  const role = components.fromRole || 0; 

  const total = goals + scenario + relations + procedure + faction + risk + psych + archetype + role - components.cost - components.repetitionPenalty - components.stagnationPenalty;
  
  return { 
      total, 
      weighted: { goals, scenario, relations, procedure, faction, risk, psych, archetype, role }
  };
}

function computeRelationsInfluenceWithTom(
  agent: AgentState,
  targetId: string | undefined,
  world: WorldState
): number {
  if (!targetId) return 0;
  
  const tv = getTomView(world, agent.entityId, targetId);
  const tomV2 = agent.tomV2Metrics;
  
  const trust = tv.trust; 
  const respect = tv.dominance > 0 ? tv.dominance : 0; 
  const conflict = tv.conflict; 
  const bond = tv.bond;
  const fear = tv.dominance < 0 ? -tv.dominance : 0; 
  
  const coalition = tomV2?.coalition_cohesion ?? 0.5;
  const normConflict = tomV2?.norm_conflict ?? 0.0;
  
  const betrayalRisk = (tomV2?.decep_incentive ?? 0) * (1 - (tomV2?.detect_power ?? 0.5));

  let boost = 0;
  boost += 0.5 * trust;
  boost += 0.3 * respect;
  boost += 0.3 * bond;
  boost += 0.4 * coalition;
  boost -= 0.4 * conflict;
  boost -= 0.3 * fear;
  boost -= 0.7 * betrayalRisk;
  boost -= 0.5 * normConflict;

  return boost;
}

function computeRelationalUtility(agent: AgentState, action: Action, world: WorldState): number {
    if (!action.targetId) return 0;
    const relScore = computeRelationsInfluenceWithTom(agent, action.targetId, world);
    const actionId = action.id;
    
    // Actions that build/use relationship capital
    if (['reassure', 'support_leader', 'aid_ally', 'share_information', 'share_personal_belief', 'follow_order', 'acknowledge_order', 'propose_leadership', 'assign_role'].includes(actionId)) {
        return relScore; 
    }
    // Actions that damage relationship
    if (['attack', 'intimidate', 'blame_other', 'sow_dissent', 'gossip', 'refuse_order', 'challenge_leader', 'humiliate_in_public'].includes(actionId)) {
        return -relScore; 
    }
    return 0;
}

function adjustRefuseOrderWithTom(agent: AgentState, world: WorldState, baseQ: number): number {
  const leaderId = world.leadership.currentLeaderId;
  if (!leaderId || leaderId === agent.entityId) return baseQ;
  const tv = getTomView(world, agent.entityId, leaderId);
  const tomV2 = agent.tomV2Metrics;
  const legitimacy = world.leadership.legitimacy ?? 0.5;
  const leaderBetrayalRisk = (1 - tv.trust) * tv.conflict; 
  const normConflict = tomV2?.norm_conflict ?? 0.0;
  let q = baseQ;
  q += 0.8 * leaderBetrayalRisk;
  q += 0.6 * normConflict;
  q -= 0.7 * legitimacy;
  return q;
}

function computeDynamicScenarioUtility(agent: AgentState, action: Action, world: WorldState): number {
  if (!world.scene || !world.scene.metrics) return 0;
  const s = world.scene.metrics;
  const actionId = action.id;
  let u = 0;
  
  // Reduced scenario utility. Focus on enabling actions rather than direct rewards.
  // Goals like 'c_preserve_group_safety' should handle the motivation.
  
  // Physical constraints still apply here (physics of the world)
  if (actionId === 'triage_wounded' && s.wounded_unsorted <= 0) u -= 2.0;
  if (actionId === 'evacuate_wounded' && s.wounded_stable <= 0) u -= 2.0;
  
  if (actionId === 'search_route') {
    // Diminishing returns on search
    if (s.route_known >= 100) u -= 1.0;
  }
  
  return u;
}

// Deprecated in favor of c_maintain_order / c_obey_legit_auth goals
function computeProceduralUtility(agent: AgentState, action: Action): number {
    return 0; 
}

// Deprecated in favor of c_support_leader / c_increase_status
function computeLeaderUtility(agent: AgentState, action: Action, world: WorldState): number {
    return 0;
}

function computeRepetitionPenalty(agent: AgentState, action: Action): number {
  if (!agent.actionHistory || agent.actionHistory.length === 0) return 0;
  const K = 5; 
  const recentHistory = agent.actionHistory.slice(-K);
  const freq = recentHistory.filter(h => h.id === action.id && h.targetId === action.targetId).length;
  return (freq / K) * 1.0; 
}

function computeStagnationPenalty(world: WorldState, agent: AgentState, action: Action): number {
  const dt = world.tick - (agent.lastSignificantTick ?? 0);
  if (dt < 5) return 0;
  if (["observe", "wait"].includes(action.id)) return 0.5;
  return 0;
}

function computeRiskUtility(agent: AgentState, action: Action, effProfile?: EffectiveBehaviorProfile): number {
    const riskAttitude = effProfile?.riskAttitude ?? 0; 
    if (Math.abs(riskAttitude) < 0.05) return 0;
    let variance = 0;
    if (action.tags?.includes('risk')) variance = 1.0;
    return riskAttitude * variance;
}

function computePsychUtility(agent: AgentState, action: Action): number {
    if (agent.actionProfile && agent.actionProfile.discouraged.has(action.id)) {
        return -0.5;
    }

    if (!agent.psych) return 0;
    const { coping, activeGoalModifiers } = agent.psych;
    const selfGap = agent.psych.selfGap ?? computeSelfGap(agent);
    let q = 0;
    const tags = action.tags || [];
    if (activeGoalModifiers) {
        if (tags.includes("hierarchy") && activeGoalModifiers.preserve_system) q += activeGoalModifiers.preserve_system * 0.5;
        if (tags.includes("care") && activeGoalModifiers.protect_others) q += activeGoalModifiers.protect_others * 0.5;
        if (tags.includes("self-preservation") && activeGoalModifiers.self_preservation) q += activeGoalModifiers.self_preservation * 0.5;
    }
    if (tags.includes("risk")) q += 0.4 * selfGap * coping.selfHarm;
    if (tags.includes("conflict")) q -= 0.5 * coping.avoid;
    if (tags.includes("hierarchy")) q += 0.5 * coping.hyperControl;
    if (tags.includes("care")) q += 0.4 * coping.helper;
    if (tags.includes("force")) q += 0.5 * coping.aggression;
    return q;
}

function computeMoodModifier(agent: AgentState, action: Action): number {
    let mode: 'cautious' | 'normal' | 'desperate' = 'normal';
    if (agent.prMonstro && agent.prMonstro > 0.8 || agent.archetype?.phase === 'break') {
        mode = 'desperate';
    } else if (agent.tomMetrics && agent.tomMetrics.toM_Unc > 0.6 && agent.tomMetrics.toM_Quality < 0.3) {
        mode = 'cautious';
    }
    let mod = 0;
    const isRisky = action.tags?.includes('risk');
    const isRadical = action.id === 'attack' || action.id === 'refuse_order' || action.id === 'challenge_leader';
    if (mode === 'cautious') {
        if (isRisky) mod -= 0.3;
        if (action.id === 'observe' || action.id === 'wait') mod += 0.2;
    }
    if (mode === 'desperate') {
        if (isRadical) mod += 0.4;
        if (action.id === 'wait') mod -= 0.3;
    }
    return mod;
}

function computeCategoryUtility(agent: AgentState, action: Action, effProfile?: EffectiveBehaviorProfile): number {
    let u = 0;
    const cat = action.category;
    
    if (cat === 'aggression') {
        if (effProfile?.normPenaltyScale.harm && effProfile.normPenaltyScale.harm < 0.8) {
            u += 0.3; 
        }
    }
    if (cat === 'withdrawal') {
         if ((agent.body?.acute?.stress ?? 0) > 70 || (agent.psych?.coping?.avoid ?? 0) > 0.6) {
             u += 0.5;
         }
    }
    if (cat === 'self_harm') {
         if ((agent.psych?.coping?.selfHarm ?? 0) > 0.5) {
             u += 0.6;
         }
    }
    
    return u;
}

function computeRoleFitUtility(agent: AgentState, action: Action, world: WorldState): number {
    const role = getAgentRole(agent, world);
    const allowedActions = ACTIONS_FOR_ROLE[role] ?? [];
    
    let u = 0;
    if (allowedActions.includes(action.id as SocialActionId)) {
        u += 0.8; // Bonus for doing your job
    }
    
    // Penalty for doing someone else's specialized job if you are not free
    if (role !== 'leader' && role !== 'free' && role !== 'incident_leader') {
        if (action.id === 'triage_wounded' && role !== 'medic' && role !== 'stabilizer_guard') u -= 0.5;
        if (action.id === 'issue_order') u -= 0.5;
    }
    
    return u;
}

function computeSaturationPenalty(agent: AgentState, action: Action, world: WorldState): number {
    if (!action.satisfies) return 0;
    const { prop } = action.satisfies;
    const fact = world.contextEx?.contextAtoms[prop];
    
    if (fact && fact.confidence > 0.5) {
        return 2.0; 
    }
    return 0;
}


export function topGoalFromContribs(contribs: Record<string, number>): string {
  let bestKey: string | undefined = undefined;
  let bestVal = -Infinity;
  if (!contribs) return 'protect_self';
  for (const [k, v] of Object.entries(contribs) as [string, number][]) {
    if (v > bestVal) { bestVal = v; bestKey = k; }
  }
  return bestKey || (Object.keys(contribs)[0] as string) || 'protect_self';
}


export function computeQ(
  world: WorldState,
  agent: AgentState,
  action: Action,
  effProfile?: EffectiveBehaviorProfile
): QBreakdown & { goalContribs: Record<string, number> } {
    
  // 1. COMPUTE GOAL INFLUENCE
  // Priority: agent.contextGoals (Personalized) > agent.goalEcology (Generic)
  let qFromGoals = 0;
  let goalContribs: Record<string, number> = {};

  if (agent.contextGoals && agent.contextGoals.length > 0) {
      // Use Context Layer Goals
      for (const g of agent.contextGoals) {
          // Type guard or duck typing to check which goal structure we have
          // ContextGoal has 'goalId' not 'id' in legacy logic, but 'id' in new types.
          // AgentState.contextGoals is typed as (ContextGoal | AgentGoalState)[].
          
          let goalId: string;
          let priority: number;
          
          if ('id' in g) {
             // ContextGoal structure
             goalId = g.id;
             priority = g.score;
          } else {
             // AgentGoalState structure
             goalId = g.goalId;
             priority = g.basePriority;
          }
          
          const impact = action.goalImpact?.[goalId] ?? 0;
          if (impact > 0) {
              const s = priority * impact;
              qFromGoals += s;
              goalContribs[goalId] = s;
          }
      }
  } else {
      // Fallback to Legacy Goal Ecology which now uses V4 Engine
      const legacy = computeGoalContribution(agent, world, action.id as SocialActionId);
      qFromGoals = legacy.qFromGoals;
      goalContribs = legacy.goalContribs;
  }
  
  const fromGoals = qFromGoals;

  // 2. COMPUTE SCENARIO UTILITY
  // Only structural/phase utility, not behavioral guidance
  let sPart = 0;
  if (world.scenarioProcedures && world.scenarioProcedures[agent.entityId]) {
      sPart += world.scenarioProcedures[agent.entityId][action.id] ?? 0;
  }
  if (world.scenario && world.scene?.currentPhaseId) {
      const priors = world.scenario.phasePriorities?.[world.scene.currentPhaseId] ?? [];
      if (priors.includes(action.id as SocialActionId)) sPart += 1.5;
  }
  sPart += computeDynamicScenarioUtility(agent, action, world);

  // 3. RELATIONAL UTILITY
  const rPart = computeRelationalUtility(agent, action, world);
  
  // 4. PROCEDURAL UTILITY (Deprecated/Removed)
  let pPart = computeProceduralUtility(agent, action); 
  // Order influence now comes partly from goal (c_obey) and partly from structure
  const { qFromProcedure: orderBoost } = computeOrderInfluence(world, agent, action.id);
  pPart += orderBoost; // Keeping order boost as it is structural
  
  if (action.id === 'refuse_order' || action.id === 'silent_noncompliance') {
      // Adjust resistance cost based on fear/power, not just blind obedience
      pPart = adjustRefuseOrderWithTom(agent, world, pPart);
  }

  const fPart = 0; // Faction Utility removed
  const lPart = computeLeaderUtility(agent, action, world); // Effectively 0
  const riskPart = computeRiskUtility(agent, action, effProfile);
  const moodPart = computeMoodModifier(agent, action);
  const psychPart = computePsychUtility(agent, action); 
  const categoryPart = computeCategoryUtility(agent, action, effProfile);
  
  // Role Fit (Structural)
  const rolePart = computeRoleFitUtility(agent, action, world);
  
  const cPart = computeCost(agent, action, world);
  const repetitionPenalty = computeRepetitionPenalty(agent, action);
  const stagnationPenalty = computeStagnationPenalty(world, agent, action);
  
  const saturationPenalty = computeSaturationPenalty(agent, action, world);

  // Archetype Action Bias
  const archEffects = computeArchetypeEffects(agent);
  let fromArchetype = 0;
  const tags = action.tags || [];
  
  for (const [tag, bias] of Object.entries(archEffects.actionBiases)) {
      if (tags.includes(tag) || action.id === tag) {
          fromArchetype += bias;
      }
  }
  if (archEffects.preferredTags && archEffects.preferredTags.length > 0) {
      if (tags.some(t => archEffects.preferredTags.includes(t))) {
          fromArchetype += 0.8;
      }
  }
  if (archEffects.avoidedTags && archEffects.avoidedTags.length > 0) {
      if (tags.some(t => archEffects.avoidedTags.includes(t))) {
          fromArchetype -= 0.8;
      }
  }

  const tension = agent.archetypeTension ?? 0;
  if (tension > 0.7 && agent.archetype?.shadowId) {
      if (tags.includes('risk') || tags.includes('conflict') || tags.includes('self')) {
          fromArchetype += 0.6; 
      }
  }
  if (effProfile) {
      const pref = effProfile.socialActionPreference[action.id as SocialActionId] ?? 1.0;
      fromArchetype += (pref - 1.0) * 0.5;
  }
  
  fromArchetype += categoryPart;

  const components = {
      fromGoals,
      fromScenario: sPart,
      fromRelations: rPart,
      fromProcedure: pPart,
      fromFaction: fPart,
      fromRisk: riskPart + lPart + moodPart,
      fromPsych: psychPart,
      fromArchetype,
      fromRole: rolePart,
      cost: cPart,
      repetitionPenalty: repetitionPenalty + saturationPenalty,
      stagnationPenalty
  };

  let { total: qTotal, weighted } = weightedQ(components);
  qTotal += fromArchetype; 
  qTotal += rolePart; 

  qTotal = adjustForGroupAlignment(agent, world, action.id as SocialActionId, qTotal);

  // === INTEGRATE MASS LAYER FIELD ===
  const baseStress = agent.body?.acute?.stress ?? 0;
  let unitStress = baseStress / 100;

  const massField = getMassFieldForAgentMulti(agent, world);
  
  if (massField) {
    const combined = unitStress + 0.4 * massField.E_field - 0.2 * massField.I_field;
    unitStress = clamp(combined, 0, 1);
  }
  
  const alpha = system1Weight(unitStress);
  const blendedQ = (1 - alpha) * qTotal + alpha * (fromArchetype * 2.0 + qTotal); 

  return { 
      total: blendedQ, 
      fromGoals, 
      fromScenario: sPart, 
      fromRelations: rPart, 
      fromProcedure: pPart, 
      fromFaction: fPart, 
      fromLeader: lPart, 
      fromArchetype, 
      fromRole: rolePart,
      fromRisk: riskPart + moodPart, 
      fromPsych: psychPart,
      cost: cPart, 
      repetitionPenalty: repetitionPenalty + saturationPenalty, 
      stagnationPenalty, 
      alpha, 
      goalContribs: goalContribs || {}, 
      weighted 
  };
}
