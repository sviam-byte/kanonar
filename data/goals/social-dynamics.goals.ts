import { GoalMeta } from '../../types';

interface SocialGoals {
    L: GoalMeta[];
    S: GoalMeta[];
}

const goals: SocialGoals = {
  "L": [
    { "id":"FORM_COALITION", "value":0.8, "level": "L", "tags": ["social", "hierarchy"], "affinity": { "context": { "threat": 0.6, "uncertainty": 0.4 } } },
    { "id":"MAINTAIN_ALLIANCE", "value":0.6, "level": "L", "tags": ["social", "care"] }
  ],
  "S": [
    { "id":"PROPOSE_LEADERSHIP", "value":0.7, "level": "S", "tags": ["social", "hierarchy"] },
    { "id":"SUPPORT_LEADER", "value":0.6, "level": "S", "tags": ["social", "hierarchy", "care"] }
  ]
};

export default goals;