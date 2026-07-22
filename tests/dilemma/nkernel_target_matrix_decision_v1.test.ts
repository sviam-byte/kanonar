import { describe, expect, it } from 'vitest';

import type { ContextAtom } from '../../lib/context/v2/types';
import { runConflictJointDecisionV1 } from '../../lib/dilemma/integration/decisionProvider';
import { runConflictTargetMatrixDecisionV1 } from '../../lib/dilemma/integration/targetMatrixDecisionProvider';
import { conflictDirectedOutcomeToDyadicV1 } from '../../lib/dilemma/nkernel/ntargetstep';
import {
  asKernelConflictStateV1,
  buildTrustExchangeProtocolNV1,
  participantSetFromConflictPlayersV1,
  trustExchangeDefinitionNV1,
} from '../../lib/dilemma/nkernel/nstate';
import { KANONAR_SYSTEM_VERSION } from '../../lib/goal-lab/versioning';
import { adaptResolvedSceneToGoalLabV1 } from '../../lib/scene/adapters/goalLab';
import { resolveObservationsV1 } from '../../lib/scene/observation/resolver';
import type { ObservationProvenanceV1, ResolvedSceneInputV1, VisibilityRuleV1 } from '../../lib/scene/observation/types';
import { mockAgent, mockWorld } from '../pipeline/fixtures';
import { makeStateN } from './nkernelFixtures';

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const provenance = (id: string): ObservationProvenanceV1 => ({
  sourceIds: [id], adapterSteps: [{ adapterId: 'target-matrix-decision-test', adapterVersion: 1, inputIds: [id] }],
});

function rule(id: string): VisibilityRuleV1 {
  return { ruleId: id, mode: 'participants', fieldAllowlist: ['roleIds'], provenance: provenance(id) };
}

function scene(playerIds: readonly string[]): ResolvedSceneInputV1 {
  return {
    schemaVersion: 1, systemVersion: KANONAR_SYSTEM_VERSION, sceneId: 'target-matrix-decision',
    sourceRefs: [{ kind: 'test', id: 'target-matrix-decision' }], seed: 17, tick: 0,
    cast: playerIds.map((id) => ({ agentId: id, roleIds: ['participant'], roleVisibility: rule(`role-${id}`) })),
    povAgentIds: [...playerIds],
    placements: playerIds.map((id, index) => ({ agentId: id, locationId: 'loc:test', x: index, y: 0, provenance: provenance(`place-${id}`) })),
    events: [], relationLayers: [], knowledge: [], visibilityRules: [], tags: ['target-matrix-decision'],
  };
}

function inputs(
  playerIds: readonly string[],
  seeds: Readonly<Record<string, Readonly<Record<string, number>>>>,
  extraAtoms: readonly ContextAtom[] = [],
) {
  const source = scene(playerIds);
  const observed = resolveObservationsV1(source);
  if (observed.ok === false) throw new Error('scene validation failed');
  const projection = adaptResolvedSceneToGoalLabV1(source, observed.value);
  const players: Record<string, any> = {};
  for (const actorId of playerIds) {
    const world = mockWorld(playerIds.map((id) => mockAgent(id)));
    (world as any).observations = projection.observations;
    (world as any).sceneSnapshot = projection.sceneSnapshot;
    (world as any).resolvedObservations = projection.observationEnvelopes;
    const rngByTarget: Record<string, any> = {};
    for (const targetId of playerIds) {
      if (targetId === actorId) continue;
      rngByTarget[targetId] = {
        rng: lcg(seeds[actorId][targetId]),
        rngChannelId: `test:target:${actorId}:${targetId}`,
      };
    }
    players[actorId] = {
      pipelineInput: {
        world, agentId: actorId, participantIds: [...playerIds], observeLiteParams: { seed: 1234 },
        manualAtoms: [...projection.observationAtoms, ...extraAtoms],
      },
      rngByTarget,
    };
  }
  return players;
}

