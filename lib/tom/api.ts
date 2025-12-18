
// lib/tom/api.ts
import { WorldState, AgentState, ActionOutcome, CharacterGoalId, SocialActionId } from '../../types';
import { TomState, TomView, TomEmotionVector, TomRoleDistribution, TomGoalBeliefs } from './types';
import { DomainEvent } from '../../types';
import { ContextualGoalScore } from '../context/v2/types';
import { updateTomGoals, GoalObservation } from "./update.goals";
import { updateTomTraits, TraitObservation } from "./update.traits";

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function ensureTom(world: WorldState): TomState {
  if (!(world as any).tom || !(world as any).tom.views) {
    (world as any).tom = { views: {} };
  }
  return (world as any).tom as TomState;
}

export function getTomView(
  world: WorldState,
  observerId: string,
  targetId: string
): TomView | null {
  const tom = (world as any).tom as TomState | undefined;
  if (!tom) return null;
  // Handle both structure types if necessary, but standard is tom[obs][target] in this engine
  // The 'views' structure is from older spec, but the engine uses direct map
  const view = tom[observerId]?.[targetId];
  // Map TomEntry to TomView if needed, or return if compatible
  if (view && (view as any).traits) {
      return {
          observerId,
          targetId,
          emotions: (view as any).affect || { valence: 0, arousal: 0, fear: 0, anger: 0, shame: 0, trust: 0 },
          roles: (view as any).roleProfile?.roles || {},
          goals: {}, // Mapped below
          trust: (view as any).traits.trust,
          respect: (view as any).traits.respect || 0.5,
          alignment: (view as any).traits.align * 2 - 1, // 0..1 -> -1..1
          bond: (view as any).traits.bond || 0,
          dominance: (view as any).traits.dominance || 0,
      } as any; 
  }
  
  // If using the 'views' structure
  if (tom.views) {
      const obsMap = tom.views[observerId];
      return obsMap?.[targetId] ?? null;
  }
  
  return null;
}

export function setTomView(
  world: WorldState,
  view: TomView
): void {
  const tom = ensureTom(world);
  if (!tom.views[view.observerId]) {
    tom.views[view.observerId] = {};
  }
  tom.views[view.observerId][view.targetId] = view;
}

export function patchTomView(
  world: WorldState,
  observerId: string,
  targetId: string,
  patch: {
    emotions?: Partial<TomEmotionVector>;
    roles?: Partial<TomRoleDistribution>;
    goals?: Partial<TomGoalBeliefs>;
    trust?: number;
    respect?: number;
    alignment?: number;
    bond?: number;
    dominance?: number;
  }
): TomView {
  // Try to get existing view or create default
  let existing = getTomView(world, observerId, targetId);
  
  if (!existing) {
     // Create a basic TomView if none exists
     existing = {
        observerId,
        targetId,
        emotions: { valence: 0, arousal: 0, fear: 0, anger: 0, shame: 0, trust: 0.5 },
        roles: {},
        goals: {},
        trust: 0.5,
        respect: 0.5,
        alignment: 0,
        bond: 0.1,
        dominance: 0.5,
     };
  }

  const merged: TomView = {
    ...existing,
    ...patch,
    emotions: { ...existing.emotions, ...(patch.emotions ?? {}) } as TomEmotionVector,
    roles: { ...existing.roles, ...(patch.roles ?? {}) },
    goals: { ...existing.goals, ...(patch.goals ?? {}) },
  };
  
  // Update internal TomState (engine structure)
  const tom = (world as any).tom as TomState;
  if (!tom[observerId]) tom[observerId] = {};
  if (!tom[observerId][targetId]) {
       // Initialize TomEntry if missing
      tom[observerId][targetId] = {
          goals: { goalIds: [], weights: [] },
          traits: { trust: merged.trust, align: (merged.alignment + 1)/2, bond: merged.bond, competence: 0, dominance: merged.dominance, respect: merged.respect ?? 0.5, reliability: 0, obedience: 0, uncertainty: 1, conflict: 0 },
          uncertainty: 1,
          lastUpdatedTick: world.tick,
          lastInteractionTick: world.tick
      };
  }
  
  const entry = tom[observerId][targetId];
  if (patch.trust !== undefined) entry.traits.trust = patch.trust;
  if (patch.respect !== undefined) entry.traits.respect = patch.respect;
  if (patch.alignment !== undefined) entry.traits.align = (patch.alignment + 1) / 2;
  if (patch.bond !== undefined) entry.traits.bond = patch.bond;
  if (patch.dominance !== undefined) entry.traits.dominance = patch.dominance;
  
  // Update goals in entry
  if (patch.goals) {
      // Merge into goals structure
      const gIds = entry.goals.goalIds;
      const weights = entry.goals.weights;
      Object.entries(patch.goals).forEach(([gid, val]) => {
          if (val === undefined) return;
          const idx = gIds.indexOf(gid);
          if (idx >= 0) weights[idx] = val;
          else {
              gIds.push(gid);
              weights.push(val);
          }
      });
  }

  // Also update 'views' structure for API compatibility
  setTomView(world, merged);
  return merged;
}

