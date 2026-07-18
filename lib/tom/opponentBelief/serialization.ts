import { KANONAR_SYSTEM_VERSION } from '../../goal-lab/versioning';
import { codeUnitCompare } from '../../utils/compare';
import { APPROVED_BELIEF_KEYS_V1, OPPONENT_BELIEF_SCHEMA_VERSION, type BeliefPayloadV1, type OpponentBeliefV1, type SelfBeliefV1 } from './types';

export type BeliefValidationV1 = { valid: boolean; errors: Array<{ code: string; path: string }> };
export type OpponentBeliefValidationV1 = BeliefValidationV1;

const EVIDENCE_KINDS_V1 = new Set([
  'observation', 'relation_snapshot', 'role_status', 'faction_signal',
  'behavior_event', 'speech', 'scene_fact', 'compatibility_prior',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateBeliefPayloadV1(value: BeliefPayloadV1): BeliefValidationV1['errors'] {
  const errors: BeliefValidationV1['errors'] = [];
  const add = (code: string, path: string): void => { errors.push({ code, path }); };
  if (!value || typeof value !== 'object') return [{ code: 'invalid_payload', path: '$' }];
  if (!Array.isArray(value.evidence)) add('invalid_evidence', 'evidence');
  const evidenceIds = new Set<string>();
  if (Array.isArray(value.evidence)) {
    value.evidence.forEach((item, index) => {
      const path = `evidence.${index}`;
      if (!isRecord(item)) { add('invalid_evidence_item', path); return; }
      const evidenceId = typeof item.evidenceId === 'string' ? item.evidenceId : '';
      if (!evidenceId) add('invalid_evidence_id', `${path}.evidenceId`);
      else if (evidenceIds.has(evidenceId)) add('duplicate_evidence_id', `${path}.evidenceId`);
      else evidenceIds.add(evidenceId);
      if (item.schemaVersion !== 1) add('invalid_evidence_schema', `${path}.schemaVersion`);
      if (!EVIDENCE_KINDS_V1.has(String(item.kind ?? ''))) add('invalid_evidence_kind', `${path}.kind`);
      if (typeof item.observerId !== 'string' || !item.observerId) add('invalid_evidence_observer', `${path}.observerId`);
      if (typeof item.targetId !== 'string' || !item.targetId) add('invalid_evidence_target', `${path}.targetId`);
      if (!isRecord(item.payload)) add('invalid_evidence_payload', `${path}.payload`);
      if (!Number.isFinite(item.reliability) || Number(item.reliability) < 0 || Number(item.reliability) > 1) add('invalid_evidence_reliability', `${path}.reliability`);
      if (!Number.isInteger(item.tick) || Number(item.tick) < 0) add('invalid_evidence_tick', `${path}.tick`);
      const provenance = item.provenance;
      if (!isRecord(provenance)
        || !Array.isArray(provenance.sourceIds)
        || !provenance.sourceIds.every(sourceId => typeof sourceId === 'string' && sourceId.length > 0)
        || !Array.isArray(provenance.adapterSteps)) {
        add('invalid_evidence_provenance', `${path}.provenance`);
      }
    });
  }
  if (!Array.isArray(value.inferredGoals)) add('invalid_inferred_goals', 'inferredGoals');
  else value.inferredGoals.forEach((goal, index) => {
    if (!goal || typeof goal.goalId !== 'string' || !goal.goalId
      || !Number.isFinite(goal.probability) || goal.probability < 0 || goal.probability > 1
      || !Number.isFinite(goal.confidence) || goal.confidence < 0 || goal.confidence > 1
      || !Array.isArray(goal.evidenceIds)
      || goal.evidenceIds.some(id => !evidenceIds.has(id))) {
      add('invalid_inferred_goal', `inferredGoals.${index}`);
    }
  });
  if (!Array.isArray(value.predictedPolicy)) add('invalid_predicted_policy', 'predictedPolicy');
  else value.predictedPolicy.forEach((policy, index) => {
    if (!policy || typeof policy.actionCategory !== 'string' || !policy.actionCategory
      || !Number.isFinite(policy.probability) || policy.probability < 0 || policy.probability > 1
      || !Number.isFinite(policy.confidence) || policy.confidence < 0 || policy.confidence > 1
      || !Array.isArray(policy.evidenceIds)
      || policy.evidenceIds.some(id => !evidenceIds.has(id))) {
      add('invalid_predicted_policy_item', `predictedPolicy.${index}`);
    }
  });
  if (!value.estimates || typeof value.estimates !== 'object') add('invalid_estimates', 'estimates');
  for (const key of APPROVED_BELIEF_KEYS_V1) {
    const estimate = value.estimates?.[key];
    if (!estimate) { add('missing_axis', `estimates.${key}`); continue; }
    for (const field of ['value', 'confidence', 'uncertainty'] as const) if (!Number.isFinite(estimate[field]) || estimate[field] < 0 || estimate[field] > 1) add(`invalid_${field}`, `estimates.${key}.${field}`);
    if (!Number.isInteger(estimate.updatedAtTick) || estimate.updatedAtTick < 0) add('invalid_estimate_tick', `estimates.${key}.updatedAtTick`);
    if (!Array.isArray(estimate.evidenceIds)) add('invalid_evidence_ids', `estimates.${key}.evidenceIds`);
    else estimate.evidenceIds.forEach((id, index) => { if (!evidenceIds.has(id)) add('invalid_evidence_reference', `estimates.${key}.evidenceIds[${index}]`); });
  }
  const confidence = APPROVED_BELIEF_KEYS_V1.reduce((sum, key) => sum + (value.estimates?.[key]?.confidence ?? 0), 0) / APPROVED_BELIEF_KEYS_V1.length;
  const uncertainty = APPROVED_BELIEF_KEYS_V1.reduce((sum, key) => sum + (value.estimates?.[key]?.uncertainty ?? 0), 0) / APPROVED_BELIEF_KEYS_V1.length;
  if (!value.summary
    || !Number.isFinite(value.summary.confidence)
    || value.summary.confidence < 0
    || value.summary.confidence > 1
    || !Number.isFinite(value.summary.uncertainty)
    || value.summary.uncertainty < 0
    || value.summary.uncertainty > 1) {
    add('invalid_summary', 'summary');
  } else if (Math.abs(confidence - value.summary.confidence) > 1e-12 || Math.abs(uncertainty - value.summary.uncertainty) > 1e-12) {
    add('summary_mismatch', 'summary');
  }
  if (!Number.isInteger(value.updatedAtTick) || value.updatedAtTick < 0) add('invalid_updated_at_tick', 'updatedAtTick');
  return errors;
}

export function validateOpponentBeliefV1(value: OpponentBeliefV1): OpponentBeliefValidationV1 {
  const errors = validateBeliefPayloadV1(value);
  if (!value || typeof value !== 'object') return { valid: false, errors };
  const add = (code: string, path: string): void => { errors.push({ code, path }); };
  if (value.schemaVersion !== OPPONENT_BELIEF_SCHEMA_VERSION) add('invalid_schema_version', 'schemaVersion');
  if (value.systemVersion !== KANONAR_SYSTEM_VERSION) add('invalid_system_version', 'systemVersion');
  if (!value.observerId || !value.targetId || value.observerId === value.targetId) add('self_target_forbidden', 'targetId');
  if (value.beliefId !== `belief:opponent:${value.observerId}:${value.targetId}`) add('invalid_belief_id', 'beliefId');
  return { valid: errors.length === 0, errors };
}

export function validateSelfBeliefV1(value: SelfBeliefV1): BeliefValidationV1 {
  const errors = validateBeliefPayloadV1(value);
  if (!value || typeof value !== 'object') return { valid: false, errors };
  const add = (code: string, path: string): void => { errors.push({ code, path }); };
  if (value.schemaVersion !== OPPONENT_BELIEF_SCHEMA_VERSION) add('invalid_schema_version', 'schemaVersion');
  if (value.systemVersion !== KANONAR_SYSTEM_VERSION) add('invalid_system_version', 'systemVersion');
  if (!value.participantId) add('empty_participant_id', 'participantId');
  if (value.beliefId !== `belief:self:${value.participantId}`) add('invalid_belief_id', 'beliefId');
  return { valid: errors.length === 0, errors };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => codeUnitCompare(a, b)).map(([key, item]) => [key, canonicalize(item)]));
  return value;
}

