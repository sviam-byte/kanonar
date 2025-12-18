
import { ContextAtom } from '../../types';

export interface TargetCandidate {
  id: string;          // target agent id
  distance: number;    // 0..1 (1 — very close)
  wounded?: boolean;
  allyScore?: number;  // >0 — ally, <0 — enemy, 0 — neutral
}

/**
 * Extracts candidate targets from contextAtoms:
 * - Other agents (not self)
 * - Sufficiently close
 * - Categorized by wounded/ally status
 */
export function extractTargetCandidates(
  subjectId: string,
  atoms: ContextAtom[],
  opts?: { minDistanceNorm?: number },
): TargetCandidate[] {
  const minDist = opts?.minDistanceNorm ?? 0.2;

  const byKey = new Map<string, TargetCandidate>();

  for (const a of atoms) {
    // Skip if not related to an external agent
    if (!('relatedAgentId' in a) || !a.relatedAgentId) continue;
    
    // Prevent self-targeting explicitly
    if (a.relatedAgentId === subjectId) continue;

    const key = a.relatedAgentId;
    let c = byKey.get(key);
    if (!c) {
      c = { id: key, distance: 0 };
      byKey.set(key, c);
    }

    // Process Proximity (closest_agent)
    if (a.kind === 'closest_agent') {
        // magnitude is distance score (1=close, 0=far)
        c.distance = Math.max(c.distance, a.magnitude);
    }
    
    // Process Legacy Proximity
    if (a.kind === 'proximity_friend' || a.kind === 'proximity_enemy' || a.kind === 'proximity_neutral') {
         c.distance = Math.max(c.distance, a.magnitude);
    }

    // Process Wounded
    if ((a.kind === 'wounded_local' || a.kind === 'care_need' || a.kind === 'tom_other_severely_wounded') && a.magnitude > 0.5) {
      c.wounded = true;
    }

    // Process Ally/Enemy Score from Atoms
    if (a.kind === 'tom_trusted_ally_near' || a.kind === 'ally_support' || a.kind === 'proximity_friend') {
      c.allyScore = (c.allyScore ?? 0) + a.magnitude;
    }
    if (a.kind === 'tom_threatening_other_near' || a.kind === 'enemy_threat' || a.kind === 'proximity_enemy') {
      c.allyScore = (c.allyScore ?? 0) - a.magnitude;
    }
  }

  // Filter by minimum distance relevance
  // If no proximity atoms found, distance is 0, so it will be filtered out unless minDist is 0
  return [...byKey.values()].filter(c => c.distance >= minDist);
}
