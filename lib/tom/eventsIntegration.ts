
import { WorldState, DomainEvent, SocialActionId } from "../../types";
import { updateTomGoals, GoalObservation } from "./update.goals";
import { updateTomTraits, TraitObservation } from "./update.traits";

export function applyDomainEventsToTom(world: WorldState, events: DomainEvent[]): WorldState {
  if (!events.length) return world;

  const tomState = world.tom;
  if (!tomState) return world;

  for (const ev of events) {
      if (!ev.actorId || !ev.targetId || ev.actorId === ev.targetId) continue;
      
      const isPublic = ev.ctx?.public !== false; 

      for (const observer of world.agents) {
          if (observer.entityId === ev.actorId) continue; 
          
          const isParticipant = ev.targetId === observer.entityId;
          
          if (isPublic || isParticipant) {
               const successVal = 1; 

               const goalObs: GoalObservation = {
                   observerId: observer.entityId,
                   targetId: ev.actorId,
                   actionId: ev.actionId as SocialActionId,
                   success: successVal,
                   world: world
               };
               
               const ctx = {
                   effectiveIntensity: ev.intensity ?? 0.5,
                   baseValence: ev.polarity ?? 0
               };
               
               updateTomGoals(tomState, goalObs, ctx);

               const traitObs: TraitObservation = {
                   observerId: observer.entityId,
                   targetId: ev.actorId,
                   actionId: ev.actionId as SocialActionId,
                   success: successVal, 
                   world: world
               };
               
               updateTomTraits(tomState, traitObs, ctx);
          }
      }
  }

  return world;
}
