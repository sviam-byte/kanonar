
// lib/context/epistemic/beliefTypes.ts
import { ContextAtom } from '../v2/types';

// Minimal: belief:* is "I believe that..."
// Important: belief atoms often mirror world IDs (e.g. belief:scene:crowd)
export type BeliefAtom = ContextAtom;

// Helper: convention for belief ID mapping
export function beliefIdOf(worldId: string) {
  return `belief:${worldId}`;
}
