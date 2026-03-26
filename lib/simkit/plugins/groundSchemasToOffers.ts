import { FC } from '../../config/formulaConfig';
import type { DerivedActionSchemaCandidateV1 } from '../../actions/specs/types';
import type { ActionOffer } from '../core/types';

export interface GroundedSchemaDecisionV1 {
  schemaId: string;
  intentId: string;
  family: string;
  actionKind: string;
  score: number;
  offerId: string | null;
  offerScore: number;
  targetId: string | null;
  targetNodeId: string | null;
  narrativeLabel: string;
  dialogueHook?: { act: string; desiredEffect: string };
  cost: number;
  reasons: string[];
}

/**
 * Layer H: Ground action schemas to concrete SimKit offers.
 *
 * Now matches against requiredOfferKinds[] (not just simActionKind).
 * For schemas with targetId, prefers offers targeting the same agent.
 */
export function groundSchemasToOffers(
  schemas: DerivedActionSchemaCandidateV1[],
  offers: ActionOffer[],
  actorId: string,
): GroundedSchemaDecisionV1[] {
  const actorOffers = offers.filter((o) => o.actorId === actorId && !o.blocked);

  return schemas.map((schema) => {
    // Match against all requiredOfferKinds (enriched) or fall back to simActionKind
    const offerKinds = schema.requiredOfferKinds?.length
      ? schema.requiredOfferKinds
      : [schema.simActionKind];

    const compatible = actorOffers
      .filter((o) => offerKinds.includes(o.kind))
      .sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0));

    // If schema has a targetId, prefer offers targeting the same agent
    let bestOffer: ActionOffer | null = null;
    if (schema.targetId && compatible.length) {
      const targetMatches = compatible.filter(
        (o) => String(o.targetId) === String(schema.targetId),
      );
      bestOffer = targetMatches[0] ?? compatible[0];
    } else {
      bestOffer = compatible[0] ?? null;
    }

    const offerScore = Number(bestOffer?.score ?? 0);
    const schemaCost = schema.cost ?? 0;
    const score =
      schema.score * FC.intentSchema.grounding.schemaScoreWeight
      + offerScore * FC.intentSchema.grounding.offerScoreWeight
      - schemaCost;

    return {
      schemaId: schema.schemaId,
      intentId: schema.intentId,
      family: schema.family ?? 'verbal',
      actionKind: bestOffer?.kind ?? schema.simActionKind,
      score,
      offerId: bestOffer
        ? `${bestOffer.actorId}:${bestOffer.kind}:${bestOffer.targetId ?? (bestOffer as any).targetNodeId ?? 'self'}`
        : null,
      offerScore,
      targetId: bestOffer?.targetId ?? schema.targetId ?? null,
      targetNodeId: (bestOffer as any)?.targetNodeId ?? null,
      narrativeLabel: schema.narrativeLabel ?? schema.schemaId,
      dialogueHook: schema.dialogueHook,
      cost: schemaCost,
      reasons: bestOffer
        ? [
            'grounded',
            `offer:${bestOffer.kind}`,
            `offerScore:${offerScore.toFixed(3)}`,
            ...(schema.targetId && String(bestOffer.targetId) !== String(schema.targetId)
              ? ['target_mismatch_fallback']
              : []),
          ]
        : ['no_matching_offer'],
    };
  }).sort((a, b) => b.score - a.score);
}
