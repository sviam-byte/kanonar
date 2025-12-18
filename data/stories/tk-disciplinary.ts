
// data/stories/tk-disciplinary.ts
import { StoryCard } from "../../types";

export const TK_DISCIPLINARY_STORY: StoryCard = {
  id: "tk_disciplinary_hall",
  title: "Дисциплинарный разбор",
  scenarioId: "tk_disciplinary",
  horizon_steps: 35,

  beats: [
    {
      from: 0,
      to: 8,
      z: {
        threat: 20,
        conflict: 30,
        legitimacy: 70,
        cohesion: 60,
        uncertainty: 0.4,
      },
      cost_mod: {
        challenge_leader: 1.4,
        sow_dissent: 1.3,
      },
      shocks: { lambda: 0, J_profile: {} },
    },
    {
      from: 8,
      to: 25,
      z: {
        threat: 35,
        conflict: 50,
        legitimacy: 65,
        cohesion: 55,
        uncertainty: 0.6,
      },
      cost_mod: {
        blame_other: 1.1,
        share_personal_belief: 0.9,
        support_leader: 0.8,
        offer_private_support: 0.9,
      },
      shocks: {
          lambda: 0.2,
          J_profile: { stress: 0.3, moral_injury: 0.1 }
      },
    },
    {
      from: 25,
      to: 35,
      z: {
        threat: 20,
        conflict: 30,
        legitimacy: 75,
        cohesion: 65,
        uncertainty: 0.2,
      },
      cost_mod: {
        reassure: 0.8,
        share_information: 0.9,
      },
      shocks: { lambda: 0, J_profile: {} },
    },
  ],

  resources: {
      time_budget_h: 2
  },
};
