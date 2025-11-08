
import { CharacterEntity, EntityType, Branch, Parameter } from '../../types';

const data: CharacterEntity = {
    entityId: "archivist-mirror",
    type: EntityType.Character,
    title: "Зеркало",
    subtitle: "Теневой хранитель",
    authors: [{ name: "unknown", role: "Source" }],
    year: "409",
    versionTags: [Branch.Current],
    status: "draft",
    tags: ["архив", "зеркало", "теневой", "факты"],
    description: "Отражает упущенные факты. Цитирует архивы или говорит загадками. За истину против секретности.",
    relations: [
        { type: "counters", entityId: "arch-quietus", entityTitle: "Хедин" }
    ],
    media: [],
    evidenceIds: ["ev::mirror-quote-288F"],
    changelog: [{ version: "1.0", date: "409 OВ", author: "System", summary: "Initial record creation." }],
    parameters: [
        { key: "will", name: "Воля", description: "Решимость и ментальная стойкость персонажа.", min: 0, max: 100, step: 1, defaultValue: 60, canonValue: 60, category: 'core' },
        { key: "loyalty", name: "Лояльность", description: "Приверженность своей фракции и её принципам.", min: 0, max: 100, step: 1, defaultValue: 50, canonValue: 50, category: 'core' },
        { key: "stress", name: "Стресс", description: "Накопленное психологическое и операционное давление.", min: 0, max: 100, step: 1, defaultValue: 25, canonValue: 25, category: 'core' },
        { key: "dark_exposure", name: "Темное воздействие", description: "Воздействие травмирующей или онтологически опасной информации.", min: 0, max: 100, step: 1, defaultValue: 30, canonValue: 30, category: 'core' },
        { key: "causal_penalty", name: "Каузальный штраф", description: "Личное участие в действиях, рискующих каузальной целостностью.", min: 0, max: 100, step: 1, defaultValue: 10, canonValue: 10, category: 'core' },
        { key: "topo", name: "Топо", description: "Личная топологическая стабильность.", min: 0, max: 100, step: 1, defaultValue: 70, canonValue: 70, category: 'core' },
        { key: "mandate_ops", name: "Операционный мандат", description: "Операционные полномочия.", min: 0, max: 100, step: 1, defaultValue: 0, canonValue: 0, category: 'mandates' },
        { key: "mandate_reg", name: "Регуляторный мандат", description: "Регуляторные полномочия.", min: 0, max: 100, step: 1, defaultValue: 20, canonValue: 20, category: 'mandates' },
        { key: "approval_level", name: "Уровень согласования", description: "Требуемый уровень согласования для действий.", min: 0, max: 100, step: 1, defaultValue: 50, canonValue: 50, category: 'mandates' },
        { key: "competence_op", name: "Операционная комп.", description: "Операционная/логистическая компетентность.", min: 0, max: 100, step: 1, defaultValue: 50, canonValue: 50, category: 'abilities' },
        { key: "reputation", name: "Репутация", description: "Общественная и внутренняя легитимность.", min: 0, max: 100, step: 1, defaultValue: 50, canonValue: 50, category: 'abilities' },
        { key: "intel_access", name: "Доступ к данным", description: "Доступ к разведданным/информации.", min: 0, max: 100, step: 1, defaultValue: 80, canonValue: 80, category: 'abilities' },
        { key: "resources", name: "Ресурсы", description: "Доступ к материальным, информационным и кадровым активам.", min: 0, max: 100, step: 1, defaultValue: 10, canonValue: 10, category: 'abilities' },
        { key: "accountability", name: "Подотчетность", description: "Ответственность за провалы.", min: 0, max: 100, step: 1, defaultValue: 30, canonValue: 30, category: 'limitations' },
        { key: "ideology_rigidity", name: "Жесткость идеологии", description: "Жесткость убеждений.", min: 0, max: 100, step: 1, defaultValue: 20, canonValue: 20, category: 'limitations' },
        { key: "sanction_risk", name: "Риск санкций", description: "Риск санкций по мандату.", min: 0, max: 100, step: 1, defaultValue: 10, canonValue: 10, category: 'limitations' },
        { key: "privacy_cost_epsilon", name: "Стоимость приватности (ε)", description: "Риск, связанный с инвазивностью сбора данных.", min: 0, max: 100, step: 1, defaultValue: 50, canonValue: 50, category: 'limitations' },
        { key: "public_scrutiny", name: "Общественный надзор", description: "Под давлением общества/СМИ.", min: 0, max: 1, step: 1, defaultValue: 0, canonValue: 0, category: 'switches' }
    ] as Parameter[]
};

export default data;
