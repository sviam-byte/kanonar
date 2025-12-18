
import { StoryCard } from '../../types';

const story: StoryCard = {
  "id": "high-hierarchy",
  "title": "Высокая иерархия",
  "scenarioId": "council_simple",
  "horizon_steps": 60,
  "beats": [
    {
      "from": 0, "to": 60,
      "z": { "uncertainty": 0.3, "threat": 0.2, "control": 0.5, "social_pressure": 0.8, "legal": 0.7, "supply": 0.2, "bio": 0.0, "topo": 0.2 },
      "cost_mod": { "disobedience": 0.8, "injury_risk": 0.05 },
      "shocks": { "lambda": 0.02, "J_profile": { "stress": 0.15 } }
    }
  ],
  "resources": { "medkits": 2, "time_budget_h": 8, "infra_budget": 0.5 }
};

export default story;
