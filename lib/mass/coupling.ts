

import { AnyEntity, CharacterEntity, MassNetwork } from '../../types';
import { MassInputs } from './dynamics';
import { gaussian } from '../util/gaussian';

export type MassAssignment = Record<string, string>; 
// CharacterEntity.id -> MassNodeId

export interface MicroToMesoConfig {
  assignment: MassAssignment;
  stressWeight: number;
  darkWeight: number;
  riskWeight: number;
  baseNoiseScale: number;
}

/**
 * Вытаскиваем только персонажей.
 */
function asCharacters(entities: AnyEntity[]): CharacterEntity[] {
  return entities.filter((e): e is CharacterEntity => e.type === 'character');
}

/**
 * Собирает поля I и шум Xi для каждого узла массы.
 * 
 * I_k ~ средние стресс/темнота/риск персонажей в этом узле.
 * Xi_k ~ N(0, baseNoiseScale^2 / N_k).
 */
export function computeMassInputsFromCharacters(
  net: MassNetwork,
  entities: AnyEntity[],
  cfg: MicroToMesoConfig
): MassInputs {
  const chars = asCharacters(entities);
  const { nodeOrder } = net;
  const n = nodeOrder.length;

  const I = new Array<number>(n).fill(0);
  const counts = new Array<number>(n).fill(0);

  for (const c of chars) {
    // Use massNodeId from entity or fallback to config assignment
    const nodeId =
      c.massNodeId || cfg.assignment[c.entityId]; // Using entityId as per type definition
    if (!nodeId) continue;

    const idx = nodeOrder.indexOf(nodeId);
    if (idx < 0) continue;

    // Try to get metrics from various possible locations or calculate proxies
    // In a static context, we might need to rely on base params if metrics aren't calculated
    let stress = 0;
    let dark = 0;
    let risk = 0;
    
    if (c.body && c.body.acute) {
        stress = (c.body.acute.stress ?? 0) / 100;
    }
    if (c.state) {
        dark = (c.state.dark_exposure ?? 0) / 100;
    }
    if (c.vector_base) {
        // Proxy for risk if latents not available
        risk = c.vector_base.B_exploration_rate ?? 0.5;
    }

    // If using a calculated object that has metrics attached (like in simulation loop)
    const calculated = c as any;
    if (calculated.v42metrics) {
        // If available, use more precise metrics
        // Note: v42metrics uses different names
    }
    // Or if we have access to latents
    if (calculated.latents) {
        risk = calculated.latents.RP ?? risk;
    }

    const contrib =
      cfg.stressWeight * stress +
      cfg.darkWeight * dark +
      cfg.riskWeight * risk;

    I[idx] += contrib;
    counts[idx] += 1;
  }

  const Xi = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    if (counts[i] > 0) {
      I[i] /= counts[i]; // среднее по персонажам
    }
    const Nk = Math.max(counts[i], 1);
    const scale = cfg.baseNoiseScale / Math.sqrt(Nk);
    Xi[i] = scale * gaussian();
  }

  return { I, Xi };
}