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
export {
  createConflictLearningMemory,
  createConflictLearningStore,
  getConflictMemory,
  getLearnedActionValue,
  mostLikelyPredictedResponse,
  predictedResponseProb,
  updateActionValue,
  updateConflictMemory,
} from './learningMemory';
export {
  applyConflictTransition,
  collapseScore,
  createTrustExchangeProtocol,
  defaultConflictAgentState,
  defaultConflictRelationState,
  detectCyclePeriod,
  estimateDivergenceRate,
  evaluateActionUtilities,
  getAvailableActions,
  getObservationForPlayer,
  repairCapacity,
  resolveProtocolStep,
  runConflictTrajectory,
  selectDominantAction,
  stateDistance,
  trajectoryMetrics,
  TRUST_EXCHANGE_ACTION_ORDER,
  updateStrategyProfileReplicator,
  validateJointAction,
} from './dynamics';
export type {
  DilemmaSpec, DilemmaGameState, DilemmaRound, DilemmaAnalysis,
  ActionDecomposition, RoundTrace,
  V2RunConfig, V2RunResult, V2GameState, V2Round, V2RoundTrace,
  CompiledAgent, CompiledDyad, UtilityWeights,
  ScenarioTemplate, ScenarioPreset, MechanicTemplate,
  ScenarioStakes, ScenarioVisibility,
  ActionTemplate, ActionPresetOverride, ActionScore,
  StateUpdate, DilemmaClass, MechanicId, PressureSchedule,
} from './types';
export type {
  ActionImpact,
  ConflictLearningMemory,
  ConflictLearningStore,
  ConflictLearningTrace,
  ConflictRelationSnapshot,
  ConflictReward,
} from './learningMemory';
export type {
  ActionUtilityBreakdown,
  AgentDelta,
  ConflictAction,
  ConflictActionId,
  ConflictAgentState,
  ConflictEnvironmentKey,
  ConflictEnvironmentState,
  ConflictHistoryEvent,
  ConflictObservation,
  ConflictPhase,
  ConflictPlayerId,
  ConflictProtocol,
  ConflictProtocolId,
  ConflictRelationKey,
  ConflictRelationState,
  ConflictRole,
  ConflictScalarKey,
  ConflictState,
  ConflictStepResult,
  ConflictValidationError,
  ConflictValidationErrorCode,
  ConflictOutcome,
  RelationDelta,
  Result,
  StrategyProfile,
  TrajectoryMetrics,
  TrustExchangeActionId,
} from './dynamics';
