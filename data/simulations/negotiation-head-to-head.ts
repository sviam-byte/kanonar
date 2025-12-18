import { SimulationMeta } from '../../types';

export const negotiationHeadToHead: SimulationMeta = {
  key: 'negotiation-head-to-head',
  title: 'Переговоры: Один на один',
  mode: 'negotiation-head-to-head',
  description: 'Выберите двух персонажей и столкните их в прямых переговорах. Модель симулирует их поведение на основе ключевых параметров, таких как Воля, Стресс и Компетентность, чтобы определить исход сделки.',
  isCharacterCentric: true,
  payload: {
    stakes: 100,
    deadline: 20, // days
  }
};
