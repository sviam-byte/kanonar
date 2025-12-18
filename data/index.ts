
import { AnyEntity, CharacterEntity } from '../types';
import { EntityType } from '../enums';
import { createFittedCharacterFromArchetype } from '../lib/archetypes/fitter';

// Objects & Concepts
import glassKnifeData from './entities/object-glass-knife';
import comfortUnitData from './entities/object-comfort-unit';
import museumData from './entities/concept-museum';

// Characters
import deicideMentorData from './entities/character-deicide-mentor';
import assiTheRunnerData from './entities/character-assi-the-runner';
import masterGideonData from './entities/character-master-gideon';
import krystarMannData from './entities/character-krystar-mann';
import teganNotsData from './entities/character-tegan-nots';
import maeraAlbData from './entities/character-maera-alb';
import rionData from './entities/character-rion';
import norrData from './entities/character-norr';
import tavelData from './entities/character-tavel';
import bruniData from './entities/character-bruni';
import einarData from './entities/character-einar';
import rheaData from './entities/character-rhea';
import corData from './entities/character-cor';
import larsonData from './entities/character-larson';
import bernardData from './entities/character-bernard';
import olafData from './entities/character-olaf';
import brandData from './entities/character-brand';
import lyraData from './entities/character-lyra';
import elaraData from './entities/character-elara';

import { allSocialEvents } from './social-events';
import { allLocations } from './locations';

export const allEntities: AnyEntity[] = [
  // Objects & Concepts
  glassKnifeData,
  comfortUnitData,
  museumData,
  
  // Characters
  deicideMentorData,
  assiTheRunnerData,
  masterGideonData,
  krystarMannData,
  teganNotsData,
  maeraAlbData,
  rionData,
  norrData,
  tavelData,
  bruniData,
  einarData,
  rheaData,
  corData,
  larsonData,
  bernardData,
  olafData,
  brandData,
  lyraData,
  elaraData,

  // Locations
  ...allLocations,

  // Social Events
  // ...allSocialEvents, // Social events are handled separately for now
];

export const entityMap: Map<string, AnyEntity> = new Map(
  allEntities.map(e => [e.entityId, e])
);

const entityTypeMap: Map<EntityType, AnyEntity[]> = new Map();
allEntities.forEach(e => {
  if (!entityTypeMap.has(e.type)) {
    entityTypeMap.set(e.type, []);
  }
  entityTypeMap.get(e.type)!.push(e);
});

// Add social events to their own map/list
const socialEventsWithAny = (window as any).__socialEvents || allSocialEvents;
entityTypeMap.set(EntityType.SocialEvent, socialEventsWithAny as AnyEntity[]);


export const getEntities = (): AnyEntity[] => allEntities;

export const getEntityById = (id: string): AnyEntity | undefined => {
    if (entityMap.has(id)) {
        return entityMap.get(id);
    }
    
    // Check runtime characters
    if (typeof window !== 'undefined' && (window as any).__runtimeCharacters) {
        const runtimeChar = (window as any).__runtimeCharacters.find((c: CharacterEntity) => c.entityId === id);
        if (runtimeChar) return runtimeChar;
    }

    // Restore dynamic archetype loading
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
    // A temporary mechanism to allow the SocialEventsListPage to add events at runtime
    // for demonstration purposes without a full state management solution.
    if ((window as any).__socialEvents) {
        return (window as any).__socialEvents;
    }
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

  // Deduplicate by ID, preferring runtime (newer)
  const map = new Map<string, CharacterEntity>();
  for (const ch of [...staticChars, ...essences]) {
    map.set(ch.entityId, ch);
  }
  for (const ch of runtime) {
    map.set(ch.entityId, ch);
  }

  return Array.from(map.values());
};

export const addRuntimeCharacter = (ch: CharacterEntity) => {
  if (typeof window === 'undefined') return;
  const w = window as any;
  const current: CharacterEntity[] = w.__runtimeCharacters || [];
  // Remove existing if same ID to update
  const filtered = current.filter((x: CharacterEntity) => x.entityId !== ch.entityId);
  w.__runtimeCharacters = [...filtered, ch];
};
