import { SimulationMeta } from '../../types';

export const logisticsO2Pipeline: SimulationMeta = {
  key: 'logistics-o2-pipeline',
  title: 'Кислородный трубопровод',
  mode: 'logistics',
  description: 'Поддержание N объектов под целевой дозой с ограниченными A* и транзитом. Метрики: уровень выполнения, просроченные заказы, общий S, стоимость.',
  payload: {
    depots: [
        { id: 'core', cap: 900 },
        { id: 'plaza', cap: 400 }
    ],
    routes: [{ from: 'core', to: 'plaza', lt: 2, cap: 120 }],
    demand: [{ to: 'plaza', daily: 80 }],
    policy: 'priority-S',
    days: 45,
    reps: 64
  }
};