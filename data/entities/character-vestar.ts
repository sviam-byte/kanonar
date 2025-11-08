import { CharacterEntity, EntityType, Branch, Parameter } from '../../types';

const vestarData: CharacterEntity = {
  entityId: "char-vestar-001",
  type: EntityType.Character,
  title: "Vestar",
  subtitle: "Меч Короны (Нулевой акт. II)",
  authors: [{ "name": "Chron-Verifier", "role": "Compiler" }],
  year: "431 год от Воздвижения",
  versionTags: [Branch.Current],
  status: "published",
  tags: ["Меч Короны", "Гексагон", "Тень", "Воин"],
  description: "Эта карточка описывает Вестара, которого помнил Кайнракс, — верного, функционального, но уже с внутренним конфликтом.",
  relations: [],
  media: [],
  changelog: [
    { "version": "1.0", "date": "431 OВ", "author": "System", "summary": "Initial record creation based on Kainrax's memory." }
  ],
  parameters: [
    // Core
    { "key": "will", "name": "Воля", "min": 0, "max": 100, "step": 1, "defaultValue": 90, "canonValue": 90, "description": "Абсолютная решимость, закалённая службой.", category: 'core' },
    { "key": "loyalty", "name": "Лояльность", "min": 0, "max": 100, "step": 1, "defaultValue": 90, "canonValue": 90, "description": "Предан Короне и идеалам Кайрнакс.", category: 'core' },
    { "key": "stress", "name": "Стресс", "min": 0, "max": 100, "step": 1, "defaultValue": 60, "canonValue": 60, "description": "Накопленный, но эффективно подавляемый стресс.", category: 'core' },
    { "key": "dark_exposure", "name": "Темное воздействие", "min": 0, "max": 100, "step": 1, "defaultValue": 60, "canonValue": 60, "description": "Опыт столкновения с порчей, Хришем и смертью; не является мерой 'испорченности'.", category: 'core' },
    { "key": "causal_penalty", "name": "Каузальный штраф", "min": 0, "max": 100, "step": 1, "defaultValue": 20, "canonValue": 20, "description": "Действует в рамках системы, а не против неё.", category: 'core' },
    { "key": "topo", "name": "Топо", "min": 0, "max": 100, "step": 1, "defaultValue": 80, "canonValue": 80, "description": "Идентичность и место в мире четко определены.", category: 'core' },
    
    // Mandates
    { "key": "mandate_ops", "name": "Операционный мандат", "min": 0, "max": 3, "step": 1, "defaultValue": 3, "canonValue": 3, description: "Операционные полномочия (арест, карантин).", category: 'mandates' },
    { "key": "mandate_reg", "name": "Регуляторный мандат", "min": 0, "max": 3, "step": 1, "defaultValue": 1, "canonValue": 1, description: "Регуляторные полномочия (протоколы, приказы).", category: 'mandates' },
    { "key": "mandate_res", "name": "Ресурсный мандат", "min": 0, "max": 3, "step": 1, "defaultValue": 3, "canonValue": 3, description: "Доступ к ресурсам (бюджет, активы).", category: 'mandates' },
    { "key": "mandate_hr", "name": "Кадровый мандат", "min": 0, "max": 3, "step": 1, "defaultValue": 3, "canonValue": 3, description: "Кадровые полномочия (назначения).", category: 'mandates' },
    { "key": "mandate_dip", "name": "Дипломатический мандат", "min": 0, "max": 3, "step": 1, "defaultValue": 1, "canonValue": 1, description: "Дипломатические полномочия.", category: 'mandates' },
    { "key": "mandate_emg", "name": "Чрезвычайный мандат", "min": 0, "max": 3, "step": 1, "defaultValue": 2, "canonValue": 2, description: "Чрезвычайные полномочия.", category: 'mandates' },
    { "key": "approval_level", "name": "Уровень согласования", "min": 0, "max": 3, "step": 1, "defaultValue": 2, "canonValue": 2, description: "Требуемый уровень согласования для крупных действий.", category: 'mandates' },

    // Abilities
    { "key": "competence_op", "name": "Операционная комп.", "min": 0, "max": 100, "step": 1, "defaultValue": 100, "canonValue": 100, description: "Операционная/логистическая компетентность.", category: 'abilities' },
    { "key": "competence_neg", "name": "Переговорная комп.", "min": 0, "max": 100, "step": 1, "defaultValue": 70, "canonValue": 70, description: "Компетентность в переговорах/риторике.", category: 'abilities' },
    { "key": "decision_speed", "name": "Скорость решений", "min": 0, "max": 100, "step": 1, "defaultValue": 90, "canonValue": 90, description: "Скорость принятия решений.", category: 'abilities' },
    { "key": "intel_access", "name": "Доступ к данным", "min": 0, "max": 100, "step": 1, "defaultValue": 80, "canonValue": 80, description: "Доступ к разведданным/информации.", category: 'abilities' },
    { "key": "opsec", "name": "OPSEC", "min": 0, "max": 100, "step": 1, "defaultValue": 95, "canonValue": 95, description: "Дисциплина операционной безопасности.", category: 'abilities' },
    { "key": "reputation", "name": "Репутация", "min": 0, "max": 100, "step": 1, "defaultValue": 95, "canonValue": 95, description: "Общественная и внутренняя легитимность.", category: 'abilities' },
    { "key": "network_degree", "name": "Сеть влияния", "min": 0, "max": 100, "step": 1, "defaultValue": 60, "canonValue": 60, description: "Широта сети влияния.", category: 'abilities' },
    { "key": "resources", "name": "Ресурсы", "min": 0, "max": 100, "step": 1, "defaultValue": 80, "canonValue": 80, "description": "Доступ к элитным войскам и разведданным.", category: 'abilities' },
    { "key": "risk_tolerance", "name": "Толерантность к риску", "min": 0, "max": 100, "step": 1, "defaultValue": 90, "canonValue": 90, "description": "Готовность рисковать жизнью — базовое состояние.", category: 'abilities' },
    
    // Limitations
    { "key": "accountability", "name": "Подотчетность", "min": 0, "max": 100, "step": 1, "defaultValue": 90, "canonValue": 90, description: "Ответственность за провалы.", category: 'limitations' },
    { "key": "ideology_rigidity", "name": "Жесткость идеологии", "min": 0, "max": 100, "step": 1, "defaultValue": 70, "canonValue": 70, description: "Жесткость убеждений.", category: 'limitations' },
    { "key": "conflict_of_interest", "name": "Конфликт интересов", "min": 0, "max": 100, "step": 1, "defaultValue": 10, "canonValue": 10, description: "Риск предвзятых решений.", category: 'limitations' },
    { "key": "fatigue", "name": "Усталость", "min": 0, "max": 100, "step": 1, "defaultValue": 40, "canonValue": 40, description: "Накопленная усталость.", category: 'limitations' },
    { "key": "sanction_risk", "name": "Риск санкций", "min": 0, "max": 100, "step": 1, "defaultValue": 15, "canonValue": 15, description: "Риск санкций по мандату.", category: 'limitations' },
    { "key": "reputation_debt", "name": "Репутационный долг", "min": 0, "max": 100, "step": 1, "defaultValue": 5, "canonValue": 5, description: "Долг перед общественным/каноническим мнением.", category: 'limitations' },
    
    // Switches
    { "key": "public_scrutiny", "name": "Общественный надзор", "min": 0, "max": 1, "step": 1, "defaultValue": 1, "canonValue": 1, description: "Под давлением общества/СМИ.", category: 'switches' },
  ] as Parameter[]
};

export default vestarData;
