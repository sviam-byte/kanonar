
import { WorldState, AnyEntity } from '../../types';
import { computeMassInputsFromCharacters, MicroToMesoConfig } from './coupling';
import { stepMassNetwork } from './dynamics';

const DEFAULT_CFG: MicroToMesoConfig = {
  assignment: {},
  stressWeight: 0.02,
  darkWeight: 0.01,
  riskWeight: 0.01,
  baseNoiseScale: 0.3,
};

/**
 * Обновляет world.massNetwork на один "тик" мира.
 * dt=1 — один шаг симуляции.
 */
export function updateMassLayer(
  world: WorldState,
  entitiesOverride?: AnyEntity[],
  cfgOverride?: Partial<MicroToMesoConfig>
): void {
  if (!world.massNetwork) return;

  const cfg: MicroToMesoConfig = {
    ...DEFAULT_CFG,
    ...(cfgOverride || {}),
    assignment: { ...DEFAULT_CFG.assignment, ...(cfgOverride?.assignment || {}) },
  };

  const entities = (entitiesOverride || world.agents) as AnyEntity[];

  const inputs = computeMassInputsFromCharacters(
    world.massNetwork,
    entities,
    cfg
  );

  const updatedMass = stepMassNetwork(world.massNetwork, 1, inputs);

  world.massNetwork = updatedMass;
}
