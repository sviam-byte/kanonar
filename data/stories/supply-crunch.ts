
import { StoryCard } from '../../types';

const story: StoryCard = {
  "id": "supply-crunch",
  "title": "Кризис снабжения",
  "scenarioId": "cave_rescue",
  "horizon_steps": 60,
  "beats": [
    {
      "from": 0, "to": 60,
      "z": { "uncertainty": 0.5, "threat": 0.3, "control": -0.4, "social_pressure": 0.6, "legal": 0.2, "supply": -0.8, "bio": 0.1, "topo": 0.1 },
      "cost_mod": { "disobedience": 0.5, "injury_risk": 0.1 },
      "shocks": { "lambda": 0.1, "J_profile": { "stress": 0.3, "energy": -0.2 } }
    }
  ],
  "resources": { "medkits": 0, "time_budget_h": 4, "infra_budget": 0.1 }
};

export default story;
