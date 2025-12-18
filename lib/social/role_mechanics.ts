


// lib/social/role_mechanics.ts

import { WorldState, AgentState, SceneRoleId, Action, SocialActionId, SceneRoleSlot, SceneRoleState } from '../../types';
import { getTomView } from '../tom/view';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

// Define role definitions and requirements
export const ROLE_DEFINITIONS: Record<SceneRoleId, { 
    label: string, 
    requiredCapabilities: string[],
    description: string
}> = {
    leader: { 
        label: 'Лидер', 
        requiredCapabilities: ['command'], 
        description: 'Принимает решения, отдает приказы, поддерживает легитимность.'
    },
    coordinator: { 
        label: 'Координатор', 
        requiredCapabilities: ['command', 'logistics'], 
        description: 'Организует процессы, распределяет ресурсы, следит за таймингом.'
    },
    medic: { 
        label: 'Медик', 
        requiredCapabilities: ['medical_skill'], 
        description: 'Отвечает за лечение и стабилизацию раненых.'
    },
    guard: { 
        label: 'Страж', 
        requiredCapabilities: ['strength', 'stamina'], 
        description: 'Обеспечивает безопасность, сдерживает угрозы.'
    },
    scout: { 
        label: 'Разведчик', 
        requiredCapabilities: ['navigation', 'calm_under_stress'], 
        description: 'Ищет путь, собирает информацию.'
    },
    free: { 
        label: 'Свободный', 
        requiredCapabilities: [], 
        description: 'Без определенной роли.'
    },
    incident_leader: {
        label: 'Лидер Инцидента',
        requiredCapabilities: ['command', 'calm_under_stress'],
        description: 'Временный лидер для разрешения кризисной ситуации.'
    },
    stabilizer_guard: {
        label: 'Страж-стабилизатор',
        requiredCapabilities: ['strength', 'medical_skill'],
        description: 'Защищает и оказывает помощь медикам.'
    },
    tactical_coordinator: {
        label: 'Тактический координатор',
        requiredCapabilities: ['command', 'navigation'],
        description: 'Координирует тактику и перемещения группы.'
    },
    judge: {
        label: 'Судья',
        requiredCapabilities: ['command', 'calm_under_stress'],
        description: 'Выносит решения в спорных ситуациях.'
    },
    accused: {
        label: 'Обвиняемый',
        requiredCapabilities: [],
        description: 'Субъект разбирательства или суда.'
    },
    jury: {
        label: 'Присяжный',
        requiredCapabilities: ['calm_under_stress'],
        description: 'Участвует в вынесении вердикта.'
    },
    commander: {
        label: 'Командир',
        requiredCapabilities: ['command'],
        description: 'Военный лидер подразделения.'
    },
    sergeant: {
        label: 'Сержант',
        requiredCapabilities: ['command', 'stamina'],
        description: 'Младший командир, следит за дисциплиной.'
    },
    trooper: {
        label: 'Рядовой',
        requiredCapabilities: ['stamina', 'strength'],
        description: 'Основная боевая единица.'
    },
    no_role: {
        label: 'Без роли',
        requiredCapabilities: [],
        description: 'Роль не назначена.'
    },
    porter: {
        label: 'Грузчик',
        requiredCapabilities: ['strength', 'stamina'],
        description: 'Переносит грузы и раненых.'
    }
};

export const ACTIONS_FOR_ROLE: Record<SceneRoleId, SocialActionId[]> = {
    leader: ['issue_order', 'broadcast_plan', 'assign_role', 'delegate_leadership', 'revoke_order'],
    coordinator: ['coordinate_search', 'organize_evac', 'share_information'],
    medic: ['triage_wounded', 'evacuate_wounded', 'self_treat', 'search_for_medics'],
    guard: ['protect_exit', 'intimidate', 'restrain_physical', 'attack'],
    scout: ['search_route', 'observe', 'share_information'],
    free: [],
    incident_leader: ['search_route', 'clear_debris', 'broadcast_plan', 'issue_order', 'wait'],
    stabilizer_guard: ['triage_wounded', 'protect_exit', 'aid_ally'],
    tactical_coordinator: ['coordinate_search', 'broadcast_plan', 'protect_exit', 'triage_wounded', 'share_information'],
    judge: ['issue_order', 'assign_role', 'revoke_order', 'share_information'],
    accused: ['share_personal_belief', 'defend_self', 'refuse_order', 'accept_order'], // defend_self added conceptually
    jury: ['observe', 'share_personal_belief', 'vote'], // vote added conceptually
    commander: ['issue_order', 'broadcast_plan', 'assign_role', 'delegate_leadership', 'revoke_order'],
    sergeant: ['issue_order', 'acknowledge_order', 'intimidate', 'support_leader'],
    trooper: ['acknowledge_order', 'attack', 'protect_exit', 'clear_debris'],
    no_role: [],
    porter: ['clear_debris', 'evacuate_wounded']
};

export function ensureSceneRoles(world: WorldState): SceneRoleState {
    // For MVP, assume one global group with ID 'main_group'
    const groupId = 'main_group';
    
    if (!world.sceneRoles) {
        world.sceneRoles = {};
    }

    if (!world.sceneRoles[groupId]) {
        // Initialize slots based on scenario requirements or defaults
        const scenarioSlots = world.scenario?.roleSlots || [];
        const slots: SceneRoleSlot[] = [];
        
        // Map scenario definition to runtime slots
        scenarioSlots.forEach(def => {
            for(let i=0; i<def.count; i++) {
                slots.push({
                    role: def.roleId as SceneRoleId,
                    holderId: null,
                    required: true
                });
            }
        });

        // Add some optional/free slots if needed
        if (slots.length === 0) {
             slots.push({ role: 'leader', holderId: null, required: false });
             slots.push({ role: 'medic', holderId: null, required: false });
        }

        const roleState: SceneRoleState = {
            groupId,
            slots,
            structure: 'hierarchical' // Default
        };
        world.sceneRoles[groupId] = roleState;
    }

    return world.sceneRoles[groupId];
}

export function getAgentRole(agent: AgentState, world: WorldState): SceneRoleId {
    const roleState = ensureSceneRoles(world);
    const slot = roleState.slots.find(s => s.holderId === agent.entityId);
    // If no slot, check global leader
    if (!slot && world.leadership.currentLeaderId === agent.entityId) return 'leader';
    return slot ? slot.role : 'free';
}

export function evaluateRoleSuitability(agent: AgentState, role: SceneRoleId): number {
    const def = ROLE_DEFINITIONS[role];
    if (!def) return 0;

    let score = 0;
    let count = 0;

    // Capability check
    const caps = agent.capabilities || {};
    for (const cap of def.requiredCapabilities) {
        score += (caps[cap as keyof typeof caps] ?? 0);
        count++;
    }
    
    // Normalize
    return count > 0 ? score / count : 0.5;
}

export function assignRole(world: WorldState, agentId: string, role: SceneRoleId): boolean {
    const roleState = ensureSceneRoles(world);
    
    // Remove from existing slots
    roleState.slots.forEach(s => {
        if (s.holderId === agentId) s.holderId = null;
    });
    
    // Find empty slot for role
    const slot = roleState.slots.find(s => s.role === role && s.holderId === null);
    if (slot) {
        slot.holderId = agentId;
        return true;
    }
    
    // Create new dynamic slot if none exist
    roleState.slots.push({ role, holderId: agentId, required: false });
    return true;
}
