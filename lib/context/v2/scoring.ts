
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
import { curve01, CurvePreset } from '../../utils/curves';

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

function computeContextWeight(ctx: ContextSnapshot, selfId: string, preset: CurvePreset = 'smoothstep'): number {
  // Stronger context imprint when the situation is dangerous/urgent/uncertain or norm-heavy.
  const danger = clamp01(getAtomMag(ctx.atoms as any, `ctx:danger:${selfId}`, 0));
  const unc = clamp01(getAtomMag(ctx.atoms as any, `ctx:uncertainty:${selfId}`, 0));
  const time = clamp01(getAtomMag(ctx.atoms as any, `ctx:timePressure:${selfId}`, 0));
  const norm = clamp01(getAtomMag(ctx.atoms as any, `ctx:normPressure:${selfId}`, 0));

  const m = curve01(Math.max(danger, unc, time, norm), preset);
  // 0.35..1.00
  return 0.35 + 0.65 * m;
}

// Helper to map Context Domains -> Goal Axes.
// Domains are typically 0..1 "intensity" signals (danger, hierarchy, scarcity...)
// We project them into the 10 pre-goal axes as *logit-like pushes*.
const DOMAIN_TO_AXIS: Partial<Record<string, Partial<Record<GoalAxisId, number>>>> = {
  // "Survival / urgency" cluster
  danger: { escape_transcend: 1.6, control: 1.0, preserve_order: 0.6 },
  avoidance: { escape_transcend: 1.3, control: 0.4 },
  timePressure: { efficiency: 1.2, control: 0.6, preserve_order: 0.3 },
  scarcity: { efficiency: 1.2, control: 0.7, power_status: 0.2 },

  // Social / bonding
  intimacy: { care: 1.0, free_flow: 0.3 },
  attachment: { care: 1.2, preserve_order: 0.2 },
  social: { free_flow: 0.7, power_status: 0.2, care: 0.2 },
  status: { power_status: 1.0, control: 0.2 },

  // Authority / norms
  hierarchy: { preserve_order: 1.0, control: 0.6, power_status: 0.3 },
  obligation: { preserve_order: 1.1, control: 0.6, efficiency: 0.2 },

  // Care signals
  'care/help': { care: 1.5, preserve_order: 0.2 },
};

function mapDomainsToGoalLogits(
  domains: Record<string, number> | undefined,
  opts?: { noiseFloor?: number; scale?: number }
): Record<GoalAxisId, number> {
  const noiseFloor = clamp01(opts?.noiseFloor ?? 0.20);

  // Scale of contextual imprint in *axis logits* space.
  // Primary fix for "Traits Trap": domains (0..1) must compete with trait logits (~[-3..+3]).
  const scale = Number.isFinite(opts?.scale as any) ? Number(opts?.scale) : 4.5;

  const logits: Record<GoalAxisId, number> = makeZeroGoalLogits() as any;

  // 1) Direct pass-through: if domains already contains goal axis keys (rare but supported).
  const safeDomains = domains ?? {};

  for (const axis of GOAL_AXES as GoalAxisId[]) {
    const v0 = safeNumber(safeDomains[axis] ?? 0);
    if (v0 > noiseFloor) logits[axis] += scale * clamp01(v0);
  }

  // 2) Domain projection using DOMAIN_TO_AXIS map.
  for (const [domainKey, raw] of Object.entries(safeDomains)) {
    const v = clamp01(safeNumber(raw ?? 0));
    if (v <= noiseFloor) continue;

    const row = DOMAIN_TO_AXIS[domainKey];
    if (!row) continue;

    for (const [axis, w] of Object.entries(row)) {
      logits[axis as GoalAxisId] += scale * v * safeNumber(w ?? 0);
    }
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
  const tuning = (agent as any).goalTuning || (world as any)?.scene?.goalTuning || (world as any)?.goalTuning;
  const contextLogits = mapDomainsToGoalLogits(
    ctx.domains,
    (tuning as any)?.contextScoring || (world as any)?.contextScoring
  );

  // Combine Logits: Traits + Bio + Context
  const combinedLogits = makeZeroGoalLogits();
  const curvePreset = ((world as any)?.decisionCurvePreset || 'smoothstep') as CurvePreset;
  const ctxW = computeContextWeight(ctx, agent.entityId, curvePreset);
  const survivalAxes = new Set<GoalAxisId>(['escape_transcend', 'control', 'preserve_order']);

  // Danger proxy (0..1): prefer canonical atom, fallback to domain.
  const danger01 = clamp01(
    getAtomMag(ctx.atoms as any, `ctx:danger:${agent.entityId}`, safeNumber((ctx as any)?.domains?.danger ?? 0))
  );
  const veto = clamp01((danger01 - 0.55) / 0.25); // 0 below ~0.55, ~1 above ~0.80

  for (const axis of GOAL_AXES) {
    // Priority-aware context weight per axis:
    const prio = getCtxPrio(ctx, String(axis), agent.entityId, 0.5);
    const prioMul = prioToMultiplier(prio);

    const base = (traitLogits[axis] || 0) + (bioLogits[axis] || 0);

    // "Traits trap" fix:
    // - Context becomes strong enough to override stable traits in urgent situations.
    // - Additionally, high danger applies a veto-like dampening to non-survival axes.
    const ctxTerm = (contextLogits[axis] || 0) * ctxW * prioMul;

    const damp = survivalAxes.has(axis as any) ? 1.0 : (1.0 - 0.85 * veto);
    const boost = survivalAxes.has(axis as any) ? (1.0 + 0.75 * veto) : 1.0;

    combinedLogits[axis] = base * damp + ctxTerm * boost;
  }

  // 2. Run V4 Engine
  // We pass the atoms directly so V4 can do fine-grained targeting
  const concreteGoals = computeConcreteGoals(
      agent,
      combinedLogits,
      world,
      [], // nearbyActors (handled via world or atoms)
      frame,
      ctx.atoms,
      tuning
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
