// lib/dilemma/index.ts
// Public exports for DilemmaLab v1 + v2.

// v1 (legacy)
export { runDilemmaGame } from './runner';
export type { DilemmaRunConfig, DilemmaRunResult } from './runner';

// v2
export { runDilemmaV2 } from './runner';
export { compileAgent, compileDyad, computePerceivedStakes } from './compiler';
export { getMechanic, allMechanics, MECHANIC_CATALOG } from './mechanics';
export {
  getScenario,
  getScenarioResolved,
  allScenarios,
  allScenarioPresets,
  SCENARIO_CATALOG,
  RESOLVED_SCENARIO_CATALOG,
  SCENARIO_PRESETS,
} from './scenarios';
export { explainDecision, summarizeGame } from './explainer';
export type {
  DilemmaSpec, DilemmaGameState, DilemmaRound, DilemmaAnalysis,
  ActionDecomposition, RoundTrace,
  V2RunConfig, V2RunResult, V2GameState, V2Round, V2RoundTrace,
  CompiledAgent, CompiledDyad, UtilityWeights,
  ScenarioTemplate, ScenarioPreset, MechanicTemplate,
  ScenarioStakes, ScenarioVisibility,
  ActionTemplate, ActionPresetOverride, ActionScore,
  StateUpdate, DilemmaClass, MechanicId,
} from './types';
