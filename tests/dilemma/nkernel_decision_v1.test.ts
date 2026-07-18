// NKERNEL-DECISION-0 regression. Pins the N = 2 reduction oracle (the N
// provider must reproduce runConflictJointDecisionV1 byte-for-byte over the
// meaningful overlapping fields: choices, canonical/reference actions and
// step state/outcome, divergence), the single-target-only v1 scope decided in
// NKERNEL_FOUNDATION_0 §5.5 (all_others at N = 3 fails closed; a hand-built
// single-target N = 3 definition runs end-to-end), and fail-closed on a
// missing rng channel + determinism. No runtime wiring; the dyadic
// runConflictJointDecisionV1 stays the reference.

import { describe, expect, it } from 'vitest';

import { adaptResolvedSceneToGoalLabV1 } from '../../lib/scene/adapters/goalLab';
import { resolveObservationsV1 } from '../../lib/scene/observation/resolver';
import { KANONAR_SYSTEM_VERSION } from '../../lib/goal-lab/versioning';
import type { ObservationProvenanceV1, ResolvedSceneInputV1, VisibilityRuleV1 } from '../../lib/scene/observation/types';
import { TRUST_EXCHANGE_ACTION_ORDER } from '../../lib/dilemma/dynamics/trustExchange';
import { runConflictJointDecisionV1 } from '../../lib/dilemma/integration/decisionProvider';
import { runConflictNJointDecisionV1 } from '../../lib/dilemma/integration/ndecisionProvider';
import {
  CONFLICT_DEFINITION_V3_SCHEMA_VERSION,
  type ConflictDefinitionV3,
} from '../../lib/dilemma/definition/conflictDefinitionV3';
import type { ParticipantSetV1 } from '../../lib/dilemma/definition/participantSet';
import {
  asKernelConflictStateV1,
  buildTrustExchangeProtocolNV1,
  participantSetFromConflictPlayersV1,
  trustExchangeDefinitionNV1,
} from '../../lib/dilemma/nkernel/nstate';

import { mockAgent, mockWorld } from '../pipeline/fixtures';
import { makeStateN } from './nkernelFixtures';

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const provenance = (id: string): ObservationProvenanceV1 => ({
  sourceIds: [id],
  adapterSteps: [{ adapterId: 'nkernel-decision-test', adapterVersion: 1, inputIds: [id] }],
});

function rule(id: string, allow: string[]): VisibilityRuleV1 {
  return { ruleId: id, mode: 'participants', fieldAllowlist: allow, provenance: provenance(id) };
}

function integrationSceneN(playerIds: readonly string[]): ResolvedSceneInputV1 {
  return {
    schemaVersion: 1, systemVersion: KANONAR_SYSTEM_VERSION, sceneId: 'nkernel-decision-scene',
    sourceRefs: [{ kind: 'test', id: 'nkernel-decision' }], seed: 7, tick: 0,
    cast: playerIds.map((id) => ({ agentId: id, roleIds: ['participant'], roleVisibility: rule(`role-${id}`, ['roleIds']) })),
    povAgentIds: [...playerIds],
    placements: playerIds.map((id, i) => ({ agentId: id, locationId: 'loc:demo', x: i, y: i, provenance: provenance(`p-${id}`) })),
    events: [],
    relationLayers: [],
    knowledge: [],
    visibilityRules: [],
    tags: ['nkernel-decision'],
  };
}

function buildPlayersInput(playerIds: readonly string[], seeds: Record<string, number>): Record<string, any> {
  const scene = integrationSceneN(playerIds);
  const resolution = resolveObservationsV1(scene);
  if (!resolution.ok) throw new Error('scene failed validation');
  const goalLabProjection = adaptResolvedSceneToGoalLabV1(scene, resolution.value);

  const players: Record<string, any> = {};
  for (const observerId of playerIds) {
    const world = mockWorld(playerIds.map((id) => mockAgent(id)));
    (world as any).observations = goalLabProjection.observations;
    (world as any).sceneSnapshot = goalLabProjection.sceneSnapshot;
    (world as any).resolvedObservations = goalLabProjection.observationEnvelopes;
    const pipelineInput = {
      world, agentId: observerId, participantIds: [...playerIds],
      observeLiteParams: { seed: 1234 },
      manualAtoms: goalLabProjection.observationAtoms,
    } as any;
    players[observerId] = {
      pipelineInput,
      rng: lcg(seeds[observerId]),
      rngChannelId: `test:decide:${observerId}`,
    };
  }
  return players;
}

function mustSet(players: readonly string[]): ParticipantSetV1 {
  const res = participantSetFromConflictPlayersV1(players);
  if (res.ok === false) throw new Error('expected participant set ok');
  return res.value;
}

// Every actor's 3 legal actions target one fixed other participant instead of
// all_others — legal under the single-target-only v1 scope (NKERNEL_FOUNDATION_0
// §5.5). The target only flavors which counterparty's belief atoms modulate the
// GoalLab candidate (candidateBridge.ts); the real kernel transition still runs
// every unordered pair regardless (NKERNEL-STEP-0 §2), so this is a legitimate
// end-to-end N = 3 exercise, not a restricted kernel.
function makeSingleTargetDefinitionN3(): ConflictDefinitionV3 {
  const roles = [
    { id: 'role-a', playerId: 'a' },
    { id: 'role-b', playerId: 'b' },
    { id: 'role-c', playerId: 'c' },
  ];
  const nextTarget: Record<string, string> = { a: 'b', b: 'c', c: 'a' };
  return {
    schemaVersion: CONFLICT_DEFINITION_V3_SCHEMA_VERSION,
    protocolId: 'trust_exchange',
    playerCount: 3,
    roles,
    phases: [{ id: 'simultaneous_choice', actorRoleIds: roles.map((role) => role.id), observation: 'public_state' }],
    legalActions: TRUST_EXCHANGE_ACTION_ORDER.flatMap((actionId) => roles.map((role) => ({
      id: actionId,
      phaseId: 'simultaneous_choice',
      actorRoleId: role.id,
      target: { mode: 'participant' as const, participantId: nextTarget[role.playerId] },
    }))),
    termination: { kind: 'external_round_budget', note: 'test fixture' },
  };
}

