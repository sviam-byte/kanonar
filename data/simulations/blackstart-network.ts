import { SimulationMeta } from '../../types';

export const blackstartNetwork: SimulationMeta = {
  key: 'blackstart-network',
  title: 'Черный запуск сети',
  mode: 'blackstart',
  description: 'Restore the system after a failure without getting into a loop. Metrics: probability of full start, number of rollbacks, time.',
  payload: {
    days: 1,
    reps: 64
  }
};
