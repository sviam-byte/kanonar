// lib/tom/opponentBelief/legacyDecoder.ts
//
// TOM-SPEC-0 legacy decoder: one directed `world.tom[observer][target]`
// TomEntry becomes a single compatibility_prior evidence item applied to the
// neutral prior. Only the four axes with a direct legacy counterpart are
// mapped (trust, align->alignment, respect, dominance); everything else is
// retained as migration diagnostics and can never reach an estimate. The
// decoder reads nothing beyond the passed entry — no world, no target truth.

import { FC } from '../../config/formulaConfig';
import { codeUnitCompare } from '../../utils/compare';
import { makeNeutralOpponentBeliefPriorV1 } from './builder';
import { updateOpponentBeliefV1 } from './update';
import type { ApprovedBeliefKeyV1, BeliefEvidenceV1, OpponentBeliefV1 } from './types';

export const LEGACY_TOM_DECODER_ADAPTER_ID = 'legacy-tom-decoder';
export const LEGACY_TOM_DECODER_VERSION = 1;

// Approved legacy mapping table (TOM-SPEC-0: no label aliasing beyond this).
const LEGACY_TRAIT_TO_AXIS: ReadonlyArray<readonly [legacyField: string, axis: ApprovedBeliefKeyV1]> = [
  ['trust', 'trust'],
  ['align', 'alignment'],
  ['respect', 'respect'],
  ['dominance', 'dominance'],
];

export type LegacyTomDecodeOkV1 = {
  ok: true;
  belief: OpponentBeliefV1;
  evidence: BeliefEvidenceV1;
  diagnostics: {
    mappedAxes: ApprovedBeliefKeyV1[];
    unmappedFields: Record<string, number>;
    reliability: number;
  };
};

export type LegacyTomDecodeErrV1 = {
  ok: false;
  code: 'unsupported_legacy_shape' | 'self_target_forbidden';
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

function decodeReliability(traits: Record<string, unknown>, entry: Record<string, unknown>): number {
  const cfg = FC.opponentBeliefV1.legacyDecoder;
  const rawUncertainty = typeof traits.uncertainty === 'number' && Number.isFinite(traits.uncertainty)
    ? traits.uncertainty
    : typeof entry.uncertainty === 'number' && Number.isFinite(entry.uncertainty)
      ? entry.uncertainty
      : 1;
  const certainty = 1 - clamp01(rawUncertainty);
  const evidenceCount = typeof entry.evidenceCount === 'number' && Number.isFinite(entry.evidenceCount)
    ? Math.max(0, entry.evidenceCount)
    : 0;
  const raw = cfg.reliabilityFloor
    + cfg.certaintyWeight * certainty
    + cfg.evidenceCountWeight * (evidenceCount / (evidenceCount + cfg.evidenceCountHalfPoint));
  return Math.max(cfg.reliabilityFloor, Math.min(cfg.reliabilityCeiling, raw));
}

export function decodeLegacyTomToOpponentBeliefV1(args: {
  entry: unknown;
  observerId: string;
  targetId: string;
  tick: number;
}): LegacyTomDecodeOkV1 | LegacyTomDecodeErrV1 {
  if (!args.observerId || !args.targetId || args.observerId === args.targetId) {
    return { ok: false, code: 'self_target_forbidden' };
  }
  // Only the root TomEntry shape is supported; `views`/V3 report decoding is
  // explicitly deferred (unknown shapes fail closed, no best-effort parsing).
  const entry = args.entry as Record<string, unknown> | null | undefined;
  const traits = entry && typeof entry === 'object' ? entry.traits as Record<string, unknown> | undefined : undefined;
  if (!traits || typeof traits !== 'object' || Array.isArray(traits)) {
    return { ok: false, code: 'unsupported_legacy_shape' };
  }

  const mappedAxes: ApprovedBeliefKeyV1[] = [];
  const axisPayload: Record<string, number> = {};
  for (const [legacyField, axis] of LEGACY_TRAIT_TO_AXIS) {
    const value = traits[legacyField];
    if (typeof value === 'number' && Number.isFinite(value)) {
      axisPayload[axis] = clamp01(value);
      mappedAxes.push(axis);
    }
  }

  const mappedLegacyFields = new Set(LEGACY_TRAIT_TO_AXIS.map(([legacyField]) => legacyField));
  const unmappedFields: Record<string, number> = {};
  for (const key of Object.keys(traits).sort(codeUnitCompare)) {
    const value = traits[key];
    if (!mappedLegacyFields.has(key) && typeof value === 'number' && Number.isFinite(value)) {
      unmappedFields[key] = value;
    }
  }

  const reliability = decodeReliability(traits, entry as Record<string, unknown>);
  const lastUpdatedTick = typeof entry.lastUpdatedTick === 'number' && Number.isFinite(entry.lastUpdatedTick)
    ? entry.lastUpdatedTick
    : 0;
  const sourceId = `tom_state:${args.observerId}:${args.targetId}`;
  const evidence: BeliefEvidenceV1 = {
    schemaVersion: 1,
    evidenceId: `belief:evidence:legacy-tom:${args.observerId}:${args.targetId}`,
    kind: 'compatibility_prior',
    observerId: args.observerId,
    targetId: args.targetId,
    payload: {
      ...axisPayload,
      migration: {
        decoderId: LEGACY_TOM_DECODER_ADAPTER_ID,
        decoderVersion: LEGACY_TOM_DECODER_VERSION,
        unmappedFields,
      },
    },
    reliability,
    tick: Math.min(lastUpdatedTick, args.tick),
    provenance: {
      sourceIds: [sourceId],
      adapterSteps: [{
        adapterId: LEGACY_TOM_DECODER_ADAPTER_ID,
        adapterVersion: LEGACY_TOM_DECODER_VERSION,
        inputIds: [sourceId],
      }],
    },
  };

  const prior = makeNeutralOpponentBeliefPriorV1(args);
  const belief = updateOpponentBeliefV1(prior, [evidence], args.tick);
  return { ok: true, belief, evidence, diagnostics: { mappedAxes, unmappedFields, reliability } };
}
