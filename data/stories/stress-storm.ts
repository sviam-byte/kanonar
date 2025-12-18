
import { StoryCard } from '../../types';

const story: StoryCard = {
  "id": "stress-storm",
  "title": "Стрессовый шторм",
  "scenarioId": "cave_rescue",
  "horizon_steps": 60,
  "beats": [
    {
      "from": 0, "to": 20,
      "z": { "uncertainty": 0.8, "threat": 0.7, "control": -0.6, "social_pressure": 0.5, "legal": 0.3, "supply": -0.3, "bio": 0.4, "topo": 0.5 },
      "shocks": { "lambda": 0.2, "J_profile": { "stress": 0.5, "energy": -0.3 } }
    },
    {
      "from": 20, "to": 60,
      "z": { "uncertainty": 0.9, "threat": 0.9, "control": -0.8, "social_pressure": 0.7, "legal": 0.4, "supply": -0.5, "bio": 0.6, "topo": 0.6 },
      "shocks": { "lambda": 0.3, "J_profile": { "stress": 0.7, "energy": -0.4 } }
    }
  ],
  "resources": { "medkits": 1, "time_budget_h": 3, "infra_budget": 0.2 }
};

export default story;
