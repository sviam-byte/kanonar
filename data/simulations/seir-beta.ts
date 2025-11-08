import { SimulationMeta } from '../../types';

export const seirBeta: SimulationMeta = {
  key: 'seir-beta',
  title: 'Бета-SEIR',
  mode: 'seir',
  description: 'Удерживайте R₀ < 1 и не превышайте вместимость больниц. Метрики: пик госпитализаций, дни перегрузки, общая потеря S.',
  payload: {
    N: 1200000,
    params: { beta0: 0.32, sigma: 0.2, gamma: 0.12, h_rate: 0.06 },
    controls: [{ t: 3, kind: 'lockdown', eff: 0.35 }],
    days: 120,
    reps: 128
  }
};