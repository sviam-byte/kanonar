
import { StoryCard } from '../../types';

const story: StoryCard = {
  "id": "coalition-formation",
  "title": "Формирование коалиции",
  "scenarioId": "council_simple",
  "horizon_steps": 40,
  "beats": [
    {
      "from": 0, "to": 40,
      "z": { "uncertainty": 0.8, "threat": 0.7, "control": -0.5, "social_pressure": 0.6, "legal": 0.3, "supply": -0.1, "bio": 0.1, "topo": 0.2 },
      "cost_mod": { "disobedience": 0.1, "injury_risk": 0.3 },
      "shocks": { "lambda": 0.08, "J_profile": { "stress": 0.35 } }
    }
  ],
  "resources": { "medkits": 2, "time_budget_h": 6, "infra_budget": 0.4 }
};

export default story;
