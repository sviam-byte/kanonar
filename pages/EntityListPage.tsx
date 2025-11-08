import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { getEntitiesByType } from '../data';
import { EntityType } from '../types';
import { useBranch } from '../contexts/BranchContext';

const typeToTitle: Record<string, string> = {
    [EntityType.Character]: 'Персонажи',
    [EntityType.Object]: 'Объекты',
    [EntityType.Concept]: 'Концепты',
    [EntityType.Place]: 'Места',
    [EntityType.Protocol]: 'Протоколы',
    [EntityType.Event]: 'События',
    [EntityType.Document]: 'Документы',
    [EntityType.Essence]: 'Сущности',
}

export const EntityListPage: React.FC = () => {
  const { entityType } = useParams<{ entityType: string }>();
  const { branch } = useBranch();

  if (!entityType || !Object.values(EntityType).includes(entityType as EntityType)) {
    return <div className="p-8 text-canon-red">Ошибка: Неверный тип сущности.</div>;
  }
  
  const entities = getEntitiesByType(entityType as EntityType)
    .filter(entity => entity.versionTags.includes(branch));
    
  const title = typeToTitle[entityType] || (entityType.charAt(0).toUpperCase() + entityType.slice(1) + 's');

  return (
    <div className="p-8">
      <h2 className="text-3xl font-bold mb-6 border-b border-canon-border pb-2">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {entities.map(entity => (
          <Link 
            key={entity.entityId} 
            to={`/${entity.type}/${entity.entityId}`}
            className="block p-5 bg-canon-bg-light border border-canon-border rounded-lg hover:border-canon-accent transition-colors"
          >
            <h3 className="text-xl font-bold text-canon-accent">{entity.title}</h3>
            <p className="text-sm text-canon-text-light">{entity.subtitle}</p>
            <div className="mt-4 flex flex-wrap gap-2">
                {entity.tags.map(tag => (
                    <span key={tag} className="text-xs bg-canon-border px-2 py-1 rounded">{tag}</span>
                ))}
            </div>
          </Link>
        ))}
        {entities.length === 0 && <p>Сущности данного типа не найдены для выбранной ветки '{branch}'.</p>}
      </div>
    </div>
  );
};
