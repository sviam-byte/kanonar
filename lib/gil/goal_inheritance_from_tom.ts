// /lib/gil/goal_inheritance_from_tom.ts
import { TomState, TomEntry, WorldState } from "../../types";
import { getStructuralTieFast } from '../social/relations';
import { clamp } from '../util/safe';

export interface GilParams {
  phiMax: Record<string, number>;
}

export function computePhiRowFromTom(
  selfId: string,
  donors: string[],
  tom: TomState,
  gil: GilParams,
  world: WorldState, // World needed for structural ties
): { phi: Record<string, number>; totalPhi: number } {
  const phiRaw = new Map<string, number>();
  let sumRaw = 0;

  for (const j of donors) {
    if (j === selfId) continue;

    const entry = tom[selfId]?.[j];
    if (!entry) continue;

    const t = entry.traits;
    const structural = getStructuralTieFast(world, selfId, j);

    // Perceived support: how much donor j seems to support self i's goals
    const tom_j_i = tom[j]?.[selfId];
    // A simple proxy: how much does j trust i?
    const perceivedSupport = tom_j_i?.traits.trust ?? 0.5;

    const relationalAffinity =
      0.5 * t.trust +
      0.4 * t.bond +
      0.3 * t.align -
      0.2 * Math.max(0, (t.dominance - 0.5) * 2);

    const structuralAffinity =
      0.6 * structural.kin +
      0.4 * structural.faction;
    
    const base = relationalAffinity + structuralAffinity + 0.5 * perceivedSupport;

    const v = 1 / (1 + Math.exp(-3 * (base - 0.1)));

    if (v <= 0) continue;
    phiRaw.set(j, v);
    sumRaw += v;
  }

  const phiMax = gil.phiMax[selfId] ?? 0.6;
  const scale = sumRaw > phiMax && sumRaw > 0 ? phiMax / sumRaw : 1;

  const phi: Record<string, number> = {};
  let totalPhi = 0;

  for (const [j, v] of phiRaw.entries()) {
    const vv = v * scale;
    if (vv <= 1e-4) continue;
    // Hard threshold
    if (vv < 0.25) continue;
    phi[j] = vv;
    totalPhi += vv;
  }

  return { phi, totalPhi };
}