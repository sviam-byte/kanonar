import { CharacterEntity, EntityType, Branch, Parameter } from '../../types';

const rionData: CharacterEntity = {
  entityId: "char-rion-001",
  type: EntityType.Character,
  title: "Рион",
  subtitle: "Инженер «Плана-Заплатки»",
  authors: [{ "name": "Хрон-Верификатор", "role": "Составитель" }],
  year: "380-410 OВ",
  versionTags: [Branch.Current, Branch.PreRector],
  status: "published",
  tags: ["инженер", "Рианнон", "стабилизация", "человек"],
  description: "Рион — высокопоставленный инженер, действующий под эгидой Рианнон. Специализируясь на «Планах-заплатках» и «Локализации трещин», её работа заключается в ремонте онтологических повреждений и укреплении стабильности артефактов и документов. Она воплощает принцип, согласно которому реальность можно ремонтировать и поддерживать, но не создавать из ничего.",
  relations: [
    { "type": "owner", "entityId": "obj-glass-knife-002", "entityTitle": "Стеклянный нож" }
  ],
  evidenceIds: ["ev-rion-patch-plan", "ev-rion-glass-knife-owner"],
  media: [
    {
      "type": "image",
      "url": "https://storage.googleapis.com/maker-me/prompts%2Fart%2Fprivate%2Fclvgja17r0002mh0fpyf06ol0_1.png",
      "caption": "Официальный портрет, около 408 г. OВ.",
      "source": "Архивы Ректората"
    }
  ],
  changelog: [
    { "version": "1.0", "date": "410 OВ", "author": "Система", "summary": "Создание первичной записи." }
  ],
  parameters: [
    // Core
    { "key": "will", "name": "Воля", "min": 0, "max": 100, "step": 1, "defaultValue": 75, "canonValue": 80, "description": "Решимость и ментальная стойкость персонажа.", category: 'core' },
    { "key": "loyalty", "name": "Лояльность", "min": 0, "max": 100, "step": 1, "defaultValue": 85, "canonValue": 90, "description": "Приверженность своей фракции и её принципам.", category: 'core' },
    { "key": "stress", "name": "Стресс", "min": 0, "max": 100, "step": 1, "defaultValue": 30, "canonValue": 25, "description": "Накопленное психологическое и операционное давление.", category: 'core' },
    { "key": "dark_exposure", "name": "Темное воздействие", "min": 0, "max": 100, "step": 1, "defaultValue": 20, "canonValue": 15, "description": "Воздействие травмирующей или онтологически опасной информации.", category: 'core' },
    { "key": "causal_penalty", "name": "Каузальный штраф", "min": 0, "max": 100, "step": 1, "defaultValue": 10, "canonValue": 5, "description": "Личное участие в действиях, рискующих каузальной целостностью.", category: 'core' },
    { "key": "topo", "name": "Топо", "min": 0, "max": 100, "step": 1, "defaultValue": 50, "canonValue": 60, "description": "Личная топологическая стабильность.", category: 'core' },
    
    // Mandates
    { "key": "mandate_ops", "name": "Операционный мандат", "min": 0, "max": 3, "step": 1, "defaultValue": 2, "canonValue": 2, "description": "Операционные полномочия (арест, карантин).", category: 'mandates' },
    { "key": "mandate_reg", "name": "Регуляторный мандат", "min": 0, "max": 3, "step": 1, "defaultValue": 1, "canonValue": 1, "description": "Регуляторные полномочия (протоколы, приказы).", category: 'mandates' },
    { "key": "mandate_res", "name": "Ресурсный мандат", "min": 0, "max": 3, "step": 1, "defaultValue": 3, "canonValue": 3, "description": "Доступ к ресурсам (бюджет, активы).", category: 'mandates' },
    { "key": "mandate_hr", "name": "Кадровый мандат", "min": 0, "max": 3, "step": 1, "defaultValue": 1, "canonValue": 1, "description": "Кадровые полномочия (назначения).", category: 'mandates' },
    { "key": "mandate_dip", "name": "Дипломатический мандат", "min": 0, "max": 3, "step": 1, "defaultValue": 0, "canonValue": 0, "description": "Дипломатические полномочия.", category: 'mandates' },
    { "key": "mandate_emg", "name": "Чрезвычайный мандат", "min": 0, "max": 3, "step": 1, "defaultValue": 1, "canonValue": 1, "description": "Чрезвычайные полномочия.", category: 'mandates' },
    { "key": "approval_level", "name": "Уровень согласования", "min": 0, "max": 3, "step": 1, "defaultValue": 1, "canonValue": 1, "description": "Требуемый уровень согласования для крупных действий.", category: 'mandates' },

    // Abilities
    { "key": "competence_op", "name": "Операционная комп.", "min": 0, "max": 100, "step": 1, "defaultValue": 95, "canonValue": 95, "description": "Операционная/логистическая компетентность.", category: 'abilities' },
    { "key": "competence_neg", "name": "Переговорная комп.", "min": 0, "max": 100, "step": 1, "defaultValue": 60, "canonValue": 60, "description": "Компетентность в переговорах/риторике.", category: 'abilities' },
    { "key": "decision_speed", "name": "Скорость решений", "min": 0, "max": 100, "step": 1, "defaultValue": 80, "canonValue": 85, "description": "Скорость принятия решений.", category: 'abilities' },
    { "key": "intel_access", "name": "Доступ к данным", "min": 0, "max": 100, "step": 1, "defaultValue": 70, "canonValue": 75, "description": "Доступ к разведданным/информации.", category: 'abilities' },
    { "key": "opsec", "name": "OPSEC", "min": 0, "max": 100, "step": 1, "defaultValue": 90, "canonValue": 90, "description": "Дисциплина операционной безопасности.", category: 'abilities' },
    { "key": "reputation", "name": "Репутация", "min": 0, "max": 100, "step": 1, "defaultValue": 70, "canonValue": 75, "description": "Общественная и внутренняя легитимность.", category: 'abilities' },
    { "key": "network_degree", "name": "Сеть влияния", "min": 0, "max": 100, "step": 1, "defaultValue": 50, "canonValue": 60, "description": "Широта сети влияния.", category: 'abilities' },
    { "key": "resources", "name": "Ресурсы", "min": 0, "max": 100, "step": 1, "defaultValue": 60, "canonValue": 70, "description": "Доступ к материальным, информационным и кадровым активам.", category: 'abilities' },

    // Limitations
    { "key": "accountability", "name": "Подотчетность", "min": 0, "max": 100, "step": 1, "defaultValue": 80, "canonValue": 85, "description": "Ответственность за провалы.", category: 'limitations' },
    { "key": "ideology_rigidity", "name": "Жесткость идеологии", "min": 0, "max": 100, "step": 1, "defaultValue": 40, "canonValue": 30, "description": "Жесткость убеждений.", category: 'limitations' },
    { "key": "privacy_cost_epsilon", "name": "Стоимость приватности (ε)", "min": 0, "max": 100, "step": 1, "defaultValue": 10, "canonValue": 5, "description": "Риск, связанный с инвазивностью сбора данных.", category: 'limitations' },
    { "key": "conflict_of_interest", "name": "Конфликт интересов", "min": 0, "max": 100, "step": 1, "defaultValue": 10, "canonValue": 10, "description": "Риск предвзятых решений.", category: 'limitations' },
    { "key": "fatigue", "name": "Усталость", "min": 0, "max": 100, "step": 1, "defaultValue": 20, "canonValue": 15, "description": "Накопленная усталость.", category: 'limitations' },
    { "key": "sanction_risk", "name": "Риск санкций", "min": 0, "max": 100, "step": 1, "defaultValue": 25, "canonValue": 20, "description": "Риск санкций по мандату.", category: 'limitations' },
    { "key": "reputation_debt", "name": "Репутационный долг", "min": 0, "max": 100, "step": 1, "defaultValue": 5, "canonValue": 5, "description": "Долг перед общественным/каноническим мнением.", category: 'limitations' },

    // Switches
    { "key": "public_scrutiny", "name": "Общественный надзор", "min": 0, "max": 1, "step": 1, "defaultValue": 0, "canonValue": 0, "description": "Под давлением общества/СМИ.", category: 'switches' },
  ] as Parameter[]
};

export default rionData;