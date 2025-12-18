
import { StoryCard } from '../../types';
import surfaceEgress from './surface-egress.ts';
import supplyCrunch from './supply-crunch.ts';
import highHierarchy from './high-hierarchy.ts';
import stressStorm from './stress-storm.ts';
import socialConflict from './social-conflict.ts';
import coalitionFormation from './coalition-formation.ts';
import { TK_TRAINING_HALL_STORY } from './tk-training-hall';
import { TK_DISCIPLINARY_STORY } from './tk-disciplinary';


export const allStories: Record<string, StoryCard> = {
    'surface-egress': surfaceEgress,
    'supply-crunch': supplyCrunch,
    'high-hierarchy': highHierarchy,
    'stress-storm': stressStorm,
    'social-conflict': socialConflict,
    'coalition-formation': coalitionFormation,
    [TK_TRAINING_HALL_STORY.id]: TK_TRAINING_HALL_STORY,
    [TK_DISCIPLINARY_STORY.id]: TK_DISCIPLINARY_STORY,
};