function setup(playerIds: readonly string[]) {
  const set = participantSetFromConflictPlayersV1(playerIds);
  if (set.ok === false) throw new Error('participant set failed');
  const definition = trustExchangeDefinitionNV1(set.value);
  if (definition.ok === false) throw new Error('definition failed');
  return { definition: definition.value, protocol: buildTrustExchangeProtocolNV1(set.value) };
}

describe('conflict-target-matrix-decision-v1', () => {
  it('N=2 preserves overlapping dyadic choice, transition, reference, and divergence semantics', () => {
    const ids = ['a', 'b'];
    const seeds = { a: { b: 101 }, b: { a: 202 } };
    const dyadicInputs = inputs(ids, seeds);
    const dyadic = runConflictJointDecisionV1({
      state: asKernelConflictStateV1(makeStateN(2)),
      players: {
        a: { pipelineInput: dyadicInputs.a.pipelineInput, ...dyadicInputs.a.rngByTarget.b },
        b: { pipelineInput: dyadicInputs.b.pipelineInput, ...dyadicInputs.b.rngByTarget.a },
      },
    });
    const configured = setup(ids);
    const matrix = runConflictTargetMatrixDecisionV1({
      state: makeStateN(2), ...configured, players: inputs(ids, seeds),
    });
    if (dyadic.ok === false || matrix.ok === false) throw new Error('expected both providers to succeed');

    expect(matrix.value.choices.a.b).toEqual(dyadic.value.choices.a);
    expect(matrix.value.choices.b.a).toEqual(dyadic.value.choices.b);
    expect(matrix.value.canonical.actionMatrix.actionsByActorTarget).toEqual({
      a: { b: dyadic.value.canonical.actions.a }, b: { a: dyadic.value.canonical.actions.b },
    });
    expect(matrix.value.canonical.step.state).toEqual(dyadic.value.canonical.step.state);
    const canonicalOutcome = conflictDirectedOutcomeToDyadicV1(matrix.value.canonical.step.outcome);
    if (canonicalOutcome.ok === false) throw new Error('expected dyadic outcome');
    expect(canonicalOutcome.value).toEqual(dyadic.value.canonical.step.outcome);
    expect(matrix.value.reference.step.state).toEqual(dyadic.value.reference.step.state);
    const referenceOutcome = conflictDirectedOutcomeToDyadicV1(matrix.value.reference.step.outcome);
    if (referenceOutcome.ok === false) throw new Error('expected dyadic reference outcome');
    expect(referenceOutcome.value).toEqual(dyadic.value.reference.step.outcome);
    expect(matrix.value.divergence.byActorTarget.a.b).toEqual(dyadic.value.divergence.byPlayer.a);
    expect(matrix.value.divergence.byActorTarget.b.a).toEqual(dyadic.value.divergence.byPlayer.b);
  });

  it('N=3 uses target-qualified beliefs and independent RNG channels per cell', () => {
    const ids = ['a', 'b', 'c'];
    const configured = setup(ids);
    const beliefAtoms: ContextAtom[] = [
      { id: 'tom:belief:final:a:b:trust', kind: 'belief', ns: 'tom', source: 'test', magnitude: 0, confidence: 1 } as any,
      { id: 'tom:belief:final:a:c:trust', kind: 'belief', ns: 'tom', source: 'test', magnitude: 1, confidence: 1 } as any,
      { id: 'tom:belief:final:a:b:threat', kind: 'belief', ns: 'tom', source: 'test', magnitude: 1, confidence: 1 } as any,
      { id: 'tom:belief:final:a:c:threat', kind: 'belief', ns: 'tom', source: 'test', magnitude: 0, confidence: 1 } as any,
    ];
    const seeds = { a: { b: 1, c: 999 }, b: { a: 2, c: 3 }, c: { a: 4, b: 5 } };
    const result = runConflictTargetMatrixDecisionV1({
      state: makeStateN(3), ...configured, players: inputs(ids, seeds, beliefAtoms),
    });
    if (result.ok === false) throw new Error(`${result.error.code}: ${result.error.message}`);

    expect(result.value.choices.a.b.rngChannelId).toBe('test:target:a:b');
    expect(result.value.choices.a.c.rngChannelId).toBe('test:target:a:c');
    expect(result.value.choices.a.b.projectedRows.every((row) => row.targetIds[0] === 'b')).toBe(true);
    expect(result.value.choices.a.c.projectedRows.every((row) => row.targetIds[0] === 'c')).toBe(true);
    const trustQ = (targetId: 'b' | 'c') => result.value.choices.a[targetId].ranked
      .find((candidate) => candidate.kernelActionId === 'trust')?.q;
    expect(trustQ('b')).not.toBe(trustQ('c'));
    expect(result.value.canonical.actionMatrix.actionsByActorTarget.a.b)
      .not.toBe(result.value.canonical.actionMatrix.actionsByActorTarget.a.c);
    expect(Object.keys(result.value.canonical.actionMatrix.actionsByActorTarget.a)).toEqual(['b', 'c']);
    expect(result.value.canonical.step.state.trace).toHaveLength(6);
  });

  it('changing one target RNG leaves every other decision cell unchanged', () => {
    const ids = ['a', 'b', 'c'];
    const configured = setup(ids);
    const baseSeeds = { a: { b: 11, c: 12 }, b: { a: 21, c: 22 }, c: { a: 31, b: 32 } };
    const changedSeeds = { ...baseSeeds, a: { ...baseSeeds.a, c: 999999 } };
    const first = runConflictTargetMatrixDecisionV1({ state: makeStateN(3), ...configured, players: inputs(ids, baseSeeds) });
    const changed = runConflictTargetMatrixDecisionV1({ state: makeStateN(3), ...configured, players: inputs(ids, changedSeeds) });
    if (first.ok === false || changed.ok === false) throw new Error('expected decisions');
    for (const actorId of ids) {
      for (const targetId of ids) {
        if (actorId === targetId || (actorId === 'a' && targetId === 'c')) continue;
        expect(changed.value.choices[actorId][targetId]).toEqual(first.value.choices[actorId][targetId]);
      }
    }

    const evidenceChanged = runConflictTargetMatrixDecisionV1({
      state: makeStateN(3),
      ...configured,
      players: inputs(ids, baseSeeds, [{
        id: 'tom:belief:final:a:c:threat', kind: 'belief', ns: 'tom', source: 'test', magnitude: 1, confidence: 1,
      } as any]),
    });
    if (evidenceChanged.ok === false) throw new Error('expected target evidence decision');
    expect(evidenceChanged.value.choices.a.b).toEqual(first.value.choices.a.b);
    expect(evidenceChanged.value.choices.b.a).toEqual(first.value.choices.b.a);
  });

  it('fails closed before transition on missing, extra, self, or null target RNG entries', () => {
    const ids = ['a', 'b', 'c'];
    const configured = setup(ids);
    const seeds = { a: { b: 1, c: 2 }, b: { a: 3, c: 4 }, c: { a: 5, b: 6 } };
    const cases = [
      (players: any) => { delete players.a.rngByTarget.c; },
      (players: any) => { players.a.rngByTarget.extra = { rng: lcg(9), rngChannelId: 'extra' }; },
      (players: any) => { players.a.rngByTarget.a = { rng: lcg(9), rngChannelId: 'self' }; },
      (players: any) => { players.a.rngByTarget.b.rng = null; },
      (players: any) => { players.a.rngByTarget.c.rng = players.a.rngByTarget.b.rng; },
      (players: any) => { players.a.rngByTarget.c.rngChannelId = players.a.rngByTarget.b.rngChannelId; },
    ];
    for (const mutate of cases) {
      const players = inputs(ids, seeds);
      mutate(players);
      const result = runConflictTargetMatrixDecisionV1({ state: makeStateN(3), ...configured, players });
      expect(result.ok).toBe(false);
      if (result.ok === false) expect(result.error.code).toBe('invalid_rng_map');
    }

    const malformedPlayers = inputs(ids, seeds);
    malformedPlayers.a.pipelineInput = null;
    const malformed = runConflictTargetMatrixDecisionV1({ state: makeStateN(3), ...configured, players: malformedPlayers });
    expect(malformed.ok).toBe(false);
    if (malformed.ok === false) expect(malformed.error.code).toBe('missing_pipeline');
  });
});
