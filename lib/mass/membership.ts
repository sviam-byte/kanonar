
import {
  AnyEntity,
  CharacterEntity,
  MassMembership,
  MassNetworkEI,
} from '../../types';
import { MassInputsEI } from './ei_dynamics';
import { gaussian } from '../util/gaussian';

export interface MicroToMesoConfigEI {
  // базовые веса, как микропеременные персонажей конвертируются в E и I
  weightStressToE: number;
  weightDarkToE: number;
  weightRiskToE: number;

  weightStressToI: number;
  weightDarkToI: number;
  weightRiskToI: number;

  // масштаб шума на уровне узла; реальный масштаб будет ~ baseNoise / sqrt(N_eff)
  baseNoiseE: number;
  baseNoiseI: number;
}

function asCharacters(entities: AnyEntity[]): CharacterEntity[] {
  return entities.filter((e): e is CharacterEntity => e.type === 'character');
}

export function computeMassInputsFromMembership(
  net: MassNetworkEI,
  entities: AnyEntity[],
  cfg: MicroToMesoConfigEI
): MassInputsEI {
  const chars = asCharacters(entities);
  const { nodeOrder } = net;
  const n = nodeOrder.length;

  const I_E = new Array<number>(n).fill(0);
  const I_I = new Array<number>(n).fill(0);
  const N_eff = new Array<number>(n).fill(0);

  for (const c of chars) {
    // Use massMembership if available, otherwise check massNodeId for legacy support
    let membership: MassMembership | undefined = c.massMembership;
    if (!membership && c.massNodeId) {
        membership = { [c.massNodeId]: 1.0 };
    }
    
    if (!membership) continue;

    // Access simulation runtime metrics if available, else fallback to static params
    const stress = (c.body?.acute?.stress ?? 0) / 100;
    const dark = (c.state?.dark_exposure ?? 0) / 100;
    // Latents might be on the object if it's AgentState
    const risk = (c as any).latents?.RP ?? (c.vector_base?.['B_exploration_rate'] ?? 0.5);

    const contribE =
      cfg.weightStressToE * stress +
      cfg.weightDarkToE * dark +
      cfg.weightRiskToE * risk;

    const contribI =
      cfg.weightStressToI * stress +
      cfg.weightDarkToI * dark +
      cfg.weightRiskToI * risk;

    for (let k = 0; k < n; k++) {
      const nodeId = nodeOrder[k];
      const w = membership[nodeId];
      if (!w || w === 0) continue;

      I_E[k] += w * contribE;
      I_I[k] += w * contribI;
      N_eff[k] += w;
    }
  }

  const Xi_E = new Array<number>(n).fill(0);
  const Xi_I = new Array<number>(n).fill(0);

  for (let k = 0; k < n; k++) {
    const Nk = N_eff[k] > 0 ? N_eff[k] : 1;
    I_E[k] /= Nk;
    I_I[k] /= Nk;

    // Shot noise scales with 1/sqrt(N)
    const noiseScaleE = cfg.baseNoiseE / Math.sqrt(Nk);
    const noiseScaleI = cfg.baseNoiseI / Math.sqrt(Nk);

    Xi_E[k] = noiseScaleE * gaussian();
    Xi_I[k] = noiseScaleI * gaussian();
  }

  return { I_E, I_I, Xi_E, Xi_I };
}
