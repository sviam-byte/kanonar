import { SimulationMeta } from '../../types';

export const percolationFrontier: SimulationMeta = {
  key: 'percolation-frontier',
  title: 'Перколяция на границе',
  mode: 'percolation',
  description: 'Prevent a continuous cluster of breaches. Metrics: probability of giant component, margin of safety.',
  payload: {
    graph: 'map://current-core',
    p_base: 0.18,
    reinforce: [{ edge: 'S12-S13', delta: -0.06 }],
    days: 1,
    reps: 500
  }
};
