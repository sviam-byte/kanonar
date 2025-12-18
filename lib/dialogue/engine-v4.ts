
import { AgentState, WorldState, CharacterGoalId } from '../../types';
import { DialogueAtomId, DialogueCandidate, DialogueLabResult } from '../../types';
import { snapshotGoals } from '../goals/engine-v4';
import { predictReaction } from '../tom/engine-v4';

export interface DialogueLabRequest {
    speakerId: string;
    listenerId: string;
    scenarioId: string;
    tick: number;
}

const ATOMS: { id: DialogueAtomId; label: string }[] = [
    { id: 'ask_info', label: 'Запросить информацию' },
    { id: 'give_info', label: 'Передать информацию' },
    { id: 'support', label: 'Выразить поддержку' },
    { id: 'challenge', label: 'Бросить вызов' },
    { id: 'submit', label: 'Подчиниться' },
    { id: 'reassure', label: 'Успокоить' },
    { id: 'command_hard', label: 'Жесткий приказ' },
    { id: 'share_personal_belief', label: 'Поделиться мнением' },
    { id: 'persuade', label: 'Убедить' },
    { id: 'intimidate', label: 'Запугать' },
];

export function computeDialogue(
    world: WorldState,
    req: DialogueLabRequest
): DialogueLabResult {
    const speaker = world.agents.find(a => a.entityId === req.speakerId);
    const listener = world.agents.find(a => a.entityId === req.listenerId);
    
    if (!speaker || !listener) return { chosen: {} as any, alternatives: [] };

    // 1. Identify Speaker's Driving Goal using the Goal Engine
    // This ensures dialogue aligns with character motivation
    const goalSnap = snapshotGoals(world, speaker, {
        scenarioId: req.scenarioId,
        tick: req.tick,
        agentId: speaker.entityId
    });
    // Use contextGoals from snapshot
    const topGoal = goalSnap.contextGoals[0]?.id || 'maintain_cohesion';

    const candidates: DialogueCandidate[] = [];

    for (const atom of ATOMS) {
        let score = 0;

        // 2. Goal Compatibility (Heuristic mapping)
        // Matches atom to goal intent
        if (topGoal === 'maintain_cohesion') {
            if (atom.id === 'support' || atom.id === 'reassure') score += 1.0;
            if (atom.id === 'share_personal_belief') score += 0.5;
        } else if (topGoal === 'seek_information' || topGoal === 'pursue_truth') {
            if (atom.id === 'ask_info') score += 1.0;
        } else if (topGoal === 'maintain_legitimacy' || topGoal === 'control') {
            if (atom.id === 'command_hard' || atom.id === 'intimidate') score += 0.8;
            if (atom.id === 'persuade') score += 0.6;
        } else if (topGoal === 'assert_autonomy') {
            if (atom.id === 'challenge') score += 1.0;
            if (atom.id === 'submit') score -= 0.5;
        } else if (topGoal === 'avoid_blame') {
            if (atom.id === 'give_info') score += 0.6; // Explain oneself
        }

        // 3. ToM Prediction: How will listener react?
        // Map atom to social action ID (approximate)
        const actionId = atom.id; 
        const prediction = predictReaction(speaker, listener.entityId, actionId as any, world);
        
        // If we want cohesion, relation gain is good. If we want control, compliance is good.
        if (topGoal === 'maintain_cohesion') {
            score += 0.5 * prediction.estimatedRelationChange;
        } else if (topGoal === 'maintain_legitimacy') {
            score += 0.5 * prediction.estimatedCompliance;
        }

        candidates.push({
            atomId: atom.id,
            label: atom.label,
            qTotal: score,
            supportsGoals: [{ goalId: topGoal, weight: score }],
            assumedListenerGoals: [], // Placeholder
            predictedEffectOnRelation: `Rel: ${prediction.estimatedRelationChange.toFixed(2)}, Comp: ${prediction.estimatedCompliance.toFixed(2)}`
        });
    }

    candidates.sort((a, b) => b.qTotal - a.qTotal);

    return {
        chosen: candidates[0],
        alternatives: candidates.slice(1, 5)
    };
}
