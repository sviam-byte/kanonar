
import { ObjectEntity, EntityType, Branch, Parameter } from '../../types';

const comfortUnitData: ObjectEntity = {
  entityId: "obj-comfort-unit-001",
  type: EntityType.Object,
  title: "Мобильная Комфорт-Единица (МКЕ)",
  subtitle: "Проектная модель",
  authors: [{ "name": "Norr/Tavel/Bruni", "role": "Creators" }],
  year: "71 год ОВ",
  versionTags: [Branch.PreBorders],
  status: "published",
  tags: ["МКЕ", "Парадокс", "Био-артефакт", "Кошка"],
  description: "Материализованный парадокс. 'Осознанный компромисс', который нарушает базовый принцип Системы — стремление к максимальной эффективности. МКЕ — это физическое воплощение 'Индекса_Бесполезности', внесенного в реальность.",
  relations: [],
  media: [],
  changelog: [
    { "version": "1.0", "date": "71 OВ", "author": "Evolutor", "summary": "Model synthesized based on contradictory goals." }
  ],
  parameters: [
    { "key": "A_star", "name": "A*", "min": 0, "max": 500, "step": 1, "defaultValue": 0, "canonValue": 30, "description": "Целевой уровень внимания системы — изначально ноль.", category: 'core' },
    { "key": "E", "name": "E", "min": 0, "max": 500, "step": 1, "defaultValue": 100, "canonValue": 100, "description": "Фактическое внимание от создателей и наблюдателей.", category: 'core' },
    { "key": "exergy_cost", "name": "exergy_cost", "min": 0, "max": 100, "step": 1, "defaultValue": 70, "canonValue": 70, "description": "Высокая стоимость поддержания 'облигатного хищника'.", category: 'core' },
    { "key": "infra_footprint", "name": "infra_footprint", "min": 0, "max": 100, "step": 1, "defaultValue": 60, "canonValue": 60, "description": "Требует изменений в системе жизнеобеспечения и безопасности.", category: 'core' },
    { "key": "hazard_rate", "name": "hazard_rate", "min": 0, "max": 100, "step": 1, "defaultValue": 40, "canonValue": 40, "description": "Потенциальный источник аллергенов и нарушений работы оборудования.", category: 'core' },
    { "key": "cvar_alpha", "name": "cvar_alpha", "min": 0, "max": 1, "step": 0.01, "defaultValue": 0.05, "canonValue": 0.05, "description": "Alpha-quantile for CVaR tail risk calculation.", category: 'core' },
    { "key": "causal_penalty", "name": "causal_penalty", "min": 0, "max": 100, "step": 1, "defaultValue": 80, "canonValue": 80, "description": "Высокий; сам факт существования нарушает базовый принцип Системы.", category: 'core' },
    { "key": "topo", "name": "topo", "min": 0, "max": 10, "step": 0.1, "defaultValue": 2, "canonValue": 2, "description": "Крайне низкая онтологическая стабильность как 'бесполезного' вида.", category: 'core' },
    { "key": "witness_count", "name": "witness_count", "min": 0, "max": 1000, "step": 1, "defaultValue": 3, "canonValue": 3, "description": "Количество наблюдателей, подкрепляющих его существование.", category: 'core' }
  ]
};

export default comfortUnitData;