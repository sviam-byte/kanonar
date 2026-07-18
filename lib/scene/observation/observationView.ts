// R7-FOUNDATION-0 §3.2 observation-view-v1: a typed per-observer selector over
// an already-resolved ObservationResolutionV1. Thin by design — the resolver
// already computes per-observer envelopes under visibility rules; this contract
// only carves out one observer's view and fails closed on integrity violations,
// so a view can never carry another participant's envelopes or be served off an
// invalid resolution. Pure domain: nothing imports it at runtime.

import { codeUnitCompare } from '../../utils/compare';
import { decodeObservationEnvelopesV1 } from './resolver';
import { OBSERVATION_SCHEMA_VERSION } from './types';
import type { ObservationEnvelopeV1, ObservationResolutionV1 } from './types';

export const OBSERVATION_VIEW_SCHEMA_VERSION = 1 as const;

export interface ObservationViewV1 {
  readonly schemaVersion: typeof OBSERVATION_VIEW_SCHEMA_VERSION;
  readonly sceneId: string;
  readonly tick: number;
  readonly observerId: string;
  // Exactly the resolver's slot for this observer: every envelope's observerId
  // equals the view's observerId (enforced, not assumed), resolver order kept.
  readonly observations: readonly ObservationEnvelopeV1[];
}

export type ObservationViewErrorV1 =
  | { readonly code: 'invalid_resolution'; readonly message: string }
  | { readonly code: 'unknown_observer'; readonly observerId: string; readonly message: string }
  | { readonly code: 'foreign_envelope'; readonly observerId: string; readonly observationId: string; readonly message: string };

export type ObservationViewResultV1 =
  | { readonly ok: true; readonly value: ObservationViewV1 }
  | { readonly ok: false; readonly errors: readonly ObservationViewErrorV1[] };

export type ObservationViewsResultV1 =
  | { readonly ok: true; readonly value: readonly ObservationViewV1[] }
  | { readonly ok: false; readonly errors: readonly ObservationViewErrorV1[] };

function resolutionErrors(resolution: ObservationResolutionV1): ObservationViewErrorV1[] {
  const errors: ObservationViewErrorV1[] = [];
  if (resolution.schemaVersion !== OBSERVATION_SCHEMA_VERSION) {
    errors.push({ code: 'invalid_resolution', message: `unsupported resolution schema version ${String(resolution.schemaVersion)}` });
  }
  // A live resolveObservationsV1 result is always valid, but a persisted or
  // handcrafted resolution may not be — views are never served off one.
  if (!resolution.validation.valid) {
    errors.push({ code: 'invalid_resolution', message: 'resolution carries a failed validation report' });
  }
  if (!resolution.sceneId || !Number.isInteger(resolution.tick) || resolution.tick < 0) {
    errors.push({ code: 'invalid_resolution', message: 'resolution requires a non-empty sceneId and a non-negative integer tick' });
  }
  if (!resolution.observationsByCharacterId || typeof resolution.observationsByCharacterId !== 'object' || Array.isArray(resolution.observationsByCharacterId)) {
    errors.push({ code: 'invalid_resolution', message: 'resolution observations must be an observer-indexed object' });
  }
  return errors;
}

function selectSlot(
  resolution: ObservationResolutionV1,
  observerId: string,
): { slot: ObservationEnvelopeV1[]; errors: ObservationViewErrorV1[] } {
  const errors: ObservationViewErrorV1[] = [];
  if (!resolution.observationsByCharacterId || typeof resolution.observationsByCharacterId !== 'object' || Array.isArray(resolution.observationsByCharacterId)) {
    return { slot: [], errors: [{ code: 'invalid_resolution', message: 'resolution observations must be an observer-indexed object' }] };
  }
  if (!Object.hasOwn(resolution.observationsByCharacterId, observerId)) {
    errors.push({ code: 'unknown_observer', observerId, message: `resolution has no observer ${observerId}` });
    return { slot: [], errors };
  }
  const rawSlot: unknown = resolution.observationsByCharacterId[observerId];
  if (Array.isArray(rawSlot)) {
    for (const item of rawSlot) {
      if (item && typeof item === 'object' && 'observerId' in item && item.observerId !== observerId) {
        const observationId = 'observationId' in item && typeof item.observationId === 'string' ? item.observationId : '<unknown>';
        const foreignObserverId = typeof item.observerId === 'string' ? item.observerId : String(item.observerId);
        errors.push({
          code: 'foreign_envelope',
          observerId,
          observationId,
          message: `slot ${observerId} carries envelope ${observationId} for observer ${foreignObserverId}`,
        });
      }
    }
  }

  const decoded = decodeObservationEnvelopesV1(rawSlot, observerId);
  if (decoded.ok === false) {
    errors.push({
      code: 'invalid_resolution',
      message: `observer ${observerId} slot failed envelope decoding: ${decoded.validation.errors.map(error => `${error.code}:${error.path}`).join(',')}`,
    });
    return { slot: [], errors };
  }

  for (const envelope of decoded.value) {
    if (envelope.sceneId !== resolution.sceneId || envelope.tick !== resolution.tick) {
      errors.push({
        code: 'invalid_resolution',
        message: `envelope ${envelope.observationId} identity does not match resolution scene/tick`,
      });
    }
    const allowedFields = new Set(envelope.visibility.allowedFields);
    if (Object.keys(envelope.payload).some(field => !allowedFields.has(field))) {
      errors.push({
        code: 'invalid_resolution',
        message: `envelope ${envelope.observationId} payload exceeds its visibility allowlist`,
      });
    }
  }
  return { slot: errors.length === 0 ? structuredClone(decoded.value) : [], errors };
}

/**
 * Fail-closed selection of one observer's view. Fails on a resolution with a
 * bad schema version or failed validation, an observer the resolution does not
 * know, or a slot polluted with another observer's envelope.
 */
export function selectObservationViewV1(
  resolution: ObservationResolutionV1,
  observerId: string,
): ObservationViewResultV1 {
  const errors = resolutionErrors(resolution);
  const { slot, errors: slotErrors } = selectSlot(resolution, observerId);
  errors.push(...slotErrors);
  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      schemaVersion: OBSERVATION_VIEW_SCHEMA_VERSION,
      sceneId: resolution.sceneId,
      tick: resolution.tick,
      observerId,
      observations: slot,
    },
  };
}

/**
 * One view per resolved observer, sorted by observerId. All-or-nothing: a
 * single polluted slot fails the whole selection rather than dropping a view.
 */
export function selectAllObservationViewsV1(
  resolution: ObservationResolutionV1,
): ObservationViewsResultV1 {
  const errors = resolutionErrors(resolution);
  if (!resolution.observationsByCharacterId || typeof resolution.observationsByCharacterId !== 'object' || Array.isArray(resolution.observationsByCharacterId)) {
    return { ok: false, errors };
  }
  const observerIds = Object.keys(resolution.observationsByCharacterId).sort(codeUnitCompare);
  const views: ObservationViewV1[] = [];
  for (const observerId of observerIds) {
    const { slot, errors: slotErrors } = selectSlot(resolution, observerId);
    errors.push(...slotErrors);
    if (slotErrors.length === 0) {
      views.push({
        schemaVersion: OBSERVATION_VIEW_SCHEMA_VERSION,
        sceneId: resolution.sceneId,
        tick: resolution.tick,
        observerId,
        observations: slot,
      });
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: views };
}
