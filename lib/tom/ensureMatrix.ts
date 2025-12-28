// lib/tom/ensureMatrix.ts
import type { WorldState, TomEntry } from '../../types';
import { initTomForCharacters } from './init';

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

function neutralEntry(tick: number): TomEntry {
  return {
    goals: { goalIds: [], weights: [] },
    traits: {
      trust: 0.5,
      align: 0.5,
      bond: 0.4,
      competence: 0.5,
      dominance: 0.5,
      reliability: 0.5,
      obedience: 0.5,
      uncertainty: 0.5,
      conflict: 0.3,
      respect: 0.5,
      fear: 0.5,
    },
    uncertainty: 0.5,
    lastUpdatedTick: tick,
    lastInteractionTick: tick,
  };
}

export function ensureTomMatrix(world: WorldState, agentIds: string[]) {
  const w: any = world as any;

  if (!w.tom) {
    // seed from built-in init if present
    w.tom = initTomForCharacters(w.agents, w);
  }

  const views: Record<string, Record<string, TomEntry>> = (w.tom.views ?? w.tom) as any;

  for (const selfId of agentIds) {
    if (!views[selfId]) views[selfId] = {};
    for (const otherId of agentIds) {
      if (selfId === otherId) continue;
      if (!views[selfId][otherId]) {
        views[selfId][otherId] = neutralEntry(w.tick ?? 0);
      } else {
        const e = views[selfId][otherId];
        e.traits.trust = clamp01(e.traits.trust);
        e.traits.align = clamp01(e.traits.align);
        e.traits.bond = clamp01(e.traits.bond);
        e.traits.conflict = clamp01(e.traits.conflict);
        e.traits.respect = clamp01(e.traits.respect);
        e.traits.fear = clamp01(e.traits.fear);
        e.traits.dominance = clamp01(e.traits.dominance);
        e.traits.uncertainty = clamp01(e.traits.uncertainty);
        e.uncertainty = clamp01((e as any).uncertainty ?? e.traits.uncertainty);
      }
    }
  }

  if (w.tom.views) w.tom.views = views;
  else w.tom = views;
}
