
import { Episode, NarrativeSlot, Norm, AgentState, WorldState, EpisodeMeta } from '../../types';
import { ALL_NORMS } from '../../data/norms';

function checkNormViolation(episode: Episode, norm: Norm): boolean {
    // Check if episode tags intersect with norm violation tags
    if (norm.violationPattern.tags) {
        const hasTag = norm.violationPattern.tags.some(t => episode.tags.includes(t));
        if (hasTag) return true;
    }
    // Check action type
    if (norm.violationPattern.actionType) {
        const primaryObs = episode.observations[0];
        if (primaryObs && primaryObs.actionType === norm.violationPattern.actionType) return true;
    }
    return false;
}

function deriveEpisodeMeta(episode: Episode): EpisodeMeta {
    const meta: EpisodeMeta = {
        harmDone: 0,
        betrayal: 0,
        deceit: 0,
        selfSacrifice: 0,
        savedOthers: 0,
        obeyedOrder: 0,
        defiedSystem: 0,
        survivedAgainstOdds: 0
    };

    const tags = episode.tags;
    const intensity = episode.intensity;

    if (tags.includes('harm') || tags.includes('conflict')) meta.harmDone = intensity;
    if (tags.includes('betrayal') || tags.includes('lie')) meta.betrayal = intensity;
    if (tags.includes('lie')) meta.deceit = intensity;

    if (tags.includes('heroism') || tags.includes('care')) {
        meta.savedOthers = intensity;
        // Heuristic: high intensity care often implies risk/sacrifice
        if (intensity > 0.7) meta.selfSacrifice = intensity * 0.8;
    }

    if (tags.includes('rebellion')) meta.defiedSystem = intensity;
    // Absence of rebellion in a hierarchy context implies obedience, simplified
    // Ideally we'd check specific action types like 'acknowledge_order'
    
    // Survival is hard to gauge from tags alone without context, leaving at 0 for now
    
    return meta;
}

export function interpretEpisode(
    agent: AgentState,
    episode: Episode,
    world: WorldState
): { slot: NarrativeSlot, legitimacyPenalty: number } {
    let interpretation: NarrativeSlot['interpretation'] = 'normal';
    let cause = 'circumstance';
    let lesson = 'none';
    let legitimacyPenalty = 0;
    const trustChange: Record<string, number> = {};

    // 0. Augment Episode with Meta (Psych Signals)
    episode.meta = deriveEpisodeMeta(episode);

    // 1. Norm Checking
    const violatedNorms = ALL_NORMS.filter(norm => checkNormViolation(episode, norm));
    
    if (violatedNorms.length > 0) {
        // Found violations
        const worstNorm = violatedNorms.reduce((prev, curr) => prev.basePenalty > curr.basePenalty ? prev : curr);
        
        if (worstNorm.severity === 'taboo') interpretation = 'chaos';
        else if (worstNorm.severity === 'hard') interpretation = 'unfair';
        
        cause = `violation of ${worstNorm.name}`;
        legitimacyPenalty = violatedNorms.reduce((sum, n) => sum + n.basePenalty, 0);
        
        // Attribute blame to main actor
        const actorId = episode.mainActors[0];
        if (actorId) {
             trustChange[actorId] = -0.1 * legitimacyPenalty;
        }
    }

    // 2. Basic Semantic Interpretation (Success/Fail/Type)
    if (episode.tags.includes('betrayal')) {
        interpretation = 'betrayal';
        cause = 'malice';
    } else if (episode.tags.includes('heroism')) {
        interpretation = 'heroism';
        cause = 'virtue';
    } else if (episode.tags.includes('support')) {
        interpretation = 'order'; // Reinforces social order
    }

    // 3. Self-Reference check
    const isSelfActor = episode.mainActors.includes(agent.entityId);
    if (isSelfActor) {
        // Interpreting own actions
        if (violatedNorms.length > 0) {
             lesson = "I must be more careful / I am becoming a monster";
        }
    }

    const slot: NarrativeSlot = {
        episodeId: episode.id,
        interpretation,
        perceivedCause: cause,
        perceivedLesson: lesson,
        impactOnValues: {}, // Could shift values here
        impactOnToM: {
            trustChange,
        }
    };

    return { slot, legitimacyPenalty };
}
