
// lib/kanonar/analytics.ts

import {
    WorldState,
    WorldEpisode,
    KanonarMetricSnapshot,
} from '../../types';
import { listify } from '../utils/listify';

const mean = (arr: number[]) =>
    arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0;

export interface KanonarAnalyticsConfig {
    windowSize: number;  // сколько последних тиков учитывать (эпизодов может быть меньше)
}

export function collectEpisodesWindow(world: WorldState, cfg: KanonarAnalyticsConfig): WorldEpisode[] {
    const { windowSize } = cfg;
    const episodes = listify(world.worldEpisodes);
    if (!episodes.length) return [];

    const currentTick = world.tick;
    const fromTick = currentTick - windowSize + 1;

    return episodes.filter(ep => ep.tick >= fromTick && ep.tick <= currentTick);
}

export function computeMetricSnapshot(windowEpisodes: WorldEpisode[], world: WorldState): KanonarMetricSnapshot {
    const Svals: number[] = [];
    const stressVals: number[] = [];
    const darkShares: number[] = [];

    // из эпизодов
    for (const ep of windowEpisodes) {
        if (ep.stabilitySummary) {
            if (typeof ep.stabilitySummary.meanS === 'number') Svals.push(ep.stabilitySummary.meanS);
            if (typeof ep.stabilitySummary.meanStress === 'number') stressVals.push(ep.stabilitySummary.meanStress);
            if (typeof ep.stabilitySummary.darkShare === 'number') darkShares.push(ep.stabilitySummary.darkShare);
        }
    }

    // если эпизоды пустые/бедные — fallback к текущему world.agents
    if (!Svals.length || !stressVals.length || !darkShares.length) {
        const agents = listify(world.agents);
        const sArr: number[] = [];
        const stArr: number[] = [];
        let darkCount = 0;

        const DARK_MODES = new Set(['dark', 'apophenia', 'corruption']);

        for (const a of agents) {
            sArr.push(a.S ?? 50);
            stArr.push(a.body?.acute?.stress ?? 0);
            const mode = (a as any).mode as string | undefined;
            if (mode && DARK_MODES.has(mode)) darkCount++;
        }

        if (!Svals.length) Svals.push(mean(sArr));
        if (!stressVals.length) stressVals.push(mean(stArr));
        if (!darkShares.length && agents.length) {
            darkShares.push(darkCount / agents.length);
        }
    }

    // отношения по snapshot’ам
    const trustVals: number[] = [];
    const conflictVals: number[] = [];
    const factionConflictVals: number[] = [];

    for (const ep of windowEpisodes) {
        if (!ep.relationsSnapshot) continue;
        for (const rel of ep.relationsSnapshot) {
            if (typeof rel.trust === 'number') trustVals.push(rel.trust);
            if (typeof rel.conflict === 'number') conflictVals.push(rel.conflict);

            // пример: если у тебя в rel есть factionFrom/factionTo — можно посчитать поляризацию
            // здесь оставляю как "дырку" под твою реальную схему
        }
    }

    // лидерство
    const leaderIds: string[] = [];
    const contestVals: number[] = [];

    for (const ep of windowEpisodes) {
        if (!ep.leadership) continue;
        const lid = ep.leadership.leaderId;
        if (lid) leaderIds.push(lid);
        if (typeof ep.leadership.contestLevel === 'number') {
            contestVals.push(ep.leadership.contestLevel);
        }
    }

    let leaderChangeRate = 0;
    if (leaderIds.length > 1) {
        let changes = 0;
        for (let i = 1; i < leaderIds.length; i++) {
            if (leaderIds[i] !== leaderIds[i - 1]) changes++;
        }
        leaderChangeRate = changes / (leaderIds.length - 1);
    }

    const snapshot: KanonarMetricSnapshot = {
        meanS: mean(Svals) || 50,
        meanStress: mean(stressVals) || 0,
        darkShare: mean(darkShares) || 0,
        meanTrust: trustVals.length ? mean(trustVals) : undefined,
        meanConflict: conflictVals.length ? mean(conflictVals) : undefined,
        factionPolarization: factionConflictVals.length ? mean(factionConflictVals) : undefined,
        leaderChangeRate,
        leaderContestLevel: contestVals.length ? mean(contestVals) : undefined,
        extra: {},
    };

    return snapshot;
}
