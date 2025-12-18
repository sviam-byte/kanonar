// lib/social/relations.ts

import { WorldState } from '../../types';
import { relations } from '../../data/relations';

export interface StructuralTie {
  kin: number;
  faction: number;
  priorBond: number;
}

export function getStructuralTieFast(
  world: WorldState,
  observerId: string,
  targetId: string
): StructuralTie {
  const key = [observerId, targetId].sort().join("__");
  const r = relations[key];

  const obs = world.agents.find(a => a.entityId === observerId);
  const tgt = world.agents.find(a => a.entityId === targetId);
  
  const isSameFaction = (obs?.factionId && obs.factionId === tgt?.factionId) ? 1 : 0;
  
  if (!r) return { kin: 0, faction: isSameFaction, priorBond: 0 };
  
  return {
    kin: r.kind === "kin" ? 1 : 0,
    faction: r.kind === "faction" ? 1 : 0, // Use static faction if defined
    priorBond: r.weight ?? 0,
  };
}
