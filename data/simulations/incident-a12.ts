import { SimulationMeta } from '../../types';

export const incidentA12: SimulationMeta = {
  key: 'incident-a12',
  title: 'Утечка A12 · КАРТА',
  mode: 'map',
  description: 'Симулирует распространение утечки по 2D-сетке и эффект карантинных мер. Цель — локализовать утечку.',
  payload: {
    grid: { w: 32, h: 20, D: 0.18, dt: 1 },
    sources: [{ x: 14, y: 9, rate: 2.5, days: 6 }],
    quarantine: [{ rect: [10, 7, 8, 6], k: 0.45, from: 2 }],
    thresholds: { safe: 0.3, alert: 1.0 },
    days: 30,
    reps: 1 // For UI, we only need 1 rep
  }
};