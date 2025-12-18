

import { Norm } from '../types';

export const ALL_NORMS: Norm[] = [
    {
        id: 'no_create_monsters',
        name: 'Не создавать монстров',
        description: 'Запрет на действия, ведущие к неконтролируемой онтологической угрозе.',
        issuerId: 'rectorate', // Global/System
        scope: 'global',
        severity: 'taboo',
        violationPattern: {
            tags: ['risk', 'chaos_change', 'dark_exposure'],
            actionType: 'attack', // Just an example, should be refined
        },
        basePenalty: 0.5,
    },
    {
        id: 'protocol_compliance',
        name: 'Соблюдение протокола',
        description: 'Действия должны быть согласованы с лидером или процедурой.',
        issuerId: 'faction_loyalist',
        scope: 'faction',
        severity: 'hard',
        violationPattern: {
            actionType: 'refuse_order',
            tags: ['conflict'],
        },
        basePenalty: 0.2,
    },
    {
        id: 'protect_own',
        name: 'Защищать своих',
        description: 'Не причинять вреда членам своей группы.',
        issuerId: 'group_consensus',
        scope: 'local',
        severity: 'hard',
        violationPattern: {
            tags: ['harm', 'betrayal'],
        },
        basePenalty: 0.4,
    },
    {
        id: 'no_hidden_risks',
        name: 'Не скрывать риски',
        description: 'Информация об угрозах должна быть публичной.',
        issuerId: 'rectorate',
        scope: 'global',
        severity: 'soft',
        violationPattern: {
            actionType: 'deceive',
        },
        basePenalty: 0.1,
    }
];