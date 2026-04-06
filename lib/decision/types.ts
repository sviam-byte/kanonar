// lib/decision/types.ts
// Decision-facing types (lightweight, UI/debug oriented).

import type { ActionOfferBase } from '../../types';

export type ActionOffer = ActionOfferBase & {
  id: string;        // possibility id
  key: string;       // parsed key
  why?: Record<string, unknown>;  // explainability payload (score trace)
};
