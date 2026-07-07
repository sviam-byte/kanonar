// lib/simkit/actions/objectSpec.ts
//
// Object v0 (MVP-0, I-1.2): a resource token living entirely in world.facts —
// NOTHING in entity types. Fact `obj:v0:<objId> = { holderId, locId }`.
// Three actions change ownership and emit an `obj:transfer` event:
//   take  — object lies in the actor's location (holderId === null)
//   give  — actor holds it, recipient is a character in talk range
//   seize — another character in the same location holds it
// The object's presence/ownership changes the MENU (enumerate), which is the
// A4 proto-claim: ablating the object removes take/seize candidates.
//
// Forbidden here by the MVP-0 freeze (KANONAR_PHASE_I_IMPL_PLAN §3): inventory,
// weight, durability, crafting, affordance v1, context axes. Object v1 (typed
// contract, possibility gates, context axes) is I-2 — do not grow this file.

import type { ActionSpec, OfferCtx, ValidateCtx, ApplyCtx } from './specs';
import type { ActionOffer, SimEvent, SimWorld } from '../core/types';
import { distSameLocation, getSpatialConfig } from '../core/spatial';
import { clamp01 } from '../../util/math';

export const OBJ_V0_PREFIX = 'obj:v0:';

export type ObjectV0State = { holderId: string | null; locId: string };

export function objectFactKey(objId: string): string {
  return `${OBJ_V0_PREFIX}${objId}`;
}

/** All v0 objects, sorted by objId for deterministic enumeration. */
export function listObjectsV0(world: SimWorld): Array<{ objId: string; state: ObjectV0State }> {
  const out: Array<{ objId: string; state: ObjectV0State }> = [];
  for (const key of Object.keys(world.facts || {}).sort()) {
    if (!key.startsWith(OBJ_V0_PREFIX)) continue;
    const raw = (world.facts as any)[key];
    if (!raw || typeof raw !== 'object') continue;
    out.push({
      objId: key.slice(OBJ_V0_PREFIX.length),
      state: {
        holderId: raw.holderId != null ? String(raw.holderId) : null,
        locId: String(raw.locId ?? ''),
      },
    });
  }
  return out;
}

function readObject(world: SimWorld, objId: string): ObjectV0State | null {
  const raw = (world.facts as any)?.[objectFactKey(objId)];
  if (!raw || typeof raw !== 'object') return null;
  return {
    holderId: raw.holderId != null ? String(raw.holderId) : null,
    locId: String(raw.locId ?? ''),
  };
}

/** Location of the object right now: its holder's location, or its own. */
function objectLocId(world: SimWorld, state: ObjectV0State): string {
  if (state.holderId) {
    const holder = world.characters[state.holderId];
    if (holder) return String(holder.locId);
  }
  return state.locId;
}

/**
 * Resolve which object an action refers to. Offers built by enumerate carry
 * meta.objectId, but SimAction→offer conversion (validate.ts toOffer) and the
 * decider plugin's grounding may drop meta — so validation/apply fall back to
 * a deterministic inference from world state (first matching objId, sorted).
 */
export function resolveObjectId(
  world: SimWorld,
  kind: 'take' | 'give' | 'seize',
  actorId: string,
  targetId: string | null,
  explicitId?: string,
): string | null {
  if (explicitId) return explicitId;
  const actor = world.characters[actorId];
  if (!actor) return null;
  for (const { objId, state } of listObjectsV0(world)) {
    if (kind === 'take' && state.holderId === null && state.locId === actor.locId) return objId;
    if (kind === 'give' && state.holderId === actorId) return objId;
    if (kind === 'seize' && state.holderId && state.holderId !== actorId) {
      if (targetId && state.holderId !== targetId) continue;
      const holder = world.characters[state.holderId];
      if (holder && holder.locId === actor.locId) return objId;
    }
  }
  return null;
}

function inGiveRange(world: SimWorld, actorId: string, targetId: string): boolean {
  const a = world.characters[actorId];
  const b = world.characters[targetId];
  if (!a || !b || a.locId !== b.locId) return false;
  try {
    const d = distSameLocation(world, actorId, targetId);
    return Number.isFinite(d) ? d <= getSpatialConfig(world).talkRange : true;
  } catch {
    return true; // same location without positions: allow (generic-social convention)
  }
}

