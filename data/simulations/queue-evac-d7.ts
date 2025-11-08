import { SimulationMeta } from '../../types';

export const queueEvacD7: SimulationMeta = {
  key: 'queue-evac-d7',
  title: 'Эвакуация D7',
  mode: 'queue',
  description: 'Evacuate a sector in time T with c control points. Metrics: average time in system, queue tail, violators.',
  payload: {
    lambda: 18,
    mu: 6,
    servers: 3,
    controls: [{ t: 4, servers: 5 }],
    days: 12,
    reps: 64
  }
};
