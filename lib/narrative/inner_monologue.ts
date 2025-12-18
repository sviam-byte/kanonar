
import { AgentState, NarrativeSlot, CharacterGoalId } from '../../types';
import { GOAL_DEFS } from '../goals/space';

const PSYCH_TEMPLATES: Record<string, string[]> = {
    'hero': [
        "I must hold the line.",
        "They are counting on me.",
        "Strength is duty."
    ],
    'victim': [
        "Why does this always happen to me?",
        "There is no way out.",
        "They will betray me eventually."
    ],
    'tool': [
        "Follow the procedure.",
        "I am just an instrument.",
        "Do not deviate from the plan."
    ],
    'monster': [
        "They are weak.",
        "Power is the only truth.",
        "Let them burn."
    ],
    'observer': [
        "This is interesting.",
        "I need more data.",
        "Keep watching."
    ]
};

const STRESS_MODIFIERS = {
    low: (t: string) => t,
    medium: (t: string) => `${t} Focus.`,
    high: (t: string) => `${t} ...I can't breathe. Too much.`,
    critical: (t: string) => `ERROR. ${t} SYSTEM FAILURE.`
};

const GOAL_THOUGHTS: Record<string, string[]> = {
    'protect_self': ["I need to survive.", "Too dangerous."],
    'maintain_legitimacy': ["They must respect the chain of command.", "Do I look weak?"],
    'maintain_cohesion': ["We must stay together.", "Division is death."],
    'help_wounded': ["I can't leave them.", "Life is precious."],
    'assert_autonomy': ["I won't be controlled.", "My will is my own."],
    'default': ["What should I do next?"]
};

export function generateInnerMonologue(agent: AgentState, tick: number): NarrativeSlot | null {
    // Only generate thoughts occasionally to avoid spam, or if state changed significantly
    // For now, stochastic check based on "processing speed" (e.g. high stress = more racing thoughts)
    
    const stress = (agent.body?.acute?.stress ?? 0) / 100;
    const threshold = 0.1 + 0.8 * (1 - stress); // High stress -> Low threshold -> More thoughts
    
    // Deterministic RNG based on tick + ID would be better, but Math.random is fine for "chatter"
    if (Math.random() > 0.2) return null; // 20% chance per tick roughly

    const role = agent.psych?.narrative.role || 'observer';
    const goalId = agent.drivingGoalId;
    
    // 1. Pick a template based on Goal + Role
    let templates = GOAL_THOUGHTS[goalId] || GOAL_THOUGHTS['default'];
    let baseThought = templates[Math.floor(Math.random() * templates.length)];
    
    // 2. Flavor with Role
    if (Math.random() < 0.4) {
         const roleTemplates = PSYCH_TEMPLATES[role] || PSYCH_TEMPLATES['observer'];
         baseThought = roleTemplates[Math.floor(Math.random() * roleTemplates.length)];
    }
    
    // 3. Modify by Stress
    let finalThought = baseThought;
    if (stress > 0.8) finalThought = STRESS_MODIFIERS.critical(baseThought);
    else if (stress > 0.5) finalThought = STRESS_MODIFIERS.high(baseThought);
    else if (stress > 0.2) finalThought = STRESS_MODIFIERS.medium(baseThought);
    
    // 4. Distortions
    if (agent.psych?.distortion) {
        if (agent.psych.distortion.trustBias > 0.6) finalThought += " (They are lying.)";
        if (agent.psych.distortion.catastrophizing > 0.6) finalThought += " It's all over.";
    }

    return {
        episodeId: `thought-${tick}-${agent.entityId}`,
        interpretation: 'internal',
        perceivedCause: goalId ? `Goal: ${GOAL_DEFS[goalId as CharacterGoalId]?.label_ru || goalId}` : 'State',
        perceivedLesson: finalThought,
        impactOnValues: {},
        impactOnToM: {}
    };
}
