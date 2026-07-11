// tests/tom/legacy_decoder_v1.test.ts
//
// TOM-SPEC-0 legacy decoder contract: explicit trust/align/respect/dominance
// mapping, everything else retained as migration diagnostics only, decoder
// identity in provenance, fail-closed on unsupported shapes.

import { describe, expect, it } from 'vitest';
import {
  LEGACY_TOM_DECODER_ADAPTER_ID,
  LEGACY_TOM_DECODER_VERSION,
  decodeLegacyTomToOpponentBeliefV1,
} from '../../lib/tom/opponentBelief/legacyDecoder';
import { validateOpponentBeliefV1 } from '../../lib/tom/opponentBelief/serialization';

function legacyEntry(overrides: Record<string, unknown> = {}, traitOverrides: Record<string, unknown> = {}) {
  return {
    goals: { goalIds: [], weights: [] },
    traits: {
      trust: 0.8, align: 0.3, respect: 0.6, dominance: 0.4,
      bond: 0.9, fear: 0.7, conflict: 0.2, competence: 0.5,
      reliability: 0.5, obedience: 0.5, uncertainty: 0.5,
      ...traitOverrides,
    },
    uncertainty: 0.5,
    lastUpdatedTick: 3,
    lastInteractionTick: 3,
    ...overrides,
  };
}

describe('legacy ToM decoder V1', () => {
  it('maps exactly trust/align/respect/dominance and leaves the other axes at prior', () => {
    const result = decodeLegacyTomToOpponentBeliefV1({ entry: legacyEntry(), observerId: 'a', targetId: 'b', tick: 5 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Prior confidence is 0, so the first evidence value lands verbatim.
    expect(result.belief.estimates.trust.value).toBeCloseTo(0.8, 12);
    expect(result.belief.estimates.alignment.value).toBeCloseTo(0.3, 12);
    expect(result.belief.estimates.respect.value).toBeCloseTo(0.6, 12);
    expect(result.belief.estimates.dominance.value).toBeCloseTo(0.4, 12);
    expect(result.diagnostics.mappedAxes).toEqual(['trust', 'alignment', 'respect', 'dominance']);

    for (const axis of ['threat', 'support', 'attachment', 'predictability'] as const) {
      expect(result.belief.estimates[axis]).toMatchObject({ value: 0.5, confidence: 0, uncertainty: 1 });
    }
    expect(validateOpponentBeliefV1(result.belief).valid).toBe(true);
  });

  it('keeps unmapped legacy fields as migration diagnostics that cannot move estimates', () => {
    const base = decodeLegacyTomToOpponentBeliefV1({ entry: legacyEntry(), observerId: 'a', targetId: 'b', tick: 5 });
    const bondFlipped = decodeLegacyTomToOpponentBeliefV1({
      entry: legacyEntry({}, { bond: 0.1, fear: 0.0, conflict: 0.9 }),
      observerId: 'a', targetId: 'b', tick: 5,
    });
    expect(base.ok && bondFlipped.ok).toBe(true);
    if (!base.ok || !bondFlipped.ok) return;

    expect(bondFlipped.belief.estimates).toEqual(base.belief.estimates);
    const migration = base.evidence.payload.migration as { decoderId: string; decoderVersion: number; unmappedFields: Record<string, number> };
    expect(migration.decoderId).toBe(LEGACY_TOM_DECODER_ADAPTER_ID);
    expect(migration.decoderVersion).toBe(LEGACY_TOM_DECODER_VERSION);
    expect(Object.keys(migration.unmappedFields)).toEqual(
      ['bond', 'competence', 'conflict', 'fear', 'obedience', 'reliability', 'uncertainty'],
    );
    for (const axis of ['bond', 'fear', 'conflict', 'competence'] as const) {
      expect(axis in base.evidence.payload).toBe(false);
    }
  });

  it('derives reliability from certainty and evidence count with floor and ceiling', () => {
    const freshInit = decodeLegacyTomToOpponentBeliefV1({
      entry: legacyEntry({ evidenceCount: undefined }, { uncertainty: 1.0 }),
      observerId: 'a', targetId: 'b', tick: 5,
    });
    const certain = decodeLegacyTomToOpponentBeliefV1({
      entry: legacyEntry({ evidenceCount: 4 }, { uncertainty: 0 }),
      observerId: 'a', targetId: 'b', tick: 5,
    });
    const saturated = decodeLegacyTomToOpponentBeliefV1({
      entry: legacyEntry({ evidenceCount: 1e6 }, { uncertainty: 0 }),
      observerId: 'a', targetId: 'b', tick: 5,
    });
    expect(freshInit.ok && certain.ok && saturated.ok).toBe(true);
    if (!freshInit.ok || !certain.ok || !saturated.ok) return;
    expect(freshInit.diagnostics.reliability).toBeCloseTo(0.2, 12);
    expect(certain.diagnostics.reliability).toBeCloseTo(0.725, 12);
    expect(saturated.diagnostics.reliability).toBeLessThanOrEqual(0.8);
    expect(saturated.diagnostics.reliability).toBeGreaterThan(0.7999);
  });

  it('records decoder identity in the compatibility_prior provenance', () => {
    const result = decodeLegacyTomToOpponentBeliefV1({ entry: legacyEntry(), observerId: 'a', targetId: 'b', tick: 5 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.evidence.kind).toBe('compatibility_prior');
    expect(result.evidence.evidenceId).toBe('belief:evidence:legacy-tom:a:b');
    expect(result.evidence.provenance.adapterSteps).toEqual([{
      adapterId: 'legacy-tom-decoder', adapterVersion: 1, inputIds: ['tom_state:a:b'],
    }]);
    expect(result.evidence.tick).toBe(3);
  });

  it('fails closed on unsupported shapes and self-targets', () => {
    expect(decodeLegacyTomToOpponentBeliefV1({ entry: { views: { a: {} } }, observerId: 'a', targetId: 'b', tick: 5 }))
      .toEqual({ ok: false, code: 'unsupported_legacy_shape' });
    expect(decodeLegacyTomToOpponentBeliefV1({ entry: null, observerId: 'a', targetId: 'b', tick: 5 }))
      .toEqual({ ok: false, code: 'unsupported_legacy_shape' });
    expect(decodeLegacyTomToOpponentBeliefV1({ entry: legacyEntry(), observerId: 'a', targetId: 'a', tick: 5 }))
      .toEqual({ ok: false, code: 'self_target_forbidden' });
  });

  it('is deterministic', () => {
    const first = decodeLegacyTomToOpponentBeliefV1({ entry: legacyEntry(), observerId: 'a', targetId: 'b', tick: 5 });
    const second = decodeLegacyTomToOpponentBeliefV1({ entry: legacyEntry(), observerId: 'a', targetId: 'b', tick: 5 });
    expect(second).toEqual(first);
  });
});