describe('NKERNEL-DECISION-0 conflict-njoint-decision-v1', () => {
  it('N = 2 reduction oracle: reproduces runConflictJointDecisionV1 byte-for-byte', () => {
    const seeds = { a: 101, b: 202 };

    const dyadicResult = runConflictJointDecisionV1({
      state: asKernelConflictStateV1(makeStateN(2)),
      players: buildPlayersInput(['a', 'b'], seeds),
    });

    const set = mustSet(['a', 'b']);
    const definition = trustExchangeDefinitionNV1(set);
    if (definition.ok === false) throw new Error('expected v3 definition ok');
    const nResult = runConflictNJointDecisionV1({
      state: makeStateN(2),
      definition: definition.value,
      protocol: buildTrustExchangeProtocolNV1(set),
      players: buildPlayersInput(['a', 'b'], seeds),
    });

    if (dyadicResult.ok === false || nResult.ok === false) throw new Error('expected both decisions ok');

    expect(nResult.value.choices).toEqual(dyadicResult.value.choices);
    expect(nResult.value.canonical.actions).toEqual(dyadicResult.value.canonical.actions);
    expect(nResult.value.canonical.step.state).toEqual(dyadicResult.value.canonical.step.state);
    expect(nResult.value.canonical.step.outcome).toEqual(dyadicResult.value.canonical.step.outcome);
    expect(nResult.value.reference.actions).toEqual(dyadicResult.value.reference.actions);
    expect(nResult.value.reference.step.state).toEqual(dyadicResult.value.reference.step.state);
    expect(nResult.value.reference.step.outcome).toEqual(dyadicResult.value.reference.step.outcome);
    expect(nResult.value.divergence).toEqual(dyadicResult.value.divergence);
  });

  it('fails closed at N = 3 on the standard all_others trust_exchange definition (multi-target out of v1 scope)', () => {
    const set = mustSet(['a', 'b', 'c']);
    const definition = trustExchangeDefinitionNV1(set);
    if (definition.ok === false) throw new Error('expected v3 definition ok');

    const result = runConflictNJointDecisionV1({
      state: makeStateN(3),
      definition: definition.value,
      protocol: buildTrustExchangeProtocolNV1(set),
      players: buildPlayersInput(['a', 'b', 'c'], { a: 1, b: 2, c: 3 }),
    });

    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.error.code).toBe('multi_target_not_supported');
  });

  it('runs end-to-end at N = 3 with a single-target definition', () => {
    const definition = makeSingleTargetDefinitionN3();
    const set = mustSet(['a', 'b', 'c']);

    const result = runConflictNJointDecisionV1({
      state: makeStateN(3),
      definition,
      protocol: buildTrustExchangeProtocolNV1(set),
      players: buildPlayersInput(['a', 'b', 'c'], { a: 11, b: 22, c: 33 }),
    });

    if (result.ok === false) throw new Error(`expected decision ok, got ${result.error.code}: ${result.error.message}`);
    const report = result.value;

    for (const playerId of ['a', 'b', 'c']) {
      expect(TRUST_EXCHANGE_ACTION_ORDER.includes(report.canonical.actions[playerId])).toBe(true);
      const trace = report.choices[playerId];
      expect(trace.projectedRows.length).toBe(TRUST_EXCHANGE_ACTION_ORDER.length);
      expect(trace.ranked.length).toBe(TRUST_EXCHANGE_ACTION_ORDER.length);
      expect(trace.ranked.some((entry) => entry.chosen)).toBe(true);
    }
    expect(report.canonical.step.state.tick).toBe(1);
    expect(report.canonical.step.pairwise).toHaveLength(3); // N=3 -> 3 unordered pairs
    const entry = report.divergence.byPlayer['a'];
    expect(entry.canonicalActionId).toBe(report.canonical.actions['a']);
    expect(entry.referenceActionId).toBe(report.reference.actions['a']);
  });

  it('fails closed on a missing rng channel, not a silent fallback', () => {
    const set = mustSet(['a', 'b']);
    const definition = trustExchangeDefinitionNV1(set);
    if (definition.ok === false) throw new Error('expected v3 definition ok');
    const players = buildPlayersInput(['a', 'b'], { a: 1, b: 2 });
    players.b.rng = null;

    const result = runConflictNJointDecisionV1({
      state: makeStateN(2),
      definition: definition.value,
      protocol: buildTrustExchangeProtocolNV1(set),
      players,
    });

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.error.code).toBe('missing_rng_channel');
      expect((result.error as { playerId?: string }).playerId).toBe('b');
    }
  });

  it('is deterministic for identical states and seeds', () => {
    const set = mustSet(['a', 'b']);
    const definition = trustExchangeDefinitionNV1(set);
    if (definition.ok === false) throw new Error('expected v3 definition ok');
    const protocol = buildTrustExchangeProtocolNV1(set);
    const seeds = { a: 7, b: 9 };

    const first = runConflictNJointDecisionV1({
      state: makeStateN(2), definition: definition.value, protocol, players: buildPlayersInput(['a', 'b'], seeds),
    });
    const second = runConflictNJointDecisionV1({
      state: makeStateN(2), definition: definition.value, protocol, players: buildPlayersInput(['a', 'b'], seeds),
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
