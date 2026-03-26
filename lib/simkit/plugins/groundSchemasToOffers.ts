import { FC } from '../../config/formulaConfig';
import type { ActionOffer } from '../core/types';
import type { DerivedActionSchemaCandidateV1 } from '../../actions/specs/types';

export interface GroundedSchemaDecisionV1 {
  schemaId: string;
  intentId: string;
  actionKind: string;
  score: number;
  offerId: string | null;
  offerScore: number;
  targetId: string | null;
  targetNodeId: string | null;
  reasons: string[];
}

/** Layer H: Ground action schemas to concrete SimKit offers. */
export function groundSchemasToOffers(
  schemas: DerivedActionSchemaCandidateV1[],
  offers: ActionOffer[],
  actorId: string,
): GroundedSchemaDecisionV1[] {
  const actorOffers = offers.filter((o) => o.actorId === actorId && !o.blocked);

  return schemas.map((schema) => {
    const compatible = actorOffers
      .filter((o) => o.kind === schema.simActionKind)
      .sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0));

    const bestOffer = compatible[0];
    const offerScore = Number(bestOffer?.score ?? 0);
    const score = schema.score * FC.intentSchema.grounding.schemaScoreWeight + offerScore * FC.intentSchema.grounding.offerScoreWeight;

    return {
      schemaId: schema.schemaId,
      intentId: schema.intentId,
      actionKind: schema.simActionKind,
      score,
      offerId: bestOffer ? `${bestOffer.actorId}:${bestOffer.kind}:${bestOffer.targetId ?? bestOffer.targetNodeId ?? 'self'}` : null,
      offerScore,
      targetId: bestOffer?.targetId ?? null,
      targetNodeId: (bestOffer as any)?.targetNodeId ?? null,
      reasons: bestOffer ? ['schema_plus_offer'] : ['schema_only_no_offer'],
    };
  }).sort((a, b) => b.score - a.score);
}
