
import { MassNetworkEI } from '../../types';

export interface MassInputsEI {
  I_E: number[];   // внешний вход в E узлов
  I_I: number[];   // внешний вход в I узлов
  Xi_E: number[];  // шум для E
  Xi_I: number[];  // шум для I
}

function F(x: number): number {
  // Sigmoid function
  return 1 / (1 + Math.exp(-x));
}

/**
 * Wilson–Cowan on a network:
 *
 * τ_E dE_i/dt = -E_i + F_E( biasE + gainE * (Σ_j W_EE[i][j] E_j - Σ_j W_EI[i][j] I_j + I_E[i]) + noiseScaleE * Xi_E[i] )
 * τ_I dI_i/dt = -I_i + F_I( biasI + gainI * (Σ_j W_IE[i][j] E_j - Σ_j W_II[i][j] I_j + I_I[i]) + noiseScaleI * Xi_I[i] )
 */
export function stepMassNetworkEI(
  net: MassNetworkEI,
  dt: number,
  inputs: MassInputsEI
): MassNetworkEI {
  const { nodeOrder, W_EE, W_EI, W_IE, W_II } = net;
  const n = nodeOrder.length;

  const next: MassNetworkEI = {
    ...net,
    nodes: { ...net.nodes },
  };

  for (let i = 0; i < n; i++) {
    const id = nodeOrder[i];
    const node = net.nodes[id];
    if (!node) continue;

    const {
      tauE,
      tauI,
      biasE,
      biasI,
      gainE,
      gainI,
      noiseScaleE,
      noiseScaleI,
    } = node.params;

    let hE = 0;
    let hI = 0;

    for (let j = 0; j < n; j++) {
      const srcId = nodeOrder[j];
      const src = net.nodes[srcId];
      if (!src) continue;

      hE += W_EE[i][j] * src.E - W_EI[i][j] * src.I;
      hI += W_IE[i][j] * src.E - W_II[i][j] * src.I;
    }

    const I_Ei = inputs.I_E[i] ?? 0;
    const I_Ii = inputs.I_I[i] ?? 0;
    const Xi_Ei = inputs.Xi_E[i] ?? 0;
    const Xi_Ii = inputs.Xi_I[i] ?? 0;

    const uE = biasE + gainE * (hE + I_Ei) + noiseScaleE * Xi_Ei;
    const uI = biasI + gainI * (hI + I_Ii) + noiseScaleI * Xi_Ii;

    // Euler step
    const dEdt = (-node.E + F(uE)) / tauE;
    const dIdt = (-node.I + F(uI)) / tauI;

    const E_next = node.E + dt * dEdt;
    const I_next = node.I + dt * dIdt;

    next.nodes[id] = {
      ...node,
      E: Math.max(0, E_next), // Ensure non-negative activity usually desirable
      I: Math.max(0, I_next),
    };
  }

  return next;
}
