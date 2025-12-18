import { SimulationMeta, NegotiationScenario } from '../../types';

export const negotiationEmbassy: SimulationMeta = {
  key: 'negotiation-embassy',
  title: 'Переговоры в Посольстве',
  mode: 'negotiation',
  description: 'Выберите персонажа для ведения критически важных переговоров. Система проанализирует всех доступных кандидатов и ранжирует их по совокупной эффективности, учитывая вероятность успеха, ожидаемую выгоду, риски и влияние на будущую стабильность персонажа.',
  isCharacterCentric: true,
  payload: {
    counterparties: [
      {
        id: 'cp-hardliner',
        name: 'Фракция «Жесткой линии»',
        hardness: 80,
        reputation: 60,
        discountDelta: 0.90,
        scrutiny: 70,
        batna: 25,
      },
      {
        id: 'cp-pragmatist',
        name: 'Прагматичная Гильдия',
        hardness: 50,
        reputation: 80,
        discountDelta: 0.95,
        scrutiny: 40,
        batna: 40,
      },
      {
        id: 'cp-desperate',
        name: 'Отчаявшийся Аванпост',
        hardness: 30,
        reputation: 20,
        discountDelta: 0.85,
        scrutiny: 20,
        batna: 10,
      }
    ],
    missions: [
      {
        id: 'mission-supply',
        name: 'Доступ к маршруту снабжения',
        valueModel: 'supply',
        deadlineDays: 14,
        stakes: 80,
      },
      {
        id: 'mission-alliance',
        name: 'Пакт о ненападении',
        valueModel: 'alliance',
        deadlineDays: 30,
        stakes: 120,
      },
    ]
  } as NegotiationScenario
};
