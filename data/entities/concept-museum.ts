import { EntityType, Branch, SMSBFlags, ConceptEntity } from '../../types';

const museumData: ConceptEntity = {
  entityId: "concept-museum-stable-things",
  type: EntityType.Concept,
  title: "Музей стабильных вещей",
  subtitle: "Коллекция артефактов устойчивости",
  authors: [{ "name": "Система", "role": "Классификатор" }],
  year: "н.д.",
  versionTags: [Branch.Current],
  status: "published",
  tags: ["концепт", "устойчивость", "СМСБ", "онтология"],
  description: "Концептуальный музей, объединяющий объекты, демонстрирующие аномальную устойчивость к онтологической энтропии. Механизмы устойчивости варьируются: от низкой внутренней энтропии и 'божественной пайки' до коллективной памяти и топологической защиты. Каждый экспонат требует определенной 'дозы внимания' для поддержания своего состояния, но избыток внимания может привести к 'пересушке' и потере свойств.",
  relations: [
    { "type": "source", "entityId": "obj-glass-knife-002", "entityTitle": "Стеклянный нож" },
    { "type": "source", "entityId": "obj-comfort-unit-001", "entityTitle": "Мобильная Комфорт-Единица (МКЕ)" }
  ],
  media: [],
  changelog: [
    { "version": "1.0", "date": "412 OВ", "author": "Хрон-Верификатор", "summary": "Концепт формализован на основе анализа устойчивых артефактов." }
  ],
  parameters: [],
  smsb: {
    privacyCost: 0.1,
    fairnessDebt: false,
    rollbackWindow: "нет",
    hysteresis: true,
    modelQuorum: 1,
    attentionBudget: 5000,
  } as SMSBFlags
};

export default museumData;