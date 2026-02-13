import type { AgentState, WorldState } from '../../../types';
import type { ContextAtom } from '../../context/v2/types';
import { arr } from '../../utils/arr';

export type BeliefUpdateLiteParams = {
  /** Limit the number of ids included in the snapshot to keep exports sane. */
  maxIds?: number;
};

export type BeliefUpdateLiteSnapshot = {
  kind: 'beliefUpdateLite';
  selfId: string;
  tick: number;

  inputs: {
    obsAtomIds: string[];
    priorBeliefAtomIds: string[];
    overrideAtomIds: string[];
    eventsCount: number;
  };

  outputs: {
    /** Belief-like atoms that ended up in the merged canonical set after S0. */
    posteriorBeliefAtomIds: string[];
    addedBeliefAtomIds: string[];
    droppedBeliefAtomIds: string[];
  };

  params: {
    anxiety?: number | null;
    paranoia?: number | null;
    attention?: number | null;
    memoryDecay?: number | null;
  };

  notes: string[];
};

function uniq(xs: string[], max: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of xs) {
    if (!x) continue;
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
    if (out.length >= max) break;
  }
  return out;
}

function slice0(xs: string[], max: number): string[] {
  return xs.length > max ? xs.slice(0, max) : xs;
}

function numOrNull(x: any): number | null {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function pickTrait(agent: any, keys: string[]): number | null {
  for (const k of keys) {
    const v = agent?.traits?.[k] ?? agent?.psych?.[k] ?? agent?.mind?.[k] ?? agent?.[k];
    const n = numOrNull(v);
    if (n != null) return n;
  }
  return null;
}

function idStartsWithAny(id: string, prefixes: string[]): boolean {
  for (const p of prefixes) if (id.startsWith(p)) return true;
  return false;
}

/**
 * Minimal, honest snapshot of how S0 combined prior belief + overrides + observations.
 *
 * This does NOT attempt to fully model U(b,a,o) (that lives across later stages),
 * but it gives you a strict, inspectable interface for the “belief prior injection” step.
 */
export function buildBeliefUpdateLiteSnapshot(input: {
  world: WorldState;
  agent: AgentState;
  selfId: string;
  tick: number;
  mergedAtomsS0: ContextAtom[];
  obsAtomIds: string[];
  priorBeliefAtomIds: string[];
  overrideAtomIds: string[];
  eventsCount: number;
  params?: BeliefUpdateLiteParams;
}): BeliefUpdateLiteSnapshot {
  const maxIds = Number(input.params?.maxIds ?? 800);
  const notes: string[] = [];

  // Best-effort extraction of “belief-like” atoms that are present after S0 merge.
  // In this codebase, beliefs commonly live in ids with `belief:` or `mem:` prefixes,
  // but we also keep prior ids as a fallback.
  const mergedIds = new Set<string>();
  for (const a of arr(input.mergedAtomsS0)) {
    const id = typeof (a as any)?.id === 'string' ? String((a as any).id) : '';
    if (!id) continue;
    mergedIds.add(id);
  }

  const beliefPrefixes = ['belief:', 'mem:', 'memory:', 'ctx:belief:'];
  const posteriorBelief: string[] = [];
  for (const id of mergedIds) {
    if (idStartsWithAny(id, beliefPrefixes)) posteriorBelief.push(id);
  }

  // Fallback: if no belief-prefixed ids exist, treat explicit prior ids as the belief set.
  const posteriorBeliefAtomIds = posteriorBelief.length
    ? uniq(posteriorBelief, maxIds)
    : uniq(input.priorBeliefAtomIds.filter((id) => mergedIds.has(id)), maxIds);
  if (!posteriorBelief.length) {
    notes.push('No belief:* atoms detected in merged S0; posteriorBeliefAtomIds derived from priorBeliefAtomIds ∩ mergedAtomsS0.');
  }

  const priorSet = new Set(input.priorBeliefAtomIds);
  const postSet = new Set(posteriorBeliefAtomIds);

  const added: string[] = [];
  for (const id of postSet) if (!priorSet.has(id)) added.push(id);

  const dropped: string[] = [];
  for (const id of priorSet) if (!postSet.has(id)) dropped.push(id);

  // Best-effort psych params (future target: explicit distortions/attention/memory configs).
  const anxiety = pickTrait(input.agent as any, ['anxiety', 'traitAnxiety', 'anx']);
  const paranoia = pickTrait(input.agent as any, ['paranoia', 'traitParanoia']);
  const attention = pickTrait(input.agent as any, ['attention', 'attn']);
  const memoryDecay = pickTrait(input.agent as any, ['memoryDecay', 'forgetting', 'decay']);
  if (anxiety == null && paranoia == null) notes.push('No anxiety/paranoia-like trait found on agent; params.anxiety/paranoia are null.');

  return {
    kind: 'beliefUpdateLite',
    selfId: input.selfId,
    tick: input.tick,
    inputs: {
      obsAtomIds: slice0(uniq(input.obsAtomIds, maxIds), maxIds),
      priorBeliefAtomIds: slice0(uniq(input.priorBeliefAtomIds, maxIds), maxIds),
      overrideAtomIds: slice0(uniq(input.overrideAtomIds, maxIds), maxIds),
      eventsCount: Number(input.eventsCount ?? 0),
    },
    outputs: {
      posteriorBeliefAtomIds: slice0(posteriorBeliefAtomIds, maxIds),
      addedBeliefAtomIds: slice0(uniq(added, maxIds), maxIds),
      droppedBeliefAtomIds: slice0(uniq(dropped, maxIds), maxIds),
    },
    params: {
      anxiety,
      paranoia,
      attention,
      memoryDecay,
    },
    notes,
  };
}
