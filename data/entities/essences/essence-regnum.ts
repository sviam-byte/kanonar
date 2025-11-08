
import { EssenceEntity, EntityType, Branch, Parameter } from '../../../types';

const data: EssenceEntity = {
  entityId: "essence-regnum",
  type: EntityType.Essence,
  title: "Регнум",
  subtitle: "Совещательный орган Кайрнакса",
  authors: [{ name: "Kanonar", role: "Compiler" }],
  year: "Неизвестен",
  versionTags: [Branch.Current],
  status: "published",
  tags: [],
  description: "Совещательный орган Кайрнакса.",
  relations: [
    { type: 'curated_by', entityId: 'essence-rector', entityTitle: 'Клотар' }
  ],
  media: [
    {
      type: 'image',
      url: 'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20100%20100%22%20fill%3D%22currentColor%22%3E%3Ccircle%20cx%3D%2250%22%20cy%3D%2250%22%20r%3D%2212%22%20%2F%3E%3Ccircle%20cx%3D%2250%22%20cy%3D%2250%22%20r%3D%2228%22%20fill%3D%22none%22%20stroke%3D%22currentColor%22%20stroke-width%3D%225%22%20%2F%3E%3Ccircle%20cx%3D%2250%22%20cy%3D%2250%22%20r%3D%2245%22%20fill%3D%22none%22%20stroke%3D%22currentColor%22%20stroke-width%3D%225%22%20%2F%3E%3Cg%20transform%3D%22translate(50%2C50)%22%3E%3Crect%20x%3D%22-2.5%22%20y%3D%22-40%22%20width%3D%225%22%20height%3D%2212%22%20%2F%3E%3Crect%20x%3D%22-2.5%22%20y%3D%2228%22%20width%3D%225%22%20height%3D%2212%22%20%2F%3E%3Crect%20x%3D%22-40%22%20y%3D%22-2.5%22%20width%3D%2212%22%20height%3D%225%22%20%2F%3E%3Crect%20x%3D%2228%22%20y%3D%22-2.5%22%20width%3D%2212%22%20height%3D%225%22%20%2F%3E%3Cg%20transform%3D%22rotate(45)%22%3E%3Crect%20x%3D%22-2.5%22%20y%3D%22-40%22%20width%3D%225%22%20height%3D%2212%22%20%2F%3E%3Crect%20x%3D%22-2.5%22%20y%3D%2228%22%20width%3D%225%22%20height%3D%2212%22%20%2F%3E%3Crect%20x%3D%22-40%22%20y%3D%22-2.5%22%20width%3D%2212%22%20height%3D%225%22%20%2F%3E%3Crect%20x%3D%2228%22%20y%3D%22-2.5%22%20width%3D%2212%22%20height%3D%225%22%20%2F%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E',
      caption: 'Эмблема Регнума',
    }
  ],
  changelog: [
    { version: "1.0", date: "431 OВ", author: "System", summary: "Initial record creation." }
  ],
  parameters: []
};

export default data;
