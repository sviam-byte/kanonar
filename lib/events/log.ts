
import { WorldState, DomainEvent } from '../../types';

export function getEventsAtTick(world: WorldState, tick: number): DomainEvent[] {
  // If world has a structured event log (new system)
  const log = (world as any).eventLog?.events as DomainEvent[] | undefined;
  
  if (log) {
    return log.filter(e => e.t === tick);
  }

  // If using legacy world.worldEpisodes (system observation)
  // We need to extract actions/events from the episode of the current tick
  const episode = world.worldEpisodes?.find(ep => ep.tick === tick);
  if (episode) {
      // Map episode actions to domain events structure if possible, 
      // or return empty if we only care about canonical DomainEvents
      // For now, assume this helper targets the canonical DomainEvent stream.
      return [];
  }

  return [];
}
