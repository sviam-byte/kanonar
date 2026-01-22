
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

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function getAtomMag(atoms: any[] | undefined, id: string, fb = 0): number {
  const arr = Array.isArray(atoms) ? atoms : [];
  const a: any = arr.find(x => String(x?.id) === id);
  const m = a?.magnitude ?? a?.m ?? 0;
  return typeof m === 'number' && Number.isFinite(m) ? m : fb;
}

function getCtxPrio(ctx: ContextSnapshot, axisId: string, selfId: string, fb = 0.5): number {
  // ctx:prio:* are expected to be 0..1. Default 0.5 = neutral.
  const v = clamp01(getAtomMag(ctx.atoms as any, `ctx:prio:${axisId}:${selfId}`, fb));
  return v;
}

function prioToMultiplier(prio01: number): number {
  // 0   -> 0.60  (de-emphasize)
  // 0.5 -> 1.00  (neutral)
  // 1   -> 1.40  (emphasize)
  return 0.60 + 0.80 * clamp01(prio01);
}

function computeContextWeight(ctx: ContextSnapshot, selfId: string): number {
  // Stronger context imprint when the situation is dangerous/urgent/uncertain or norm-heavy.
  const danger = clamp01(getAtomMag(ctx.atoms as any, `ctx:danger:${selfId}`, 0));
  const unc = clamp01(getAtomMag(ctx.atoms as any, `ctx:uncertainty:${selfId}`, 0));
  const time = clamp01(getAtomMag(ctx.atoms as any, `ctx:timePressure:${selfId}`, 0));
  const norm = clamp01(getAtomMag(ctx.atoms as any, `ctx:normPressure:${selfId}`, 0));

  const m = Math.max(danger, unc, time, norm);
  // 0.35..1.00
  return 0.35 + 0.65 * m;
}

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
  const ctxW = computeContextWeight(ctx, agent.entityId);
  for (const axis of GOAL_AXES) {
    // Priority-aware context weight per axis:
    const prio = getCtxPrio(ctx, String(axis), agent.entityId, 0.5);
    const prioMul = prioToMultiplier(prio);

    combinedLogits[axis] =
      (traitLogits[axis] || 0) +
      (bioLogits[axis] || 0) +
      (contextLogits[axis] || 0) * ctxW * prioMul;
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
