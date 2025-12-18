
import { ScenarioDef, WorldState } from '../../types';

export function compileScenarioObjectives(world: WorldState) {
    if (!world.scenario || !world.scenario.objectives) {
        world.scenarioProcedures = {};
        return;
    }

    // Map: AgentId -> ActionId -> Weight
    const procedures: Record<string, Record<string, number>> = {};

    for (const [actorId, table] of Object.entries(world.scenario.objectives)) {
        if (!procedures[actorId]) procedures[actorId] = {};
        
        for (const [actionId, weight] of Object.entries(table)) {
            procedures[actorId][actionId] = (procedures[actorId][actionId] ?? 0) + weight;
        }
    }
    
    world.scenarioProcedures = procedures;
}
