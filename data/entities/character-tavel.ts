import { CharacterEntity, EntityType, Branch, Parameter } from '../../types';

const tavelData: CharacterEntity = {
  entityId: "char-tavel-001",
  type: EntityType.Character,
  title: "Tavel",
  subtitle: "Специалист по мелким хищникам",
  authors: [{ "name": "Chron-Verifier", "role": "Compiler" }],
  year: "70-71 год ОВ",
  versionTags: [Branch.PreBorders],
  status: "published",
  tags: ["Системный игрок", "Ученый", "МКЕ"],
  description: "Идеальный системный игрок, прагматичный и целеустремленный, ключевой технический исполнитель проекта МКЕ. Лояльна Протоколу и репутации, панически боится несанкционированного риска.",
  relations: [
      { type: "participant", entityId: "char-norr-001", entityTitle: "Norr" },
      { type: "participant", entityId: "char-bruni-001", entityTitle: "Bruni" },
      { type: "participant", entityId: "obj-comfort-unit-001", entityTitle: "Мобильная Комфорт-Единица (МКЕ)" }
  ],
  media: [],
  changelog: [
    { "version": "1.0", "date": "70 OВ", "author": "System", "summary": "Record created based on 'Многоцелевая оптимизация' narrative." }
  ],
  parameters: [
    // Core
    { "key": "will", "name": "Воля", "min": 0, "max": 100, "step": 1, "defaultValue": 80, "canonValue": 80, "description": "Очень высокая; прагматична и целеустремленна.", category: 'core' },
    { "key": "loyalty", "name": "Лояльность", "min": 0, "max": 100, "step": 1, "defaultValue": 70, "canonValue": 70, "description": "Высокая лояльность Протоколу и репутационному капиталу.", category: 'core' },
    { "key": "stress", "name": "Стресс", "min": 0, "max": 100, "step": 1, "defaultValue": 50, "canonValue": 50, "description": "Средний, операционный стресс, связанный с боязнью провала.", category: 'core' },
    { "key": "dark_exposure", "name": "Темное воздействие", "min": 0, "max": 100, "step": 1, "defaultValue": 20, "canonValue": 20, "description": "Низкий; 'тьма' для нее - это бюрократия.", category: 'core' },
    { "key": "causal_penalty", "name": "Каузальный штраф", "min": 0, "max": 100, "step": 1, "defaultValue": 30, "canonValue": 30, "description": "Растет, когда она соглашается на 'многоцелевую оптимизацию'.", category: 'core' },
    { "key": "topo", "name": "Топо", "min": 0, "max": 100, "step": 1, "defaultValue": 80, "canonValue": 80, "description": "Высокая; онтологически стабильна, но мировоззрение дает трещину.", category: 'core' },

    // Mandates
    { "key": "mandate_ops", "name": "Операционный мандат", "min": 0, "max": 3, "step": 1, "defaultValue": 1, "canonValue": 1, description: "Operational authority.", category: 'mandates' },
    { "key": "mandate_reg", "name": "Регуляторный мандат", "min": 0, "max": 3, "step": 1, "defaultValue": 1, "canonValue": 1, description: "Regulatory authority.", category: 'mandates' },
    { "key": "mandate_res", "name": "Ресурсный мандат", "min": 0, "max": 3, "step": 1, "defaultValue": 2, "canonValue": 2, description: "Resource access.", category: 'mandates' },
    { "key": "mandate_hr", "name": "Кадровый мандат", "min": 0, "max": 3, "step": 1, "defaultValue": 0, "canonValue": 0, description: "Personnel authority.", category: 'mandates' },
    { "key": "mandate_dip", "name": "Дипломатический мандат", "min": 0, "max": 3, "step": 1, "defaultValue": 0, "canonValue": 0, description: "Diplomatic authority.", category: 'mandates' },
    { "key": "mandate_emg", "name": "Чрезвычайный мандат", "min": 0, "max": 3, "step": 1, "defaultValue": 0, "canonValue": 0, description: "Emergency powers.", category: 'mandates' },
    { "key": "approval_level", "name": "Уровень согласования", "min": 0, "max": 3, "step": 1, "defaultValue": 1, "canonValue": 1, description: "Required approval level.", category: 'mandates' },

    // Abilities
    { "key": "competence_op", "name": "Операционная комп.", "min": 0, "max": 100, "step": 1, "defaultValue": 90, "canonValue": 90, description: "Operational/logistical competence.", category: 'abilities' },
    { "key": "competence_neg", "name": "Переговорная комп.", "min": 0, "max": 100, "step": 1, "defaultValue": 50, "canonValue": 50, description: "Negotiation/rhetoric competence.", category: 'abilities' },
    { "key": "decision_speed", "name": "Скорость решений", "min": 0, "max": 100, "step": 1, "defaultValue": 70, "canonValue": 70, description: "Speed of decision-making.", category: 'abilities' },
    { "key": "intel_access", "name": "Доступ к данным", "min": 0, "max": 100, "step": 1, "defaultValue": 70, "canonValue": 70, description: "Access to intelligence/data.", category: 'abilities' },
    { "key": "opsec", "name": "OPSEC", "min": 0, "max": 100, "step": 1, "defaultValue": 80, "canonValue": 80, description: "Operational security discipline.", category: 'abilities' },
    { "key": "reputation", "name": "Репутация", "min": 0, "max": 100, "step": 1, "defaultValue": 80, "canonValue": 80, description: "Public and internal legitimacy.", category: 'abilities' },
    { "key": "network_degree", "name": "Сеть влияния", "min": 0, "max": 100, "step": 1, "defaultValue": 40, "canonValue": 40, description: "Width of influence network.", category: 'abilities' },
    { "key": "resources", "name": "Ресурсы", "min": 0, "max": 100, "step": 1, "defaultValue": 60, "canonValue": 60, "description": "Выше среднего; главный ресурс - репутационный капитал.", category: 'abilities' },
    { "key": "risk_tolerance", "name": "Толерантность к риску", "min": 0, "max": 100, "step": 1, "defaultValue": 30, "canonValue": 30, "description": "Низкая; панически боится несанкционированного риска.", category: 'abilities' },

    // Limitations
    { "key": "accountability", "name": "Подотчетность", "min": 0, "max": 100, "step": 1, "defaultValue": 80, "canonValue": 80, description: "Accountability for failures.", category: 'limitations' },
    { "key": "ideology_rigidity", "name": "Жесткость идеологии", "min": 0, "max": 100, "step": 1, "defaultValue": 90, "canonValue": 90, description: "Rigidity of beliefs (pro-protocol).", category: 'limitations' },
    { "key": "conflict_of_interest", "name": "Конфликт интересов", "min": 0, "max": 100, "step": 1, "defaultValue": 20, "canonValue": 20, description: "Risk of biased decisions.", category: 'limitations' },
    { "key": "fatigue", "name": "Усталость", "min": 0, "max": 100, "step": 1, "defaultValue": 40, "canonValue": 40, description: "Accumulated fatigue.", category: 'limitations' },
    { "key": "sanction_risk", "name": "Риск санкций", "min": 0, "max": 100, "step": 1, "defaultValue": 60, "canonValue": 60, description: "Risk of mandate sanctions.", category: 'limitations' },
    { "key": "reputation_debt", "name": "Репутационный долг", "min": 0, "max": 100, "step": 1, "defaultValue": 20, "canonValue": 20, description: "Debt owed to public/canon opinion.", category: 'limitations' },

    // Switches
    { "key": "public_scrutiny", "name": "Общественный надзор", "min": 0, "max": 1, "step": 1, "defaultValue": 0, "canonValue": 0, description: "Under public/media pressure.", category: 'switches' },
  ] as Parameter[]
};

export default tavelData;
