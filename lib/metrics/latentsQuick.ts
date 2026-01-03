// lib/metrics/latentsQuick.ts
import type { EntityParams } from '../../types';
import { latentSchema } from '../../data/latent-schema';
import { calculatePrMonstroDay } from '../formulas';

/**
 * Calculate latent values and quick-state proxies from flattened parameters.
 */
export function calculateLatentsAndQuickStates(
  flatParams: EntityParams
): { latents: Record<string, number>; quickStates: Record<string, number> } {
  const latents: Record<string, number> = {};

  // Calculate Latents
  for (const [key, schema] of Object.entries(latentSchema)) {
    let sum = 0;
    let count = 0;
    for (const comp of (schema as any).components) {
      const fullKey = `vector_base.${comp.key}`;
      const val = (flatParams as any)[fullKey] ?? (flatParams as any)[comp.key] ?? 0.5;

      sum += comp.weight > 0 ? val : (1 - val);
      count++;
    }
    latents[key] = count > 0 ? sum / count : 0.5;
  }

  // Calculate Quick States
  const quickStates: Record<string, number> = {};

  // Social Support Proxy (for PrMonstro)
  const rec = (flatParams as any)['vector_base.C_reciprocity_index'] ?? 0.5;
  const loy = (flatParams as any)['vector_base.C_coalition_loyalty'] ?? 0.5;
  const sec = (flatParams as any)['vector_base.A_Transparency_Secrecy'] ?? 0.5;
  quickStates['social_support_proxy'] = (rec + loy + (1 - sec)) / 3;

  // Decision Readiness (DR)
  const disc = (flatParams as any)['vector_base.B_cooldown_discipline'] ?? 0.5;
  const goalC = (flatParams as any)['vector_base.B_goal_coherence'] ?? 0.5;
  const cal = (flatParams as any)['vector_base.E_Model_calibration'] ?? 0.5;
  quickStates['DR'] = (disc + goalC + cal) / 3;

  // Stability Index (SI)
  const trad = (flatParams as any)['vector_base.A_Tradition_Continuity'] ?? 0.5;
  const leg = (flatParams as any)['vector_base.A_Legitimacy_Procedure'] ?? 0.5;
  const stab = (flatParams as any)['vector_base.A_Safety_Care'] ?? 0.5;
  quickStates['SI'] = (trad + leg + stab) / 3;

  // Dark Susceptibility
  const sens = (flatParams as any)['vector_base.C_reputation_sensitivity'] ?? 0.5;
  const dark = ((flatParams as any)['state.dark_exposure'] ?? 0) / 100;
  const trauma = ((flatParams as any)['body.acute.moral_injury'] ?? 0) / 100;
  quickStates['dark_susceptibility'] = (sens + dark + trauma) / 3;

  // Phys Fitness
  const str = (flatParams as any)['body.functional.strength_upper'] ?? 0.5;
  const end = (flatParams as any)['body.functional.aerobic_capacity'] ?? 0.5;
  quickStates['phys_fitness'] = (str + end) / 2;

  // Phys Fragility
  const knee = (flatParams as any)['body.functional.injury_risk.knees'] ?? 0.5;
  const back = (flatParams as any)['body.functional.injury_risk.lower_back'] ?? 0.5;
  quickStates['phys_fragility'] = (knee + back) / 2;

  // Hormone Tension
  const hpa = (flatParams as any)['body.regulation.HPA_axis'] ?? 0.5;
  const stress = ((flatParams as any)['body.acute.stress'] ?? 0) / 100;
  quickStates['hormone_tension'] = (hpa + stress) / 2;

  // ToM Quality proxy (for SDE loop)
  const meta = (flatParams as any)['vector_base.G_Metacog_accuracy'] ?? 0.5;
  const ch = latents['CH'] ?? 0.5;
  quickStates['ToM_Q'] = (meta + ch) / 2;

  // Topology (for SDE)
  const topo = (flatParams as any)['vector_base.E_KB_topos'] ?? 0.5;
  quickStates['T_topo'] = topo;

  // PrMonstro Calculation (Quick)
  const s = {
    stress: (flatParams as any)['body.acute.stress'] ?? 0,
    fatigue: (flatParams as any)['body.acute.fatigue'] ?? 0,
    darkness: (flatParams as any)['state.dark_exposure'] ?? 0,
  };
  quickStates['prMonstro'] = calculatePrMonstroDay(flatParams as any, s as any, latents, quickStates);

  return { latents, quickStates };
}
