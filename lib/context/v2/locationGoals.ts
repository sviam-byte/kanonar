
// lib/context/v2/locationGoals.ts

import {
  WorldState,
  AgentId,
  LocationId,
  AgentState,
  GoalEcology,
} from '../../types';
import {
  ContextSnapshot,
  ContextualGoalScore as BaseContextualGoalScore,
  ContextAtom,
} from './types';
import { buildContextSnapshot } from './builder';
import {
  scoreContextualGoals,
  contextScoresToGoalEcology,
} from './scoring';
import { safeNumber } from './math-utils';
import { hydrateLocation, calculateLocationGoalInfluence } from '../../adapters/rich-location';
import { calculateAllCharacterMetrics } from '../../metrics';
import { Branch } from '../../types';
import { buildLocationContextIfPossible } from '../locationContext';
import type { Location } from '../../location/types';

export interface ExtraContextForLocation {
  manualAtoms?: ContextAtom[];
  activeEventsIds?: string[];
}

export interface AgentContextGoals {
  agentId: AgentId;
  snapshot: ContextSnapshot;
  scores: BaseContextualGoalScore[];
  ecology: GoalEcology;
}

export interface ContextualGoalScore {
  goalId: string;
  baseWeight: number;
  contextDelta: number;
  finalWeight: number;
  sources: string[];
}

export function computeLocationGoalsForAgent(
  world: WorldState,
  agentId: AgentId,
  locationId: LocationId | null
): ContextualGoalScore[] {
  if (!locationId) return [];

  const entity = (world as any).locations?.find(
    (loc: any) => loc.entityId === locationId
  );
  if (!entity) return [];

  // Богатая локация
  const loc: Location = hydrateLocation(entity);

  // Базовый контекст (privacy, risk, etc.) — оставляем, чтобы не потерять существующую семантику
  const locationContext = buildLocationContextIfPossible(world, locationId, [agentId], []);

  // Метрики персонажа (ценности, архетипы, стресс и т.п.)
  const agent = world.agents.find((c) => c.entityId === agentId);
  if (!agent) return [];
  
  // Calculate full metrics to ensure we have the latest state for evaluation
  const metrics = calculateAllCharacterMetrics(agent, Branch.Current, []);
  // Merge metrics into a temporary agent state for calculation
  const preparedAgent = { ...agent, ...metrics.modifiableCharacter } as AgentState;

  // Влияние локации на цели: из rich-location адаптера
  const impacts = calculateLocationGoalInfluence(loc, preparedAgent);

  // Преобразуем impacts в ContextualGoalScore[]
  const scores: ContextualGoalScore[] = impacts.map((imp) => {
    const baseWeight = imp.baseWeight ?? 0;
    const contextDelta = imp.finalScore - baseWeight;

    const sources: string[] = [
      "location:affordances",
      "location:contextModes",
      "location:norms",
    ];

    if (locationContext) {
      sources.push("location:macroContext");
    }
    
    // Add specific modifiers from impact calculation
    if (imp.modifiers) {
        sources.push(...imp.modifiers);
    }

    return {
      goalId: imp.goalId,
      baseWeight,
      contextDelta,
      finalWeight: imp.finalScore,
      sources,
    };
  });

  return scores;
}

export function computeLocationGoalsForAgents(
   world: WorldState,
   agentIds: AgentId[],
   locationId: LocationId | null
 ): Record<AgentId, ContextualGoalScore[]> {
   const result: Record<AgentId, ContextualGoalScore[]> = {};
   for (const id of agentIds) {
    result[id] = computeLocationGoalsForAgent(world, id, locationId);
   }
   return result;
}

/**
 * Высокоуровневая обёртка: для заданной локации и списка агентов
 * считает контекст и цели для каждого.
 */
export function computeContextGoalsForLocation(
  world: WorldState,
  locationId: LocationId,
  agentIds: AgentId[],
  extra?: ExtraContextForLocation
): AgentContextGoals[] {
  const results: AgentContextGoals[] = [];

  for (const agentId of agentIds) {
    const agent: AgentState | undefined = world.agents.find(
      (a) => a.entityId === agentId
    );
    if (!agent) continue;

    const snapshot = buildContextSnapshot(world, agent, {
      focusLocationId: locationId,
      manualAtoms: extra?.manualAtoms,
    });

    const rawScores = scoreContextualGoals(agent, world, snapshot);
    const ecology = contextScoresToGoalEcology(rawScores);

    const cleanedScores: BaseContextualGoalScore[] = rawScores.map((g) => ({
      ...g,
      totalLogit: safeNumber(g.totalLogit),
      probability: safeNumber(g.probability),
      contributions: g.contributions.map((c) => ({
        ...c,
        value: safeNumber(c.value),
      })),
    }));

    const cleanedEcology: GoalEcology = {
      ...ecology,
      execute: ecology.execute.map((g) => ({
        ...g,
        base: safeNumber(g.base),
        dynamic: safeNumber(g.dynamic),
        activation_score: safeNumber(g.activation_score),
      })),
      latent: ecology.latent.map((g) => ({
        ...g,
        base: safeNumber(g.base),
        dynamic: safeNumber(g.dynamic),
        activation_score: safeNumber(g.activation_score),
      })),
    };

    results.push({
      agentId,
      snapshot,
      scores: cleanedScores,
      ecology: cleanedEcology,
    });
  }

  return results;
}