function transferEvent(
  world: SimWorld,
  kind: 'take' | 'give' | 'seize',
  objId: string,
  actorId: string,
  fromId: string | null,
  toId: string,
): SimEvent {
  return {
    id: `evt:obj:transfer:${kind}:${world.tickIndex}:${actorId}:${objId}`,
    type: 'obj:transfer',
    payload: {
      kind,
      objectId: objId,
      actorId,
      fromId,
      toId,
      locationId: String(world.characters[actorId]?.locId ?? ''),
      tick: world.tickIndex,
    },
  };
}

function setHolder(world: SimWorld, objId: string, holderId: string | null, locId: string) {
  (world.facts as any)[objectFactKey(objId)] = { holderId, locId };
}

const passthroughValidate = ({ offer }: ValidateCtx): ActionOffer => ({ ...offer, blocked: Boolean(offer.blocked), reason: offer.reason ?? null });

export const TakeSpec: ActionSpec = {
  kind: 'take',
  enumerate: ({ world, actorId }: OfferCtx): ActionOffer[] => {
    const actor = world.characters[actorId];
    if (!actor) return [];
    const offers: ActionOffer[] = [];
    for (const { objId, state } of listObjectsV0(world)) {
      if (state.holderId !== null) continue;
      if (state.locId !== actor.locId) continue;
      offers.push({
        kind: 'take',
        actorId,
        targetId: null,
        score: 0.35,
        meta: { objectId: objId },
        reason: null,
      } as ActionOffer);
    }
    return offers;
  },
  validateV1: ({ world, actorId, offer }: ValidateCtx): ActionOffer => {
    const explicit = String((offer as any)?.meta?.objectId ?? '') || undefined;
    const objId = resolveObjectId(world, 'take', actorId, offer.targetId ?? null, explicit);
    const state = objId ? readObject(world, objId) : null;
    const actor = world.characters[actorId];
    if (!objId || !state || !actor) return { ...offer, blocked: true, reason: 'take:no_object' };
    if (state.holderId !== null) return { ...offer, blocked: true, reason: 'take:already_held' };
    if (state.locId !== actor.locId) return { ...offer, blocked: true, reason: 'take:not_here' };
    return { ...offer, blocked: false, reason: null };
  },
  validateV2: passthroughValidate,
  classifyV3: () => 'single',
  apply: ({ world, action }: ApplyCtx) => {
    const notes: string[] = [];
    const events: SimEvent[] = [];
    const actorId = action.actorId;
    const explicit = String((action as any)?.meta?.objectId ?? (action as any)?.payload?.objectId ?? '') || undefined;
    const objId = resolveObjectId(world, 'take', actorId, action.targetId ?? null, explicit);
    const state = objId ? readObject(world, objId) : null;
    const actor = world.characters[actorId];
    if (!objId || !state || !actor || state.holderId !== null || state.locId !== actor.locId) {
      return { world, events, notes: [`take failed: ${actorId} obj=${objId || '(none)'}`] };
    }
    setHolder(world, objId, actorId, actor.locId);
    events.push(transferEvent(world, 'take', objId, actorId, null, actorId));
    notes.push(`take: ${actorId} picks up ${objId}`);
    return { world, events, notes };
  },
};

export const GiveSpec: ActionSpec = {
  kind: 'give',
  enumerate: ({ world, actorId }: OfferCtx): ActionOffer[] => {
    const actor = world.characters[actorId];
    if (!actor) return [];
    const offers: ActionOffer[] = [];
    for (const { objId, state } of listObjectsV0(world)) {
      if (state.holderId !== actorId) continue;
      for (const otherId of Object.keys(world.characters).sort()) {
        if (otherId === actorId) continue;
        if (!inGiveRange(world, actorId, otherId)) continue;
        offers.push({
          kind: 'give',
          actorId,
          targetId: otherId,
          score: 0.3,
          meta: { objectId: objId },
          reason: null,
        } as ActionOffer);
      }
    }
    return offers;
  },
  validateV1: ({ world, actorId, offer }: ValidateCtx): ActionOffer => {
    const explicit = String((offer as any)?.meta?.objectId ?? '') || undefined;
    const objId = resolveObjectId(world, 'give', actorId, offer.targetId ?? null, explicit);
    const state = objId ? readObject(world, objId) : null;
    const targetId = String(offer.targetId ?? '');
    if (!objId || !state) return { ...offer, blocked: true, reason: 'give:no_object' };
    if (state.holderId !== actorId) return { ...offer, blocked: true, reason: 'give:not_holder' };
    if (!targetId || !world.characters[targetId]) return { ...offer, blocked: true, reason: 'give:no_target' };
    if (!inGiveRange(world, actorId, targetId)) return { ...offer, blocked: true, reason: 'give:out_of_range' };
    return { ...offer, blocked: false, reason: null };
  },
  validateV2: passthroughValidate,
  classifyV3: () => 'single',
  apply: ({ world, action }: ApplyCtx) => {
    const notes: string[] = [];
    const events: SimEvent[] = [];
    const actorId = action.actorId;
    const targetId = String(action.targetId ?? '');
    const explicit = String((action as any)?.meta?.objectId ?? (action as any)?.payload?.objectId ?? '') || undefined;
    const objId = resolveObjectId(world, 'give', actorId, targetId || null, explicit);
    const state = objId ? readObject(world, objId) : null;
    const target = targetId ? world.characters[targetId] : null;
    if (!objId || !state || !target || state.holderId !== actorId || !inGiveRange(world, actorId, targetId)) {
      return { world, events, notes: [`give failed: ${actorId} -> ${targetId || '(none)'} obj=${objId || '(none)'}`] };
    }
    setHolder(world, objId, targetId, target.locId);
    events.push(transferEvent(world, 'give', objId, actorId, actorId, targetId));
    notes.push(`give: ${actorId} hands ${objId} to ${targetId}`);
    return { world, events, notes };
  },
};

