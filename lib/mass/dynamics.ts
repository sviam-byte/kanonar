

import { MassNetwork } from '../../types';

export interface MassInputs {
  // детерминированный вклад для каждого узла (суммарное поле от персонажей/событий)
  I: number[];
  // шумовой вклад (shot noise / finite-size)
  Xi: number[];
}

// простая сигмоида; можешь потом заменить на кусочно-линейную
function F(u: number): number {
  return 1 / (1 + Math.exp(-u));
}

/**
 * Один шаг по сети масс (Эйлер вперёд).
 * 
 * τ dx/dt = -x + F( bias + gain * (Σ w_ij x_j + I_i) + noiseScale * Xi_i )
 */
export function stepMassNetwork(
  net: MassNetwork,
  dt: number,
  inputs: MassInputs
): MassNetwork {
  const { W, nodeOrder } = net;
  const n = nodeOrder.length;

  const next: MassNetwork = {
    ...net,
    nodes: { ...net.nodes },
    // W и nodeOrder не трогаем
  };

  for (let i = 0; i < n; i++) {
    const id = nodeOrder[i];
    const node = net.nodes[id];
    if (!node) continue;

    const { tau, bias, gain, noiseScale } = node.params;

    // Σ w_ij x_j — вход от других узлов
    let h = 0;
    for (let j = 0; j < n; j++) {
      const srcId = nodeOrder[j];
      const srcNode = net.nodes[srcId];
      if (!srcNode) continue;
      h += W[i][j] * srcNode.x;
    }

    const I_i = inputs.I[i] ?? 0;
    const Xi_i = inputs.Xi[i] ?? 0;

    const u = bias + gain * (h + I_i) + noiseScale * Xi_i;

    // τ dx/dt = -x + F(u)
    const dxdt = (-node.x + F(u)) / tau;
    const xNext = node.x + dt * dxdt;

    next.nodes[id] = {
      ...node,
      x: xNext,
    };
  }

  return next;
}