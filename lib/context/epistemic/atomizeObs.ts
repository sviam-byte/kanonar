
// lib/context/epistemic/atomizeObs.ts
import { ContextAtom } from '../v2/types';
import { normalizeAtom } from '../v2/infer';
import { computeInfoAdequacy, clamp01, defaultPerceptionProfile } from './perceptionProfile';
import { WorldState, AgentState } from '../../../types';

function dist2(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function toCloseness(d: number, max: number) {
  // d in [0,max] => closeness 1..0
  if (!Number.isFinite(d) || max <= 0) return 0;
  return clamp01(1 - d / max);
}

// Hook: get agent position (assuming grid coordinates)
function getAgentCell(world: WorldState, agentId: string): { x: number; y: number } | null {
  const agent = world.agents.find(a => a.entityId === agentId);
  // Type assertion for position which might be optional on AgentState in some contexts
  const pos = (agent as any)?.position;
  if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) return { x: pos.x, y: pos.y };
  return null;
}

// Hook: get local visibility (placeholder, can hook into LocationEntity.properties)
function getLocalVisibility(world: WorldState, agentId: string): number {
  return 1.0; // Default perfect visibility if not blocked by map
}

export function atomizeObservations(world: WorldState, agent: AgentState, input: {
  selfId: string;
  arousal?: number;   // from affect
  ctxCrowd?: number;  // existing atom magnitude if available
  ctxChaos?: number;  // existing atom magnitude
}): { atoms: ContextAtom[] } {
  const selfId = input.selfId;
  const selfCell = getAgentCell(world, selfId);
  const profile = defaultPerceptionProfile();

  const visibility = getLocalVisibility(world, selfId);
  const { quality, parts } = computeInfoAdequacy({
    visibility,
    crowd: input.ctxCrowd ?? 0,
    chaos: input.ctxChaos ?? 0,
    arousal: input.arousal ?? 0,
    profile
  });

  const atoms: ContextAtom[] = [];

  // 1. General Observation Quality Atom
  atoms.push(normalizeAtom({
    id: 'obs:infoAdequacy',
    kind: 'obs_quality', // Generic kind, mapped later if needed
    ns: 'obs',
    origin: 'obs',
    source: 'perception',
    magnitude: clamp01(quality),
    confidence: 1,
    tags: ['obs', 'quality'],
    label: `info:${Math.round(quality * 100)}%`,
    trace: { usedAtomIds: [], notes: ['computed from visibility/crowd/chaos/arousal'], parts }
  } as any));

  // 2. Observations of others ("Who is nearby?")
  const others = world.agents || [];
  
  // If we have positions, calc distance-based observations
  if (selfCell) {
      const maxD = profile.sightRange;
      for (const other of others) {
        const otherId = other.entityId;
        if (!otherId || otherId === selfId) continue;

        const otherCell = getAgentCell(world, otherId);
        if (!otherCell) continue;

        const d = Math.sqrt(dist2(selfCell, otherCell));
        if (d > maxD) continue;

        const closeness = toCloseness(d, maxD);
        // Confidence drops with distance and low general quality
        const conf = clamp01(quality * (0.4 + 0.6 * closeness)); 

        atoms.push(normalizeAtom({
          id: `obs:nearby:${otherId}:closeness`,
          kind: 'obs_nearby', // Mapped to proximity logic
          ns: 'obs',
          origin: 'obs',
          source: 'perception',
          magnitude: closeness,
          confidence: conf,
          subject: selfId,
          target: otherId,
          tags: ['obs', 'nearby'],
          label: `near:${otherId} c=${Math.round(closeness * 100)}%`,
          trace: { usedAtomIds: ['obs:infoAdequacy'], notes: ['distance->closeness with confidence'], parts: { d, maxD, quality } }
        } as any));

        // LOS proxy
        const los = closeness > 0.2 ? 1 : 0;
        atoms.push(normalizeAtom({
          id: `obs:los:${otherId}`,
          kind: 'obs_los',
          ns: 'obs',
          origin: 'obs',
          source: 'perception',
          magnitude: los,
          confidence: conf,
          subject: selfId,
          target: otherId,
          tags: ['obs', 'los'],
          label: `los:${otherId}=${los}`,
          trace: { usedAtomIds: [`obs:nearby:${otherId}:closeness`, 'obs:infoAdequacy'], notes: ['simple LOS proxy'], parts: { closeness } }
        } as any));
      }
  }

  return { atoms };
}