export const SeizeSpec: ActionSpec = {
  kind: 'seize',
  enumerate: ({ world, actorId }: OfferCtx): ActionOffer[] => {
    const actor = world.characters[actorId];
    if (!actor) return [];
    const offers: ActionOffer[] = [];
    for (const { objId, state } of listObjectsV0(world)) {
      const holderId = state.holderId;
      if (!holderId || holderId === actorId) continue;
      const holder = world.characters[holderId];
      if (!holder || holder.locId !== actor.locId) continue;
      offers.push({
        kind: 'seize',
        actorId,
        targetId: holderId,
        score: 0.3,
        meta: { objectId: objId },
        reason: null,
      } as ActionOffer);
    }
    return offers;
  },
  validateV1: ({ world, actorId, offer }: ValidateCtx): ActionOffer => {
    const explicit = String((offer as any)?.meta?.objectId ?? '') || undefined;
    const objId = resolveObjectId(world, 'seize', actorId, offer.targetId ?? null, explicit);
    const state = objId ? readObject(world, objId) : null;
    const actor = world.characters[actorId];
    if (!objId || !state || !actor) return { ...offer, blocked: true, reason: 'seize:no_object' };
    const holderId = state.holderId;
    if (!holderId || holderId === actorId) return { ...offer, blocked: true, reason: 'seize:not_held_by_other' };
    const holder = world.characters[holderId];
    if (!holder || holder.locId !== actor.locId) return { ...offer, blocked: true, reason: 'seize:holder_not_here' };
    return { ...offer, blocked: false, reason: null };
  },
  validateV2: passthroughValidate,
  classifyV3: () => 'single',
  apply: ({ world, action }: ApplyCtx) => {
    const notes: string[] = [];
    const events: SimEvent[] = [];
    const actorId = action.actorId;
    const explicit = String((action as any)?.meta?.objectId ?? (action as any)?.payload?.objectId ?? '') || undefined;
    const objId = resolveObjectId(world, 'seize', actorId, action.targetId ?? null, explicit);
    const state = objId ? readObject(world, objId) : null;
    const actor = world.characters[actorId];
    const holderId = state?.holderId ?? null;
    const holder = holderId ? world.characters[holderId] : null;
    if (!state || !actor || !holderId || holderId === actorId || !holder || holder.locId !== actor.locId) {
      return { world, events, notes: [`seize failed: ${actorId} obj=${objId || '(none)'}`] };
    }
    setHolder(world, objId, actorId, actor.locId);
    // Coercive act: same magnitudes as the existing `challenge` generic effects
    // (no new constants invented in MVP-0).
    holder.stress = clamp01(holder.stress + 0.04);
    const facts: any = world.facts;
    if (!facts.relations) facts.relations = {};
    if (!facts.relations[holderId]) facts.relations[holderId] = {};
    if (!facts.relations[holderId][actorId]) facts.relations[holderId][actorId] = {};
    const curThreat = Number(facts.relations[holderId][actorId].threat ?? 0);
    facts.relations[holderId][actorId].threat = clamp01((Number.isFinite(curThreat) ? curThreat : 0) + 0.05);
    events.push(transferEvent(world, 'seize', objId, actorId, holderId, actorId));
    notes.push(`seize: ${actorId} seizes ${objId} from ${holderId}`);
    return { world, events, notes };
  },
};
