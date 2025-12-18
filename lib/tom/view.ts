// lib/tom/view.ts
import { WorldState, TomRelView, AgentState } from '../../types';

function clamp01(x: number) {
    return Math.max(0, Math.min(1, x));
}

export function getTomView(world: WorldState, observerId: string, targetId: string): TomRelView {
    const entry = world.tom?.[observerId]?.[targetId];
    const observer = world.agents.find(a => a.entityId === observerId);
    const target = world.agents.find(a => a.entityId === targetId);

    if (!entry || !observer || !target) {
        // Return sane defaults if data is missing
        return {
            observerId,
            targetId,
            trust: 0.5,
            bond: 0.1,
            align: 0.5,
            alignment: 0,
            dominance: 0,
            vulnerability: 0.5,
            uncertainty: 1.0,
            lastInteractionTick: 0,
            conflict: 0.1,
            emotions: { valence: 0, arousal: 0, fear: 0, anger: 0, shame: 0, trust: 0.5 },
            roles: {},
            goals: {},
            respect: 0.5
        };
    }

    let trust = entry.traits.trust;
    let conflict = entry.traits.conflict ?? 0.1;
    let align = entry.traits.align;
    let bond = entry.traits.bond;

    // Apply Psych Distortions
    if (observer.psych && observer.psych.distortion) {
        const { trustBias, threatBias, mindReading, blackWhiteThinking, personalization } = observer.psych.distortion;
        
        // Trust bias reduces perceived trust
        trust = clamp01(trust * (1 - 0.6 * trustBias));
        
        // Threat bias and mind reading increase perceived conflict/threat
        conflict = clamp01(conflict + 0.5 * threatBias + 0.3 * mindReading);
        
        // Black and white thinking pushes alignment to extremes
        if (blackWhiteThinking > 0.3) {
            align = align > 0.5 ? clamp01(align + 0.2 * blackWhiteThinking) : clamp01(align - 0.2 * blackWhiteThinking);
        }
        
        // Personalization might increase perceived bond (falsely) or conflict depending on context
        // For simplicity, let's say it amplifies bond if trust is high, amplifies conflict if low
        if (trust > 0.6) {
             bond = clamp01(bond + 0.3 * personalization);
        }
    }


    const t = entry.traits;
    const dominance = (t.dominance - 0.5) * 2; // Map [0,1] to [-1,1]
    const vulnerability = Math.max(0, 1 - t.competence - (target.hp / 100)) / 2;
    
    // Construct derived views for complex objects
    const emotions = entry.affect || { valence: 0, arousal: 0, fear: 0, anger: 0, shame: 0, trust: trust };
    const roles = entry.roleProfile?.roles || {};
    const goals: Record<string, number> = {};
    if (entry.goals) {
        entry.goals.goalIds.forEach((gid, i) => {
            goals[gid] = entry.goals.weights[i];
        });
    }

    return {
        observerId,
        targetId,
        trust,
        bond,
        align,
        alignment: align * 2 - 1, // Normalized [-1, 1]
        dominance,
        vulnerability,
        uncertainty: entry.uncertainty,
        lastInteractionTick: entry.lastInteractionTick,
        conflict,
        emotions,
        roles,
        goals,
        respect: t.respect || 0.5
    };
}