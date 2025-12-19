import { AnyEntity, CharacterEntity } from '../types';
import { EntityType } from '../enums';
import { createFittedCharacterFromArchetype } from '../lib/archetypes/fitter';
import { allSocialEvents } from './social-events';
import { allLocations } from './locations';

// Автоподхват всех сущностей из data/entities/**/*.ts (с защитой, если glob недоступен)
const entityModules = (import.meta as any)?.glob
  ? (import.meta as any).glob('./entities/**/*.ts', { eager: true })
  : {};

function pickDefaultEntity(mod: unknown): AnyEntity | null {
  const ent = (mod as any)?.default;
  if (!ent || typeof ent !== 'object') return null;
  if (!('entityId' in (ent as any)) || !('type' in (ent as any))) return null;
  return ent as AnyEntity;
}

const importedEntities: AnyEntity[] = Object.values(entityModules)
  .map(pickDefaultEntity)
  .filter(Boolean) as AnyEntity[];

// Собираем реестр: все сущности + все локации
export const allEntities: AnyEntity[] = [
  ...importedEntities,
  ...allLocations,
];

export const entityMap: Map<string, AnyEntity> = new Map(allEntities.map(e => [e.entityId, e]));

// Группировка по типам
const entityTypeMap: Map<EntityType, AnyEntity[]> = new Map();
for (const e of allEntities) {
  if (!entityTypeMap.has(e.type)) entityTypeMap.set(e.type, []);
  entityTypeMap.get(e.type)!.push(e);
}

// Социальные события (без обращения к window на уровне модуля)
const socialEventsWithAny =
  (typeof window !== 'undefined' && (window as any).__socialEvents)
    ? ((window as any).__socialEvents as AnyEntity[])
    : (allSocialEvents as AnyEntity[]);

entityTypeMap.set(EntityType.SocialEvent, socialEventsWithAny);

export const getEntities = (): AnyEntity[] => allEntities;

export const getEntityById = (id: string): AnyEntity | undefined => {
  if (entityMap.has(id)) return entityMap.get(id);

  // Runtime characters
  if (typeof window !== 'undefined' && (window as any).__runtimeCharacters) {
    const runtimeChar = (window as any).__runtimeCharacters.find((c: CharacterEntity) => c.entityId === id);
    if (runtimeChar) return runtimeChar;
  }

  // Dynamic archetypes
  if (id && id.startsWith('ARCHETYPE::')) {
    const parts = id.replace('ARCHETYPE::', '').split('-');
    if (parts.length === 3) {
      return createFittedCharacterFromArchetype(parts[0], parseInt(parts[1], 10), parts[2]);
    }
  }

  return undefined;
};

export const getEntitiesByType = (type: EntityType): AnyEntity[] => entityTypeMap.get(type) || [];

export const getAllSocialEvents = () => {
  if (typeof window !== 'undefined' && (window as any).__socialEvents) return (window as any).__socialEvents;
  return allSocialEvents;
};

// --- Runtime Character Support ---
export const getAllCharactersWithRuntime = (): CharacterEntity[] => {
  const staticChars = (entityTypeMap.get(EntityType.Character) || []) as CharacterEntity[];
  const essences = (entityTypeMap.get(EntityType.Essence) || []) as CharacterEntity[];

  let runtime: CharacterEntity[] = [];
  if (typeof window !== 'undefined' && (window as any).__runtimeCharacters) {
    runtime = (window as any).__runtimeCharacters as CharacterEntity[];
  }

  const map = new Map<string, CharacterEntity>();
  for (const ch of [...staticChars, ...essences]) map.set(ch.entityId, ch);
  for (const ch of runtime) map.set(ch.entityId, ch);

  return Array.from(map.values());
};

export const addRuntimeCharacter = (ch: CharacterEntity) => {
  if (typeof window === 'undefined') return;
  const w = window as any;
  const current: CharacterEntity[] = w.__runtimeCharacters || [];
  const filtered = current.filter((x: CharacterEntity) => x.entityId !== ch.entityId);
  w.__runtimeCharacters = [...filtered, ch];
};
