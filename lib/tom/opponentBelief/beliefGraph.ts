import { codeUnitCompare } from '../../utils/compare';
import { validateOpponentBeliefV1, validateSelfBeliefV1 } from './serialization';
import type { OpponentBeliefV1, SelfBeliefV1 } from './types';

export const BELIEF_GRAPH_SCHEMA_VERSION = 1 as const;

/** A directed graph without self-loops has exactly N·(N−1) edges when fully connected. */
export function maxDirectedEdgesV1(participantCount: number): number {
  return participantCount <= 1 ? 0 : participantCount * (participantCount - 1);
}

/** JSON tuple encoding is injective for arbitrary string participant ids. */
export function beliefGraphEdgeKeyV1(observerId: string, targetId: string): string {
  return JSON.stringify([observerId, targetId]);
}

export interface BeliefGraphV1 {
  readonly schemaVersion: typeof BELIEF_GRAPH_SCHEMA_VERSION;
  readonly participants: readonly string[];
  readonly directedBeliefs: readonly OpponentBeliefV1[];
  readonly selfBeliefs: readonly SelfBeliefV1[];
  /** Compatibility alias for the original directed-only graph field. */
  readonly directed: readonly OpponentBeliefV1[];
}

export type BeliefGraphErrorV1 =
  | { readonly code: 'empty_participants'; readonly message: string }
  | { readonly code: 'duplicate_participant'; readonly participantId: string; readonly message: string }
  | { readonly code: 'unknown_participant'; readonly beliefId: string; readonly participantId: string; readonly message: string }
  | { readonly code: 'invalid_belief'; readonly beliefId: string; readonly beliefKind: 'directed' | 'self'; readonly message: string }
  | { readonly code: 'duplicate_belief'; readonly key: string; readonly message: string };

export type BeliefGraphConstructionV1 =
  | { readonly ok: true; readonly value: BeliefGraphV1 }
  | { readonly ok: false; readonly errors: readonly BeliefGraphErrorV1[] };

export type BeliefGraphInputV1 =
  | {
    readonly participants: readonly string[];
    readonly directedBeliefs: readonly OpponentBeliefV1[];
    readonly selfBeliefs: readonly SelfBeliefV1[];
    readonly beliefs?: never;
  }
  | {
    readonly participants: readonly string[];
    /** Compatibility input for the original directed-only call sites. */
    readonly beliefs: readonly OpponentBeliefV1[];
    readonly directedBeliefs?: never;
    readonly selfBeliefs?: never;
  };

function sortDirected(beliefs: readonly OpponentBeliefV1[]): OpponentBeliefV1[] {
  return [...beliefs].sort(
    (a, b) => codeUnitCompare(a.observerId, b.observerId) || codeUnitCompare(a.targetId, b.targetId),
  );
}

function sortSelfBeliefs(beliefs: readonly SelfBeliefV1[]): SelfBeliefV1[] {
  return [...beliefs].sort((a, b) => codeUnitCompare(a.participantId, b.participantId));
}

export function buildBeliefGraphV1(input: BeliefGraphInputV1): BeliefGraphConstructionV1 {
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

  const directedInput = 'directedBeliefs' in input ? input.directedBeliefs : input.beliefs;
  const selfInput = 'selfBeliefs' in input ? input.selfBeliefs : [];
  const directedBeliefs: OpponentBeliefV1[] = [];
  const selfBeliefs: SelfBeliefV1[] = [];
  const seenDirected = new Set<string>();
  const seenSelf = new Set<string>();

  for (const belief of directedInput) {
    const validation = validateOpponentBeliefV1(belief);
    if (!validation.valid) {
      errors.push({
        code: 'invalid_belief',
        beliefId: belief?.beliefId ?? '',
        beliefKind: 'directed',
        message: `invalid directed belief ${belief?.beliefId ?? '<unknown>'}: ${validation.errors.map(error => error.code).join(',')}`,
      });
      continue;
    }
    const key = beliefGraphEdgeKeyV1(belief.observerId, belief.targetId);
    if (seenDirected.has(key)) {
      errors.push({ code: 'duplicate_belief', key, message: `duplicate directed belief for ${key}` });
      continue;
    }
    seenDirected.add(key);
    for (const id of [belief.observerId, belief.targetId]) {
      if (!participantSet.has(id)) {
        errors.push({ code: 'unknown_participant', beliefId: belief.beliefId, participantId: id, message: `belief ${belief.beliefId} references unknown participant ${id}` });
      }
    }
    directedBeliefs.push(structuredClone(belief));
  }

  for (const belief of selfInput) {
    const validation = validateSelfBeliefV1(belief);
    if (!validation.valid) {
      errors.push({
        code: 'invalid_belief',
        beliefId: belief?.beliefId ?? '',
        beliefKind: 'self',
        message: `invalid self belief ${belief?.beliefId ?? '<unknown>'}: ${validation.errors.map(error => error.code).join(',')}`,
      });
      continue;
    }
    if (seenSelf.has(belief.participantId)) {
      errors.push({ code: 'duplicate_belief', key: belief.participantId, message: `duplicate self belief for ${belief.participantId}` });
      continue;
    }
    seenSelf.add(belief.participantId);
    if (!participantSet.has(belief.participantId)) {
      errors.push({ code: 'unknown_participant', beliefId: belief.beliefId, participantId: belief.participantId, message: `belief ${belief.beliefId} references unknown participant ${belief.participantId}` });
    }
    selfBeliefs.push(structuredClone(belief));
  }

  if (errors.length > 0) return { ok: false, errors };

  const sortedDirected = sortDirected(directedBeliefs);
  return {
    ok: true,
    value: {
      schemaVersion: BELIEF_GRAPH_SCHEMA_VERSION,
      participants: [...participantSet].sort(codeUnitCompare),
      directedBeliefs: sortedDirected,
      selfBeliefs: sortSelfBeliefs(selfBeliefs),
      directed: sortedDirected,
    },
  };
}
