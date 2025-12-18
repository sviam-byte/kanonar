
import { WorldState, AnyEntity } from '../../types';
import { recordEpisode, ObservationContext } from './observation';
import { computeMassInputsFromCharacters, MicroToMesoConfig } from '../mass/coupling';
import { stepMassNetwork } from '../mass/dynamics';

export interface WorldTickConfig {
  dt: number;
  microToMeso: MicroToMesoConfig;
  maxEpisodes?: number;
}

export interface WorldTickContext extends ObservationContext {}

/**
 * Один "тик" мира с учётом слоя масс:
 *   1. записать эпизод в логи;
 *   2. обновить сеть масс;
 */
export function worldTick(
  world: WorldState,
  entities: AnyEntity[],
  ctx: WorldTickContext,
  cfg: WorldTickConfig
): WorldState {
  let next = recordEpisode(world, entities, ctx, cfg.maxEpisodes);

  if (!next.massNetwork) {
    return next; // если слоя масс ещё нет — только лог
  }

  const inputs = computeMassInputsFromCharacters(
    next.massNetwork,
    entities,
    cfg.microToMeso
  );

  const updatedMass = stepMassNetwork(next.massNetwork, cfg.dt, inputs);

  next = {
    ...next,
    massNetwork: updatedMass,
  };

  return next;
}
