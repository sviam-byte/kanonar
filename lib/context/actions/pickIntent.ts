import type { ActionIntent } from '../types';
import type { TickContext } from '../engineTypes';

export function defaultPickIntent(
  intents: ActionIntent[],
  ctx: TickContext
): ActionIntent | null {
  if (!intents.length) return null;

  let best: ActionIntent | null = null;
  let bestScore = -Infinity;

  for (const intent of intents) {
    const def = ctx.actionCatalog[intent.actionId];
    if (!def) continue;

    let score = 0;

    if (def.effects) {
      const previewWorld = {
        ...ctx.world,
        contextEx: {
          ...ctx.world.contextEx,
          metrics: { ...ctx.world.contextEx.metrics },
          locationOf: { ...ctx.world.contextEx.locationOf },
        },
      };
      for (const eff of def.effects(previewWorld, intent)) {
        score += eff.deltaMean * (ctx.goalWeights?.[eff.metric] ?? 1);
      }
    }

    if (def.baseRisk) score -= def.baseRisk;

    if (ctx.normViolations?.includes(intent.actionId)) {
      score -= 5;
    }

    if (score > bestScore) {
      bestScore = score;
      best = intent;
    }
  }

  return best;
}
