
import { EntityType, CharacterEntity, StoryCard, SimulationMeta } from '../types';
import { getEntitiesByType } from './index';
import { allStories } from './stories/index';
import { allSimulations } from './simulations/index';

export type AccessModuleId = 'default' | 'tegan-krystar' | 'genshin';

export interface AccessModule {
  id: AccessModuleId;
  label: string;
  description: string;
  codes: string[];
  // Methods to return whitelisted entities
  getCharacters(): CharacterEntity[];
  getStories(): StoryCard[];
  getSimulations(): SimulationMeta[];
  // Checkers for easy filtering
  isCharacterAllowed(id: string): boolean;
  isStoryAllowed(id: string): boolean;
  isSimulationAllowed(key: string): boolean;
}

const DEFAULT_MODULE: AccessModule = {
  id: 'default',
  label: 'Основной Канонар',
  description: 'Базовый слой Kanonar 4.0: полный набор сущностей, историй и симуляций.',
  codes: ['CORE', 'DEFAULT', 'KANONAR'],
  getCharacters: () => getEntitiesByType(EntityType.Character) as CharacterEntity[],
  getStories: () => Object.values(allStories),
  getSimulations: () => allSimulations,
  isCharacterAllowed: () => true,
  isStoryAllowed: () => true,
  isSimulationAllowed: () => true,
};

// --- TEGAN & KRYSTAR CONFIG ---

const TK_CHAR_IDS = new Set<string>([
  'character-tegan-nots',
  'character-krystar-mann',
  'character-larson',
  'character-bernard',
  'character-olaf',
  'character-brand',
]);

const TK_STORY_IDS = new Set<string>([
  'social-conflict', 
  'high-hierarchy',
  'tk_training_hall',
  'tk_disciplinary_hall'
]);

const TK_SIM_KEYS = new Set<string>([
  'negotiation-head-to-head',
  'network-dynamics',
]);

const TEGAN_KRYSTAR_MODULE: AccessModule = {
  id: 'tegan-krystar',
  label: 'Модуль: Теган и Кристар',
  description:
    'Закрытый слой симуляции (Крепость). Фокус на иерархии, долге и личной динамике Тегана и Кристара. Доступны только релевантные персонажи и сценарии.',
  codes: ['TEGAN-KRYSTAR', 'TK-01', 'TK', 'TK_FORTRESS'],
  
  getCharacters() {
    const all = getEntitiesByType(EntityType.Character) as CharacterEntity[];
    return all.filter((ch) => TK_CHAR_IDS.has(ch.entityId));
  },
  getStories() {
    return Object.values(allStories).filter(s => TK_STORY_IDS.has(s.id));
  },
  getSimulations() {
    return allSimulations.filter(s => TK_SIM_KEYS.has(s.key));
  },
  
  isCharacterAllowed(id: string) { return TK_CHAR_IDS.has(id); },
  isStoryAllowed(id: string) { return TK_STORY_IDS.has(id); },
  isSimulationAllowed(key: string) { return TK_SIM_KEYS.has(key); }
};

// --- GENSHIN MODULE ---

const GENSHIN_CHAR_IDS = new Set<string>([
  'character-genshin-dainsleif',
  'character-genshin-kaeya',
  'character-genshin-rhinedottir',
  'character-genshin-vedrfolnir',
  'character-genshin-hroptatyr',
]);

const GENSHIN_MODULE: AccessModule = {
  id: 'genshin',
  label: 'Модуль: GENSHIN (Каэнри\'а)',
  description: 'Закрытый набор персонажей по мотивам Genshin: Каэнри\'а, Король Кэйа, Дайнслейф и ключевые фигуры исследований.',
  codes: ['GENSHIN', 'KHAENRIAH', 'BLACK-SUN'],

  getCharacters() {
    const all = getEntitiesByType(EntityType.Character) as CharacterEntity[];
    return all.filter((ch) => GENSHIN_CHAR_IDS.has(ch.entityId));
  },
  getStories() {
    return [];
  },
  getSimulations() {
    return [];
  },

  isCharacterAllowed(id: string) { return GENSHIN_CHAR_IDS.has(id); },
  isStoryAllowed(_id: string) { return false; },
  isSimulationAllowed(_key: string) { return false; },
};

export const ACCESS_MODULES: AccessModule[] = [
  DEFAULT_MODULE,
  TEGAN_KRYSTAR_MODULE,
  GENSHIN_MODULE,
];

export function resolveAccessModuleByCode(rawCode: string): AccessModule | null {
  const code = rawCode.trim().toUpperCase();
  if (!code) return null;
  for (const mod of ACCESS_MODULES) {
    if (mod.codes.some((c) => c.toUpperCase() === code)) {
      return mod;
    }
  }
  return null;
}
