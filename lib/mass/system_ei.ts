
import { AnyEntity, WorldState } from '../../types';
import { computeMassInputsFromMembership, MicroToMesoConfigEI } from './membership';
import { stepMassNetworkEI } from './ei_dynamics';

const DEFAULT_CFG_EI: MicroToMesoConfigEI = {
  weightStressToE: 0.2,
  weightDarkToE: 0.1,
  weightRiskToE: 0.1,

  weightStressToI: 0.05,
  weightDarkToI: 0.01,
  weightRiskToI: 0.0,

  baseNoiseE: 0.3,
  baseNoiseI: 0.2,
};

export function updateMassLayerEI(
  world: WorldState,
  entitiesOverride?: AnyEntity[],
  cfgOverride?: Partial<MicroToMesoConfigEI>,
  dt: number = 0.1
): void {
  if (!world.massNetwork_ei) return;

  const cfg: MicroToMesoConfigEI = {
    ...DEFAULT_CFG_EI,
    ...(cfgOverride || {}),
  };

  const entities = (entitiesOverride || world.agents) as AnyEntity[];

  const inputs = computeMassInputsFromMembership(world.massNetwork_ei, entities, cfg);
  world.massNetwork_ei = stepMassNetworkEI(world.massNetwork_ei, dt, inputs);
}
