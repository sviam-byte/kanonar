import { FC } from '../../config/formulaConfig';
import type { DerivedIntentCandidateV1 } from '../../intents/specs/types';
import { ACTION_SCHEMAS_V1 } from './registry';
import type { DerivedActionSchemaCandidateV1 } from './types';

export function evaluateActionSchema(intent: DerivedIntentCandidateV1): DerivedActionSchemaCandidateV1[] {
  return ACTION_SCHEMAS_V1
    .filter((s) => s.intentIds.includes(intent.intentId))
    .map((schema) => {
      const modifierSum = schema.scoreModifiers.reduce((sum, m) => sum + (m.kind === 'constant' ? m.value : 0), 0);
      const score = schema.scoreBase + modifierSum + intent.score * FC.intentSchema.schema.intentScoreWeight;
      return {
        schemaId: schema.id,
        intentId: intent.intentId,
        simActionKind: schema.simActionKind,
        score,
        reasons: ['schema_base', 'intent_bridge'],
        trace: {
          usedAtomIds: intent.trace.usedAtomIds,
          notes: ['Derived via ActionSchemaV1'],
          parts: { intentId: intent.intentId, intentScore: intent.score },
        },
      };
    })
    .sort((a, b) => b.score - a.score);
}

export function deriveActionSchemaCandidatesV1(intents: DerivedIntentCandidateV1[]): DerivedActionSchemaCandidateV1[] {
  return intents.flatMap((intent) => evaluateActionSchema(intent)).sort((a, b) => b.score - a.score);
}
