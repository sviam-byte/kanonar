
import {
  CharacterEntity,
  MassMembership,
  MassNetworkEI,
  WorldState,
  AgentState,
} from '../../types';

export interface MassFieldMulti {
  /** Weighted E across all affiliated nodes */
  E_field: number;
  /** Weighted I across all affiliated nodes */
  I_field: number;
}

export function getMassFieldForCharacterMulti(
  character: CharacterEntity,
  net?: MassNetworkEI
): MassFieldMulti | null {
  if (!net) return null;

  let membership: MassMembership | undefined = character.massMembership;
  if (!membership && character.massNodeId) {
      membership = { [character.massNodeId]: 1.0 };
  }

  if (!membership) return null;

  let numE = 0;
  let numI = 0;
  let denom = 0;

  for (const id of net.nodeOrder) {
    const w = membership[id];
    if (!w || w === 0) continue;
    const node = net.nodes[id];
    if (!node) continue;

    numE += w * node.E;
    numI += w * node.I;
    denom += w;
  }

  if (denom === 0) return null;

  return {
    E_field: numE / denom,
    I_field: numI / denom,
  };
}

export function getMassFieldForAgentMulti(
  agent: AgentState,
  world: WorldState
): MassFieldMulti | null {
  return getMassFieldForCharacterMulti(agent, world.massNetwork_ei);
}