export function syncSelfAffectToTom(
  world: WorldState,
  agent: AgentState
): void {
  const id = agent.entityId;
  const a = agent.affect;
  if (!a) return;

  // We update "how I view myself" in ToM to match actual affect
  patchTomView(world, id, id, {
    emotions: {
      valence: a.valence,
      arousal: a.arousal,
      fear: a.fear,
      anger: a.anger,
      shame: a.shame,
      trust: a.trustBaseline,
    },
  });
}

export function updateSelfTomFromAffect(
  world: WorldState,
  agent: AgentState
): TomView {
  const id = agent.entityId;
  const affect = (agent as any).affect; 
  if (!affect) {
    return patchTomView(world, id, id, {});
  }

  const emotions: TomEmotionVector = {
    valence: affect.valence ?? 0,
    arousal: affect.arousal ?? 0,
    fear: affect.fear ?? 0,
    anger: affect.anger ?? 0,
    shame: affect.shame ?? 0,
    trust: affect.trustBaseline ?? 0.5,
  };

  return patchTomView(world, id, id, { emotions });
}

export function updateTomFromEvent(
  world: WorldState,
  event: DomainEvent
): void {
  const { actorId, targetId, tags, intensity } = event;
  if (!actorId || !targetId || actorId === targetId) return;

  const w = intensity ?? 0.5;

  if (tags?.includes('harm') || tags?.includes('attack')) {
      const witnesses = event.epistemics?.observers?.map(o => o.actorId) || [];
      for (const obsId of witnesses) {
          if (obsId === actorId) continue;
          const prev = getTomView(world, obsId, actorId);
          const newTrust = prev ? Math.max(0, prev.trust - 0.3 * w) : 0.3;
          
          patchTomView(world, obsId, actorId, {
              trust: newTrust,
              emotions: { anger: 0.7 * w } 
          });
      }
      
      patchTomView(world, actorId, targetId, {
          emotions: { fear: 0.8 * w } 
      });
  }
}

export function diffuseTomToAffect(
  world: WorldState,
  agent: AgentState
): AgentState {
  const id = agent.entityId;
  const tom = (world as any).tom as TomState | undefined;
  // Use views if available or fallback to tom keys
  if (!tom) return agent;
  
  // Need to iterate views where observer is agent? Or where agent is target?
  // "if I am sure everyone hates me" -> iterate views where targetId == agent.id
  
  // However, function signature suggests we look at "my view of the world" or "world view of me"
  // Original implementation looked at tom.views[id] which is "How I see others".
  // If I see others as hostile, I get scared?
  // Or if I see others as vulnerable?
  
  // Let's assume we look at how others see ME (reputation pressure)
  // This requires iterating all agents.
  
  let totalAngerTowardsMe = 0;
  let count = 0;
  
  if (tom.views) {
      Object.values(tom.views).forEach(obsView => {
          const v = obsView[id];
          if (v) {
              totalAngerTowardsMe += v.emotions.anger;
              count++;
          }
      });
  }

  const avgAnger = count > 0 ? totalAngerTowardsMe / count : 0;

  const affect = { ...((agent as any).affect ?? {
    valence: 0,
    arousal: 0.2,
    fear: 0,
    anger: 0,
    shame: 0,
    trustBaseline: 0.5,
  }) };

  if (avgAnger > 0.3) {
      affect.fear = clamp01(affect.fear + avgAnger * 0.2);
  }

  return { ...agent, affect } as AgentState;
}

// --- NEW FUNCTIONS ---

export function getAlignmentWithAgent(
  world: WorldState,
  observerId: string,
  targetId: string
): number {
  const view = getTomView(world, observerId, targetId);
  if (!view) return 0;
  const trust = view.trust ?? 0.5;
  // Alignment -1..1, Trust 0..1
  return Math.max(-1, Math.min(1, view.alignment ?? 0)) * (0.5 + 0.5 * trust);
}

