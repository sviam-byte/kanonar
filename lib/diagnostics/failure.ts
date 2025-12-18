


import { AgentState, AgentFailureMode, AgentFailureState, WorldState } from '../../types';

const FAILURE_PROFILES: Record<AgentFailureMode, { threshold: (a: AgentState) => boolean }> = {
    'cognitive_collapse': {
        threshold: (a) => (a.v42metrics?.DQ_t ?? 0) < 0.2 && (a.body.acute.stress ?? 0) > 80
    },
    'moral_collapse': {
        threshold: (a) => (a.latents?.EW ?? 0) < 0.2 && (a.body.acute.moral_injury ?? 0) > 70
    },
    'social_isolation': {
        threshold: (a) => (a.latents?.CL ?? 0) < 0.2 && (a.tomMetrics?.toM_Unc ?? 0) > 0.8
    },
    'burnout': {
        threshold: (a) => (a.v42metrics?.ExhaustRisk_t ?? 0) > 0.9
    },
    'monstro_risk': {
        threshold: (a) => (a.prMonstro ?? 0) > 0.8
    }
};

export function checkFailureModes(agent: AgentState, world: WorldState) {
    if (!agent.failureState) {
        agent.failureState = { activeModes: [], atRiskModes: [], history: [] };
    }

    const state = agent.failureState;
    state.atRiskModes = [];

    for (const mode of Object.keys(FAILURE_PROFILES) as AgentFailureMode[]) {
        const profile = FAILURE_PROFILES[mode];
        if (profile.threshold(agent)) {
            if (!state.activeModes.includes(mode)) {
                state.activeModes.push(mode);
                state.history.push({ mode, tick: world.tick, resolved: false });
                // Trigger effect?
                // e.g., limit actions, force phase change
                if (mode === 'burnout' && agent.archetype) {
                    agent.archetype.phase = 'break';
                }
            }
        } else {
            // Recovery logic?
            if (state.activeModes.includes(mode)) {
                state.activeModes = state.activeModes.filter(m => m !== mode);
                const hist = state.history.find(h => h.mode === mode && !h.resolved);
                if (hist) hist.resolved = true;
            }
        }
        
        // Risk warning logic (simplified)
        // e.g. if close to threshold
        // For now, just use a lighter threshold
        // ...
    }
}