import { CharacterEntity, EntityType, Branch, Parameter } from '../../types';

const lyraData: CharacterEntity = {
  entityId: "char-lyra-001",
  type: EntityType.Character,
  title: "Lyra",
  subtitle: "Студентка-Биотехник",
  authors: [{ "name": "Chron-Verifier", "role": "Compiler" }],
  year: "100 год от Воздвижения",
  versionTags: [Branch.PreBorders],
  status: "published",
  tags: ["Студент", "Биотехник", "Университет", "Исследователь"],
  description: "Персонаж из эпохи относительной стабильности и строгой системности. Её открытие «аномалии» (шафрановый цветок) пробуждает в ней упрямство и решимость идти против системы.",
  relations: [],
  media: [],
  changelog: [
    { "version": "1.0", "date": "100 OВ", "author": "System", "summary": "Record created for 'Дешевле' narrative." }
  ],
  parameters: [
    // Core
    { "key": "will", "name": "Воля", "min": 0, "max": 100, "step": 1, "defaultValue": 60, "canonValue": 60, "description": "Средняя, растущая решимость.", category: 'core' },
    { "key": "loyalty", "name": "Лояльность", "min": 0, "max": 100, "step": 1, "defaultValue": 50, "canonValue": 50, "description": "Колеблющаяся лояльность между системой и правдой.", category: 'core' },
    { "key": "stress", "name": "Стресс", "min": 0, "max": 100, "step": 1, "defaultValue": 40, "canonValue": 40, "description": "Академический стресс, усиливающийся от конфликта.", category: 'core' },
    { "key": "dark_exposure", "name": "Темное воздействие", "min": 0, "max": 100, "step": 1, "defaultValue": 10, "canonValue": 10, "description": "Столкновение с системной ложью как травматичное открытие.", category: 'core' },
    { "key": "causal_penalty", "name": "Каузальный штраф", "min": 0, "max": 100, "step": 1, "defaultValue": 10, "canonValue": 10, "description": "Её действия имеют потенциально высокий, но неосознанный штраф.", category: 'core' },
    { "key": "topo", "name": "Топо", "min": 0, "max": 100, "step": 1, "defaultValue": 70, "canonValue": 70, "description": "Стабильная идентичность, но под угрозой из-за внутреннего конфликта.", category: 'core' },
    
    // Mandates
    { "key": "mandate_ops", "name": "Операционный мандат", "min": 0, "max": 3, "step": 1, "defaultValue": 0, "canonValue": 0, description: "Operational authority.", category: 'mandates' },
    { "key": "mandate_reg", "name": "Регуляторный мандат", "min": 0, "max": 3, "step": 1, "defaultValue": 0, "canonValue": 0, description: "Regulatory authority.", category: 'mandates' },
    { "key": "mandate_res", "name": "Ресурсный мандат", "min": 0, "max": 3, "step": 1, "defaultValue": 0, "canonValue": 0, description: "Resource access.", category: 'mandates' },
    { "key": "mandate_hr", "name": "Кадровый мандат", "min": 0, "max": 3, "step": 1, "defaultValue": 0, "canonValue": 0, description: "Personnel authority.", category: 'mandates' },
    { "key": "mandate_dip", "name": "Дипломатический мандат", "min": 0, "max": 3, "step": 1, "defaultValue": 0, "canonValue": 0, description: "Diplomatic authority.", category: 'mandates' },
    { "key": "mandate_emg", "name": "Чрезвычайный мандат", "min": 0, "max": 3, "step": 1, "defaultValue": 0, "canonValue": 0, description: "Emergency powers.", category: 'mandates' },
    { "key": "approval_level", "name": "Уровень согласования", "min": 0, "max": 3, "step": 1, "defaultValue": 0, "canonValue": 0, description: "Required approval level.", category: 'mandates' },

    // Abilities
    { "key": "competence_op", "name": "Операционная комп.", "min": 0, "max": 100, "step": 1, "defaultValue": 80, "canonValue": 80, description: "Operational/logistical competence.", category: 'abilities' },
    { "key": "competence_neg", "name": "Переговорная комп.", "min": 0, "max": 100, "step": 1, "defaultValue": 30, "canonValue": 30, description: "Negotiation/rhetoric competence.", category: 'abilities' },
    { "key": "decision_speed", "name": "Скорость решений", "min": 0, "max": 100, "step": 1, "defaultValue": 50, "canonValue": 50, description: "Speed of decision-making.", category: 'abilities' },
    { "key": "intel_access", "name": "Доступ к данным", "min": 0, "max": 100, "step": 1, "defaultValue": 20, "canonValue": 20, description: "Access to intelligence/data.", category: 'abilities' },
    { "key": "opsec", "name": "OPSEC", "min": 0, "max": 100, "step": 1, "defaultValue": 60, "canonValue": 60, description: "Operational security discipline.", category: 'abilities' },
    { "key": "reputation", "name": "Репутация", "min": 0, "max": 100, "step": 1, "defaultValue": 40, "canonValue": 40, description: "Public and internal legitimacy.", category: 'abilities' },
    { "key": "network_degree", "name": "Сеть влияния", "min": 0, "max": 100, "step": 1, "defaultValue": 10, "canonValue": 10, description: "Width of influence network.", category: 'abilities' },
    { "key": "resources", "name": "Ресурсы", "min": 0, "max": 100, "step": 1, "defaultValue": 30, "canonValue": 30, "description": "Низкие ресурсы, главный актив - интеллект.", category: 'abilities' },
    { "key": "risk_tolerance", "name": "Толерантность к риску", "min": 0, "max": 100, "step": 1, "defaultValue": 40, "canonValue": 40, "description": "Низкая, но растущая по мере защиты своего открытия.", category: 'abilities' },
    
    // Limitations
    { "key": "accountability", "name": "Подотчетность", "min": 0, "max": 100, "step": 1, "defaultValue": 20, "canonValue": 20, description: "Accountability for failures.", category: 'limitations' },
    { "key": "ideology_rigidity", "name": "Жесткость идеологии", "min": 0, "max": 100, "step": 1, "defaultValue": 70, "canonValue": 70, description: "Rigidity of beliefs.", category: 'limitations' },
    { "key": "conflict_of_interest", "name": "Конфликт интересов", "min": 0, "max": 100, "step": 1, "defaultValue": 80, "canonValue": 80, description: "Risk of biased decisions (truth vs system).", category: 'limitations' },
    { "key": "fatigue", "name": "Усталость", "min": 0, "max": 100, "step": 1, "defaultValue": 30, "canonValue": 30, description: "Accumulated fatigue.", category: 'limitations' },
    { "key": "sanction_risk", "name": "Риск санкций", "min": 0, "max": 100, "step": 1, "defaultValue": 80, "canonValue": 80, description: "Risk of mandate sanctions.", category: 'limitations' },
    { "key": "reputation_debt", "name": "Репутационный долг", "min": 0, "max": 100, "step": 1, "defaultValue": 5, "canonValue": 5, description: "Debt owed to public/canon opinion.", category: 'limitations' },
    
    // Switches
    { "key": "public_scrutiny", "name": "Общественный надзор", "min": 0, "max": 1, "step": 1, "defaultValue": 0, "canonValue": 0, description: "Under public/media pressure.", category: 'switches' },
  ] as Parameter[]
};

export default lyraData;
