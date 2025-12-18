
import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { getEntitiesByType, getAllSocialEvents } from '../data';
import { AnyEntity, EntityType } from '../types';
import { useBranch } from '../contexts/BranchContext';
import { useAccess } from '../contexts/AccessContext';
import { EntitySecurityGate, RedactedBlock } from '../components/EntitySecurityGate';

const typeToTitle: Record<string, string> = {
    [EntityType.Character]: 'Персонажи',
    [EntityType.Object]: 'Объекты',
    [EntityType.Concept]: 'Концепты',
    [EntityType.Location]: 'Места',
    [EntityType.Protocol]: 'Протоколы',
    [EntityType.Event]: 'События',
    [EntityType.Document]: 'Документы',
    [EntityType.Essence]: 'Сущности',
    [EntityType.SocialEvent]: 'Социальные События',
}

export const EntityListPage: React.FC = () => {
  const { entityType } = useParams<{ entityType: string }>();
  const { branch } = useBranch();
  const { activeModule, isRestricted } = useAccess();

  if (!entityType || !Object.values(EntityType).includes(entityType as EntityType)) {
    return <div className="p-8 text-canon-red">Ошибка: Неверный тип сущности.</div>;
  }
  
  let entities = (entityType === EntityType.SocialEvent) 
    ? getAllSocialEvents()
    : getEntitiesByType(entityType as EntityType)
        .filter((entity): entity is AnyEntity & { versionTags: string[] } => 'versionTags' in entity && Array.isArray(entity.versionTags))
        .filter(entity => entity.versionTags.includes(branch));

  // --- UNIFIED VISIBILITY FILTERING ---
  entities = entities.filter(e => {
      // 1. KEY CHECK (Hard Visibility)
      // Entities with a 'requiredKey' are completely HIDDEN unless the key is active.
      // This takes precedence over everything.
      if (e.security?.requiredKey) {
          if (!activeModule) return false; // No key active -> Hidden
          
          const key = e.security.requiredKey;
          const hasKey = activeModule.id === key || activeModule.codes.includes(key);
          
          if (!hasKey) return false; // Wrong key -> Hidden
          
          // If key matches, it is allowed (unless filtered by legacy rules below, which we generally skip for keyed items)
          return true; 
      }

      // 2. MODULE_ONLY TAG CHECK
      // Entities marked as 'module_only' must be hidden in public view (when no module is active).
      if (e.tags?.includes('module_only') && !activeModule) {
          return false;
      }

      // 3. LEGACY MODULE WHITELIST (Soft Visibility)
      // If we are in a restricted module (like 'tegan-krystar'), apply its specific whitelists.
      if (isRestricted && activeModule) {
           if (entityType === EntityType.Character) {
               return activeModule.isCharacterAllowed(e.entityId);
           }
           // Future: Add isStoryAllowed, etc. here if needed.
      }
      
      // Default: Visible (Public items or Chronicle items which handle redaction internally)
      return true;
  });
    
  const title = typeToTitle[entityType] || (entityType.charAt(0).toUpperCase() + entityType.slice(1) + 's');

  return (
    <div className="p-8">
      <div className="flex items-center gap-4 mb-6 border-b border-canon-border pb-2">
          <h2 className="text-3xl font-bold">{title}</h2>
          {isRestricted && activeModule && (
               <span className="px-2 py-1 text-xs bg-yellow-500/20 text-yellow-500 rounded border border-yellow-500/40">
                   Фильтр: {activeModule.label}
               </span>
          )}
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {entities.map(entity => (
           <EntitySecurityGate 
                key={entity.entityId} 
                security={entity.security}
                fallback={
                    <div className="block p-5 bg-canon-bg-light/20 border border-canon-border/50 rounded-lg h-40 relative">
                        <RedactedBlock level={entity.security?.requiredLevel || 0} label={entity.entityId} />
                    </div>
                }
           >
              <Link 
                to={`/${entity.type}/${entity.entityId}`}
                className="block p-5 bg-canon-bg-light border border-canon-border rounded-lg hover:border-canon-accent transition-colors"
              >
                <div className="flex justify-between items-start">
                    <h3 className="text-xl font-bold text-canon-accent">{entity.title}</h3>
                    {entity.security?.requiredLevel !== undefined && (
                        <span className="text-[10px] font-mono text-red-400 border border-red-500/30 px-1 rounded">LVL {entity.security.requiredLevel}</span>
                    )}
                </div>
                {'subtitle' in entity && entity.subtitle && <p className="text-sm text-canon-text-light">{entity.subtitle}</p>}
                <div className="mt-4 flex flex-wrap gap-2">
                    {entity.tags && entity.tags.map(tag => (
                        <span key={tag} className="text-xs bg-canon-border px-2 py-1 rounded">{tag}</span>
                    ))}
                </div>
              </Link>
           </EntitySecurityGate>
        ))}
        {entities.length === 0 && <p className="text-canon-text-light italic">Сущности данного типа не найдены или скрыты.</p>}
      </div>
    </div>
  );
};