export function getEffectiveRoleForAgent(
  world: WorldState,
  self: AgentState
): TomRoleDistribution {
  const selfId = self.entityId;
  
  // 1. Self Perception (if available)
  const selfView = getTomView(world, selfId, selfId);
  if (selfView && Object.keys(selfView.roles).length > 0) {
      return selfView.roles;
  }
  
  // 2. Fallback: Aggregate peer perception
  const tom = (world as any).tom as TomState;
  if (!tom) return {};

  const rolesAccum: TomRoleDistribution = {};
  let count = 0;

  // Iterate over all observers in tom structure
  Object.keys(tom).forEach(obsId => {
      if (obsId === selfId) return;
      const entry = tom[obsId][selfId];
      if (entry && entry.roleProfile) { // Check if new structure has roleProfile
          const r = entry.roleProfile.roles;
          count++;
          for (const role in r) {
              rolesAccum[role as keyof TomRoleDistribution] = (rolesAccum[role as keyof TomRoleDistribution] ?? 0) + r[role];
          }
      }
      // Check legacy views
      if (tom.views && tom.views[obsId] && tom.views[obsId][selfId]) {
           const v = tom.views[obsId][selfId];
           if (v.roles) {
               count++;
               for (const role in v.roles) {
                   rolesAccum[role as keyof TomRoleDistribution] = (rolesAccum[role as keyof TomRoleDistribution] ?? 0) + (v.roles[role as keyof TomRoleDistribution] ?? 0);
               }
           }
      }
  });

  if (count === 0) return {};
  
  for (const k in rolesAccum) {
      const key = k as keyof TomRoleDistribution;
      rolesAccum[key] = (rolesAccum[key] ?? 0) / count;
  }
  
  return rolesAccum;
}

export function inferGoalFromAction(actionId: string): CharacterGoalId | null {
  if (['attack', 'intimidate', 'confront_leader'].includes(actionId)) return 'contain_enemy';
  if (['triage_wounded', 'evacuate_wounded', 'aid_ally'].includes(actionId)) return 'help_wounded';
  if (['escape', 'retreat', 'hide'].includes(actionId)) return 'protect_self';
  if (['issue_order', 'broadcast_plan'].includes(actionId)) return 'maintain_order';
  if (['support_leader', 'follow_order'].includes(actionId)) return 'support_leader';
  return null;
}

export function updateTomFromAction(
  world: WorldState,
  observerId: string,
  outcome: ActionOutcome
): void {
  const targetId = outcome.actorId;
  if (observerId === targetId) return;

  const actionId = outcome.intention?.id;
  if (!actionId) return;

  const inferredGoal = inferGoalFromAction(actionId); 
  
  if (inferredGoal) {
      // Use standard updater
       const tomState = (world as any).tom;
       const goalObs: GoalObservation = {
           observerId,
           targetId,
           actionId: actionId as SocialActionId,
           success: outcome.success,
           world
       };
       updateTomGoals(tomState, goalObs);
       
       // Also patch view directly to ensure sync
       const prev = getTomView(world, observerId, targetId);
       const prevProb = prev?.goals?.[inferredGoal] ?? 0;
       const newProb = clamp01(prevProb + 0.1 * outcome.success);
       
       patchTomView(world, observerId, targetId, {
           goals: { [inferredGoal]: newProb }
       });
  }
}

export function updateTomFromContextGoals(
  world: WorldState,
  actorId: string,
  scores: ContextualGoalScore[]
): void {
  if (!scores.length) return;
  const topGoalId = scores[0].goalId;

  // Update all observers in same location
  const actor = world.agents.find(a => a.entityId === actorId);
  if (!actor) return;
  
  const observers = world.agents.filter(a => 
      a.entityId !== actorId && 
      ((a as any).locationId === (actor as any).locationId || !(actor as any).locationId)
  );

  for (const obs of observers) {
      const obsId = obs.entityId;
      
      // 1. Update Goal Belief
      const prev = getTomView(world, obsId, actorId);
      const prevProb = prev?.goals?.[topGoalId] ?? 0;
      const newProb = clamp01(prevProb + 0.15); // Strong evidence
      
      // 2. Update Alignment/Trust based on goal compatibility
      // Get observer's own top goal
      // In a result loop we'd use their calculated scores. Here we assume we can access them or use drivingGoalId
      const obsGoal = obs.drivingGoalId;
      const aligned = obsGoal === topGoalId; 
      
      const oldAlign = prev?.alignment ?? 0;
      const oldTrust = prev?.trust ?? 0.5;
      
      const newAlign = Math.max(-1, Math.min(1, oldAlign + (aligned ? 0.1 : -0.05)));
      const newTrust = clamp01(oldTrust + (aligned ? 0.05 : -0.02));

      patchTomView(world, obsId, actorId, {
          goals: { [topGoalId]: newProb },
          alignment: newAlign,
          trust: newTrust
      });
  }
}
