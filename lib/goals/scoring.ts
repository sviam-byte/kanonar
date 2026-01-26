

import { AgentState, WorldState, GoalState, GoalEcology, CharacterGoalId, SocialActionId } from '../../types';
import { GOAL_DEFS, actionGoalMap } from './space';
import { computeGoalPriorities } from '../goal-planning';
import { sampleGumbel } from '../core/noise';
import { getPlanningGoals } from './adapter';
import { computeConcreteGoals } from '../life-goals/v4-engine';
import { makeZeroGoalLogits } from '../life-goals/psych-to-goals';
import { GOAL_AXES } from '../life-goals/v3-params';

// Helper to estimate effect profile based on domain
function estimateGoalEffectProfile(domain: string): { stress?: number, fatigue?: number } {
    if (!domain) return {};
    // Defensive check to ensure domain is a string
    const d = String(domain).toUpperCase();
    switch(d) {
        case 'REST': return { stress: -2.0, fatigue: -1.0 };
        case 'COMBAT': return { stress: 1.5, fatigue: 1.0 };
        case 'WORK': return { stress: 0.5, fatigue: 0.5 };
        case 'CARE': return { stress: -0.2, fatigue: 0.2 };
        case 'ESCAPE': return { stress: 2.0, fatigue: 2.0 };
        case 'AFFECT': return { stress: -0.5 };
        case 'BODY': return { fatigue: -0.5 };
        // New V3/V4 Domains
        case 'SURVIVAL': return { stress: 1.0, fatigue: 0.5 };
        case 'CONTROL': return { stress: 0.5, fatigue: 0.8 };
        case 'STATUS': return { stress: 0.3, fatigue: 0.2 };
        case 'INFORMATION': return { stress: 0.1, fatigue: 0.3 };
        case 'OBEDIENCE': return { stress: 0.2, fatigue: 0.1 };
        default: return {};
    }
}

// Helper to preserve state
function updateGoalSatisfaction(goal: GoalState, agent: AgentState, world: WorldState) {
    if (goal.id === 'help_wounded' && world.scene?.metrics) {
        const m = world.scene.metrics;
        if (m.wounded_total > 0) {
             goal.satisfaction = (m.wounded_stable + m.wounded_evacuated) / m.wounded_total;
        }
    }
}

// NEW: Assign specific targets to goals based on context, oaths, and relations
function assignGoalTargets(goal: GoalState, agent: AgentState, world: WorldState) {
    // 1. Targeted Oaths override all
    const oath = agent.identity.oaths?.find(o => {
        // Simple heuristic mapping from goal ID to oath key semantics
        if (goal.id === 'serve_authority' && (o.key === 'serve_lord' || o.key === 'serve_system')) return true;
        if (goal.id === 'protect_other' && o.key === 'protect_kin') return true;
        if (goal.id === 'follow_order' && o.key === 'serve_lord') return true;
        return false;
    });
    
    if (oath && oath.targetId) {
        (goal as any).targetId = oath.targetId;
        return;
    }
    
    // 2. Relational Heuristics
    if (goal.id === 'protect_other' || goal.id === 'maintain_bonds' || goal.id.startsWith('c_protect')) {
        // Find highest bond
        let bestId = '';
        let maxBond = 0;
        for(const other of world.agents) {
            if (other.entityId === agent.entityId) continue;
            const rel = agent.relationships?.[other.entityId];
            if (rel && rel.bond > maxBond) {
                maxBond = rel.bond;
                bestId = other.entityId;
            }
        }
        if (bestId) (goal as any).targetId = bestId;
    }
    
    if (goal.id === 'serve_authority' || goal.id === 'follow_leader' || goal.id.startsWith('c_obey')) {
        const leaderId = world.leadership.currentLeaderId;
        if (leaderId && leaderId !== agent.entityId) {
            (goal as any).targetId = leaderId;
        }
    }
}


