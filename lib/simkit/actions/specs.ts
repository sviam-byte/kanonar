// lib/simkit/actions/specs.ts
// ActionSpecs: single source of truth for action affordances.
//
// Each spec encodes:
// - when possible (enumerate)
// - requirements / blocking (validate)
// - atomicity (single tick vs intent) — v0 is always 'single'
// - apply semantics still live in core/rules.applyAction

import type { ActionKind, ActionOffer, SimWorld } from '../core/types';
import { getChar, getLoc } from '../core/world';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export type Atomicity = 'single' | 'intent';

export type OfferCtx = {
  world: SimWorld;
  actorId: string;
};

export type ActionSpec = {
  kind: ActionKind;
  atomicity: Atomicity;
  enumerate: (ctx: OfferCtx) => ActionOffer[];
  validateOffer: (ctx: OfferCtx, offer: ActionOffer) => ActionOffer;
};

function validateCommon(_ctx: OfferCtx, o: ActionOffer): ActionOffer {
  // Normalize: default fields
  const score = Number(o.score ?? 0);
  return {
    ...o,
    score: Number.isFinite(score) ? score : 0,
    blocked: Boolean(o.blocked),
    reason: o.reason ?? null,
  };
}

const WaitSpec: ActionSpec = {
  kind: 'wait',
  atomicity: 'single',
  enumerate: ({ actorId }) => [{ kind: 'wait', actorId, score: 0.1 }],
  validateOffer: (ctx, o) => validateCommon(ctx, o),
};

const RestSpec: ActionSpec = {
  kind: 'rest',
  atomicity: 'single',
  enumerate: ({ world, actorId }) => {
    const c = getChar(world, actorId);
    // REST если энергия низкая
    return [{ kind: 'rest', actorId, score: clamp01((0.6 - c.energy) * 2) }];
  },
  validateOffer: (ctx, o) => validateCommon(ctx, o),
};

const WorkSpec: ActionSpec = {
  kind: 'work',
  atomicity: 'single',
  enumerate: ({ world, actorId }) => {
    const c = getChar(world, actorId);
    // WORK если энергия не слишком низкая
    return [{ kind: 'work', actorId, score: clamp01((c.energy - 0.2) * 0.8) }];
  },
  validateOffer: (ctx, o) => validateCommon(ctx, o),
};

const MoveSpec: ActionSpec = {
  kind: 'move',
  atomicity: 'single',
  enumerate: ({ world, actorId }) => {
    const c = getChar(world, actorId);
    const loc = getLoc(world, c.locId);
    const out: ActionOffer[] = [];
    for (const n of loc.neighbors || []) {
      // v0 heuristic score (replace with GoalLab scoring later)
      out.push({ kind: 'move', actorId, targetId: n, score: 0.2 });
    }
    return out;
  },
  validateOffer: (ctx, o) => {
    const base = validateCommon(ctx, o);
    try {
      const c = getChar(ctx.world, base.actorId);
      const loc = getLoc(ctx.world, c.locId);
      const to = String(base.targetId ?? '');
      const ok = !!to && (loc.neighbors || []).includes(to);
      if (!ok) return { ...base, blocked: true, reason: 'not-a-neighbor', score: 0 };
      return base;
    } catch {
      return { ...base, blocked: true, reason: 'invalid', score: 0 };
    }
  },
};

const TalkSpec: ActionSpec = {
  kind: 'talk',
  atomicity: 'single',
  enumerate: ({ world, actorId }) => {
    const c = getChar(world, actorId);
    const out: ActionOffer[] = [];
    for (const other of Object.values(world.characters)) {
      if (other.id === c.id) continue;
      if (other.locId !== c.locId) continue;
      out.push({ kind: 'talk', actorId, targetId: other.id, score: 0.15 });
    }
    return out;
  },
  validateOffer: (ctx, o) => {
    const base = validateCommon(ctx, o);
    try {
      const c = getChar(ctx.world, base.actorId);
      const otherId = String(base.targetId ?? '');
      const other = ctx.world.characters[otherId];
      if (!other) return { ...base, blocked: true, reason: 'no-target', score: 0 };
      if (other.locId !== c.locId) return { ...base, blocked: true, reason: 'not-same-location', score: 0 };
      return base;
    } catch {
      return { ...base, blocked: true, reason: 'invalid', score: 0 };
    }
  },
};

export const ACTION_SPECS: Record<ActionKind, ActionSpec> = {
  wait: WaitSpec,
  rest: RestSpec,
  work: WorkSpec,
  move: MoveSpec,
  talk: TalkSpec,
};

export function enumerateActionOffers(world: SimWorld): ActionOffer[] {
  const offers: ActionOffer[] = [];

  const actorIds = Object.keys(world.characters || {}).sort();
  for (const actorId of actorIds) {
    for (const kind of Object.keys(ACTION_SPECS).sort() as ActionKind[]) {
      const spec = ACTION_SPECS[kind];
      const raw = spec.enumerate({ world, actorId });
      for (const o of raw) {
        const validated = spec.validateOffer({ world, actorId }, o);
        offers.push(validated);
      }
    }
  }

  // deterministic ordering
  return offers.sort((a, b) => (b.score - a.score)
    || a.actorId.localeCompare(b.actorId)
    || String(a.targetId ?? '').localeCompare(String(b.targetId ?? ''))
    || a.kind.localeCompare(b.kind));
}
