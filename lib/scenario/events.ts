
import { DomainEvent, WorldState } from '../../types';

/**
 * События для текущего сценария и текущего тика.
 * Если useSceneTick = true, используется scene.tick, иначе world.tick.
 */
export function getScenarioEventsForCurrentTick(
  allEvents: DomainEvent[],
  world: WorldState,
  useSceneTick: boolean = false
): DomainEvent[] {
  const scenario = world.scenario;
  const scene = world.scene;
  if (!scenario) return [];

  const currentTick = useSceneTick
    ? scene?.tick
    : world.tick;

  return allEvents.filter((ev) => {
    const sameScenario =
      ev.ctx?.scenarioKind === scenario.id ||
      (ev.meta && (ev.meta as any).scenarioId === scenario.id);

    if (!sameScenario) return false;
    if (currentTick == null) return sameScenario;

    return ev.t === currentTick; // Fix: tick -> t
  });
}
