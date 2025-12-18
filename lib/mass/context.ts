

import { CharacterEntity, MassNetwork } from '../../types';

export interface MassField {
  stressField: number; // x узла
}

/**
 * Вернуть поле масс для конкретного персонажа.
 */
export function getMassFieldForCharacter(
  character: CharacterEntity,
  net?: MassNetwork
): MassField | null {
  if (!net) return null;
  const nodeId = character.massNodeId;
  if (!nodeId) return null;

  const node = net.nodes[nodeId];
  if (!node) return null;

  return {
    stressField: node.x,
  };
}