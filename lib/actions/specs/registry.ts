import type { ActionSchemaV1 } from './types';

/** 10 canonical schema candidates (Layer G). */
export const ACTION_SCHEMAS_V1: ActionSchemaV1[] = [
  { id: 'schema_move_to_safe_spot', label: 'Move to safe spot', intentIds: ['withdraw', 'seek_cover'], simActionKind: 'move', scoreBase: 0.08, scoreModifiers: [{ kind: 'constant', value: 0.04 }] },
  { id: 'schema_warn_target', label: 'Warn target', intentIds: ['warn_group'], simActionKind: 'talk', scoreBase: 0.05, scoreModifiers: [{ kind: 'constant', value: 0.02 }] },
  { id: 'schema_reassure_dialog', label: 'Reassure dialog', intentIds: ['reassure_target', 'clarify'], simActionKind: 'comfort', scoreBase: 0.06, scoreModifiers: [{ kind: 'constant', value: 0.01 }] },
  { id: 'schema_assist_physical', label: 'Assist physically', intentIds: ['assist_target', 'escort_target'], simActionKind: 'help', scoreBase: 0.06, scoreModifiers: [{ kind: 'constant', value: 0.02 }] },
  { id: 'schema_verify_by_question', label: 'Verify by question', intentIds: ['ask_fact'], simActionKind: 'question_about', scoreBase: 0.05, scoreModifiers: [{ kind: 'constant', value: 0.01 }] },
  { id: 'schema_verify_by_observation', label: 'Verify by observation', intentIds: ['observe_target'], simActionKind: 'observe', scoreBase: 0.04, scoreModifiers: [{ kind: 'constant', value: 0.02 }] },
  { id: 'schema_coordinate_plan', label: 'Coordinate plan', intentIds: ['coordinate'], simActionKind: 'negotiate', scoreBase: 0.05, scoreModifiers: [{ kind: 'constant', value: 0.01 }] },
  { id: 'schema_challenge_stance', label: 'Challenge stance', intentIds: ['challenge_target'], simActionKind: 'confront', scoreBase: 0.03, scoreModifiers: [{ kind: 'constant', value: 0.02 }] },
  { id: 'schema_issue_command', label: 'Issue command', intentIds: ['command_target'], simActionKind: 'command', scoreBase: 0.03, scoreModifiers: [{ kind: 'constant', value: 0.01 }] },
  { id: 'schema_pause_recover', label: 'Pause and recover', intentIds: ['pause'], simActionKind: 'wait', scoreBase: 0.05, scoreModifiers: [{ kind: 'constant', value: 0.02 }] },
];
