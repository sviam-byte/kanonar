
import { AgentState, WorldState, SocialActionId, PlanState, PlanStep } from '../../types';

/**
 * Опции планировщика.
 */
export interface PlanningOptions {
  defaultHorizon?: number;
}

/**
 * Определить, "выработан" ли план (курсор вышел за пределы).
 */
export function isPlanExhausted(plan: PlanState | undefined | null): boolean {
  if (!plan) return true;
  return plan.cursor >= plan.steps.length || plan.steps.length === 0;
}

/**
 * Определить, устарел ли план по времени.
 */
export function isPlanStale(plan: PlanState | undefined | null, world: WorldState): boolean {
  if (!plan) return true;
  const builtAt = plan.builtAtTick ?? 0;
  const horizon = plan.horizon ?? 0;
  if (horizon <= 0) return true;
  // Если прошло больше времени, чем горизонт планирования - план устарел
  return world.tick > builtAt + horizon * 2; // Даем немного запаса
}

/**
 * Проверяет, жив ли план по статусу.
 */
export function isPlanActive(plan: PlanState | undefined | null): boolean {
    return !!plan && plan.status === 'active';
}

/**
 * Построить новый "жадный" план из списка кандидатов (fallback).
 */
export function buildGreedyPlan(
  agent: AgentState,
  world: WorldState,
  candidateActions: SocialActionId[],
  options?: PlanningOptions
): PlanState | null {
  if (!candidateActions || candidateActions.length === 0) {
    return null;
  }

  const horizon =
    (options && typeof options.defaultHorizon === 'number' && options.defaultHorizon > 0
      ? Math.floor(options.defaultHorizon)
      : 3);

  const steps: PlanStep[] = [];

  for (let i = 0; i < horizon; i++) {
    const actionId = candidateActions[i % candidateActions.length];
    const step: PlanStep = {
      id: `step-${world.tick}-${i}`,
      actionId,
      explanation: "Greedy fallback step"
    };
    steps.push(step);
  }

  const plan: PlanState = {
    steps,
    cursor: 0,
    builtAtTick: world.tick,
    horizon,
    status: 'active',
    origin: 'self',
    ownerId: agent.entityId
  };

  return plan;
}

/**
 * Создает план из списка шагов.
 */
export function createPlanFromSteps(
    agent: AgentState,
    world: WorldState,
    steps: PlanStep[],
    origin: 'self' | 'shared' | 'assigned' = 'self'
): PlanState {
    return {
        steps,
        cursor: 0,
        builtAtTick: world.tick,
        horizon: steps.length,
        status: 'active',
        origin,
        ownerId: agent.entityId
    };
}

/**
 * Продвинуться на один шаг по плану.
 */
export function advancePlanStep(
  agent: AgentState
): { agent: AgentState; step: PlanStep | null } {
  const plan = agent.planState;

  if (!plan || isPlanExhausted(plan) || plan.status !== 'active') {
    return { agent, step: null };
  }

  const cursor = plan.cursor ?? 0;

  if (cursor < 0 || cursor >= plan.steps.length) {
    const completed: AgentState = {
      ...agent,
      planState: {
        ...plan,
        status: 'completed'
      },
    };
    return { agent: completed, step: null };
  }

  const step = plan.steps[cursor];

  const updatedPlan: PlanState = {
    ...plan,
    cursor: cursor + 1,
    status: cursor + 1 >= plan.steps.length ? 'completed' : 'active'
  };

  const updatedAgent: AgentState = {
    ...agent,
    planState: updatedPlan,
  };

  return { agent: updatedAgent, step };
}

/**
 * Отметить план как проваленный.
 */
export function failPlan(agent: AgentState): AgentState {
    if (!agent.planState) return agent;
    return {
        ...agent,
        planState: {
            ...agent.planState,
            status: 'failed'
        }
    };
}
