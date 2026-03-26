import type { IntentSpecV1 } from './types';

/** 13 canonical intents for Layer F (additive, migration-safe). */
export const INTENT_SPECS_V1: IntentSpecV1[] = [
  { id: 'withdraw', label: 'Withdraw', description: 'Increase distance from risk.', allowedGoalIds: ['reduce_self_threat', 'restore_self_control', 'deescalate_interaction'], scoreBase: 0.06, scoreModifiers: [{ kind: 'weighted_metric', metric: 'hazard', weight: 0.8, clamp: [0, 1.2] }] },
  { id: 'seek_cover', label: 'Seek Cover', description: 'Find safer position.', allowedGoalIds: ['reduce_self_threat'], scoreBase: 0.08, scoreModifiers: [{ kind: 'weighted_metric', metric: 'hazard', weight: 1.0, clamp: [0, 1.3] }] },
  { id: 'warn_group', label: 'Warn Group', description: 'Notify others about danger.', allowedGoalIds: ['reduce_self_threat', 'preserve_cooperation'], scoreBase: 0.02, scoreModifiers: [{ kind: 'weighted_appraisal', tag: 'danger_to_other', weight: 0.8, clamp: [0, 1.0] }] },
  { id: 'reassure_target', label: 'Reassure', description: 'Lower target distress.', allowedGoalIds: ['stabilize_other', 'maintain_trust_signal'], scoreBase: 0.06, scoreModifiers: [{ kind: 'weighted_metric', metric: 'closeness', weight: 0.4, clamp: [0, 0.6] }] },
  { id: 'assist_target', label: 'Assist', description: 'Provide practical support.', allowedGoalIds: ['stabilize_other', 'preserve_cooperation'], scoreBase: 0.05, scoreModifiers: [{ kind: 'weighted_metric', metric: 'dependency', weight: 0.6, clamp: [0, 0.8] }] },
  { id: 'escort_target', label: 'Escort', description: 'Move with target to safer position.', allowedGoalIds: ['stabilize_other'], scoreBase: 0.04, scoreModifiers: [{ kind: 'weighted_appraisal', tag: 'target_distress', weight: 0.7, clamp: [0, 1.0] }] },
  { id: 'ask_fact', label: 'Ask Fact', description: 'Query target for verification.', allowedGoalIds: ['verify_claim'], scoreBase: 0.04, scoreModifiers: [{ kind: 'weighted_metric', metric: 'uncertainty', weight: 0.8, clamp: [0, 1.0] }] },
  { id: 'observe_target', label: 'Observe', description: 'Collect evidence by observation.', allowedGoalIds: ['verify_claim'], scoreBase: 0.03, scoreModifiers: [{ kind: 'weighted_metric', metric: 'uncertainty', weight: 0.65, clamp: [0, 0.9] }] },
  { id: 'clarify', label: 'Clarify', description: 'Repair ambiguity in communication.', allowedGoalIds: ['preserve_cooperation', 'maintain_trust_signal'], scoreBase: 0.03, scoreModifiers: [{ kind: 'weighted_appraisal', tag: 'relationship_strain', weight: 0.6, clamp: [0, 0.8] }] },
  { id: 'coordinate', label: 'Coordinate', description: 'Align short-term plans.', allowedGoalIds: ['preserve_cooperation'], scoreBase: 0.03, scoreModifiers: [{ kind: 'weighted_metric', metric: 'utility_of_target', weight: 0.6, clamp: [0, 0.8] }] },
  { id: 'challenge_target', label: 'Challenge', description: 'Assertively oppose target.', allowedGoalIds: ['confront_threat_source', 'protect_status_position'], scoreBase: 0.02, scoreModifiers: [{ kind: 'weighted_appraisal', tag: 'target_as_threat', weight: 0.9, clamp: [0, 1.2] }] },
  { id: 'command_target', label: 'Command', description: 'Issue directive to target.', allowedGoalIds: ['protect_status_position'], scoreBase: 0.01, scoreModifiers: [{ kind: 'weighted_metric', metric: 'authority', weight: 0.8, clamp: [0, 0.9] }] },
  { id: 'pause', label: 'Pause', description: 'Stop and regulate self.', allowedGoalIds: ['restore_self_control', 'recover_resources'], scoreBase: 0.05, scoreModifiers: [{ kind: 'weighted_metric', metric: 'self_fatigue', weight: 0.75, clamp: [0, 1.0] }] },
];
