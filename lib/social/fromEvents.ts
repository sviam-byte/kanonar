
import { WorldState, DomainEvent, Relationship } from "../../types";

function clamp(x: number, min: number, max: number) {
  return Math.max(min, Math.min(max, x));
}

export function applyDomainEventsToRelationships(world: WorldState, events: DomainEvent[]): WorldState {
  if (!events.length) return world;

  // Clone agents array to ensure immutability if needed, though usually we mutate state in tick
  // Since AgentState is mutable in simulation loop, we can modify in place.
  // But to be safe and consistent with functional style where possible:
  const nextAgents = world.agents.map((a) => ({ ...a, relationships: { ...(a.relationships ?? {}) } }));
  const nextWorld = { ...world, agents: nextAgents };

  for (const ev of events) {
    const { actorId, targetId, polarity = 0, intensity = 0 } = ev;
    if (!actorId || !targetId || actorId === targetId) continue;

    const actor = nextWorld.agents.find((a) => a.entityId === actorId);
    const target = nextWorld.agents.find((a) => a.entityId === targetId);
    
    if (!actor || !target) continue;

    const delta = polarity * intensity * 0.1;

    const updateRel = (rel: Relationship | undefined): Relationship => {
        const base = rel || { trust: 0.5, conflict: 0, bond: 0, align: 0.5, respect: 0.5, fear: 0, history: [] };
        return {
            ...base,
            trust: clamp(base.trust + delta, 0, 1),
            conflict: clamp(base.conflict - delta, 0, 1),
            bond: base.bond, // Bond usually requires specific interaction types, kept stable here for generic events
        };
    };

    actor.relationships[targetId] = updateRel(actor.relationships[targetId]);
    // Optionally reciprocal effect could be added here, but usually handled by separate perception/reaction logic
  }

  return nextWorld;
}
