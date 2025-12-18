
// data/stories/tk-training-hall.ts
import { StoryCard } from "../../types";

export const TK_TRAINING_HALL_STORY: StoryCard = {
  id: "tk_training_hall",
  title: "Учебная тренировка в зале крепости",
  scenarioId: "tk_training",
  horizon_steps: 40,

  // roles: [
  //   { roleId: "leader", characterId: "character-tegan-nots" },
  //   { roleId: "medic", characterId: "character-krystar-mann" },
  //   { roleId: "porter", characterId: "character-bernard" },
  //   { roleId: "porter", characterId: "character-brand" },
  //   { roleId: "porter", characterId: "character-olaf" },
  //   { roleId: "porter", characterId: "character-larson" },
  // ],

  beats: [
    {
      from: 0,
      to: 10,
      z: {
        threat: 10,
        discipline: 60,
        cohesion: 50,
        legitimacy: 70,
        uncertainty: 0.1,
      },
      cost_mod: {
        refuse_order: 1.2,
        challenge_leader: 1.5,
      },
      shocks: { lambda: 0, J_profile: {} },
    },
    {
      from: 10,
      to: 30,
      z: {
        threat: 30,
        discipline: 70,
        cohesion: 55,
        legitimacy: 75,
        uncertainty: 0.3,
      },
      cost_mod: {
        support_leader: 0.8,
        acknowledge_order: 0.8,
        blame_other: 1.1,
        sow_dissent: 1.4,
      },
      shocks: {
          lambda: 0.1,
          J_profile: { stress: 0.2 }
      },
    },
    {
      from: 30,
      to: 40,
      z: {
        threat: 15,
        discipline: 65,
        cohesion: 60,
        legitimacy: 80,
        uncertainty: 0.1,
      },
      cost_mod: {
        reassure: 0.8,
        offer_private_support: 0.8,
      },
      shocks: { lambda: 0, J_profile: {} },
    },
  ],

  resources: {
    time_budget_h: 4,
  },
};
