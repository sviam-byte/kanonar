
import {
  AgentState,
  WorldState,
  CharacterGoalId,
  GoalAxisId,
  GoalEcology,
  GoalState,
  AffectState,
  AgentContextFrame
} from '../../types';
import {
  ContextSnapshot,
  ContextualGoalScore,
  ContextualGoalContribution,
} from './types';
import { GOAL_DEFS } from '../../goals/space';
import { safeNumber } from './math-utils';
import { GOAL_AXES } from '../../life-goals/v3-params';
import { computeTraitLogits } from '../../life-goals/life-from-traits';
import { computeConcreteGoals } from '../../life-goals/v4-engine';
import { makeZeroGoalLogits } from '../../life-goals/psych-to-goals';
import { computeBioLogitsV3 } from '../../life-goals/life-from-biography';
import { buildGoalEvidence } from '../../goals/evidence';
import { readPreGoal01 } from '../../goals/preGoals';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

// Helper to map domains for legacy compatibility
function mapDomainsToGoalLogits(
  domains: Record<string, number>
): Record<GoalAxisId, number> {
  const logits: Record<GoalAxisId, number> = {} as any;
  for (const axis of GOAL_AXES as GoalAxisId[]) {
    logits[axis] = safeNumber(domains[axis] ?? 0);
  }
  return logits;
}

/**
 * UNIFIED SCORING FUNCTION
 * This now delegates the heavy lifting to the V4 Engine (computeConcreteGoals),
 * ensuring that all goal logic is defined in `v4-params.ts` and not duplicated here.
 */
