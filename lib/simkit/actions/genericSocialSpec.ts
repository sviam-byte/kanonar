// lib/simkit/actions/genericSocialSpec.ts
// Generic fallback spec for pipeline-generated social actions not in ACTION_SPECS.
//
// Philosophy: any action the GoalLab pipeline decides is valid to attempt.
// Effects are derived from BASE_EFFECTS (actionProjection.ts) when available,
// otherwise minimal stress/trust defaults are applied.

import type { ActionSpec, OfferCtx, ApplyCtx } from './specs';
import type { SimEvent } from '../core/types';
import { distSameLocation, getSpatialConfig } from '../core/spatial';
import { clamp01 } from '../../util/math';
import { actionEffectForKind } from '../../decision/actionProjection';

function bumpFact(facts: any, key: string, delta: number, min = 0, max = 1) {
  const cur = Number(facts[key] ?? 0);
  facts[key] = Math.max(min, Math.min(max, (Number.isFinite(cur) ? cur : 0) + delta));
}

function bumpRelation(facts: any, fromId: string, toId: string, key: string, delta: number) {
  if (!facts.relations) facts.relations = {};
  if (!facts.relations[fromId]) facts.relations[fromId] = {};
  if (!facts.relations[fromId][toId]) facts.relations[fromId][toId] = {};
  const cur = Number(facts.relations[fromId][toId][key] ?? 0.5);
  facts.relations[fromId][toId][key] = clamp01(cur + delta);
}

/**
 * Build a generic social ActionSpec for a given action kind.
 * This is used at runtime for any kind not found in ACTION_SPECS.
 */
export function buildGenericSocialSpec(kind: string): ActionSpec {
  return {
    kind: kind as any,

    enumerate: (_ctx: OfferCtx) => {
      // Generic social actions are not proposed by SimKit's heuristic;
      // they only arrive via GoalLab pipeline decisions.
      return [];
    },

    validateV1: ({ offer }) => ({ ...offer, blocked: false, reason: null }),
    validateV2: ({ offer }) => ({ ...offer, blocked: false, reason: null }),
    classifyV3: () => 'single',

    apply: ({ world, action }: ApplyCtx) => {
      const notes: string[] = [];
      const events: SimEvent[] = [];

      const actor = world.characters[action.actorId];
      if (!actor) return { world, events, notes: ['no actor'] };

      const effects = actionEffectForKind(kind);
      const hasEffects = Object.keys(effects).length > 0;

      // Apply feature effects to actor's state.
      if (effects.stress) {
        actor.stress = clamp01(actor.stress + effects.stress);
      }
      if (effects.fatigue) {
        actor.energy = clamp01(actor.energy - effects.fatigue);
      }

      // Apply social effects to target (if targeted action).
      const targetId = action.targetId;
      const target = targetId ? world.characters[targetId] : null;

      if (target && targetId) {
        // Check proximity.
        let inRange = false;
        try {
          const d = distSameLocation(world, action.actorId, targetId);
          inRange = Number.isFinite(d) && d <= getSpatialConfig(world).talkRange;
        } catch {
          // distSameLocation may throw if characters lack positions.
          inRange = actor.locId === target.locId;
        }

        if (inRange || actor.locId === target.locId) {
          const trustDelta = effects.socialTrust ?? 0;
          const valenceDelta = effects.emotionValence ?? 0;

          if (trustDelta !== 0) {
            bumpRelation(world.facts as any, targetId, action.actorId, 'trust', trustDelta);
            bumpRelation(world.facts as any, action.actorId, targetId, 'trust', trustDelta * 0.5);
          }

          if (valenceDelta !== 0) {
            target.stress = clamp01(target.stress - valenceDelta * 0.5);
          }

          // Resource effects.
          if (effects.resourceAccess || effects.scarcity) {
            const facts = world.facts as any;
            if (effects.resourceAccess) {
              bumpFact(facts, `ctx:resourceAccess:${action.actorId}`, effects.resourceAccess);
            }
            if (effects.scarcity) {
              bumpFact(facts, `ctx:scarcity:${action.actorId}`, effects.scarcity);
            }
          }

          // Emit action event for observers.
          events.push({
            id: `evt:action:${kind}:${world.tickIndex}:${action.actorId}`,
            type: `action:${kind}`,
            payload: {
              actorId: action.actorId,
              targetId,
              kind,
              locationId: actor.locId,
              effects: hasEffects ? effects : { note: 'no BASE_EFFECTS entry' },
            },
          });

          notes.push(`${kind}: ${action.actorId} -> ${targetId} (trust Δ=${trustDelta.toFixed(3)})`);
        } else {
          notes.push(`${kind}: ${action.actorId} -> ${targetId} OUT OF RANGE`);
        }
      } else {
        // Self-directed action.
        events.push({
          id: `evt:action:${kind}:${world.tickIndex}:${action.actorId}`,
          type: `action:${kind}`,
          payload: {
            actorId: action.actorId,
            kind,
            locationId: actor.locId,
          },
        });
        notes.push(`${kind}: ${action.actorId} (self)`);
      }

      // Write context facts for pipeline visibility.
      const facts = world.facts as any;
      facts[`ctx:lastAction:${action.actorId}`] = kind;
      facts[`ctx:lastActionTick:${action.actorId}`] = world.tickIndex;
      if (targetId) {
        facts[`ctx:lastActionTarget:${action.actorId}`] = targetId;
      }

      return { world, events, notes };
    },
  };
}
