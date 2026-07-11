// tests/tom/opponent_belief_oracles.test.ts
//
// TOM-SPEC-0 required oracle pair, end-to-end through the observation
// boundary: scene -> resolver -> belief builder -> S5 projection.
//
//   Hidden-field non-interference: changing target truth the observer's
//   allowlist withholds must not move the belief or its atoms.
//   Visible sensitivity: different allowed evidence for different targets
//   must produce different beliefs (opponent-sensitivity matrix, 1 x 5).

import { describe, expect, it } from 'vitest';
import { KANONAR_SYSTEM_VERSION } from '../../lib/goal-lab/versioning';
import { buildOpponentBeliefV1, projectOpponentBeliefToS5AtomsV1 } from '../../lib/tom/opponentBelief/builder';
import { decodeOpponentBeliefV1, encodeOpponentBeliefV1 } from '../../lib/tom/opponentBelief/serialization';
import { resolveObservationsV1 } from '../../lib/scene/observation/resolver';
import type { ContextAtom } from '../../lib/context/v2/types';
import type { ObservationProvenanceV1, ResolvedSceneInputV1, SceneEventInputV1, VisibilityRuleV1 } from '../../lib/scene/observation/types';

const provenance = (id: string): ObservationProvenanceV1 => ({ sourceIds: [id], adapterSteps: [{ adapterId: 'oracle-test', adapterVersion: 1, inputIds: [id] }] });

function rule(id: string, allow: string[], observerIds?: string[]): VisibilityRuleV1 {
  return { ruleId: id, mode: observerIds ? 'observer_list' : 'participants', observerIds, fieldAllowlist: allow, provenance: provenance(id) };
}

function relationEvent(targetId: string, payload: Record<string, unknown>, eventId: string): SceneEventInputV1 {
  return {
    eventId, kind: 'relation_signal', tick: 2, actorId: targetId, targetIds: [targetId],
    payload, visibilityRuleIds: ['signals'], baseReliability: 0.8, provenance: provenance(eventId),
  };
}

function matrixScene(targets: Array<{ id: string; trust: number; hidden?: unknown }>): ResolvedSceneInputV1 {
  return {
    schemaVersion: 1, systemVersion: KANONAR_SYSTEM_VERSION, sceneId: 'oracle-scene',
    sourceRefs: [{ kind: 'test', id: 'oracle' }], seed: 11, tick: 2,
    cast: [
      { agentId: 'observer', roleIds: ['witness'], roleVisibility: rule('role-observer', ['roleIds']) },
      ...targets.map(target => ({ agentId: target.id, roleIds: ['stranger'], roleVisibility: rule(`role-${target.id}`, ['roleIds']) })),
    ],
    povAgentIds: ['observer'],
    placements: [
      { agentId: 'observer', locationId: 'hall', x: 0, y: 0, provenance: provenance('p-observer') },
      ...targets.map((target, index) => ({ agentId: target.id, locationId: 'hall', x: index + 1, y: 0, provenance: provenance(`p-${target.id}`) })),
    ],
    events: targets.map(target => relationEvent(target.id, { trust: target.trust, hiddenPlan: target.hidden ?? 'none' }, `signal-${target.id}`)),
    relationLayers: [], knowledge: [],
    // hiddenPlan is deliberately absent from the allowlist.
    visibilityRules: [rule('signals', ['trust'])],
    tags: ['oracle'],
  };
}

function atomSemantics(atoms: ContextAtom[]) {
  return atoms
    .map(atom => ({
      id: String(atom.id), magnitude: atom.magnitude, confidence: atom.confidence,
      usedAtomIds: [...(atom.trace?.usedAtomIds ?? [])].map(String).sort(),
    }))
    .sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}

function beliefFor(scene: ResolvedSceneInputV1, targetId: string) {
  const resolution = resolveObservationsV1(scene);
  if (!resolution.ok) throw new Error('oracle fixture failed validation');
  return buildOpponentBeliefV1({
    observerId: 'observer', targetId,
    observations: resolution.value.observationsByCharacterId.observer,
    tick: scene.tick,
  });
}

describe('OpponentBelief oracles (scene -> resolver -> builder -> S5)', () => {
  it('hidden-field non-interference: withheld target truth cannot move the belief', () => {
    const targets = [{ id: 'target1', trust: 0.7, hidden: 'loyal' }];
    const baseline = beliefFor(matrixScene(targets), 'target1');
    const mutated = beliefFor(matrixScene([{ id: 'target1', trust: 0.7, hidden: 'planning-betrayal' }]), 'target1');

    expect(mutated.estimates).toEqual(baseline.estimates);
    expect(encodeOpponentBeliefV1(mutated)).toBe(encodeOpponentBeliefV1(baseline));
    expect(atomSemantics(projectOpponentBeliefToS5AtomsV1(mutated)))
      .toEqual(atomSemantics(projectOpponentBeliefToS5AtomsV1(baseline)));
  });

  it('opponent-sensitivity matrix: one observer, five strangers, five different beliefs', () => {
    const targets = [
      { id: 'target1', trust: 0.1 }, { id: 'target2', trust: 0.3 }, { id: 'target3', trust: 0.5 },
      { id: 'target4', trust: 0.7 }, { id: 'target5', trust: 0.9 },
    ];
    const scene = matrixScene(targets);
    const beliefs = targets.map(target => beliefFor(scene, target.id));

    const trustValues = beliefs.map(belief => belief.estimates.trust.value);
    expect(new Set(trustValues).size).toBe(5);

    const finalTrustMagnitudes = beliefs.map(belief => {
      const atoms = projectOpponentBeliefToS5AtomsV1(belief);
      return atoms.find(atom => atom.id === `tom:belief:final:observer:${belief.targetId}:trust`)?.magnitude;
    });
    expect(new Set(finalTrustMagnitudes).size).toBe(5);

    // Each belief's ledger is directed at its own target, and the trust
    // signal comes only from that target's own observation.
    for (const belief of beliefs) {
      expect(belief.evidence.length).toBeGreaterThan(0);
      for (const item of belief.evidence) expect(item.targetId).toBe(belief.targetId);
      const relationEvidence = belief.evidence.filter(item => item.kind === 'relation_snapshot');
      expect(relationEvidence).toHaveLength(1);
      expect(relationEvidence[0].observationId).toContain(`signal-${belief.targetId}`);
    }
  });

  it('replay: encode -> decode -> project equals the pre-encode projection', () => {
    const belief = beliefFor(matrixScene([{ id: 'target1', trust: 0.7 }]), 'target1');
    const decoded = decodeOpponentBeliefV1(encodeOpponentBeliefV1(belief));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(atomSemantics(projectOpponentBeliefToS5AtomsV1(decoded.value)))
      .toEqual(atomSemantics(projectOpponentBeliefToS5AtomsV1(belief)));
  });
});
