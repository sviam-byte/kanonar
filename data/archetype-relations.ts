// data/archetype-relations.ts
import { METRIC_NAMES } from '../lib/archetypes/metrics';
import { allArchetypes as individualArchetypes } from './archetypes';

export const ARCHETYPE_NODES = Object.entries(METRIC_NAMES).map(([id, name]) => ({
    id,
    name,
    type: 'core',
    description: `Фундаментальная ось поведения: ${name}.`
}));

export const SOCIAL_ROLES: { id: string; name: string; description: string; type: 'role'; weights: Record<string, number> }[] = [
    { id: 'Leader', name: 'Лидер', description: 'Определяет направление, принимает решения, ведет за собой.', type: 'role', weights: { AGENCY: 0.9, SCOPE: 0.8, ACTION: 0.6, ACCEPT: 0.4, FORMAL: 0.5 } },
    { id: 'Follower', name: 'Последователь', description: 'Исполняет приказы, поддерживает стабильность, обеспечивает сплоченность.', type: 'role', weights: { ACCEPT: 0.9, FORMAL: 0.7, AGENCY: 0.1, CARE: 0.4 } },
    { id: 'Rebel', name: 'Бунтарь', description: 'Оспаривает статус-кво, ищет новые пути, провоцирует изменения.', type: 'role', weights: { RADICAL: 0.9, AGENCY: 0.8, ACCEPT: 0.1, ACTION: 0.7 } },
    { id: 'Healer', name: 'Целитель', description: 'Заботится о благополучии группы, снижает конфликты, восстанавливает.', type: 'role', weights: { CARE: 0.9, ACCEPT: 0.6, TRUTH: 0.5, MANIP: 0.1 } },
    { id: 'Manipulator', name: 'Манипулятор', description: 'Использует скрытые методы для достижения своих целей, искажает информацию.', type: 'role', weights: { MANIP: 0.9, RADICAL: 0.4, TRUTH: 0.1, FORMAL: 0.2 } },
    { id: 'Scholar', name: 'Ученый', description: 'Ищет истину, систематизирует знания, ценит объективность.', type: 'role', weights: { TRUTH: 0.9, SCOPE: 0.6, FORMAL: 0.5, ACTION: 0.2 } }
];

export const ALL_INDIVIDUAL_ARCHETYPES = individualArchetypes.map(arch => {
    let type: 'human' | 'divine' | 'other' = 'human';
    if (arch.lambda === 'D') type = 'divine';
    if (arch.lambda === 'O') type = 'other';
    return {
        id: arch.id,
        name: arch.data.name,
        type: type,
        description: arch.data.description,
        metrics: arch.metrics,
    };
});


export const ARCHETYPE_INFLUENCES: { source: string; target: string; value: number; description: string }[] = [
    { source: 'AGENCY', target: 'ACTION', value: 0.7, description: "Субъектность побуждает к действию." },
    { source: 'AGENCY', target: 'ACCEPT', value: -0.5, description: "Высокая субъектность снижает слепое принятие." },
    { source: 'RADICAL', target: 'ACCEPT', value: -0.9, description: "Радикальность прямо противоположна принятию статус-кво." },
    { source: 'CARE', target: 'MANIP', value: -0.8, description: "Истинная забота несовместима с манипуляцией." },
    { source: 'TRUTH', target: 'MANIP', value: -0.9, description: "Стремление к истине исключает манипуляцию." },
    { source: 'FORMAL', target: 'RADICAL', value: -0.7, description: "Формализм подавляет радикальные проявления." },
    { source: 'ACTION', target: 'ACCEPT', value: -0.4, description: "Действие часто нарушает существующий порядок." },
    { source: 'SCOPE', target: 'AGENCY', value: 0.6, description: "Масштабное видение усиливает субъектность." },
    { source: 'TRUTH', target: 'AGENCY', value: 0.5, description: "Знание истины дает свободу и силу для действий." },
    { source: 'CARE', target: 'ACCEPT', value: 0.4, description: "Забота о других способствует принятию и стабильности в группе." },
];