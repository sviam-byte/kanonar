import { SimulationMeta } from '../../types';

export const crowdExhibit: SimulationMeta = {
  key: 'crowd-exhibit',
  title: 'Толпа у экспоната',
  mode: 'crowd',
  description: 'Display an artifact safely. Metrics: max density, evacuation time, number of "red zones".',
  payload: {
    map: 'plaza',
    inflow: [{ t0: 0, rate: 40, dur: 1200 }],
    days: 1,
    reps: 64
  }
};
