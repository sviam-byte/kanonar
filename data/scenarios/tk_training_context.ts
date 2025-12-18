
import type { ScenarioConfig } from "../../lib/context/types";

export const TK_TRAINING_CONTEXT: ScenarioConfig = {
  id: "tk_training.ctx",
  label: "Строевая тренировка — контекст",
  kind: "fortress_drill",

  contextMode: "physical_survival", // Using physical_survival as a base for drill
  engineMode: "hybrid",
  governance: "hierarchical",

  map: {
    locations: [
      { id: "ka_fortress.drill_square", label: "Плац", tags: ["drill", "public"] },
      { id: "ka_fortress.barracks", label: "Казармы", tags: ["rest", "private"] },
    ],
    connections: [
      { from: "ka_fortress.drill_square", to: "ka_fortress.barracks" },
      { from: "ka_fortress.barracks", to: "ka_fortress.drill_square" },
    ],
  },

  affordances: [
    {
      requiresLocationTags: ["drill"],
      allowedActions: ["issue_order", "acknowledge_order", "wait"],
    },
    {
      requiresLocationTags: ["rest"],
      allowedActions: ["share_personal_belief", "rest"], // Updated to valid action IDs
    },
  ],

  stages: [],
  activeNorms: [],
  contextSeed: [],
  contextRules: [],
  outcomeRules: { success: [], failure: [] }
};
