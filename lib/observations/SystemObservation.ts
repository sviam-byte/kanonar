
// lib/observations/SystemObservation.ts

import {
    WorldState,
    SimulationEvent,
    ActionChosenEvent,
    ActionAppliedEvent,
    RelationshipSnapshotEvent,
    WorldEpisode,
    WorldEpisodeAction,
} from '../../types';

const DARK_MODES = new Set(['dark', 'apophenia', 'corruption']);

export const SystemObservation = {
    captureWorldEpisode(world: WorldState, events: SimulationEvent[], maxEpisodes = 1000): void {
        const tick = world.tick;

        // 1) Collect actions for the tick
        const actions: WorldEpisodeAction[] = [];

        const chosenByActor: Record<string, ActionChosenEvent> = {};
        const appliedByActor: Record<string, ActionAppliedEvent> = {};

        for (const ev of events) {
            if (ev.kind === 'ActionChosen') {
                const ac = ev as ActionChosenEvent;
                chosenByActor[ac.actorId] = ac;
            } else if (ev.kind === 'ActionApplied') {
                const ap = ev as ActionAppliedEvent;
                appliedByActor[ap.actorId] = ap;
            }
        }

        for (const actorId of Object.keys(chosenByActor)) {
            const ac = chosenByActor[actorId];
            const ap = appliedByActor[actorId];

            actions.push({
                actorId,
                actionId: ac.actionId,
                targetId: ac.targetId,
                qTotal: ac.qTotal,
                successProb: ac.probability,
                successRealized: ap?.success,
                topGoalId: ac.topGoalId,
            });
        }

        // 2) Relations snapshot if available
        let relationsSnapshot: RelationshipSnapshotEvent['snapshot'] | undefined;
        for (const ev of events) {
            if (ev.kind === 'RelationshipSnapshot') {
                relationsSnapshot = (ev as RelationshipSnapshotEvent).snapshot;
                break;
            }
        }

        // 3) Scene metrics
        const sceneId = world.scene?.scenarioDef.id;
        const phaseId = world.scene?.currentPhaseId;
        const sceneMetrics = world.scene?.metrics
            ? JSON.parse(JSON.stringify(world.scene.metrics))
            : undefined;

        // 4) Leadership context
        const leadership = world.leadership
            ? {
                  leaderId: world.leadership.currentLeaderId,
                  leaderScores: world.leadership.leaderScores,
                  legitimacy: world.leadership.legitimacy,
                  contestLevel: world.leadership.contestLevel,
              }
            : undefined;

        // 5) Stability Summary
        let stabilitySummary: WorldEpisode['stabilitySummary'] | undefined;
        if (world.agents && world.agents.length > 0) {
            const Svals: number[] = [];
            const stressVals: number[] = [];
            let darkCount = 0;

            for (const a of world.agents) {
                Svals.push(a.S ?? 50);
                const stress = a.body?.acute?.stress ?? 0;
                stressVals.push(stress);
                const mode = (a as any).mode as string | undefined;
                if (mode && DARK_MODES.has(mode)) darkCount++;
            }

            const mean = (arr: number[]) =>
                arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0;

            stabilitySummary = {
                meanS: mean(Svals),
                meanStress: mean(stressVals),
                darkShare: world.agents.length ? darkCount / world.agents.length : 0,
            };
        }

        const episode: WorldEpisode = {
            tick,
            sceneId,
            phaseId,
            actions,
            relationsSnapshot,
            sceneMetrics,
            leadership,
            stabilitySummary,
        };

        // 6) Record into world state
        if (!world.worldEpisodes) {
            world.worldEpisodes = [];
        }

        world.worldEpisodes.push(episode);

        // 7) Limit history
        if (world.worldEpisodes.length > maxEpisodes) {
            world.worldEpisodes.splice(0, world.worldEpisodes.length - maxEpisodes);
        }
    },
};
