
import { EssenceEntity, EntityType, Branch, Parameter } from '../../../types';

const data: EssenceEntity = {
  entityId: "essence-emissary",
  type: EntityType.Essence,
  title: "Ирис",
  subtitle: "Эмиссар",
  authors: [{ name: "Kanonar", role: "Compiler" }],
  year: "412-431 OВ",
  versionTags: [Branch.Current],
  status: "published",
  tags: [],
  description: "Текущий носитель сигиллы Эмиссара.",
  relations: [
    { type: 'student_of', entityId: 'essence-rector', entityTitle: 'Клотар' },
    { type: 'advises', entityId: 'essence-mech', entityTitle: 'Вестар' },
    { type: 'is_opponent_of', entityId: 'essence-molot', entityTitle: 'Рагнар' },
    { type: 'is_colleague_of', entityId: 'essence-rhiannon', entityTitle: 'Рианнон' },
  ],
  media: [
    {
      type: 'image',
      url: 'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20100%20100%22%20fill%3D%22currentColor%22%3E%3Cdefs%3E%3Cmask%20id%3D%22m%22%3E%3Crect%20width%3D%22100%22%20height%3D%22100%22%20fill%3D%22white%22%2F%3E%3Cg%20transform%3D%22translate(83%2050)%20rotate(-28)%22%3E%3Crect%20x%3D%220%22%20y%3D%22-1.5%22%20width%3D%2210%22%20height%3D%223%22%20fill%3D%22black%22%20%2F%3E%3Crect%20x%3D%220%22%20y%3D%22-7.5%22%20width%3D%2210%22%20height%3D%223%22%20fill%3D%22black%22%20%2F%3E%3C%2Fg%3E%3C%2Fmask%3E%3C%2Fdefs%3E%3Ccircle%20cx%3D%2250%22%20cy%3D%2250%22%20r%3D%2245%22%20stroke%3D%22currentColor%22%20stroke-width%3D%225%22%20fill%3D%22none%22%2F%3E%3Cpath%20d%3D%22M95%2C50%20l-20%2C-9%20v18%20Z%22%20mask%3D%22url(%23m)%22%2F%3E%3C%2Fsvg%3E',
      caption: 'Эмблема Эмиссара',
    }
  ],
  changelog: [
    { version: "1.0", date: "431 OВ", author: "System", summary: "Initial record creation." }
  ],
  parameters: [
    { key: "will", name: "Воля", description: "Решимость и ментальная стойкость.", min: 0, max: 100, step: 1, defaultValue: 90, canonValue: 90, category: 'core' },
    { key: "loyalty", name: "Лояльность", description: "Приверженность фракции или идее.", min: 0, max: 100, step: 1, defaultValue: 50, canonValue: 50, category: 'core' },
    { key: "stress", name: "Стресс", description: "Психологическое и операционное давление.", min: 0, max: 100, step: 1, defaultValue: 80, canonValue: 80, category: 'core' },
    { key: "dark_exposure", name: "Темное воздействие", description: "Воздействие онтологически опасной информации.", min: 0, max: 100, step: 1, defaultValue: 80, canonValue: 80, category: 'core' },
    { key: "causal_penalty", name: "Каузальный штраф", description: "Риск нарушения причинно-следственных связей.", min: 0, max: 100, step: 1, defaultValue: 40, canonValue: 40, category: 'core' },
    { key: "topo", name: "Топо", description: "Онтологическая целостность личности.", min: 0, max: 100, step: 1, defaultValue: 90, canonValue: 90, category: 'core' },
    { key: "mandate_ops", name: "Операционный мандат", description: "Операционные полномочия.", min: 0, max: 100, step: 1, defaultValue: 60, canonValue: 60, category: 'mandates' },
    { key: "mandate_reg", name: "Регуляторный мандат", description: "Регуляторные полномочия.", min: 0, max: 100, step: 1, defaultValue: 10, canonValue: 10, category: 'mandates' },
    { key: "approval_level", name: "Уровень согласования", description: "Требуемый уровень согласования для действий.", min: 0, max: 100, step: 1, defaultValue: 50, canonValue: 50, category: 'mandates' },
    { key: "competence_op", name: "Операционная комп.", description: "Компетентность в своей сфере.", min: 0, max: 100, step: 1, defaultValue: 70, canonValue: 70, category: 'abilities' },
    { key: "reputation", name: "Репутация", description: "Легитимность и авторитет.", min: 0, max: 100, step: 1, defaultValue: 60, canonValue: 60, category: 'abilities' },
    { key: "intel_access", name: "Доступ к данным", description: "Доступ к информации.", min: 0, max: 100, step: 1, defaultValue: 60, canonValue: 60, category: 'abilities' },
    { key: "resources", name: "Ресурсы", description: "Доступ к материальным и иным активам.", min: 0, max: 100, step: 1, defaultValue: 40, canonValue: 40, category: 'abilities' },
    { key: "accountability", name: "Подотчетность", description: "Ответственность за провалы.", min: 0, max: 100, step: 1, defaultValue: 60, canonValue: 60, category: 'limitations' },
    { key: "ideology_rigidity", name: "Жесткость идеологии", description: "Негибкость убеждений.", min: 0, max: 100, step: 1, defaultValue: 80, canonValue: 80, category: 'limitations' },
    { key: "sanction_risk", name: "Риск санкций", description: "Риск санкций по мандату.", min: 0, max: 100, step: 1, defaultValue: 50, canonValue: 50, category: 'limitations' },
    { key: "privacy_cost_epsilon", name: "Стоимость приватности (ε)", description: "Инвазивность сбора данных.", min: 0, max: 100, step: 1, defaultValue: 40, canonValue: 40, category: 'limitations' },
    { key: "public_scrutiny", name: "Общественный надзор", description: "Под давлением общества/СМИ.", min: 0, max: 1, step: 1, defaultValue: 1, canonValue: 1, category: 'switches' }
  ] as Parameter[]
};

export default data;
