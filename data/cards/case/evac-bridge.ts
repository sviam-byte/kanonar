import { CaseCard } from '../../../lib/solver/types';

const cardData: CaseCard = {
  "id": "evac-bridge",
  "title": "Эвакуация через повреждённый мост",
  "horizon_steps": 48,
  "goals_L": [
    {"id":"evacuate_civilians","value":0.9,"deadline":36,"min_lock":8},
    {"id":"preserve_team","value":0.7,"min_lock":6,"softban_lambda":0.6},
    {"id":"maintain_legitimacy","value":0.5}
  ],
  "goals_S": [
    {"id":"scout_path","value":0.6,"tags":["topo","progress"]},
    {"id":"stabilize_bridge","value":0.5,"tags":["risk","progress"]},
    {"id":"rest_cycle","value":0.4,"tags":["recovery"]},
    {"id":"request_co_sign","value":0.3,"tags":["hierarchy"],"softban_lambda":0.8},
    {"id":"aid_wounded","value":0.5,"tags":["social","care"]}
  ],
  "beats": [
    {
      "from":0,"to":12,
      "z":{"uncertainty":0.5,"threat":0.4,"control":-0.2,"social_pressure":0.2,"legal":0.2,"supply":-0.1,"bio":0.1,"topo":0.5},
      "shocks":{"lambda":0.05,"J_profile":{"stress":0.25,"energy":-0.15}}
    },
    {
      "from":12,"to":30,
      "z":{"uncertainty":0.7,"threat":0.6,"control":-0.3,"social_pressure":0.35,"legal":0.25,"supply":-0.2,"bio":0.15,"topo":0.6},
      "shocks":{"lambda":0.12,"J_profile":{"stress":0.4,"energy":-0.25}}
    },
    {
      "from":30,"to":48,
      "z":{"uncertainty":0.4,"threat":0.3,"control":0.1,"social_pressure":0.15,"legal":0.1,"supply":0.0,"bio":0.1,"topo":0.3},
      "shocks":{"lambda":0.03,"J_profile":{"stress":0.2,"energy":-0.10}}
    }
  ],
  "resources":{"medkits":1,"time_budget_h":5,"infra_budget":0.25},
  "actions":[
    {"id":"advance","tags":["progress","risk"],"base_cost":{"energy":0.10,"injury":0.05}},
    {"id":"hold","tags":["stability"],"base_cost":{"energy":0.03}},
    {"id":"rest","tags":["recovery"],"base_cost":{"time":0.10}},
    {"id":"bypass","tags":["topo","risk"],"base_cost":{"energy":0.08,"time":0.05}},
    {"id":"request_co_sign","tags":["hierarchy"],"base_cost":{"time":0.07,"obedience":0.05}},
    {"id":"aid_ally","tags":["social","care"],"base_cost":{"time":0.05,"energy":0.05}},
    {"id":"escalate","tags":["force","risk"],"base_cost":{"injury":0.12,"legal":0.10}}
  ]
};

export default cardData;