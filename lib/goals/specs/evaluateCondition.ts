import type { Condition, CompareOp } from '../../ontology/conditions';
import type { GoalEvalContext } from './evalTypes';

function compare(op: CompareOp, left: number, right: number): boolean {
  switch (op) {
    case '>':
      return left > right;
    case '>=':
      return left >= right;
    case '<':
      return left < right;
    case '<=':
      return left <= right;
    case '==':
      return left === right;
    case '!=':
      return left !== right;
    default:
      return false;
  }
}

/**
 * Evaluates one declarative condition against the normalized evaluation context.
 *
 * The function is deterministic and side-effect free, so callers can safely reuse it
 * in batch derivation, UI explainers, and offline tests.
 */
export function evaluateCondition(condition: Condition, ctx: GoalEvalContext): boolean {
  switch (condition.kind) {
    case 'recent_event':
      return ctx.recentEvents.some((ev) => {
        if (!condition.eventKinds.includes(ev.kind)) return false;
        if (ev.age > condition.maxAge) return false;
        if ((condition.minSalience ?? Number.NEGATIVE_INFINITY) > (ev.salience ?? 0)) return false;

        if (condition.observer === 'self' && ev.observerMode !== 'seen') return false;
        if (condition.targetRole === 'self' && ev.targetId !== ctx.selfId) return false;
        if (condition.targetRole === 'target' && ev.targetId !== ctx.targetId) return false;

        return true;
      });

    case 'appraisal_tag':
      return ctx.appraisals.some((a) => {
        if (!condition.tags.includes(a.tag)) return false;
        if ((condition.minScore ?? Number.NEGATIVE_INFINITY) > a.score) return false;
        if (condition.targetRole === 'target' && a.targetId !== ctx.targetId) return false;
        if (condition.targetRole === 'self' && a.targetId !== ctx.selfId) return false;
        return true;
      });

    case 'metric':
      return compare(condition.op, Number(ctx.metrics[condition.metric] ?? 0), condition.value);

    case 'belief':
      return condition.mode === 'all'
        ? condition.atomIds.every((id) => ctx.beliefs.has(id))
        : condition.atomIds.some((id) => ctx.beliefs.has(id));

    case 'capability':
      return condition.mode === 'all'
        ? condition.capabilityIds.every((id) => ctx.capabilities.has(id))
        : condition.capabilityIds.some((id) => ctx.capabilities.has(id));

    case 'cooldown_ready':
      return condition.actionIds.every((id) => ctx.cooldownReady.has(id));

    case 'not_repeated': {
      // Current compact version does not have per-action age; we keep horizon in schema
      // for future precision, while enforcing count-based anti-spam today.
      const count = ctx.recentActionKinds.filter((a) => condition.actionIds.includes(a)).length;
      return count <= condition.maxCount;
    }

    case 'target_exists':
      return Boolean(ctx.targetId);

    case 'target_reachable': {
      const distance = Number(ctx.metrics.distance ?? Number.POSITIVE_INFINITY);
      return distance <= (condition.maxDistance ?? Number.POSITIVE_INFINITY);
    }

    case 'target_communicable': {
      const distance = Number(ctx.metrics.distance ?? Number.POSITIVE_INFINITY);
      return distance <= (condition.maxDistance ?? 2);
    }

    case 'instrumental_need':
      return Number(ctx.metrics.utility_of_target ?? 0) >= condition.minValue;

    case 'all':
      return condition.conditions.every((c) => evaluateCondition(c, ctx));

    case 'any':
      return condition.conditions.some((c) => evaluateCondition(c, ctx));

    case 'not':
      return !evaluateCondition(condition.condition, ctx);

    default:
      return false;
  }
}
