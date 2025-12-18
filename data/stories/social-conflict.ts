
import { StoryCard } from '../../types';

const story: StoryCard = {
  "id": "social-conflict",
  "title": "Социальный конфликт",
  "scenarioId": "council_simple",
  "horizon_steps": 60,
  "beats": [
    {
      "from": 0, "to": 60,
      "z": { "uncertainty": 0.6, "threat": 0.1, "control": 0.0, "social_pressure": 0.9, "legal": 0.5, "supply": 0.1, "bio": 0.0, "topo": 0.1 },
      "cost_mod": { "disobedience": 0.6, "injury_risk": 0.2 },
      "shocks": { "lambda": 0.08, "J_profile": { "stress": 0.4, "moral_injury": 0.2 } }
    }
  ],
  "resources": { "medkits": 2, "time_budget_h": 6, "infra_budget": 0.4 }
};

export default story;