export function updateGoalEcology(agent: AgentState, world: WorldState): void {
  
  // 1. Check if we have Life Goal Debug info (logits) to run V4 engine
  const lifeGoalDebug = agent.goalEcology?.lifeGoalDebug;
  
  let newGoalStates: GoalState[] = [];
  let ecologyDebug = lifeGoalDebug;

  // --- V4 ENGINE PATH ---
  // If we have logits, we can compute concrete goals on the fly. 
  // If not, we might need to compute them or fallback to V3.
  // For robustness in simulation loops where lifeGoalDebug might be missing initially,
  // we should probably rely on `computeGoalPriorities` to get the V3 logits first if needed.
  
  // Run V3 to get logits if missing
  const { priorities, activations, debug, lifeGoalDebug: newLifeGoalDebug } = computeGoalPriorities(agent, getPlanningGoals(), world, { skipBioShift: true });
  
  if (!ecologyDebug) {
      ecologyDebug = newLifeGoalDebug;
  }
  
  if (ecologyDebug) {
      // Reconstruct z_total from debug components
      const z_total = makeZeroGoalLogits();
      const { g_traits, g_bio, g_psych, g_distortion, weights } = ecologyDebug;
      
      for (const axis of GOAL_AXES) {
          z_total[axis] = 
              weights.wT * (g_traits[axis] || 0) + 
              weights.wB * (g_bio[axis] || 0) + 
              weights.wP * ((g_psych[axis] || 0) + (g_distortion?.[axis] || 0));
      }
      
      const tuning = (agent as any).goalTuning || (world as any)?.scene?.goalTuning || (world as any)?.goalTuning;
      const concreteGoals = computeConcreteGoals(agent, z_total, world, [], undefined, undefined, tuning);
      
      newGoalStates = concreteGoals.map(cg => ({
          id: cg.id as CharacterGoalId,
          layer: cg.layer,
          name: cg.label,
          // Use total logit as 'base' to show the pre-softmax strength in UI
          base: cg.logit, 
          dynamic: cg.score,
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
          effect_profile: estimateGoalEffectProfile(cg.domain), // Add effect profile
          targetId: cg.targetId,
          // Pass formula through via extended type handling in UI if needed, or attach to object
          // Ideally we should update GoalState type but for now we rely on attachment in ecology debug
      }));
      
      // Attach concrete goals to debug for UI to access advanced fields (breakdown, formula)
      if (ecologyDebug) {
          (ecologyDebug as any).concreteGoals = concreteGoals;
      }
      
  } else {
      // --- LEGACY FALLBACK ---
      const maxActivation = Math.max(...activations, 1e-6);
      newGoalStates = getPlanningGoals().map((pg, idx) => {
          const priority = priorities[idx];
          const activation = activations[idx];
          const relativeMagnitude = Math.min(1, activation / maxActivation);
          const def = GOAL_DEFS[pg.id as CharacterGoalId];
          const domain = pg.domains[0]?.domain || 'other';
          
          return {
              id: pg.id as CharacterGoalId,
              layer: 'mission',
              name: def?.label_ru || pg.label,
              base: debug.b_ctx[idx] || 0,
              dynamic: relativeMagnitude, 
              tension: 0,
              frustration: 0,
              sacred: false,
              blocked: false,
              priority: priority,
              weight: relativeMagnitude, 
              activation_score: activation, // Added
              deonticFit: 1, // Added
              conflictingGoalIds: [], // Added
              domain: domain,
              origin: 'legacy',
              is_active: false,
              satisfaction: 0.5,
              effect_profile: estimateGoalEffectProfile(domain) // Add effect profile
          };
      });
  }

  // Update Satisfaction & Targets for all goals (both paths)
  for(const state of newGoalStates) {
      // Try to find existing state to preserve tension/frustration
      const prev = agent.goalEcology?.execute.find(g => g.id === state.id) 
                || agent.goalEcology?.latent.find(g => g.id === state.id);
      
      if (prev) {
          state.tension = prev.tension;
          state.frustration = prev.frustration;
          state.satisfaction = prev.satisfaction;
      }

      updateGoalSatisfaction(state, agent, world);
      assignGoalTargets(state, agent, world);
      
      if (agent.drivingGoalId === state.id) {
          state.tension = Math.max(0, state.tension - 0.1);
      } else {
          state.tension = Math.min(1, state.tension + 0.02);
      }
  }

  // 4. Sort and Distribute by Priority using Gumbel-Max (stochastic, but deterministic per seed)
  // Temperature comes from world; lower = more robotic, higher = more chaotic.
  const T = typeof (world as any).decisionTemperature === 'number' ? (world as any).decisionTemperature : 1.0;
  const STICKINESS_BONUS = 0.2;

  for (const st of newGoalStates) {
      const sticky = agent.drivingGoalId === st.id ? STICKINESS_BONUS : 0;
      const rng = (agent as any).rngChannels?.decide;
      const noise = rng ? sampleGumbel(T, rng) : 0;
      st.stochasticPriority = st.priority + sticky + noise;
  }

  newGoalStates.sort((a, b) => (b.stochasticPriority ?? b.priority) - (a.stochasticPriority ?? a.priority));
  
  const execute = newGoalStates.slice(0, 5).map(g => ({ ...g, is_active: true }));
  const latent = newGoalStates.slice(5).map(g => ({ ...g, is_active: false }));

  agent.goalEcology = {
      execute: execute as any,
      latent,
      queue: latent,
      drop: [],
      tension: 0, 
      frustration: 0,
      conflictMatrix: {},
      groupGoals: [],
      lifeGoalDebug: ecologyDebug // ATTACH DEBUG INFO HERE
  };
  
  // Sync legacy fields for other systems
  agent.goalIds = execute.map(g => g.id);
  agent.w_eff = execute.map(g => g.stochasticPriority ?? g.priority);
}

export function computeGoalContribution(
  agent: AgentState,
  world: WorldState,
  actionId: string
): { qFromGoals: number; perGoal: any[]; topGoalId?: CharacterGoalId; goalContribs: Record<string, number> } {
    
    let qFromGoals = 0;
    const goalContribs: Record<string, number> = {};
    const perGoal: any[] = [];

    if (agent.goalEcology) {
        const activeGoals = agent.goalEcology.execute;
        
        // Check legacy mapping first
        const links = actionGoalMap[actionId as SocialActionId] ?? [];
        
        for (const goal of activeGoals) {
            let match = 0;
            
            // 1. Legacy Link
            const link = links.find(l => l.goalId === goal.id);
            if (link) match = link.match;
            
            // 2. Domain/Tag heuristic for V4 (fallback)
            if (!link) {
                 // This assumes 'actionId' has a definition with tags in socialActions.
                 // We don't have easy access to action def here without importing socialActions, 
                 // but we can rely on actionGoalMap being exhaustive for now.
            }

            if (match > 0) {
                 const score = goal.priority * match;
                 qFromGoals += score;
                 goalContribs[goal.id] = score;
                 perGoal.push({ goalId: goal.id, score });
            }
        }
    }
    
    perGoal.sort((a, b) => b.score - a.score);
    
    return {
        qFromGoals,
        perGoal,
        topGoalId: perGoal[0]?.goalId,
        goalContribs
    };
}
