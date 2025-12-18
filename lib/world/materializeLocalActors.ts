
import { WorldState, AgentState, LocalActorRef, EntityType } from '../../types';
import { defaultBody, defaultIdentity } from '../character-snippet';

export function materializeLocalActors(
  world: WorldState,
  actors: LocalActorRef[],
): WorldState {
  if (!actors || !actors.length) return world;

  const existingIds = new Set(world.agents.map(a => a.entityId));
  const extraAgents: AgentState[] = [];

  for (const ref of actors) {
    if (existingIds.has(ref.id)) continue;

    // Create a minimal viable AgentState from the ref
    // We assume default personality traits for "generic" actors unless specified
    const agent: AgentState = {
      entityId: ref.id,
      title: ref.label || `Actor ${ref.id}`,
      type: EntityType.Character,
      
      // Minimal required fields to prevent crashes in context builders
      body: {
          ...defaultBody,
          acute: { ...defaultBody.acute, stress: 0 }
      },
      identity: { ...defaultIdentity },
      
      // Role info derived from ref
      roles: { global: [ref.role || 'observer'] },
      effectiveRole: ref.role,
      
      // Position is stored directly on the object for map logic (non-standard but used in lab)
      // We assume caller handles actual spatial coordinates via other means if needed
      
      // Default empty vectors
      vector_base: {},
      latents: {},
      
      // Required empty containers
      relationships: {},
      tom: { self: null, perceived: {} },
      history: [],
      
      // Prevent crash when accessing competence
      competencies: { competence_core: 50 },

      // Threat level stored in metadata or custom field if needed by advanced logic,
      // but Context V2 builder handles LocalActorRef properties directly from the ref list usually.
      // This materialization is primarily to allow `world.agents.find` to work.
    } as any;

    extraAgents.push(agent);
  }

  return {
    ...world,
    agents: [...world.agents, ...extraAgents],
  };
}
