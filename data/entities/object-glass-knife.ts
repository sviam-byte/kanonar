import { ObjectEntity, EntityType, Branch, Parameter } from '../../types';

const glassKnifeData: ObjectEntity = {
  entityId: "obj-glass-knife-002",
  type: EntityType.Object,
  title: "Стеклянный Нож",
  subtitle: "Артефакт сфокусированной причинности",
  authors: [{ "name": "Рион", "role": "Хранитель" }],
  year: "160 OВ",
  versionTags: [Branch.Current],
  status: "published",
  tags: ["артефакт", "каузальный", "хрупкий", "острый"],
  description: "Клинок, изготовленный из витрифицированных временных парадоксов. Он режет не физическую материю, а каузальные связи. Его стабильность сильно зависит от внимания наблюдателей (дозы) и топологической целостности. Классический пример объекта с высокой Pᵥ, но также с опасно высокой Vσ при неправильном обращении.",
  relations: [
     { "type": "participant", "entityId": "char-rion-001", "entityTitle": "Рион" }
  ],
  evidenceIds: ["ev-glass-knife-causal-sever"],
  media: [],
  changelog: [
    { "version": "1.0", "date": "160 OВ", "author": "Неизвестен", "summary": "Первое обнаружение." },
    { "version": "2.0", "date": "395 OВ", "author": "Рион", "summary": "Применен «План-заплатка» для стабилизации формы." }
  ],
  parameters: [
    { "key": "A_star", "name": "A* (Опт. внимание)", "min": 0, "max": 500, "step": 1, "defaultValue": 240, "canonValue": 250, "description": "Оптимальный уровень внимания наблюдателей, необходимый за цикл.", category: 'core' },
    { "key": "E", "name": "E (Текущ. внимание)", "min": 0, "max": 500, "step": 1, "defaultValue": 220, "canonValue": 250, "description": "Текущий уровень получаемого внимания.", category: 'core' },
    { "key": "exergy_cost", "name": "Эксергетическая стоимость", "min": 0, "max": 100, "step": 1, "defaultValue": 40, "canonValue": 35, "description": "Энергия, необходимая для поддержания его существования.", category: 'core' },
    { "key": "infra_footprint", "name": "Инфраструктурный след", "min": 0, "max": 100, "step": 1, "defaultValue": 60, "canonValue": 50, "description": "Сложность, которую он добавляет в поддерживающую инфраструктуру.", category: 'core' },
    { "key": "hazard_rate", "name": "Уровень опасности", "min": 0, "max": 100, "step": 1, "defaultValue": 70, "canonValue": 65, "description": "Частота отказов в наихудших сценариях для расчета CVaR.", category: 'core' },
    { "key": "cvar_alpha", "name": "CVaR альфа-квантиль", "min": 0, "max": 1, "step": 0.01, "defaultValue": 0.05, "canonValue": 0.05, "description": "Альфа-квантиль для расчета хвостового риска CVaR.", category: 'core' },
    { "key": "causal_penalty", "name": "Каузальный штраф", "min": 0, "max": 100, "step": 1, "defaultValue": 80, "canonValue": 75, "description": "Потенциал вызывать парадоксы и разрывать каузальные цепи.", category: 'core' },
    { "key": "topo", "name": "Топо-бонус", "min": 0, "max": 10, "step": 0.1, "defaultValue": 7, "canonValue": 8, "description": "Внутренний бонус топологической целостности.", category: 'core' },
    { "key": "witness_count", "name": "Число свидетелей", "min": 0, "max": 1000, "step": 1, "defaultValue": 150, "canonValue": 200, "description": "Количество наблюдателей, подкрепляющих его существование.", category: 'core' }
  ]
};

export default glassKnifeData;