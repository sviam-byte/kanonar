// lib/simkit/actions/validate.ts
// Strict 3-layer validation for "one tick = one atomic contour".
//
// V1: syntactic/existence (actor/target/args/reachability)
// V2: policy/permissions (norms, blocks)
// V3: atomicity (single vs intent)
//
// If V3 fails => normalize to start_intent (single-tick).
// If V1/V2 fails => fallback to wait (or return not allowed).

import type { ActionKind, ActionOffer, SimAction, SimWorld } from '../core/types';
import { ACTION_SPECS } from './specs';

export type ValidationResult = {
  allowed: boolean;
  singleTick: boolean;
  reasons: string[];
  normalizedAction?: SimAction | null;
  fallbackAction?: SimAction | null;
};

function toOffer(a: SimAction): ActionOffer {
  return {
    kind: a.kind,
    actorId: a.actorId,
    targetId: a.targetId ?? null,
    score: 0,
    blocked: false,
    reason: null,
  };
}

function mkWait(world: SimWorld, actorId: string): SimAction {
  return {
    id: `act:wait:${world.tickIndex}:${actorId}:fallback`,
    kind: 'wait',
    actorId,
    targetId: null,
  };
}

export function validateActionStrict(world: SimWorld, a: SimAction): ValidationResult {
  const spec = ACTION_SPECS[a.kind as ActionKind];
  if (!spec) {
    return {
      allowed: false,
      singleTick: true,
      reasons: [`v1:no-spec:${String(a.kind)}`],
      fallbackAction: mkWait(world, a.actorId),
    };
  }

  const baseOffer = toOffer(a);

  const v1 = spec.validateV1({ world, actorId: a.actorId, offer: baseOffer });
  if (v1.blocked) {
    return {
      allowed: false,
      singleTick: true,
      reasons: [String(v1.reason || 'v1:blocked')],
      fallbackAction: mkWait(world, a.actorId),
    };
  }

  const v2 = spec.validateV2({ world, actorId: a.actorId, offer: v1 });
  if (v2.blocked) {
    return {
      allowed: false,
      singleTick: true,
      reasons: [String(v2.reason || 'v2:blocked')],
      fallbackAction: mkWait(world, a.actorId),
    };
  }

  const atomicity = spec.classifyV3({ world, actorId: a.actorId, offer: v2 });
  if (atomicity === 'intent') {
    const intentId = `intent:${a.actorId}:${world.tickIndex}:${a.kind}`;
    const normalized: SimAction = {
      id: `act:start_intent:${world.tickIndex}:${a.actorId}:${a.kind}`,
      kind: 'start_intent',
      actorId: a.actorId,
      targetId: a.targetId ?? null,
      payload: {
        intentId,
        intent: {
          originalAction: {
            id: a.id,
            kind: a.kind,
            actorId: a.actorId,
            targetId: a.targetId ?? null,
            payload: a.payload ?? null,
          },
        },
      },
    };

    return {
      allowed: true,
      singleTick: false,
      reasons: ['v3:intent'],
      normalizedAction: normalized,
    };
  }

  return {
    allowed: true,
    singleTick: true,
    reasons: [],
    normalizedAction: null,
  };
}