export function scoreContextualGoals(
  agent: AgentState,
  world: WorldState,
  ctx: ContextSnapshot,
  affectOverride?: AffectState,
  frame?: AgentContextFrame
): ContextualGoalScore[] {
  
  // 1. Prepare Inputs for V4 Engine
  
  // A. Trait Logits (Nature)
  const traitLogits = computeTraitLogits(agent.vector_base || {});
  
  // B. Bio Logits (Nurture) - calculated via psych state helper or directly
  const bioLogits = agent.psych ? computeBioLogitsV3(agent.psych) : makeZeroGoalLogits();
  
  // C. Domain Logits (Context)
  // We map the V2 domains (calculated from atoms) into V4 Pre-Goal Logits
  const contextLogits = mapDomainsToGoalLogits(ctx.domains);

  // Combine Logits: Traits + Bio + Context
  const combinedLogits = makeZeroGoalLogits();
  for (const axis of GOAL_AXES) {
      combinedLogits[axis] = 
          (traitLogits[axis] || 0) + 
          (bioLogits[axis] || 0) + 
          (contextLogits[axis] || 0) * 0.5; // Context bias
  }

  // 2. Run V4 Engine
  // We pass the atoms directly so V4 can do fine-grained targeting
  const concreteGoals = computeConcreteGoals(
      agent,
      combinedLogits,
      world,
      [], // nearbyActors (handled via world or atoms)
      frame,
      ctx.atoms
  );

  // 3. Map V4 Results back to V2 ContextualGoalScore for UI compatibility
  const scores: ContextualGoalScore[] = concreteGoals.map(cg => {
      // Map V4 breakdown to V2 contributions
      const contributions: ContextualGoalContribution[] = cg.breakdown.map(bd => ({
          source: bd.category === 'Base' ? 'life' : 'derived',
          value: bd.contribution,
          explanation: `${bd.category}: ${bd.key}`,
          atomLabel: bd.key,
          formula: `${bd.weight.toFixed(1)} * ${bd.agentValue.toFixed(2)}`
      }));

      // Add a summary contribution for the base logit if not present
      if (contributions.length === 0) {
          contributions.push({
              source: 'life',
              value: cg.logit,
              explanation: 'Base Probability'
          });
      }

      return {
          goalId: cg.defId as CharacterGoalId, // Map back to generic ID or keep specific
          targetAgentId: cg.targetId,
          totalLogit: cg.logit,
          probability: cg.score,
          domain: cg.domain,
          contributions: contributions
      };
  });

  // --- NEW: apply pre-goals multipliers (domain-sensitive) ---
  try {
    const selfId = agent?.entityId;
    if (selfId && ctx?.atoms?.length) {
      const atoms = ctx.atoms as any;

      const wSafety = readPreGoal01(atoms, selfId, 'safety', 0.5);
      const wSocial = readPreGoal01(atoms, selfId, 'social', 0.5);
      const wResource = readPreGoal01(atoms, selfId, 'resource', 0.5);
      const wExplore = readPreGoal01(atoms, selfId, 'explore', 0.5);
      const wBonding = readPreGoal01(atoms, selfId, 'bonding', 0.5);
      const wDominance = readPreGoal01(atoms, selfId, 'dominance', 0.5);

      for (const g of scores) {
        const dom = String((g as any)?.domain ?? (g as any)?.group ?? (g as any)?.category ?? '').toLowerCase();
        let mult = 1;
        if (dom.includes('safety') || dom.includes('avoid') || dom.includes('escape')) mult *= (0.75 + 0.5 * wSafety);
        if (dom.includes('social') || dom.includes('norm') || dom.includes('status')) mult *= (0.75 + 0.5 * wSocial);
        if (dom.includes('resource') || dom.includes('consume') || dom.includes('acquire')) mult *= (0.75 + 0.5 * wResource);
        if (dom.includes('explore') || dom.includes('learn') || dom.includes('curiosity')) mult *= (0.75 + 0.5 * wExplore);
        if (dom.includes('bond') || dom.includes('care') || dom.includes('ally')) mult *= (0.75 + 0.5 * wBonding);
        if (dom.includes('domin') || dom.includes('power') || dom.includes('control')) mult *= (0.75 + 0.5 * wDominance);

        const base = typeof (g as any).score === 'number' ? (g as any).score : (g as any).probability;
        const prob = typeof base === 'number' ? base : 0;
        const next = clamp01(prob * mult);
        (g as any).score = next;
        (g as any).probability = next;
        (g as any).preGoalMult = mult;
      }
    }
  } catch {
    // pre-goals are best-effort overlays
  }

  try {
    const selfId = agent?.entityId;
    if (selfId && ctx?.atoms?.length) {
      for (const g of scores) {
        const goalId = g.goalId || (g as any).id || (g as any).goalId;
        const domain = (g as any)?.domain;
        const kind = (g as any)?.type || (g as any)?.kind;
        (g as any).evidence = buildGoalEvidence({ goalId: String(goalId), selfId, atoms: ctx.atoms as any, domain, kind });
      }
    }
  } catch {
    // evidence is best-effort; scoring must not fail
  }

  return scores.sort((a, b) => b.probability - a.probability);
}

export function contextScoresToGoalEcology(scores: ContextualGoalScore[]): GoalEcology {
  const sorted = [...scores].sort((a, b) => b.probability - a.probability);
  const execute: GoalState[] = [];
  const latent: GoalState[] = [];

  sorted.forEach((s, idx) => {
    const def = GOAL_DEFS[s.goalId as CharacterGoalId];
    const name = def?.label_ru ?? s.goalId;
    // Fallback domain if V4 domain is specialized
    const domain = s.domain ?? def?.domains?.[0] ?? 'context'; 

    const state: GoalState = {
      id: s.goalId,
      layer: 'scenario',
      name,
      base: 0,
      dynamic: safeNumber(s.totalLogit),
      tension: 0,
      frustration: 0,
      sacred: false,
      blocked: false,
      priority: s.probability,
      weight: s.probability,
      activation_score: s.probability,
      deonticFit: 0,
      conflictingGoalIds: [],
      domain,
      origin: 'context_v2',
      is_active: idx < 5, // Top 5 active
      satisfaction: 0,
      targetId: s.targetAgentId ?? undefined,
      effect_profile: undefined,
      directSupport: 0,
    };
    
    if (idx < 5) execute.push(state);
    else latent.push(state);
  });

  return { execute, latent, queue: latent, drop: [], tension: 0, frustration: 0, conflictMatrix: {}, groupGoals: [] };
}
