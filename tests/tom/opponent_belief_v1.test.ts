import { describe, expect, it } from 'vitest';
import { KANONAR_SYSTEM_VERSION } from '../../lib/goal-lab/versioning';
import { buildOpponentBeliefV1, projectOpponentBeliefToS5AtomsV1 } from '../../lib/tom/opponentBelief/builder';
import { decodeOpponentBeliefV1, encodeOpponentBeliefV1, validateOpponentBeliefV1 } from '../../lib/tom/opponentBelief/serialization';
import { updateOpponentBeliefV1 } from '../../lib/tom/opponentBelief/update';
import type { ObservationEnvelopeV1 } from '../../lib/scene/observation/types';

function observation(targetId: string, payload: Record<string, unknown>, id = `obs-${targetId}`): ObservationEnvelopeV1 {
  return {
    schemaVersion: 1, systemVersion: KANONAR_SYSTEM_VERSION, observationId: id,
    sceneId: 'scene', observerId: 'alice', subjectId: targetId, targetId,
    kind: 'relation_signal', payload,
    visibility: { ruleIds: ['r'], mode: 'private', allowedFields: Object.keys(payload) },
    reliability: 0.8, source: { sourceKind: 'relation', sourceId: id }, tick: 2,
    provenance: { sourceIds: [id], adapterSteps: [{ adapterId: 'test', adapterVersion: 1, inputIds: [id] }] },
  };
}

describe('OpponentBeliefV1', () => {
  it('builds only from directed visible observations and differentiates targets', () => {
    const observations = [observation('bob', { trust: 0.9, hidden: 0.1 }), observation('carol', { trust: 0.1 })];
    const bob = buildOpponentBeliefV1({ observerId: 'alice', targetId: 'bob', observations, tick: 2 });
    const carol = buildOpponentBeliefV1({ observerId: 'alice', targetId: 'carol', observations, tick: 2 });
    expect(bob.estimates.trust.value).toBe(0.9);
    expect(carol.estimates.trust.value).toBeCloseTo(0.1, 12);
    expect(bob.evidence).toHaveLength(1);
    expect(bob.estimates.threat.value).toBe(0.5);
  });

  it('is independent of input order and ignores non-approved payload fields', () => {
    const a = observation('bob', { trust: 0.8, secret: 'x' }, 'a');
    const b = observation('bob', { trust: 0.4 }, 'b');
    const first = buildOpponentBeliefV1({ observerId: 'alice', targetId: 'bob', observations: [a, b], tick: 2 });
    const second = buildOpponentBeliefV1({ observerId: 'alice', targetId: 'bob', observations: [{ ...a, payload: { trust: 0.8, secret: 'changed' } }, b].reverse(), tick: 2 });
    expect(second.estimates).toEqual(first.estimates);
  });

  it('projects exactly three S5 atoms per approved axis with provenance', () => {
    const belief = buildOpponentBeliefV1({ observerId: 'alice', targetId: 'bob', observations: [observation('bob', { trust: 0.9 })], tick: 2 });
    const atoms = projectOpponentBeliefToS5AtomsV1(belief);
    expect(atoms).toHaveLength(24);
    expect(atoms.filter(atom => atom.id.includes(':trust'))).toHaveLength(3);
    expect(atoms.every(atom => atom.subject === 'alice' && atom.target === 'bob' && atom.trace?.usedAtomIds.includes(belief.beliefId))).toBe(true);
  });

  it('does not apply the same evidence twice during incremental updates', () => {
    const belief = buildOpponentBeliefV1({ observerId: 'alice', targetId: 'bob', observations: [observation('bob', { trust: 0.9 })], tick: 2 });
    const repeated = updateOpponentBeliefV1(belief, belief.evidence, 3);
    expect(repeated.estimates).toEqual(belief.estimates);
    expect(repeated.evidence).toEqual(belief.evidence);
  });

  it('compacts evidence above the V1 retention limit without dangling references', () => {
    const observations = Array.from({ length: 257 }, (_, index) => observation('bob', { trust: index / 256 }, `obs-${String(index).padStart(3, '0')}`));
    const belief = buildOpponentBeliefV1({ observerId: 'alice', targetId: 'bob', observations, tick: 2 });
    expect(belief.evidence).toHaveLength(256);
    expect(belief.evidence.some(item => item.kind === 'compatibility_prior')).toBe(true);
    expect(validateOpponentBeliefV1(belief).valid).toBe(true);
  });

  it('round-trips semantically and rejects self-target beliefs', () => {
    const belief = buildOpponentBeliefV1({ observerId: 'alice', targetId: 'bob', observations: [observation('bob', { alignment: 0.7 })], tick: 2 });
    const decoded = decodeOpponentBeliefV1(encodeOpponentBeliefV1(belief));
    expect(decoded).toEqual({ ok: true, value: belief });
    const invalid = { ...belief, targetId: 'alice' };
    expect(validateOpponentBeliefV1(invalid).valid).toBe(false);
  });
});
