

import { GoalMeta } from '../../types';

interface SurfaceEgressGoals {
    L: GoalMeta[];
    S: GoalMeta[];
}

const goals: SurfaceEgressGoals = {
  "L": [
    {"id":"reach_surface","value":0.9,"deadline":48,"min_lock":8, "level": "L", "tags": ["progress"]},
    {"id":"preserve_team","value":0.7,"min_lock":6,"softban_lambda":0.8, "level": "L", "tags": ["care", "social"]},
    {"id":"maintain_legitimacy","value":0.5, "level": "L", "tags": ["hierarchy"]}
  ],
  "S": [
    {"id":"scout_path","value":0.6, "level": "S", "tags": ["progress", "topo"]},
    {"id":"rest_cycle","value":0.4, "level": "S", "tags": ["recovery"]},
    {"id":"request_co_sign","value":0.3,"softban_lambda":0.5, "level": "S", "tags": ["hierarchy"]},
    {"id":"aid_wounded","value":0.5,"oath_mask":false, "level": "S", "tags": ["care", "social"]}
  ]
};

export default goals;