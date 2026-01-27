
import { AgentState, Action } from '../../types';
import { getGlobalRunSeed, hashString32 } from '../core/noise';

export function stepDynamics(agent: AgentState, world: any, action: Action, z: Record<string, number>) {
    // This is a stub. A real implementation would update agent.body, S, Pv, dose, D, etc.
    // For now, we modify S slightly for demonstration (без Math.random).
    if (world.metrics) {
        const t = world?.tick ?? world?.time ?? 0;
        const u = (hashString32(`${getGlobalRunSeed()}:${agent.entityId}:${t}:S`) >>> 0) / 4294967296;
        world.metrics.S = (world.metrics.S ?? 50) + (u - 0.5) * 2;
        world.metrics.S = Math.max(0, Math.min(100, world.metrics.S));
        world.metrics.Pv = world.metrics.Pv ?? 50;
        world.metrics.dose = world.metrics.dose ?? 1;
        world.metrics.D = world.metrics.D ?? 15;
    }
}
