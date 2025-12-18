// --- /lib/narrative/generator.ts ---

import { AgentState, Action, GoalMeta } from '../../types';
import { entityMap } from '../../data';
import { renderGoalName } from '../engine/labels';

/**
 * Generates a qualitative description of the agent's internal state.
 * @param agent The agent state.
 * @returns A descriptive string clause or an empty string.
 */
function getQualitativeState(agent: AgentState): string {
    if (agent.body.acute.stress > 80) return "в состоянии сильного стресса";
    if (agent.body.acute.fatigue > 80) return "будучи крайне уставшим";
    if (agent.body.reserves.sleep_debt_h > 24) return "испытывая сильный недосып";
    if (agent.hp < 40) return "будучи тяжело раненым";
    if (agent.body.acute.moral_injury > 70) return "с тяжелой моральной травмой";
    if (agent.body.acute.stress > 60) return "в состоянии стресса";
    if (agent.body.acute.fatigue > 60) return "будучи уставшим";
    return "";
}


/**
 * Generates a full, human-readable narrative line for an agent's action.
 * @param agent The agent performing the action.
 * @param action The action being performed.
 * @param allGoals A list of all possible goals to determine motivation.
 * @returns A complete narrative sentence.
 */
export function generateNarrativeLine(agent: AgentState, action: Action | null, allGoals: GoalMeta[]): string {
    // 1. Subject
    const subject = agent.title;

    // 2. Action and its target
    if (!action || action.id === 'wait') {
        const stateClause = getQualitativeState(agent);
        return `${subject} бездействует${stateClause ? `, ${stateClause}` : ''}.`;
    }
    
    const verb = action.narrative_verb || action.id;
    const object = action.targetId ? entityMap.get(action.targetId)?.title || action.targetId : "";
    const actionClause = `${verb} ${object}`.trim();

    // 3. Motivation
    const primaryMotivation = renderGoalName(agent);
    const motivationClause = `движимый целью "${primaryMotivation}"`;

    // 4. State (qualitative assessment)
    const stateClause = getQualitativeState(agent);

    // 5. Assembly of the string
    let narrative = `${subject} ${actionClause}, ${motivationClause}`;
    if (stateClause) {
        narrative += `, ${stateClause}`;
    }
    
    return narrative + ".";
}