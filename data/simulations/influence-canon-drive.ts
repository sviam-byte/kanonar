import { SimulationMeta } from '../../types';

export const influenceCanonDrive: SimulationMeta = {
  key: 'influence-canon-drive',
  title: 'Кампания: Канонизация',
  mode: 'influence',
  description: 'Increase an entity\'s Pv to the canon threshold. Metrics: Pv(t), campaign cost, stability after a "forgetting attack".',
  payload: {
    entityRef: { type: 'objects', slug: 'o2-router-x1' },
    beta: 0.08,
    gamma: 0.03,
    seeds: 120,
    days: 60,
    reps: 64
  }
};