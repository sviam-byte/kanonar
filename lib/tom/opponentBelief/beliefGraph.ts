// R7-FOUNDATION-0 first pure-domain slice: a sparse directed belief graph over
// an explicit participant set. Directed observer→target edges are bounded by
// N·(N−1); self-belief is a separate node (observerId === targetId) held OUTSIDE
// that bound, reusing the validated OpponentBeliefV1 shape (author ADR
// 2026-07-13). This module is pure domain: it validates and folds an explicit
// set of beliefs; it does not build beliefs, touch S5, or wire into any runtime.
// See docs/unification/R7_FOUNDATION_0.md §3.3.

import { codeUnitCompare } from '../../utils/compare';
import type { OpponentBeliefV1 } from './types';

export const BELIEF_GRAPH_SCHEMA_VERSION = 1 as const;

/** A directed graph without self-loops has exactly N·(N−1) edges when fully connected. */
export function maxDirectedEdgesV1(participantCount: number): number {
  return participantCount <= 1 ? 0 : participantCount * (participantCount - 1);
}

export function beliefGraphEdgeKeyV1(observerId: string, targetId: string): string {
  return `${observerId}->${targetId}`;
}

export interface BeliefGraphV1 {
  readonly schemaVersion: typeof BELIEF_GRAPH_SCHEMA_VERSION;
  // Ordered, unique participant ids.
  readonly participants: readonly string[];
  // Directed observer→target edges: observerId !== targetId, unique per pair,
  // sorted by (observerId, targetId). Count is invariant-bounded by N·(N−1).
  readonly directed: readonly OpponentBeliefV1[];
  // Self nodes (observerId === targetId), one per participant at most, sorted.
  // Kept out of the directed bound by construction.
  readonly selfBeliefs: readonly OpponentBeliefV1[];
}

export type BeliefGraphErrorV1 =
  | { readonly code: 'empty_participants'; readonly message: string }
  | { readonly code: 'duplicate_participant'; readonly participantId: string; readonly message: string }
  | { readonly code: 'unknown_participant'; readonly beliefId: string; readonly participantId: string; readonly message: string }
  | { readonly code: 'duplicate_belief'; readonly key: string; readonly message: string };

export type BeliefGraphConstructionV1 =
  | { readonly ok: true; readonly value: BeliefGraphV1 }
  | { readonly ok: false; readonly errors: readonly BeliefGraphErrorV1[] };

function sortBeliefs(beliefs: readonly OpponentBeliefV1[]): OpponentBeliefV1[] {
  return [...beliefs].sort(
    (a, b) => codeUnitCompare(a.observerId, b.observerId) || codeUnitCompare(a.targetId, b.targetId),
  );
}

/**
 * Fail-closed sparse directed belief graph over an explicit participant set.
 * A belief with observerId === targetId is folded into `selfBeliefs`; every
 * other belief is a directed edge. Fails on an empty participant set, empty or
 * duplicate participant ids, a belief referencing an unknown participant, or a
 * duplicate (observer, target) pair. Output edge/self arrays are deterministically
 * sorted so the same beliefs in any input order produce an identical graph.
 */
export function buildBeliefGraphV1(input: {
  readonly participants: readonly string[];
  readonly beliefs: readonly OpponentBeliefV1[];
}): BeliefGraphConstructionV1 {
  const errors: BeliefGraphErrorV1[] = [];

  const participantSet = new Set<string>();
  if (input.participants.length === 0) {
    errors.push({ code: 'empty_participants', message: 'participant set must be non-empty' });
  }
  for (const id of input.participants) {
    if (!id) {
      errors.push({ code: 'empty_participants', message: 'participant ids must be non-empty' });
      continue;
    }
    if (participantSet.has(id)) {
      errors.push({ code: 'duplicate_participant', participantId: id, message: `duplicate participant ${id}` });
    } else {
      participantSet.add(id);
    }
  }

  const directed: OpponentBeliefV1[] = [];
  const selfBeliefs: OpponentBeliefV1[] = [];
  const seenEdges = new Set<string>();
  for (const belief of input.beliefs) {
    const key = beliefGraphEdgeKeyV1(belief.observerId, belief.targetId);
    if (seenEdges.has(key)) {
      errors.push({ code: 'duplicate_belief', key, message: `duplicate belief for ${key}` });
      continue;
    }
    seenEdges.add(key);
    for (const id of [belief.observerId, belief.targetId]) {
      if (!participantSet.has(id)) {
        errors.push({
          code: 'unknown_participant',
          beliefId: belief.beliefId,
          participantId: id,
          message: `belief ${belief.beliefId} references unknown participant ${id}`,
        });
      }
    }
    if (belief.observerId === belief.targetId) selfBeliefs.push(belief);
    else directed.push(belief);
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      schemaVersion: BELIEF_GRAPH_SCHEMA_VERSION,
      participants: [...participantSet].sort(codeUnitCompare),
      directed: sortBeliefs(directed),
      selfBeliefs: sortBeliefs(selfBeliefs),
    },
  };
}
