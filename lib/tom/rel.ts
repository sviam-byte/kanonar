// lib/tom/rel.ts

import type { WorldState, AgentState, Relationship } from '../../types';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

type TomLikeEntry = {
  traits?: {
    trust?: number;
    fear?: number;
    dominance?: number;
    respect?: number;
    conflict?: number;
    bond?: number;
    align?: number;
    uncertainty?: number;
  };
  uncertainty?: number;
};

type TomLikeView = {
  trust?: number;
  threat?: number;
  alignment?: number;
  bond?: number;
  conflict?: number;
  respect?: number;
  dominance?: number;
  uncertainty?: number;
  emotions?: { fear?: number };
};

function extractMetrics(raw: any) {
  if (!raw || typeof raw !== 'object') return null;

  const entry = raw as TomLikeEntry;
  if (entry.traits && typeof entry.traits === 'object') {
    return {
      trust: clamp01(entry.traits.trust ?? 0),
      fear: clamp01(entry.traits.fear ?? 0),
      conflict: clamp01(entry.traits.conflict ?? 0),
      bond: clamp01(entry.traits.bond ?? 0),
      align: clamp01(entry.traits.align ?? 0),
      respect: clamp01(entry.traits.respect ?? 0),
      dominance: clamp01(entry.traits.dominance ?? 0),
      uncertainty: clamp01(entry.traits.uncertainty ?? entry.uncertainty ?? 0),
    };
  }

  const view = raw as TomLikeView;
  if (
    typeof view.trust === 'number' ||
    typeof view.threat === 'number' ||
    typeof view.bond === 'number' ||
    typeof view.conflict === 'number'
  ) {
    return {
      trust: clamp01(view.trust ?? 0),
      fear: clamp01(view.emotions?.fear ?? 0),
      conflict: clamp01(view.conflict ?? (view.threat ?? 0)),
      bond: clamp01(view.bond ?? 0),
      align: clamp01(view.alignment ?? 0),
      respect: clamp01(view.respect ?? 0),
      dominance: clamp01(view.dominance ?? 0),
      uncertainty: clamp01(view.uncertainty ?? 0),
    };
  }

  return null;
}

function getTomRaw(
  world: WorldState | undefined,
  agent: AgentState | undefined,
  selfId: string,
  otherId: string
) {
  const wTom: any = (world as any)?.tom;
  if (wTom?.views?.[selfId]?.[otherId]) return wTom.views[selfId][otherId];
  if (wTom?.[selfId]?.[otherId]) return wTom[selfId][otherId];

  const aTom: any = (agent as any)?.tom;
  if (aTom?.views?.[selfId]?.[otherId]) return aTom.views[selfId][otherId];
  if (aTom?.views?.[otherId]) return aTom.views[otherId];
  if (aTom?.[selfId]?.[otherId]) return aTom[selfId][otherId];

  return null;
}

/**
 * Lightweight bridge: map dyadic ToM (world.tom / agent.tom) into Relationship metrics.
 * Used as a fallback when agent.relationships is missing/uninitialized.
 */
export function getRelationshipFromTom(args: {
  world?: WorldState;
  agent?: AgentState;
  selfId: string;
  otherId: string;
}): Relationship | null {
  const { world, agent, selfId, otherId } = args;
  const raw = getTomRaw(world, agent, selfId, otherId);
  const m = extractMetrics(raw);
  if (!m) return null;

  return {
    history: [],
    trust: m.trust,
    align: m.align,
    respect: m.respect,
    fear: m.fear,
    bond: m.bond,
    conflict: m.conflict,
  };
}
