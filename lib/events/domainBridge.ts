
import {
  DomainEvent,
  WorldState,
} from '../../types';

/**
 * Универсальный маппер: описывает, как из твоего SimulationEvent
 * достать нужные поля для DomainEvent.
 *
 * TSim — произвольный тип твоего симуляционного события (SimulationEvent).
 */
export interface SimulationEventMapper<TSim> {
  getId(ev: TSim): string;
  getTick(ev: TSim): number | undefined;
  getActorId(ev: TSim): string;
  getTargetId?(ev: TSim): string | undefined;
  getActionId(ev: TSim): string;
  getIntensity?(ev: TSim): number | undefined;
  getScenarioKind?(ev: TSim): string | undefined;
  getLocationId?(ev: TSim): string | undefined;
  getIsPublic?(ev: TSim): boolean | undefined;
  getMeta?(ev: TSim): any;
  getDomain?(ev: TSim): string | undefined;
  getPolarity?(ev: TSim): number | undefined;
}

/**
 * Базовый конструктор DomainEvent из SimulationEvent по мапперу.
 * Никакой магии: всё, что не указано в маппере, получает безопасные дефолты.
 */
export function mapSimulationEventToDomain<TSim>(
  ev: TSim,
  mapper: SimulationEventMapper<TSim>
): DomainEvent {
  const id = mapper.getId(ev);
  const tick = mapper.getTick(ev);
  const actorId = mapper.getActorId(ev);
  const targetId = mapper.getTargetId ? mapper.getTargetId(ev) : undefined;
  const actionId = mapper.getActionId(ev);
  const intensity = mapper.getIntensity ? mapper.getIntensity(ev) : 1.0;
  const scenarioKind = mapper.getScenarioKind ? mapper.getScenarioKind(ev) : undefined;
  const locationId = mapper.getLocationId ? mapper.getLocationId(ev) : undefined;
  const isPublic = mapper.getIsPublic ? mapper.getIsPublic(ev) : true;
  const meta = mapper.getMeta ? mapper.getMeta(ev) : undefined;
  
  const domain = mapper.getDomain ? mapper.getDomain(ev) : 'simulation';
  const polarity = mapper.getPolarity ? mapper.getPolarity(ev) : 0;

  const domainEvent: DomainEvent = {
    id,
    t: tick ?? 0, // Fix: tick -> t
    actorId,
    targetId,
    actionId,
    intensity: intensity ?? 1.0,
    domain: domain ?? 'simulation',
    polarity: polarity ?? 0,
    ctx: {
      scenarioKind: scenarioKind ?? 'global',
      public: isPublic ?? true,
      locationId,
    },
    meta,
    locationId, // Явная привязка к локации
  };

  return domainEvent;
}

/**
 * Векторная версия: массив SimulationEvent → массив DomainEvent.
 */
export function mapSimulationEventsToDomain<TSim>(
  events: TSim[],
  mapper: SimulationEventMapper<TSim>
): DomainEvent[] {
  return events.map((ev) => mapSimulationEventToDomain(ev, mapper));
}

/**
 * Фильтр доменных событий по сценарию и, опционально, по тику.
 * scenarioId — это то, что ты используешь как scenarioDef.id.
 */
export function filterDomainEventsForScenario(
  events: DomainEvent[],
  scenarioId: string,
  opts?: { tick?: number }
): DomainEvent[] {
  return events.filter((ev) => {
    const sameScenario =
      ev.ctx?.scenarioKind === scenarioId ||
      // на всякий случай допускаем, что scenarioKind могли положить и в meta
      (ev.meta && (ev.meta as any).scenarioId === scenarioId);

    if (!sameScenario) return false;

    if (typeof opts?.tick === 'number') {
      // если у события нет tick, считаем его "вне" текущего тика
      return ev.t === opts.tick; // Fix: tick -> t
    }

    return true;
  });
}

/**
 * Утилита "события для текущего сценария и текущего тика".
 *
 * Предполагается, что:
 *  - world.scenario?.id = ScenarioDef.id;
 *  - world.tick — глобальный тик симуляции;
 *    либо, если тебе важнее локальный тик сцены, можно заменить на world.scene.tick.
 */
export function getDomainEventsForCurrentScenarioTick(
  allDomainEvents: DomainEvent[],
  world: WorldState,
  useSceneTick: boolean = false
): DomainEvent[] {
  const scenario = world.scenario;
  const scene = world.scene;

  if (!scenario) return [];

  const tick = useSceneTick
    ? (scene?.tick ?? undefined)
    : (world.tick as number | undefined);

  if (tick == null) {
    // если тик не определён, фильтруем только по scenario.id
    return filterDomainEventsForScenario(allDomainEvents, scenario.id);
  }

  return filterDomainEventsForScenario(allDomainEvents, scenario.id, { tick });
}
