export {
  CONFLICT_CHOICE_POLICY_ID,
  CONFLICT_CHOICE_POLICY_VERSION,
  CONFLICT_CHOICE_TRACE_SCHEMA_VERSION,
  CONFLICT_JOINT_DECISION_SCHEMA_VERSION,
  type ConflictChoiceTraceV1,
  type ConflictGoalEnergySourceV1,
  type ConflictIntegrationError,
  type ConflictJointDecisionArgsV1,
  type ConflictJointDecisionReportV1,
  type ConflictPlayerDecisionInputV1,
  type ConflictRankedCandidateTraceV1,
  type ConflictTemperatureSource,
} from './types';
export {
  CONFLICT_BELIEF_MODULATION_VERSION,
  CONFLICT_IMPACT_GOAL_MATRIX_V1,
  CONFLICT_IMPACT_GOAL_MATRIX_VERSION,
  buildConflictPossibilities,
  conflictDeltaGoalsV1,
  readConflictBeliefSignals,
  type ConflictBeliefSignals,
} from './candidateBridge';
export { runConflictJointDecisionV1 } from './decisionProvider';
// NKERNEL-SESSION-0 wiring surface: the N lanes are callable from here, but
// nothing dispatches into them by default — runConflictLabSessionV1 below and
// the UI stay dyadic (NKERNEL_FOUNDATION_0 §3.6, "за parity-gate, никогда default").
export {
  CONFLICT_NJOINT_DECISION_SCHEMA_VERSION,
  runConflictNJointDecisionV1,
  type ConflictNIntegrationErrorV1,
  type ConflictNJointDecisionArgsV1,
  type ConflictNJointDecisionReportV1,
} from './ndecisionProvider';
export {
  CONFLICT_TARGET_MATRIX_DECISION_SCHEMA_VERSION,
  runConflictTargetMatrixDecisionV1,
  type ConflictDecisionRngV1,
  type ConflictTargetDecisionRngInputV1,
  type ConflictTargetMatrixDecisionArgsV1,
  type ConflictTargetMatrixDecisionReportV1,
  type ConflictTargetMatrixIntegrationErrorV1,
  type ConflictTargetMatrixPlayerDecisionInputV1,
} from './targetMatrixDecisionProvider';
export {
  CONFLICT_NLIVE_SESSION_SCHEMA_VERSION,
  buildCanonicalInitialStateNV1,
  runConflictNLabSessionV1,
  worldForTickNV1,
  type ConflictNLabSessionConfigV1,
  type ConflictNLabSessionErrorV1,
  type ConflictNLabSessionReportV1,
} from './nliveSession';
export {
  CONFLICT_TARGET_MATRIX_LIVE_SESSION_SCHEMA_VERSION,
  runConflictTargetMatrixLabSessionV1,
  type ConflictTargetMatrixLabSessionConfigV1,
  type ConflictTargetMatrixLabSessionErrorV1,
  type ConflictTargetMatrixLabSessionReportV1,
} from './ntargetLiveSession';
export { CONFLICT_LIVE_SESSION_SCHEMA_VERSION, runConflictLabSessionV1 } from './liveSession';
export {
  CONFLICT_PARITY_EVIDENCE_SCHEMA_VERSION,
  aggregateConflictParityEvidenceV1,
  extractConflictParityRecordV1,
  isConflictChoiceTraceCompleteV1,
  rankPairConcordanceV1,
  type ConflictParityAggregateV1,
  type ConflictParityDecisionRecordV1,
  type ConflictParityDivergenceExampleV1,
  type ConflictParityMetaV1,
  type ConflictParityPlayerRecordV1,
} from './paritySweep';
