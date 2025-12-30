
// lib/goal-alignment.ts
import { GoalEcology, GoalAlignmentMetrics, ActiveGoal } from '../types';
import { allGoals as allGoalTemplates } from '../data/goals/index';
import { arr } from './utils/arr';

const SPEARMAN_6_DIVISOR = 6 / (allGoalTemplates.length * (Math.pow(allGoalTemplates.length, 2) - 1));

// Creates a dense vector representation of a goal ecology
function createGoalVector(ecology: GoalEcology | null): Record<string, number> {
    const vector: Record<string, number> = {};
    allGoalTemplates.forEach(t => vector[t.id] = 0);

    if (ecology) {
        ecology.execute.forEach(g => {
            vector[g.id] = (vector[g.id] || 0) + g.priority;
        });
        ecology.queue.forEach(g => {
            vector[g.id] = (vector[g.id] || 0) + g.priority * 0.5; // Queued goals have less weight
        });
    }
    return vector;
}

// Creates a rank map from a goal vector
function createRankMap(vector: Record<string, number>): Record<string, number> {
    const sortedGoals = Object.entries(vector)
        .sort(([, a], [, b]) => b - a)
        .map(([id]) => id);
    
    const rankMap: Record<string, number> = {};
    sortedGoals.forEach((id, index) => {
        rankMap[id] = index + 1;
    });
    return rankMap;
}

export function calculateGoalAlignment(ecology1: GoalEcology | null, ecology2: GoalEcology | null): GoalAlignmentMetrics {
    const vector1 = createGoalVector(ecology1);
    const vector2 = createGoalVector(ecology2);

    // 1. Cosine Similarity
    let dotProduct = 0;
    let mag1 = 0;
    let mag2 = 0;
    for (const id of allGoalTemplates.map(t => t.id)) {
        dotProduct += (vector1[id] || 0) * (vector2[id] || 0);
        mag1 += Math.pow(vector1[id] || 0, 2);
        mag2 += Math.pow(vector2[id] || 0, 2);
    }
    const cosine = (mag1 > 0 && mag2 > 0) ? dotProduct / (Math.sqrt(mag1) * Math.sqrt(mag2)) : 0;

    // 2. Rank Correlation (Spearman's Rho)
    const rankMap1 = createRankMap(vector1);
    const rankMap2 = createRankMap(vector2);
    let rankDiffSq = 0;
    for (const id of allGoalTemplates.map(t => t.id)) {
        rankDiffSq += Math.pow((rankMap1[id] || 0) - (rankMap2[id] || 0), 2);
    }
    const rankCorrelation = 1 - (SPEARMAN_6_DIVISOR * rankDiffSq);

    // 3. Feasible Overlap
    const activeGoals1 = new Set(arr(ecology1?.execute).map(g => g.id));
    const activeGoals2 = new Set(arr(ecology2?.execute).map(g => g.id));
    const intersection = new Set([...activeGoals1].filter(id => activeGoals2.has(id)));
    const union = new Set([...activeGoals1, ...activeGoals2]);
    const feasibleOverlap = union.size > 0 ? intersection.size / union.size : 1; // Jaccard Index

    // 4. Compromise Cost & Blocked Mass (Simplified)
    let blockedMass = 0;
    let compromiseCost = 0;
     for (const id of allGoalTemplates.map(t => t.id)) {
        const v1 = vector1[id] || 0;
        const v2 = vector2[id] || 0;
        if (v1 > 0 && v2 === 0) blockedMass += v1;
        if (v2 > 0 && v1 === 0) blockedMass += v2;
        compromiseCost += Math.abs(v1 - v2);
    }


    return {
        cosine: isNaN(cosine) ? 0 : cosine,
        rankCorrelation: isNaN(rankCorrelation) ? 0 : rankCorrelation,
        feasibleOverlap,
        compromiseCost: compromiseCost / allGoalTemplates.length,
        blockedMass: blockedMass / 2, // Average mass blocked
    };
}
