import { CharacterEntity, EntityType, Branch, Parameter } from '../../types';

const norrData: CharacterEntity = {
  entityId: "char-norr-001",
  type: EntityType.Character,
  title: "Norr",
  subtitle: "Специалист по детритофагам",
  authors: [{ "name": "Chron-Verifier", "role": "Compiler" }],
  year: "70-71 год ОВ",
  versionTags: [Branch.PreBorders],
  status: "published",
  tags: ["EntoWorks", "Специалист", "МКЕ"],
  description: "Специалист, чья личная, бытовая травма (потеря) и хронический стресс запускают несанкционированный проект с далеко идущими последствиями.",
  relations: [
      { type: "participant", entityId: "char-tavel-001", entityTitle: "Tavel" },
      { type: "participant", entityId: "char-bruni-001", entityTitle: "Bruni" },
      { type: "source", entityId: "obj-comfort-unit-001", entityTitle: "Мобильная Комфорт-Единица (МКЕ)" }
  ],
  media: [],
  changelog: [
    { "version": "1.0", "date": "70 OВ", "author": "System", "summary": "Record created based on 'Многоцелевая оптимизация' narrative." }
  ],
  parameters: [
    // Core
    { "key": "will", "name": "Воля", "min": 0, "max": 100, "step": 1, "defaultValue": 70, "canonValue": 70, "description": "Высокая решимость в достижении конкретной, личной цели.", category: 'core' },
    { "key": "loyalty", "name": "Лояльность", "min": 0, "max": 100, "step": 1, "defaultValue": 40, "canonValue": 40, "description": "Лоялен не Системе, а собственному воспоминанию о комфорте.", category: 'core' },
    { "key": "stress", "name": "Стресс", "min": 0, "max": 100, "step": 1, "defaultValue": 80, "canonValue": 80, "description": "Высокий, хронический, фоновый стресс, главный двигатель его действий.", category: 'core' },
    { "key": "dark_exposure", "name": "Темное воздействие", "min": 0, "max": 100, "step": 1, "defaultValue": 10, "canonValue": 10, "description": "Крайне низкий; его травма — сугубо личная, бытовая.", category: 'core' },
    { "key": "causal_penalty", "name": "Каузальный штраф", "min": 0, "max": 100, "step": 1, "defaultValue": 10, "canonValue": 10, "description": "Минимальный штраф до момента запуска проекта.", category: 'core' },
    { "key": "topo", "name": "Топо", "min": 0, "max": 100, "step": 1, "defaultValue": 90, "canonValue": 90, "description": "Высокая; абсолютно нормальный, онтологически стабильный человек.", category: 'core' },

    // Mandates
    { "key": "mandate_ops", "name": "Операционный мандат", "min": 0, "max": 3, "step": 1, "defaultValue": 0, "canonValue": 0, description: "Operational authority.", category: 'mandates' },
    { "key": "mandate_reg", "name": "Регуляторный мандат", "min": 0, "max": 3, "step": 1, "defaultValue": 0, "canonValue": 0, description: "Regulatory authority.", category: 'mandates' },
    { "key": "mandate_res", "name": "Ресурсный мандат", "min": 0, "max": 3, "step": 1, "defaultValue": 1, "canonValue": 1, description: "Resource access.", category: 'mandates' },
    { "key": "mandate_hr", "name": "Кадровый мандат", "min": 0, "max": 3, "step": 1, "defaultValue": 0, "canonValue": 0, description: "Personnel authority.", category: 'mandates' },
    { "key": "mandate_dip", "name": "Дипломатический мандат", "min": 0, "max": 3, "step": 1, "defaultValue": 0, "canonValue": 0, description: "Diplomatic authority.", category: 'mandates' },
    { "key": "mandate_emg", "name": "Чрезвычайный мандат", "min": 0, "max": 3, "step": 1, "defaultValue": 0, "canonValue": 0, description: "Emergency powers.", category: 'mandates' },
    { "key": "approval_level", "name": "Уровень согласования", "min": 0, "max": 3, "step": 1, "defaultValue": 2, "canonValue": 2, description: "Required approval level.", category: 'mandates' },

    // Abilities
    { "key": "competence_op", "name": "Операционная комп.", "min": 0, "max": 100, "step": 1, "defaultValue": 80, "canonValue": 80, description: "Operational/logistical competence.", category: 'abilities' },
    { "key": "competence_neg", "name": "Переговорная комп.", "min": 0, "max": 100, "step": 1, "defaultValue": 30, "canonValue": 30, description: "Negotiation/rhetoric competence.", category: 'abilities' },
    { "key": "decision_speed", "name": "Скорость решений", "min": 0, "max": 100, "step": 1, "defaultValue": 60, "canonValue": 60, description: "Speed of decision-making.", category: 'abilities' },
    { "key": "intel_access", "name": "Доступ к данным", "min": 0, "max": 100, "step": 1, "defaultValue": 20, "canonValue": 20, description: "Access to intelligence/data.", category: 'abilities' },
    { "key": "opsec", "name": "OPSEC", "min": 0, "max": 100, "step": 1, "defaultValue": 50, "canonValue": 50, description: "Operational security discipline.", category: 'abilities' },
    { "key": "reputation", "name": "Репутация", "min": 0, "max": 100, "step": 1, "defaultValue": 40, "canonValue": 40, description: "Public and internal legitimacy.", category: 'abilities' },
    { "key": "network_degree", "name": "Сеть влияния", "min": 0, "max": 100, "step": 1, "defaultValue": 50, "canonValue": 50, description: "Width of influence network (Tavel, Bruni).", category: 'abilities' },
    { "key": "resources", "name": "Ресурсы", "min": 0, "max": 100, "step": 1, "defaultValue": 30, "canonValue": 30, "description": "Низкие; главный ресурс — социальный капитал.", category: 'abilities' },
    { "key": "risk_tolerance", "name": "Толерантность к риску", "min": 0, "max": 100, "step": 1, "defaultValue": 60, "canonValue": 60, "description": "Умеренно-высокая; готов нарушить протоколы из-за личной нужды.", category: 'abilities' },

    // Limitations
    { "key": "accountability", "name": "Подотчетность", "min": 0, "max": 100, "step": 1, "defaultValue": 30, "canonValue": 30, description: "Accountability for failures.", category: 'limitations' },
    { "key": "ideology_rigidity", "name": "Жесткость идеологии", "min": 0, "max": 100, "step": 1, "defaultValue": 20, "canonValue": 20, description: "Rigidity of beliefs.", category: 'limitations' },
    { "key": "conflict_of_interest", "name": "Конфликт интересов", "min": 0, "max": 100, "step": 1, "defaultValue": 80, "canonValue": 80, description: "Risk of biased decisions (personal need vs system).", category: 'limitations' },
    { "key": "fatigue", "name": "Усталость", "min": 0, "max": 100, "step": 1, "defaultValue": 60, "canonValue": 60, description: "Accumulated fatigue.", category: 'limitations' },
    { "key": "sanction_risk", "name": "Риск санкций", "min": 0, "max": 100, "step": 1, "defaultValue": 70, "canonValue": 70, description: "Risk of mandate sanctions.", category: 'limitations' },
    { "key": "reputation_debt", "name": "Репутационный долг", "min": 0, "max": 100, "step": 1, "defaultValue": 10, "canonValue": 10, description: "Debt owed to public/canon opinion.", category: 'limitations' },

    // Switches
    { "key": "public_scrutiny", "name": "Общественный надзор", "min": 0, "max": 1, "step": 1, "defaultValue": 0, "canonValue": 0, description: "Under public/media pressure.", category: 'switches' },
  ] as Parameter[]
};

export default norrData;
