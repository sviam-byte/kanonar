import { FC } from '../../config/formulaConfig';
import type { GoalEvalContext } from '../../goals/specs/evalTypes';
import { evaluateCondition } from '../../goals/specs/evaluateCondition';
import type { DerivedIntentCandidateV1 } from '../../intents/specs/types';
import { ACTION_SCHEMAS_V1 } from './registry';
import type { DerivedActionSchemaCandidateV1 } from './types';

/**
 * Evaluate schemas for one intent. Now respects preconditions and enriched fields.
 */
export function evaluateActionSchema(
  intent: DerivedIntentCandidateV1,
  ctx?: GoalEvalContext,
): DerivedActionSchemaCandidateV1[] {
  return ACTION_SCHEMAS_V1
    .filter((s) => s.intentIds.includes(intent.intentId))
    .map((schema): DerivedActionSchemaCandidateV1 | null => {
      const reasons: string[] = [];

      // Evaluate preconditions if GoalEvalContext available
      if (ctx) {
        const actorOk = (schema.actorPreconditions ?? []).every((c) => evaluateCondition(c, ctx));
        if (!actorOk) return null;

        const targetOk = (schema.targetPreconditions ?? []).every((c) => evaluateCondition(c, ctx));
        if (!targetOk) return null;

        const worldOk = (schema.worldPreconditions ?? []).every((c) => evaluateCondition(c, ctx));
        if (!worldOk) return null;

        const blocked = (schema.blockers ?? []).some((c) => evaluateCondition(c, ctx));
        if (blocked) return null;

        reasons.push('preconditions_ok');
      }

      // Score: schema base + modifiers + intent score contribution
      let modifierSum = 0;
      for (const m of schema.scoreModifiers) {
        if (m.kind === 'constant') {
          modifierSum += m.value;
        } else if (m.kind === 'weighted_metric' && ctx) {
          const raw = Number(ctx.metrics[m.metric] ?? 0) * m.weight;
          modifierSum += m.clamp
            ? Math.max(m.clamp[0], Math.min(m.clamp[1], raw))
            : raw;
        }
      }

      const score = schema.scoreBase + modifierSum + intent.score * FC.intentSchema.schema.intentScoreWeight;
      reasons.push('schema_base', 'intent_bridge');

      return {
        schemaId: schema.id,
        intentId: intent.intentId,
        family: schema.family ?? 'verbal',
        simActionKind: schema.simActionKind,
        requiredOfferKinds: schema.requiredOfferKinds ?? [schema.simActionKind],
        narrativeLabel: schema.narrativeLabel ?? schema.label,
        dialogueHook: schema.dialogueHook,
        targetId: intent.targetId,
        score,
        cost: schema.cost ?? 0,
        reasons,
        trace: {
          usedAtomIds: intent.trace.usedAtomIds,
          notes: ['Derived via ActionSchemaV1 (enriched)'],
          parts: { intentId: intent.intentId, intentScore: intent.score },
        },
      };
    })
    .filter((x): x is DerivedActionSchemaCandidateV1 => x !== null)
    .sort((a, b) => b.score - a.score);
}

/**
 * Batch derivation entry point for Layer G.
 *
 * @param intents - Ranked intent candidates from Layer F
 * @param ctx - Optional GoalEvalContext for precondition evaluation
 */
export function deriveActionSchemaCandidatesV1(
  intents: DerivedIntentCandidateV1[],
  ctx?: GoalEvalContext,
): DerivedActionSchemaCandidateV1[] {
  return intents
    .flatMap((intent) => evaluateActionSchema(intent, ctx))
    .sort((a, b) => b.score - a.score);
}
