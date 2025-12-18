



import {
    ActionOutcome,
    AgentState,
    Episode,
    Observation,
    WorldState,
    SocialActionId,
    ObservationKind,
    ObservationChannel,
} from '../../types';
import { makeAgentRNG } from '../core/noise';

/**
 * Local observation: observer sees the outcome of sourceActor's action.
 * Can return null if the event is "not noticed".
 */
export function createObservation(
    world: WorldState,
    observer: AgentState,
    outcome: ActionOutcome,
    sourceActor: AgentState
): Observation | null {
    const rng = makeAgentRNG(observer.entityId, world.tick + 999);

    // Base visibility (placeholder for scene geometry)
    const baseVisibility = 1.0;

    // Sensory system parameters from character model
    // Cast to any to access observation config if distinct from standard AgentState properties
    const obsCfg = (observer as any).observation ?? { noise: 0.0, report_noise: 0.0 };
    const noiseLevel = obsCfg.noise ?? 0.0;

    // Add noise to visibility
    const visibility = Math.max(
        0,
        baseVisibility - noiseLevel * rng.nextFloat()
    );

    // Simple model: if visibility drops near zero, it's unnoticed
    if (visibility < 0.1) {
        return null;
    }

    const intention = outcome.intention;
    const actionId = intention?.id as SocialActionId | undefined;

    const kind: ObservationKind = 'action';
    const channel: ObservationChannel = 'direct';

    const observation: Observation = {
        id: `obs-${world.tick}-${observer.entityId}-${sourceActor.entityId}`,
        tick: world.tick,
        t: world.tick,
        observerId: observer.entityId,
        subjectId: sourceActor.entityId,
        actorId: sourceActor.entityId,
        kind,
        actionType: actionId,
        payload: {
            success: outcome.success,
            targetId: intention?.targetId,
            description: outcome.description,
            sceneDelta: outcome.sceneDelta ?? {},
            bodyDelta: outcome.bodyDelta ?? {},
        },
        visibility,
        noise: noiseLevel * rng.nextFloat(),
        channel,
        intensity: outcome.success, // Added intensity based on success
    };

    return observation;
}

/**
 * Grouping observations into an episode for a specific observer and subject.
 * Current logic: 1 actor -> 1 episode per tick.
 */
export function createEpisode(
    world: WorldState,
    observations: Observation[]
): Episode | null {
    if (observations.length === 0) return null;

    // Take the first observation as the primary one (1 action -> 1 episode)
    const primaryObs = observations[0];

    const actType = primaryObs.actionType as SocialActionId | undefined;
    const tags: string[] = [];

    // Determine basic tags based on action type
    if (actType) {
        if (['attack', 'intimidate', 'blame_other'].includes(actType)) tags.push('conflict');
        if (['deceive', 'sow_dissent'].includes(actType)) tags.push('betrayal', 'lie');
        if (['aid_ally', 'reassure', 'offer_private_support'].includes(actType)) tags.push('support');
        if (['triage_wounded', 'evacuate_wounded'].includes(actType)) tags.push('heroism', 'care');
        if (['refuse_order', 'challenge_leader'].includes(actType)) tags.push('rebellion');
        if (['acknowledge_order', 'enforce_order'].includes(actType)) tags.push('obedience', 'order');
    }

    // Episode intensity based on visibility and action "success"
    const baseIntensity = primaryObs.visibility;
    const success = primaryObs.payload?.success ?? 0;
    const intensity = Math.min(1, baseIntensity * (0.5 + 0.5 * success));

    const summary = `Observed ${primaryObs.actionType ?? 'event'} by ${primaryObs.subjectId}`;

    const episode: Episode = {
        id: `ep-${primaryObs.id}`,
        ownerId: primaryObs.observerId,
        ticks: { start: primaryObs.tick, end: primaryObs.tick },
        mainActors: [primaryObs.subjectId!].filter(Boolean),
        summary,
        tags,
        emotionalValence: 0, // filled by interpretEpisode via meta
        intensity,
        observations,
    };

    return episode;
}