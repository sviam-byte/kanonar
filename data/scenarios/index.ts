
// data/scenarios/index.ts
import { ScenarioDef } from '../../types';
import { CAVE_RESCUE_SCENARIO } from './cave_rescue_scenario';
import { TRAINING_EVAC_SCENARIO } from './training_evac_scenario';
import { COUNCIL_VOTE_SCENARIO } from './council_vote_scenario';
import { TK_TRAINING_SCENARIO } from './tk_training_scenario';
import { TK_DISCIPLINARY_SCENARIO } from './tk_disciplinary_scenario';


export const allScenarioDefs: Record<string, ScenarioDef> = {
    [CAVE_RESCUE_SCENARIO.id]: CAVE_RESCUE_SCENARIO,
    [TRAINING_EVAC_SCENARIO.id]: TRAINING_EVAC_SCENARIO,
    [COUNCIL_VOTE_SCENARIO.id]: COUNCIL_VOTE_SCENARIO,
    [TK_TRAINING_SCENARIO.id]: TK_TRAINING_SCENARIO,
    [TK_DISCIPLINARY_SCENARIO.id]: TK_DISCIPLINARY_SCENARIO,
};
