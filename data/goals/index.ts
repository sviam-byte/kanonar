


import { GoalMeta } from '../../types';
import surfaceEgressGoals from './surface-egress.goals.ts';
import socialDynamicsGoals from './social-dynamics.goals.ts';

export const allGoals: GoalMeta[] = [
    ...(surfaceEgressGoals.L as GoalMeta[]),
    ...(surfaceEgressGoals.S as GoalMeta[]),
    ...(socialDynamicsGoals.L as GoalMeta[]),
    ...(socialDynamicsGoals.S as GoalMeta[]),
];
