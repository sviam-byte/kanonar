
import { GoalAxisId } from '../../types';

// Mapping: Life Goal -> Weights on Pre-Goal Axes
export const LIFE_TO_PREGOAL: Record<string, Partial<Record<GoalAxisId, number>>> = {
    'protect_lives': { care: 1.0, control: 0.6, preserve_order: 0.4 }, // survival->control, group_cohesion->preserve_order
    'maintain_order': { preserve_order: 1.0, control: 0.7, efficiency: 0.4 },
    'seek_status': { power_status: 1.0, control: 0.4, fix_world: 0.2 },
    'preserve_autonomy': { free_flow: 1.0, escape_transcend: 0.4 }, // autonomy maps to free_flow
    'serve_authority': { preserve_order: 1.0 }, 
    'pursue_truth': { truth: 1.0 }, 
    'maintain_bonds': { care: 1.0, preserve_order: 0.6 }, 
    'seek_comfort': { escape_transcend: 1.0, control: 0.3 }, 
    'self_transcendence': { escape_transcend: 1.0, truth: 0.8 }, 
    'accumulate_resources': { control: 0.6, efficiency: 0.8 },
    'other': { free_flow: 0.1 }
};