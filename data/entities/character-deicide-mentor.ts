import { CharacterEntity, EntityType, Branch, Parameter } from '../../types';

const data: CharacterEntity = {
    entityId: "deicide-mentor",
    type: EntityType.Character,
    title: "Старкад",
    subtitle: "Наставник Деицида",
    authors: [{ name: "auto_extract", role: "Source" }],
    year: "410",
    versionTags: [Branch.Current],
    status: "published",
    tags: ["ветеран", "выживание", "Вечный Город", "полевой опыт"],
    description: "Бывший военный, переживший худшее. Циник-прагматик, учит выживанию без романтики. Говорит рублено, презирает пропаганду.",
    relations: [
        { type: "trains", entityId: "molot-trainee", entityTitle: "Бьёрн" },
        { type: "advises", entityId: "molot-scout", entityTitle: "Скьольд" }
    ],
    media: [],
    evidenceIds: [],
    changelog: [{ version: "1.0", date: "410 OВ", author: "System", summary: "Initial record creation." }],
    parameters: [
        { key: "will", name: "Воля", description: "Решимость и ментальная стойкость персонажа.", min: 0, max: 100, step: 1, defaultValue: 85, canonValue: 85, category: 'core' },
        { key: "loyalty", name: "Лояльность", description: "Приверженность своей фракции и её принципам.", min: 0, max: 100, step: 1, defaultValue: 40, canonValue: 40, category: 'core' },
        { key: "stress", name: "Стресс", description: "Накопленное психологическое и операционное давление.", min: 0, max: 100, step: 1, defaultValue: 35, canonValue: 35, category: 'core' },
        { key: "dark_exposure", name: "Темное воздействие", description: "Воздействие травмирующей или онтологически опасной информации.", min: 0, max: 100, step: 1, defaultValue: 60, canonValue: 60, category: 'core' },
        { key: "causal_penalty", name: "Каузальный штраф", description: "Личное участие в действиях, рискующих каузальной целостностью.", min: 0, max: 100, step: 1, defaultValue: 10, canonValue: 10, category: 'core' },
        { key: "topo", name: "Топо", description: "Личная топологическая стабильность.", min: 0, max: 100, step: 1, defaultValue: 70, canonValue: 70, category: 'core' },
        { key: "mandate_ops", name: "Операционный мандат", description: "Операционные полномочия.", min: 0, max: 100, step: 1, defaultValue: 10, canonValue: 10, category: 'mandates' },
        { key: "mandate_reg", name: "Регуляторный мандат", description: "Регуляторные полномочия.", min: 0, max: 100, step: 1, defaultValue: 5, canonValue: 5, category: 'mandates' },
        { key: "approval_level", name: "Уровень согласования", description: "Требуемый уровень согласования для действий.", min: 0, max: 100, step: 1, defaultValue: 20, canonValue: 20, category: 'mandates' },
        { key: "competence_op", name: "Операционная комп.", description: "Операционная/логистическая компетентность.", min: 0, max: 100, step: 1, defaultValue: 75, canonValue: 75, category: 'abilities' },
        { key: "reputation", name: "Репутация", description: "Общественная и внутренняя легитимность.", min: 0, max: 100, step: 1, defaultValue: 60, canonValue: 60, category: 'abilities' },
        { key: "intel_access", name: "Доступ к данным", description: "Доступ к разведданным/информации.", min: 0, max: 100, step: 1, defaultValue: 30, canonValue: 30, category: 'abilities' },
        { key: "resources", name: "Ресурсы", description: "Доступ к материальным, информационным и кадровым активам.", min: 0, max: 100, step: 1, defaultValue: 20, canonValue: 20, category: 'abilities' },
        { key: "accountability", name: "Подотчетность", description: "Ответственность за провалы.", min: 0, max: 100, step: 1, defaultValue: 20, canonValue: 20, category: 'limitations' },
        { key: "ideology_rigidity", name: "Жесткость идеологии", description: "Жесткость убеждений.", min: 0, max: 100, step: 1, defaultValue: 10, canonValue: 10, category: 'limitations' },
        { key: "sanction_risk", name: "Риск санкций", description: "Риск санкций по мандату.", min: 0, max: 100, step: 1, defaultValue: 20, canonValue: 20, category: 'limitations' },
        { key: "privacy_cost_epsilon", name: "Стоимость приватности (ε)", description: "Риск, связанный с инвазивностью сбора данных.", min: 0, max: 100, step: 1, defaultValue: 20, canonValue: 20, category: 'limitations' },
        { key: "public_scrutiny", name: "Общественный надзор", description: "Под давлением общества/СМИ.", min: 0, max: 1, step: 1, defaultValue: 0, canonValue: 0, category: 'switches' }
    ]
};

export default data;