// data/relations.ts
// This file defines static, long-term relationships between characters.
// The key is two character entity IDs sorted alphabetically and joined by "__".

import { UserRelation } from '../types';

interface StaticRelation {
    kind: 'kin' | 'faction' | 'rival' | 'ally';
    weight?: number; // Optional weight, e.g. for strength of kinship
}

// NOTE: This is populated based on the `roles.relations` field in character data.
// 'ward_of' and 'caretaker_of' are treated as a 'kin' relationship.
export const relations: Record<string, StaticRelation> = {
    "character-krystar-mann__character-tegan-nots": { kind: 'kin', weight: 0.9 }
};

export const RELATION_PRESETS: Record<string, { label: string, value: UserRelation }> = {
    'ally': { label: 'Союзник', value: { trust: 0.7, bond: 0.4, authority: 0.5 } },
    'friend': { label: 'Друг', value: { trust: 0.8, bond: 0.7, authority: 0.4 } },
    'rival': { label: 'Соперник', value: { trust: 0.3, bond: 0.2, authority: 0.6 } },
    'neutral': { label: 'Нейтральный', value: { trust: 0.5, bond: 0.3, authority: 0.5 } },
    'subordinate': { label: 'Подчиненный', value: { trust: 0.6, bond: 0.3, authority: 0.2 } },
    'superior': { label: 'Начальник', value: { trust: 0.6, bond: 0.3, authority: 0.8 } },
};