export function encodeOpponentBeliefV1(value: OpponentBeliefV1): string {
  const validation = validateOpponentBeliefV1(value);
  if (!validation.valid) throw new Error(`invalid_opponent_belief:${validation.errors.map(item => item.code).join(',')}`);
  return JSON.stringify(canonicalize(value));
}

export function decodeOpponentBeliefV1(serialized: string): { ok: true; value: OpponentBeliefV1 } | { ok: false; errors: OpponentBeliefValidationV1['errors'] } {
  let value: OpponentBeliefV1;
  try { value = JSON.parse(serialized) as OpponentBeliefV1; }
  catch { return { ok: false, errors: [{ code: 'invalid_json', path: '$' }] }; }
  const validation = validateOpponentBeliefV1(value);
  return validation.valid ? { ok: true, value } : { ok: false, errors: validation.errors };
}

export function encodeSelfBeliefV1(value: SelfBeliefV1): string {
  const validation = validateSelfBeliefV1(value);
  if (!validation.valid) throw new Error(`invalid_self_belief:${validation.errors.map(item => item.code).join(',')}`);
  return JSON.stringify(canonicalize(value));
}

export function decodeSelfBeliefV1(serialized: string): { ok: true; value: SelfBeliefV1 } | { ok: false; errors: BeliefValidationV1['errors'] } {
  let value: SelfBeliefV1;
  try { value = JSON.parse(serialized) as SelfBeliefV1; }
  catch { return { ok: false, errors: [{ code: 'invalid_json', path: '$' }] }; }
  const validation = validateSelfBeliefV1(value);
  return validation.valid ? { ok: true, value } : { ok: false, errors: validation.errors };
}
