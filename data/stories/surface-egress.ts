

import { StoryCard } from '../../types';

const story: StoryCard = {
  "id": "surface-egress",
  "title": "Выход на поверхность",
  "scenarioId": "cave_rescue",
  "horizon_steps": 60,
  "beats": [
    {
      "from": 0, "to": 10,
      "z": { "uncertainty": 0.6, "threat": 0.4, "control": -0.2, "social_pressure": 0.2, "legal": 0.1, "supply": 0.0, "bio": 0.1, "topo": 0.3 },
      "cost_mod": { "disobedience": 0.2, "injury_risk": 0.1 },
      "shocks": { "lambda": 0.05, "J_profile": { "stress": 0.25, "energy": -0.15 } }
    },
    {
      "from": 10, "to": 35,
      "z": { "uncertainty": 0.7, "threat": 0.6, "control": -0.3, "social_pressure": 0.3, "legal": 0.2, "supply": -0.2, "bio": 0.2, "topo": 0.4 },
      "cost_mod": { "disobedience": 0.35, "injury_risk": 0.25 },
      "shocks": { "lambda": 0.12, "J_profile": { "stress": 0.4, "energy": -0.25 } }
    },
    {
      "from": 35, "to": 60,
      "z": { "uncertainty": 0.4, "threat": 0.3, "control": 0.1, "social_pressure": 0.15, "legal": 0.1, "supply": 0.0, "bio": 0.1, "topo": 0.2 },
      "cost_mod": { "disobedience": 0.15, "injury_risk": 0.1 },
      "shocks": { "lambda": 0.03, "J_profile": { "stress": 0.2, "energy": -0.1 } }
    }
  ],
  "resources": { "medkits": 1, "time_budget_h": 6, "infra_budget": 0.3 }
};

export default story;