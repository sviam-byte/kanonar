
import { EventTemplate } from '../types';

export const allEventTemplates: EventTemplate[] = [
    // --- GOAL EXECUTION OUTCOMES ---
    {
        id: 'GOAL.SUCCESS.GENERIC', name: 'Успех цели (общий)', kind: 'GOAL.SUCCESS', domain: 'achievement',
        tags: ['achievement'],
        default_intensity: 0.6, default_years_ago: 0, default_valence: 1,
        goal_impulses: [],
        lifeGoalWeights: { seek_status: 0.4, accumulate_resources: 0.2, maintain_order: 0.1 }
    }, 
    {
        id: 'GOAL.FAIL.GENERIC', name: 'Провал цели (общий)', kind: 'GOAL.FAIL', domain: 'failure',
        tags: ['failure'],
        default_intensity: 0.7, default_years_ago: 0, default_valence: -1,
        goal_impulses: [],
        deltas: { 'body.acute.stress': 10, 'state.dark_exposure': 5 },
        lifeGoalWeights: { seek_comfort: 0.3, protect_self: 0.2, maintain_order: 0.1 }
    },
    
    // --- PERSONAL EVENT TEMPLATES ---
    {
        id: 'INJURY_MAJOR', name: 'Тяжелая травма', kind: 'injury', domain: 'injury', tags: ['injury', 'trauma'],
        default_intensity: 0.8, default_years_ago: 5, default_valence: -1, default_duration_days: 14, default_surprise: 0.8, default_controllability: 0.1, default_responsibility_self: 0.1,
        goal_impulses: [
            { goalId: 'avoid_pain', weight: 0.8 }, { goalId: 'protect_self', weight: 0.7 }
        ],
        lifeGoalWeights: { seek_comfort: 0.8, protect_lives: 0.4, maintain_order: 0.3 }
    },
    {
        id: 'ILLNESS_CHRONIC', name: 'Хроническая болезнь', kind: 'illness', domain: 'illness', tags: ['illness'],
        default_intensity: 0.6, default_years_ago: 3, default_valence: -1, default_duration_days: 365, default_surprise: 0.2, default_controllability: 0.3, default_responsibility_self: 0.0,
        goal_impulses: [],
        lifeGoalWeights: { seek_comfort: 0.9, maintain_bonds: 0.5 }
    },
    {
        id: 'NEAR_DEATH', name: 'Околосмертный опыт', kind: 'near_death', domain: 'near_death', tags: ['trauma', 'crisis'],
        default_intensity: 1.0, default_years_ago: 10, default_valence: -1, default_duration_days: 1, default_surprise: 0.9, default_controllability: 0.0, default_responsibility_self: 0.0,
        goal_impulses: [],
        lifeGoalWeights: { self_transcendence: 0.8, protect_lives: 0.7, seek_status: -0.4 }
    },
    {
        id: 'ACHIEVEMENT_AWARD', name: 'Достижение/Награда', kind: 'achievement', domain: 'achievement', tags: ['achievement', 'status'],
        default_intensity: 0.7, default_years_ago: 2, default_valence: 1, default_duration_days: 0, default_surprise: 0.4, default_controllability: 0.8, default_responsibility_self: 0.7,
        goal_impulses: [],
        lifeGoalWeights: { seek_status: 0.9, serve_authority: 0.5, accumulate_resources: 0.4 }
    },
    {
        id: 'FAILURE_PUBLIC', name: 'Публичный провал', kind: 'failure', domain: 'failure', tags: ['failure', 'humiliation'],
        default_intensity: 0.8, default_years_ago: 1, default_valence: -1, default_duration_days: 0, default_surprise: 0.6, default_controllability: 0.2, default_responsibility_self: 0.6,
        goal_impulses: [],
        lifeGoalWeights: { seek_status: 0.6, accumulate_resources: 0.3, preserve_autonomy: -0.2 } // Compensatory striving
    },
    {
        id: 'OATH_TAKE', name: 'Принятие клятвы', kind: 'oath_take', domain: 'oath_take', tags: ['oath', 'service'],
        default_intensity: 0.9, default_years_ago: 4, default_valence: 0.5, default_duration_days: 0, default_surprise: 0.1, default_controllability: 0.9, default_responsibility_self: 1.0,
        goal_impulses: [],
        lifeGoalWeights: { serve_authority: 1.0, maintain_order: 0.8, pursue_truth: 0.4 }
    },
    {
        id: 'DARK_EXPOSURE_HIGH', name: 'Сильное темное воздействие', kind: 'dark_exposure', domain: 'dark_exposure', tags: ['dark', 'trauma'],
        default_intensity: 0.8, default_years_ago: 1, default_valence: -1, default_duration_days: 7, default_surprise: 0.7, default_controllability: 0.1, default_responsibility_self: 0.2,
        goal_impulses: [],
        lifeGoalWeights: { pursue_truth: 0.6, maintain_order: 0.5, seek_comfort: -0.3 }
    },
    {
        id: 'BETRAYAL_FRIEND', name: 'Предательство друга', kind: 'betrayal_experienced', domain: 'betrayal', tags: ['betrayal', 'loss'],
        default_intensity: 0.9, default_years_ago: 2, default_valence: -1, default_duration_days: 30, default_surprise: 0.9, default_controllability: 0.1, default_responsibility_self: 0.2,
        goal_impulses: [],
        lifeGoalWeights: { maintain_bonds: -0.7, preserve_autonomy: 0.8, accumulate_resources: 0.5 }
    },
    {
        id: 'SAVED_LIFE', name: 'Спас жизнь', kind: 'saved_by_other', domain: 'rescue', tags: ['care', 'heroism'],
        default_intensity: 0.9, default_years_ago: 5, default_valence: 1, default_duration_days: 1, default_surprise: 0.8, default_controllability: 0, default_responsibility_self: 0,
        goal_impulses: [],
        lifeGoalWeights: { maintain_bonds: 0.9, protect_lives: 0.8, self_transcendence: 0.5 }
    }
];
