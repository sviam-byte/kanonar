import type { AppraisalView, GoalEvalContext, RecentEventView } from '../../goals/specs/evalTypes';

interface BuildGoalEvalContextInput {
  selfId: string;
  targetId?: string;
  tick: number;
  metrics: Record<string, number>;
  recentEvents: RecentEventView[];
  appraisals: AppraisalView[];
  beliefs: string[];
  capabilities: string[];
  recentActionKinds: string[];
  cooldownReady: string[];
}

/**
 * Adapter that normalizes pipeline/runtime state into GoalEvalContext.
 *
 * The adapter is intentionally transparent (no hidden heuristics): it converts
 * collection types and forwards values as-is to keep explainability simple.
 */
export function buildGoalEvalContext(input: BuildGoalEvalContextInput): GoalEvalContext {
  return {
    selfId: input.selfId,
    targetId: input.targetId,
    tick: input.tick,
    metrics: input.metrics,
    recentEvents: input.recentEvents,
    appraisals: input.appraisals,
    beliefs: new Set(input.beliefs),
    capabilities: new Set(input.capabilities),
    recentActionKinds: input.recentActionKinds,
    cooldownReady: new Set(input.cooldownReady),
  };
}
