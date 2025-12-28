// lib/mind/ensure.ts
// Ensure GoalLab has a *complete* and *serializable* mind state:
// - affect for every agent
// - ToM dyads for every ordered pair (A->B), A!=B

import type { WorldState, AgentState, TomEntry, TomState } from '../../types';
import { initTomForCharacters } from '../tom/init';
import { normalizeAffectState } from '../affect/normalize';
import { defaultAffect } from '../affect/engine';

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

function mkNeutralTomEntry(tick: number): TomEntry {
  return {
    traits: {
      trust: 0.5,
      fear: 0.5,
      conflict: 0.3,
      bond: 0.4,
      align: 0.5,
      respect: 0.5,
      dominance: 0.5,
      uncertainty: 0.5,
    },
    lastUpdatedTick: tick,
    uncertainty: 0.5,
  };
}

function ensureAgentAffect(agent: AgentState, tick: number) {
  const a = (agent as any).affect;
  if (a && typeof a === 'object') {
    const norm = normalizeAffectState(a);
    (agent as any).affect = norm;
    if ((agent as any).state) {
      (agent as any).state = { ...(agent as any).state, affect: norm, tick: (agent as any).state.tick ?? tick };
    }
    return;
  }

  const base = normalizeAffectState({
    ...defaultAffect(),
    tick,
    meta: { source: 'ensure_world_mind_state' },
  });

  (agent as any).affect = base;
  if ((agent as any).state) {
    (agent as any).state = { ...(agent as any).state, affect: base, tick: (agent as any).state.tick ?? tick };
  }
}

function ensureTomMatrix(world: WorldState, agentIds: string[]) {
  const w: any = world as any;

  if (!w.tom) {
    // First-time materialization: seed from dyad configs if present.
    w.tom = initTomForCharacters(w.agents, w) as TomState;
  }

  // Normalize storage shape: allow either {views:{...}} or plain.
  const views: Record<string, Record<string, TomEntry>> =
    (w.tom?.views as any) ?? (w.tom as any);

  for (const selfId of agentIds) {
    if (!views[selfId]) views[selfId] = {};
    for (const otherId of agentIds) {
      if (selfId === otherId) continue;
      if (!views[selfId][otherId]) {
        views[selfId][otherId] = mkNeutralTomEntry(w.tick ?? 0);
      } else {
        // Clamp & normalize a few values defensively
        const e = views[selfId][otherId];
        e.traits.trust = clamp01(e.traits.trust);
        e.traits.fear = clamp01(e.traits.fear);
        e.traits.conflict = clamp01(e.traits.conflict);
        e.traits.bond = clamp01(e.traits.bond);
        e.traits.align = clamp01(e.traits.align);
        e.traits.respect = clamp01(e.traits.respect);
        e.traits.dominance = clamp01(e.traits.dominance);
        e.traits.uncertainty = clamp01(e.traits.uncertainty);
        e.uncertainty = clamp01((e as any).uncertainty ?? e.traits.uncertainty);
      }
    }
  }

  // Persist back in the same shape the project expects.
  if (w.tom?.views) w.tom.views = views;
  else w.tom = views;
}

export function ensureWorldMindState(world: WorldState, agentIds?: string[]) {
  const w: any = world as any;
  const ids = agentIds?.length ? agentIds : (w.agents || []).map((a: any) => a.entityId).filter(Boolean);

  // Affect must exist for every agent.
  for (const a of w.agents || []) ensureAgentAffect(a, w.tick ?? 0);

  // ToM must contain all A->B (A!=B) dyads.
  ensureTomMatrix(world, ids);
}
