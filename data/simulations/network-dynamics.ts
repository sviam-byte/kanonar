import { SimulationMeta } from '../../types';

export const networkDynamics: SimulationMeta = {
  key: 'network-dynamics',
  title: 'Сетевая Динамика',
  mode: 'network',
  description: 'Симулирует распространение стресса и влияния по социальному графу персонажей. Наблюдайте за каскадными сбоями, когда отношения разрываются под давлением расходящихся профилей риска (Vσ).',
  isCharacterCentric: true,
  payload: {
    days: 90,
    dt: 0.25,
    vsigmaThreshold: 45, // Difference in Vσ to sever a link
    alpha: 0.05, // Diffusion factor for stress/influence
  }
};
