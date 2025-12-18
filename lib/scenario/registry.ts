
import { ScenarioId, ScenarioDef, WorldState } from "../../types";
import { allScenarioDefs } from "../../data/scenarios/index";
import { createInitialWorld } from "../world/initializer";
import { getEntitiesByType } from "../../data";
import { EntityType, CharacterEntity } from "../../types";

export function getScenarioDefinition(id: ScenarioId): ScenarioDef | undefined {
    return allScenarioDefs[id];
}

export function getInitialWorldForScenario(scenarioId: ScenarioId): WorldState {
    const scenarioDef = getScenarioDefinition(scenarioId);
    if (!scenarioDef) {
        throw new Error(`Scenario ${scenarioId} not found`);
    }

    // Default characters for quick start if not provided
    // Ideally this should come from a preset or configuration
    const allChars = (getEntitiesByType(EntityType.Character) as CharacterEntity[])
        .concat(getEntitiesByType(EntityType.Essence) as CharacterEntity[]);
    
    // Pick first 3-5 characters as default cast
    const selectedCharacters = allChars.slice(0, 5);

    const world = createInitialWorld(
        Date.now(),
        selectedCharacters,
        scenarioId,
        {}, // goalWeights
        {}  // relations
    );

    if (!world) {
        throw new Error(`Failed to create initial world for ${scenarioId}`);
    }
    
    return world;
}
