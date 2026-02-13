import type { AgentState, WorldState } from '../../../types';
import { makeDerivedRNG } from '../../core/noise';

export type ObserveLiteParams = {
  /** Visibility radius in world units (agent.pos). */
  radius?: number;
  /** Max number of other agents to include (closest first). */
  maxAgents?: number;
  /** Additive noise sigma for numeric observations. */
  noiseSigma?: number;
  /** Deterministic seed (falls back to world.rngSeed). */
  seed?: number;
};

export type ObservationLiteSnapshot = {
  kind: 'observation_lite_v1';
  selfId: string;
  tick: number;
  params: Required<Pick<ObserveLiteParams, 'radius' | 'maxAgents' | 'noiseSigma'>> & { seed: number };
  basis: {
    locationId?: string;
    selfPos?: { x: number; y: number };
  };
  visibleAgents: Array<{
    id: string;
    distance: number;
    hp?: number;
    S?: number;
    v?: number;
    factionId?: string;
  }>;
  droppedAgents: Array<{ id: string; reason: string }>;
  selectedFeatures: string[];
};

function asNum(x: any, d = 0): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : d;
}

function getPos(a: any): { x: number; y: number } | null {
  if (a?.pos && typeof a.pos.x === 'number' && typeof a.pos.y === 'number') return { x: a.pos.x, y: a.pos.y };
  if (a?.position && typeof a.position.x === 'number' && typeof a.position.y === 'number') return { x: a.position.x, y: a.position.y };
  return null;
}

export function observeLite(input: {
  world: WorldState;
  agent: AgentState;
  selfId: string;
  tick: number;
  params?: ObserveLiteParams;
}): ObservationLiteSnapshot {
  const { world, agent, selfId, tick } = input;
  const radius = asNum(input.params?.radius, 10);
  const maxAgents = Math.max(0, Math.floor(asNum(input.params?.maxAgents, 12)));
  const noiseSigma = Math.max(0, asNum(input.params?.noiseSigma, 0));
  const seed = Math.floor(asNum(input.params?.seed, asNum((world as any)?.rngSeed, 0)));

  // Deterministic RNG from centralized noise utilities (no local Math.random).
  const rng = makeDerivedRNG(`observeLite:${selfId}:${tick}`, seed);

  const selfPos = getPos(agent);
  const locationId = (agent as any)?.locationId as string | undefined;

  const others = Array.isArray((world as any)?.agents) ? (world as any).agents : [];

  const candidates: Array<{ a: any; d: number }> = [];
  const dropped: Array<{ id: string; reason: string }> = [];

  for (const a of others) {
    const id = String(a?.entityId ?? a?.id ?? '');
    if (!id || id === selfId) continue;

    const aLoc = a?.locationId as string | undefined;
    if (locationId && aLoc && aLoc !== locationId) {
      dropped.push({ id, reason: 'different locationId' });
      continue;
    }

    const p = getPos(a);
    if (selfPos && p) {
      const dx = p.x - selfPos.x;
      const dy = p.y - selfPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > radius) {
        dropped.push({ id, reason: `out of radius (${dist.toFixed(2)} > ${radius})` });
        continue;
      }
      candidates.push({ a, d: dist });
    } else {
      candidates.push({ a, d: Number.POSITIVE_INFINITY });
    }
  }

  candidates.sort((x, y) => x.d - y.d);
  const chosen = candidates.slice(0, maxAgents);
  for (const c of candidates.slice(maxAgents)) {
    const id = String(c.a?.entityId ?? c.a?.id ?? '');
    if (id) dropped.push({ id, reason: `maxAgents limit (${maxAgents})` });
  }

  const visibleAgents = chosen.map(({ a, d }) => {
    const id = String(a?.entityId ?? a?.id ?? '');
    const dist = Number.isFinite(d) ? Math.max(0, d + (noiseSigma > 0 ? rng.nextGaussian() * noiseSigma : 0)) : d;
    return {
      id,
      distance: dist,
      hp: typeof a?.hp === 'number' ? Math.max(0, a.hp + (noiseSigma > 0 ? rng.nextGaussian() * noiseSigma : 0)) : undefined,
      S: typeof a?.S === 'number' ? a.S + (noiseSigma > 0 ? rng.nextGaussian() * noiseSigma : 0) : undefined,
      v: typeof a?.v === 'number' ? a.v + (noiseSigma > 0 ? rng.nextGaussian() * noiseSigma : 0) : undefined,
      factionId: typeof a?.factionId === 'string' ? a.factionId : undefined,
    };
  });

  return {
    kind: 'observation_lite_v1',
    selfId,
    tick,
    params: { radius, maxAgents, noiseSigma, seed },
    basis: { locationId, selfPos: selfPos ?? undefined },
    visibleAgents,
    droppedAgents: dropped,
    selectedFeatures: ['distance', 'hp', 'S', 'v', 'factionId'],
  };
}
