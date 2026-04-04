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

      // Action-specific world effects for richer downstream context.
      if (kind === 'guard') {
        if (targetId) {
          facts[`ctx:guardedBy:${targetId}`] = action.actorId;
          facts[`ctx:guardedBy:${targetId}:tick`] = world.tickIndex;
          const dangerKey = `ctx:danger:${targetId}`;
          const curDanger = clamp01(Number(facts[dangerKey] ?? 0));
          facts[dangerKey] = clamp01(curDanger - 0.15);
          notes.push(`guard: ${action.actorId} protects ${targetId} (danger -0.15)`);
        }
      }

      if (kind === 'hide') {
        facts[`ctx:hidden:${action.actorId}`] = true;
        facts[`ctx:hidden:${action.actorId}:tick`] = world.tickIndex;
        notes.push(`hide: ${action.actorId} becomes hidden`);
      } else if (facts[`ctx:hidden:${action.actorId}`]) {
        // Any non-hide action removes hidden flag.
        delete facts[`ctx:hidden:${action.actorId}`];
        delete facts[`ctx:hidden:${action.actorId}:tick`];
      }

      if (kind === 'investigate' || kind === 'observe_area') {
        bumpFact(facts, `obs:infoAdequacy:${action.actorId}`, 0.12);
        if (targetId && target) {
          facts[`obs:revealed:stress:${action.actorId}:${targetId}`] = clamp01(Number(target.stress ?? 0));
          facts[`obs:revealed:health:${action.actorId}:${targetId}`] = clamp01(Number(target.health ?? 1));
          notes.push(`investigate: ${action.actorId} learns ${targetId} stress=${target.stress.toFixed(2)}`);
        } else {
          const uncKey = `ctx:uncertainty:${action.actorId}`;
          const curUnc = clamp01(Number(facts[uncKey] ?? 0.5));
          facts[uncKey] = clamp01(curUnc - 0.10);
          notes.push(`observe: ${action.actorId} reduces uncertainty -0.10`);
        }
      }

      if (kind === 'treat' && target && targetId) {
        const healAmount = 0.10;
        target.health = clamp01(target.health + healAmount);
        target.stress = clamp01(target.stress - 0.04);
        notes.push(`treat: ${action.actorId} heals ${targetId} +${healAmount.toFixed(2)} hp`);
      }

      if (kind === 'command' && target && targetId) {
        facts[`ctx:commandedBy:${targetId}`] = action.actorId;
        facts[`ctx:commandedBy:${targetId}:tick`] = world.tickIndex;
        const actorAuth = clamp01(Number(facts[`role:clearance:${action.actorId}`] ?? 0.5));
        const targetAuth = clamp01(Number(facts[`role:clearance:${targetId}`] ?? 0.5));
        if (actorAuth > targetAuth) {
          target.stress = clamp01(target.stress - 0.02);
          notes.push(`command: ${action.actorId} commands ${targetId} (authority ${actorAuth.toFixed(2)} > ${targetAuth.toFixed(2)})`);
        } else {
          target.stress = clamp01(target.stress + 0.03);
          notes.push(`command: ${action.actorId} commands ${targetId} (resisted — auth ${actorAuth.toFixed(2)} ≤ ${targetAuth.toFixed(2)})`);
        }
      }

      if (kind === 'share_resource') {
        bumpFact(facts, `ctx:resourceAccess:${action.actorId}`, -0.06);
        if (targetId) {
          bumpFact(facts, `ctx:resourceAccess:${targetId}`, +0.06);
          bumpFact(facts, `ctx:scarcity:${targetId}`, -0.04);
        }
        notes.push(`share: ${action.actorId} transfers resources${targetId ? ` to ${targetId}` : ''}`);
      }

      if (kind === 'encourage' && target && targetId) {
        target.stress = clamp01(target.stress - 0.06);
        target.energy = clamp01(target.energy + 0.03);
        notes.push(`encourage: ${action.actorId} motivates ${targetId} (stress −0.06, energy +0.03)`);
      }

      if (kind === 'suppress' && targetId) {
        facts[`ctx:suppressed:${targetId}`] = action.actorId;
        facts[`ctx:suppressed:${targetId}:tick`] = world.tickIndex;
        if (target) target.stress = clamp01(target.stress + 0.08);
        notes.push(`suppress: ${action.actorId} pins ${targetId}`);
      }

      if (kind === 'retreat') {
        facts[`ctx:retreating:${action.actorId}`] = true;
        facts[`ctx:retreating:${action.actorId}:tick`] = world.tickIndex;
        notes.push(`retreat: ${action.actorId} falling back`);
      }

      if (kind === 'rally') {
        const locId = actor.locId;
        for (const c of Object.values(world.characters || {})) {
          if (c.id === action.actorId || (c as any).locId !== locId) continue;
          const curTrust = clamp01(Number((world.facts as any)?.relations?.[c.id]?.[action.actorId]?.trust ?? 0.5));
          if (curTrust > 0.5) {
            c.stress = clamp01(c.stress - 0.03);
            bumpRelation(world.facts as any, c.id, action.actorId, 'trust', 0.02);
          }
        }
        notes.push(`rally: ${action.actorId} rallies allies`);
      }

      if (kind === 'warn' && targetId && target) {
        const dangerKey = `ctx:danger:${targetId}`;
        const actorDanger = clamp01(Number(facts[`ctx:danger:${action.actorId}`] ?? 0));
        const curTargetDanger = clamp01(Number(facts[dangerKey] ?? 0));
        facts[dangerKey] = clamp01(Math.max(curTargetDanger, actorDanger * 0.7));
        notes.push(`warn: ${action.actorId} warns ${targetId} (danger → ${facts[dangerKey].toFixed(2)})`);
      }

      if (kind === 'confide' && targetId) {
        bumpRelation(world.facts as any, action.actorId, targetId, 'closeness', 0.08);
        bumpRelation(world.facts as any, targetId, action.actorId, 'closeness', 0.06);
        bumpRelation(world.facts as any, action.actorId, targetId, 'familiarity', 0.05);
        bumpRelation(world.facts as any, targetId, action.actorId, 'familiarity', 0.05);
        notes.push(`confide: ${action.actorId} opens up to ${targetId}`);
      }

      if (kind === 'cover_fire' && targetId) {
        facts[`ctx:coveredBy:${targetId}`] = action.actorId;
        facts[`ctx:coveredBy:${targetId}:tick`] = world.tickIndex;
        const dangerKey = `ctx:danger:${targetId}`;
        facts[dangerKey] = clamp01(Number(facts[dangerKey] ?? 0) - 0.10);
        notes.push(`cover_fire: ${action.actorId} covers ${targetId}`);
      }

      if (kind === 'patrol') {
        bumpFact(facts, `obs:infoAdequacy:${action.actorId}`, 0.08);
        const uncKey = `ctx:uncertainty:${action.actorId}`;
        facts[uncKey] = clamp01(Number(facts[uncKey] ?? 0.5) - 0.06);
        notes.push(`patrol: ${action.actorId} patrols area`);
      }

      if (kind === 'plead' && targetId) {
        bumpRelation(world.facts as any, targetId, action.actorId, 'closeness', 0.03);
        notes.push(`plead: ${action.actorId} pleads with ${targetId}`);
      }

      if (kind === 'challenge' && targetId && target) {
        target.stress = clamp01(target.stress + 0.04);
        bumpRelation(world.facts as any, targetId, action.actorId, 'threat', 0.05);
        bumpRelation(world.facts as any, action.actorId, targetId, 'threat', 0.03);
        notes.push(`challenge: ${action.actorId} challenges ${targetId}`);
      }

      return { world, events, notes };
    },
  };
}
