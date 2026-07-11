import { KANONAR_SYSTEM_VERSION } from '../../goal-lab/versioning';
import { codeUnitCompare } from '../../utils/compare';
import { APPROVED_BELIEF_KEYS_V1, OPPONENT_BELIEF_SCHEMA_VERSION, type OpponentBeliefV1 } from './types';

export type OpponentBeliefValidationV1 = { valid: boolean; errors: Array<{ code: string; path: string }> };

export function validateOpponentBeliefV1(value: OpponentBeliefV1): OpponentBeliefValidationV1 {
  const errors: Array<{ code: string; path: string }> = [];
  const add = (code: string, path: string): void => { errors.push({ code, path }); };
  if (value.schemaVersion !== OPPONENT_BELIEF_SCHEMA_VERSION) add('invalid_schema_version', 'schemaVersion');
  if (value.systemVersion !== KANONAR_SYSTEM_VERSION) add('invalid_system_version', 'systemVersion');
  if (!value.observerId || !value.targetId || value.observerId === value.targetId) add('self_target_forbidden', 'targetId');
  if (value.beliefId !== `belief:opponent:${value.observerId}:${value.targetId}`) add('invalid_belief_id', 'beliefId');
  const evidenceIds = new Set(value.evidence.map(item => item.evidenceId));
  for (const key of APPROVED_BELIEF_KEYS_V1) {
    const estimate = value.estimates[key];
    if (!estimate) { add('missing_axis', `estimates.${key}`); continue; }
    for (const field of ['value', 'confidence', 'uncertainty'] as const) if (!Number.isFinite(estimate[field]) || estimate[field] < 0 || estimate[field] > 1) add(`invalid_${field}`, `estimates.${key}.${field}`);
    estimate.evidenceIds.forEach((id, index) => { if (!evidenceIds.has(id)) add('invalid_evidence_reference', `estimates.${key}.evidenceIds[${index}]`); });
  }
  const confidence = APPROVED_BELIEF_KEYS_V1.reduce((sum, key) => sum + (value.estimates[key]?.confidence ?? 0), 0) / APPROVED_BELIEF_KEYS_V1.length;
  const uncertainty = APPROVED_BELIEF_KEYS_V1.reduce((sum, key) => sum + (value.estimates[key]?.uncertainty ?? 0), 0) / APPROVED_BELIEF_KEYS_V1.length;
  if (Math.abs(confidence - value.summary.confidence) > 1e-12 || Math.abs(uncertainty - value.summary.uncertainty) > 1e-12) add('summary_mismatch', 'summary');
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
