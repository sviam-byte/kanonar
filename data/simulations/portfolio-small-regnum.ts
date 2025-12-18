import { SimulationMeta } from '../../types';

export const portfolioSmallRegnum: SimulationMeta = {
  key: 'portfolio-small-regnum',
  title: 'Малый регнум',
  mode: 'portfolio',
  description: 'Select a set of interventions for projects under budget B. Metrics: E[S_port], CVaR_α, constraint compliance.',
  payload: {
    projects: [{ ref: { type: 'objects', slug: 'o2-router-x1' }, cost: 40, 'ΔS': 0.05, cvar: 0.02 }],
    budget: 120,
    alpha: 0.95,
    days: 1,
    reps: 1000
  }
};
