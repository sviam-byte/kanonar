// lib/decision/types.ts
// Decision-facing types (lightweight, UI/debug oriented).

export type ActionOffer = {
  id: string;        // possibility id
  key: string;       // parsed key
  score: number;
  blocked?: boolean;
  targetId?: string | null;
  meta?: any;
  why?: any;         // explainability payload (score trace)
};
