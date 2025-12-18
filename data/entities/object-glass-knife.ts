
// Populated file to resolve module error and provide necessary entity data.
import { ObjectEntity, EntityType, Branch } from '../../types';

const glassKnifeData: ObjectEntity = {
  entityId: "obj-glass-knife-002",
  type: EntityType.Object,
  title: "Стеклянный нож",
  subtitle: "Артефакт каузальной хирургии",
  authors: [{ name: "Неизвестно", role: "Создатель" }],
  year: "н.д.",
  versionTags: [Branch.Current, Branch.PreRector],
  status: "published",
  tags: ["артефакт", "каузальный", "оружие", "СМСБ"],
  description: "Артефакт, способный разрывать не физические, а каузальные связи. Его использование сопряжено с высоким онтологическим риском, но его форма аномально устойчива благодаря 'божественной пайке' и вниманию свидетелей.",
  relations: [
    { "type": "owner", "entityId": "character-rion", "entityTitle": "Рианнон" }
  ],
  media: [],
  changelog: [
    { "version": "1.0", "date": "н.д.", "author": "Система", "summary": "Initial record." }
  ],
  parameters: [
    { "key": "A_star", "name": "A*", "min": 0, "max": 500, "step": 1, "defaultValue": 150, "canonValue": 150, "description": "Целевой уровень внимания для поддержания стабильности.", category: 'core' },
    { "key": "E", "name": "E", "min": 0, "max": 500, "step": 1, "defaultValue": 150, "canonValue": 150, "description": "Фактическое внимание от наблюдателей.", category: 'core' },
    { "key": "exergy_cost", "name": "exergy_cost", "min": 0, "max": 100, "step": 1, "defaultValue": 20, "canonValue": 20, "description": "Стоимость поддержания формы.", category: 'core' },
    { "key": "infra_footprint", "name": "infra_footprint", "min": 0, "max": 100, "step": 1, "defaultValue": 10, "canonValue": 10, "description": "Не требует сложной инфраструктуры.", category: 'core' },
    { "key": "hazard_rate", "name": "hazard_rate", "min": 0, "max": 100, "step": 1, "defaultValue": 90, "canonValue": 90, "description": "Высокий риск при неправильном использовании.", category: 'core' },
    { "key": "cvar_alpha", "name": "cvar_alpha", "min": 0, "max": 1, "step": 0.01, "defaultValue": 0.05, "canonValue": 0.05, "description": "Alpha-quantile for CVaR tail risk calculation.", category: 'core' },
    { "key": "causal_penalty", "name": "causal_penalty", "min": 0, "max": 100, "step": 1, "defaultValue": 95, "canonValue": 95, "description": "Крайне высокий; его функция — прямое нарушение причинности.", category: 'core' },
    { "key": "topo", "name": "topo", "min": 0, "max": 10, "step": 0.1, "defaultValue": 8, "canonValue": 8, "description": "Высокая топологическая сложность/защита ('божественная пайка').", category: 'core' },
    { "key": "witness_count", "name": "witness_count", "min": 0, "max": 1000, "step": 1, "defaultValue": 250, "canonValue": 250, "description": "Количество свидетелей, знающих о его существовании.", category: 'core' }
  ]
};

export default glassKnifeData;