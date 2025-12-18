
import { GOAL_DEFS, CharacterGoalId } from './space';
import { PlanningGoalDef, GoalDomainWeight } from '../types-goals';
import { GoalDomainId } from '../types';

export const getPlanningGoals = (): PlanningGoalDef[] => {
    return Object.values(GOAL_DEFS).map(d => {
        const domains: GoalDomainWeight[] = (d.domains || []).map(dom => ({ 
            domain: dom as GoalDomainId, 
            weight: 1.0 
        }));
        
        return {
            id: d.id,
            label: d.label_ru,
            domains,
            deficitWeight: 0.5,
            legacyId: d.id
        };
    });
};
