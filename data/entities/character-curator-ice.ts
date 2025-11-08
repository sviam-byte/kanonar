import { CharacterEntity, EntityType, Branch, Parameter } from '../../types';

const data: CharacterEntity = {
    entityId: "curator-ice",
    type: EntityType.Character,
    title: "Лед",
    subtitle: "Верховный Совет",
    authors: [{ name: "council", role: "Source" }],
    year: "409",
    versionTags: [Branch.Current],
    status: "published",
    tags: ["совет", "вердикт", "куратор", "администрация"],
    description: "Высокий чиновник. Вердикты как печать. Стабильность превыше дискуссий.",
    relations: [
        { type: "receives_reports_from", entityId: "molot-scout", entityTitle: "Скьольд" },
        { type: "oversees", entityId: "sector-admin-bot", entityTitle: "Скульд" }
    ],
    media: [],
    evidenceIds: ["ev::decree-ice-12"],
    changelog: [{ version: "1.0", date: "409 OВ", author: "System", summary: "Initial record creation." }],
    parameters: [
        { key: "will", name: "Воля", description: "Решимость и ментальная стойкость персонажа.", min: 0, max: 100, step: 1, defaultValue: 70, canonValue: 70, category: 'core' },
        { key: "loyalty", name: "Лояльность", description: "Приверженность своей фракции и её принципам.", min: 0, max: 100, step: 1, defaultValue: 85, canonValue: 85, category: 'core' },
        { key: "stress", name: "Стресс", description: "Накопленное психологическое и операционное давление.", min: 0, max: 100, step: 1, defaultValue: 40, canonValue: 40, category: 'core' },
        { key: "dark_exposure", name: "Темное воздействие", description: "Воздействие травмирующей или онтологически опасной информации.", min: 0, max: 100, step: 1, defaultValue: 20, canonValue: 20, category: 'core' },
        { key: "causal_penalty", name: "Каузальный штраф", description: "Личное участие в действиях, рискующих каузальной целостностью.", min: 0, max: 100, step: 1, defaultValue: 5, canonValue: 5, category: 'core' },
        { key: "topo", name: "Топо", description: "Личная топологическая стабильность.", min: 0, max: 100, step: 1, defaultValue: 75, canonValue: 75, category: 'core' },
        { key: "mandate_ops", name: "Операционный мандат", description: "Операционные полномочия.", min: 0, max: 100, step: 1, defaultValue: 40, canonValue: 40, category: 'mandates' },
        { key: "mandate_reg", name: "Регуляторный мандат", description: "Регуляторные полномочия.", min: 0, max: 100, step: 1, defaultValue: 90, canonValue: 90, category: 'mandates' },
        { key: "approval_level", name: "Уровень согласования", description: "Требуемый уровень согласования для действий.", min: 0, max: 100, step: 1, defaultValue: 85, canonValue: 85, category: 'mandates' },
        { key: "competence_op", name: "Операционная комп.", description: "Операционная/логистическая компетентность.", min: 0, max: 100, step: 1, defaultValue: 75, canonValue: 75, category: 'abilities' },
        { key: "reputation", name: "Репутация", description: "Общественная и внутренняя легитимность.", min: 0, max: 100, step: 1, defaultValue: 70, canonValue: 70, category: 'abilities' },
        { key: "intel_access", name: "Доступ к данным", description: "Доступ к разведданным/информации.", min: 0, max: 100, step: 1, defaultValue: 70, canonValue: 70, category: 'abilities' },
        { key: "resources", name: "Ресурсы", description: "Доступ к материальным, информационным и кадровым активам.", min: 0, max: 100, step: 1, defaultValue: 30, canonValue: 30, category: 'abilities' },
        { key: "accountability", name: "Подотчетность", description: "Ответственность за провалы.", min: 0, max: 100, step: 1, defaultValue: 70, canonValue: 70, category: 'limitations' },
        { key: "ideology_rigidity", name: "Жесткость идеологии", description: "Жесткость убеждений.", min: 0, max: 100, step: 1, defaultValue: 60, canonValue: 60, category: 'limitations' },
        { key: "sanction_risk", name: "Риск санкций", description: "Риск санкций по мандату.", min: 0, max: 100, step: 1, defaultValue: 40, canonValue: 40, category: 'limitations' },
        { key: "privacy_cost_epsilon", name: "Стоимость приватности (ε)", description: "Риск, связанный с инвазивностью сбора данных.", min: 0, max: 100, step: 1, defaultValue: 40, canonValue: 40, category: 'limitations' },
        { key: "public_scrutiny", name: "Общественный надзор", description: "Под давлением общества/СМИ.", min: 0, max: 1, step: 1, defaultValue: 1, canonValue: 1, category: 'switches' }
    ]
};

export default data;