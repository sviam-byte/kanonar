import { Faction } from '../types';

export const FACTIONS: Faction[] = [
    {
        id: 'royal_guard',
        name: 'Королевская Гвардия',
        hostility: {
            'royal': -0.8, // a-la "sub-faction", very friendly
            'independent': 0.3,
        }
    },
    {
        id: 'royal',
        name: 'Роялисты',
        hostility: {
            'royal_guard': -0.8,
            'independent': 0.2,
        }
    },
    {
        id: 'independent',
        name: 'Независимые',
        hostility: {
            'royal_guard': 0.3,
            'royal': 0.2,
        }
    }
];