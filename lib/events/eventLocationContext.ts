import { WorldState } from '../../types';
import { UnifiedEventView } from './unifiedEvents';
import {
  LocationContext,
  buildLocationContextIfPossible,
} from '../context/locationContext';
import { hydrateLocation } from "../adapters/rich-location";
import { validateLocation } from "../location/validate";
import { Location } from "../location/types";

function getLocationForEvent(world: WorldState, locationId: string | null): Location | null {
  if (!locationId) return null;
  const entity = (world as any).locations?.find(
    (loc: any) => loc.entityId === locationId
  );
  if (!entity) return null;
  const loc = hydrateLocation(entity);

  if (process.env.NODE_ENV !== "production") {
    const res = validateLocation(loc);
    if (!res.ok) {
      console.warn(
        "[event-location-context] Location for event failed validation:",
        locationId,
        res.issues
      );
    }
  }

  return loc;
}

/**
 * Построить контекст места для конкретного события.
 * actors: по умолчанию [actorId, targetId?] без дубликатов.
 */
export function buildEventLocationContext(
  world: WorldState,
  ev: UnifiedEventView
): LocationContext | null {
  const { locationId, actorId, targetId } = ev;
  const actors: string[] = [];

  if (actorId) actors.push(actorId);
  if (targetId && targetId !== actorId) actors.push(targetId);

  // Validate location if ID is present
  if (locationId) {
      getLocationForEvent(world, locationId);
  }

  // Use original builder which handles its own lookup
  // If we wanted to pass the hydrated location, we would need to update buildLocationContextIfPossible
  // to accept Location object. For now, this ensures validation side-effect runs.
  return buildLocationContextIfPossible(world, locationId as any, actors, []);
}
