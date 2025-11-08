
import { EssenceEntity, EntityType, Branch, Parameter } from '../../../types';

const data: EssenceEntity = {
  entityId: "essence-first-light",
  type: EntityType.Essence,
  title: "Первый Свет",
  subtitle: "Неизвестная сущность",
  authors: [{ name: "Kanonar", role: "Compiler" }],
  year: "Неизвестен",
  versionTags: [Branch.Current],
  status: "draft",
  tags: [],
  description: "Значение эмблемы утеряно.",
  relations: [],
  media: [
    {
      type: 'image',
      url: 'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20100%20100%22%20fill%3D%22currentColor%22%3E%3Crect%20x%3D%2240%22%20y%3D%220%22%20width%3D%2220%22%20height%3D%2215%22%20rx%3D%223%22%2F%3E%3Cg%20transform%3D%22translate(0%205)%22%3E%3Ccircle%20cx%3D%2250%22%20cy%3D%2250%22%20r%3D%2240%22%20stroke%3D%22currentColor%22%20stroke-width%3D%225%22%20fill%3D%22none%22%2F%3E%3Ccircle%20cx%3D%2250%22%20cy%3D%2250%22%20r%3D%2215%22%20%2F%3E%3Cg%20transform%3D%22translate(50%2C50)%22%20stroke%3D%22currentColor%22%20stroke-width%3D%226%22%3E%3Cpath%20d%3D%22M0%20-18%20v-19%22%20%2F%3E%3Cpath%20d%3D%22M0%2018%20v19%22%20%2F%3E%3Cpath%20d%3D%22M-18%200%20h-19%22%20%2F%3E%3Cpath%20d%3D%22M18%200%20h19%22%20%2F%3E%3Cg%20transform%3D%22rotate(45)%22%3E%3Cpath%20d%3D%22M0%20-18%20v-19%22%20%2F%3E%3Cpath%20d%3D%22M0%2018%20v19%22%20%2F%3E%3Cpath%20d%3D%22M-18%200%20h-19%22%20%2F%3E%3Cpath%20d%3D%22M18%200%20h19%22%20%2F%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E',
      caption: 'Эмблема Первого Света',
    }
  ],
  changelog: [
    { version: "1.0", date: "431 OВ", author: "System", summary: "Initial record creation." }
  ],
  parameters: []
};

export default data;
