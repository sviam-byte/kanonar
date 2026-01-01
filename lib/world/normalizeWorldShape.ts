import type { AgentState, WorldState } from '../../types';
import { listify } from '../utils/listify';

function normalizeAgentShape(a: any): AgentState {
  const agent = (a && typeof a === 'object') ? a : {};

  const goalEcologyRaw = (agent.goalEcology && typeof agent.goalEcology === 'object') ? agent.goalEcology : null;
  const goalEcology = goalEcologyRaw ? {
    ...goalEcologyRaw,
    execute: listify(goalEcologyRaw.execute),
    latent: listify(goalEcologyRaw.latent),
    queue: listify(goalEcologyRaw.queue),
    drop: listify(goalEcologyRaw.drop),
    groupGoals: listify(goalEcologyRaw.groupGoals),
  } : null;

  const narrativeRaw = (agent.narrativeState && typeof agent.narrativeState === 'object') ? agent.narrativeState : null;
  const narrativeState = narrativeRaw ? {
    ...narrativeRaw,
    episodes: listify(narrativeRaw.episodes),
  } : null;

  return {
    ...agent,
    actionHistory: listify(agent.actionHistory),
    pendingProposals: listify(agent.pendingProposals),
    goalIds: listify(agent.goalIds),
    w_eff: listify(agent.w_eff),
    contextGoals: listify(agent.contextGoals),
    goalEcology,
    narrativeState,
  } as AgentState;
}

function normalizeAgents<T>(agents: unknown): T[] {
  if (Array.isArray(agents)) return agents as T[];
  if (agents && typeof agents === 'object') return Object.values(agents as Record<string, T>);
  return [];
}

/**
 * Normalizes imported/edited WorldState shape so the rest of the pipeline can assume arrays.
 * This is intentionally *loose*: it coerces dict-like objects into arrays via Object.values().
 */
export function normalizeWorldShape(input: any): WorldState {
  const w = (input && typeof input === 'object') ? input : {};

  const agents = normalizeAgents<any>((w as any).agents).map(normalizeAgentShape);
  const locations = listify<any>((w as any).locations);
  const threats = listify<any>((w as any).threats);
  const orders = listify<any>((w as any).orders);

  const eventLogRaw = ((w as any).eventLog && typeof (w as any).eventLog === 'object') ? (w as any).eventLog : null;
  const eventLog = eventLogRaw ? {
    ...eventLogRaw,
    events: listify<any>(eventLogRaw.events),
  } : undefined;

  return {
    ...(w as any),
    agents,
    locations,
    threats,
    orders,
    ...(eventLog ? { eventLog } : {}),
  } as WorldState;
}
