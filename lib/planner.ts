




import { CharacterEntity, GoalEcology, VisualizationPlanStep, ActiveGoal, SimulationPoint, GoalProfileShape, CharacterState, EntityParams, Branch, CharacterGoalId, GoalState } from '../types';
import { flattenObject } from './param-utils';
import { calculateLatentsAndQuickStates } from './metrics/latentsQuick';

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

// Profile shape functions
function getProfileValue(t: number, t0: number, t1: number, shape: GoalProfileShape): number {
    if (t < t0 || t > t1) return 0;
    const duration = t1 - t0;
    if (duration <= 0) return 1;
    const local_t = (t - t0) / duration;

    switch (shape) {
        case 'constant':
            return 1;
        case 'trapezoid':
            const ramp = 0.1; // 10% ramp up/down
            if (local_t < ramp) return local_t / ramp;
            if (local_t > 1 - ramp) return (1 - local_t) / ramp;
            return 1;
        case 's-curve':
            return sigmoid(12 * (local_t - 0.5));
        default:
            return 1;
    }
}

// 1. Ideal Planner
export function generateIdealPlan(ecology: GoalEcology, character: CharacterEntity): VisualizationPlanStep[] {
    const plan: VisualizationPlanStep[] = [];
    let currentTime = 0; // in days

    // Only plan for the top 5 goals for performance and clarity
    const goalsToPlan = ecology.execute.slice(0, 5);

    for (const goal of goalsToPlan) {
        // Safe access to cost_model via type assertion or check
        const costModel = (goal as any).cost_model;
        const durationHours = costModel?.time_h || 8; // default 8 hours
        const durationDays = durationHours / 24;

        const profileShape = (goal as any).profile_shape || 'constant';

        const step: VisualizationPlanStep = {
            t0: currentTime,
            t1: currentTime + durationDays,
            goal,
            profile_shape: profileShape as GoalProfileShape,
        };
        plan.push(step);
        currentTime += durationDays;
    }

    return plan;
}

// 2. Timeline Simulator
export function simulateTimeline(
    plan: VisualizationPlanStep[],
    character: CharacterEntity,
    initialFlatParams: EntityParams,
    horizonDays: number
): SimulationPoint[] {
    const dt_h = 1; // 1 hour timestep
    const horizonHours = horizonDays * 24;
    const results: SimulationPoint[] = [];
    
    // Initial State
    let state = {
        stress: initialFlatParams['body.acute.stress'] || 40,
        fatigue: initialFlatParams['body.acute.fatigue'] || 30,
        sleep_debt: initialFlatParams['body.reserves.sleep_debt_h'] || 0,
        attention_debt: 0,
        risk_debt: 0,
        social_debt: 0,
    };

    const taus = {
        attention: 4 * 24, // 4 days
        risk: 20 * 24, // 20 days
        social: 15 * 24, // 15 days
    };

    // Main simulation loop
    for (let t = 0; t <= horizonHours; t += dt_h) {
        const day = t / 24;
        let activeGoals: { step: VisualizationPlanStep, activity: number }[] = [];
        let totalActivity = 0;

        // Check for active goals
        for (const step of plan) {
            const activity = getProfileValue(day, step.t0, step.t1, step.profile_shape as GoalProfileShape);
            if (activity > 0) {
                activeGoals.push({ step, activity });
                totalActivity += activity;
            }
        }
        totalActivity = Math.min(1, totalActivity); // Cap total activity at 1

        // State dynamics (Ornstein-Uhlenbeck process for relaxation)
        const theta = { stress: 0.1, fatigue: 0.08 };
        const mu = { stress: 25, fatigue: 20 };
        
        state.stress += dt_h * (theta.stress * (mu.stress - state.stress));
        state.fatigue += dt_h * (theta.fatigue * (mu.fatigue - state.fatigue));
        
        // Sleep debt dynamics
        const isSleeping = activeGoals.some(g => g.step.goal.id === ('BODY_CIRCADIAN_RESET' as CharacterGoalId)); // Simple check with cast
        if (isSleeping) {
            state.sleep_debt -= dt_h * 1.0;
        } else {
            state.sleep_debt += dt_h * (1/3); // Accumulate 8h debt over 24h awake
        }
        state.sleep_debt = Math.max(0, state.sleep_debt);

        // Apply goal effects & update debts
        for (const { step, activity } of activeGoals) {
            // Access via type guard or optional chaining with any cast for safe access
            const effects = (step.goal as any).effect_profile;
            if (effects) {
                state.stress += (effects.stress || 0) * activity * dt_h;
                state.fatigue += (effects.fatigue || 0) * activity * dt_h;
            }
            // Update debts
            const dose = (initialFlatParams['memory.attention.E'] ?? 150) / (initialFlatParams['memory.attention.A_star'] || 150);
            const overshoot = Math.max(0, dose - 1);
            const { latents, quickStates } = calculateLatentsAndQuickStates(initialFlatParams);
            const tailRisk = quickStates.prMonstro ?? 0;

            state.attention_debt += dt_h * (0.1 * overshoot * activity);
            state.risk_debt += dt_h * (0.05 * tailRisk * activity);
            // social_debt is not modeled here for simplicity
        }

        // Debt decay
        state.attention_debt *= Math.exp(-dt_h / taus.attention);
        state.risk_debt *= Math.exp(-dt_h / taus.risk);
        
        // Calculate S(t) with debt penalties
        const flatParams = { ...initialFlatParams, 'body.acute.stress': state.stress, 'body.acute.fatigue': state.fatigue };
        const { latents } = calculateLatentsAndQuickStates(flatParams);
        const Pv = 50; // Placeholder
        const Vsigma = 40; // Placeholder
        const D = 15; // Placeholder
        const T_topo = latents.T_topo ?? 0.5;
        const CL = latents.CL ?? 0.5;

        const S_raw = 1.6 * (Pv / 100) - 1.4 * (Vsigma / 100) - 1.0 * (D / 100) + 0.8 * T_topo + 0.6 * CL;
        
        const lambda_A = 0.2;
        const lambda_R = 0.3;
        const lambda_C = 0.15;
        
        const attentionPenalty = lambda_A * Math.log1p(state.attention_debt);
        const riskPenalty = lambda_R * Math.log1p(state.risk_debt);
        const socialPenalty = lambda_C * Math.log1p(state.social_debt);
        
        const S = sigmoid(S_raw - attentionPenalty - riskPenalty - socialPenalty) * 100;
        
        // Store results
        if (t % 24 === 0) { // Store daily results
            results.push({
                day,
                S,
                stress: state.stress,
                fatigue: state.fatigue,
                debts: {
                    attention: state.attention_debt,
                    risk: state.risk_debt,
                    social: state.social_debt,
                }
            } as SimulationPoint);
        }
    }

    return results;
}
