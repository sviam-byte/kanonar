import { WorldState } from '../../types';

/**
 * Checks if there are any wounded characters in the same location as the observer.
 */
export function hasLocalWounded(world: WorldState, selfId: string): boolean {
  const self = world.agents.find(a => a.entityId === selfId);
  if (!self || !self.locationId) return false;

  return world.agents.some(other => {
    // Subject's self is not relevant
    if (other.entityId === selfId) return false;
    
    // Must be in the same location
    if (other.locationId !== (self as any).locationId) return false;
    
    // "Wounded" criteria: low HP (threshold 70) or explicit wounds in body state
    const isWounded = (other.hp < 70) || (other.body?.acute?.wounds != null);
    
    return isWounded;
  });
}
