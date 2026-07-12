// CONFLICT-INTEGRATION-0: resolved scene -> per-observer GoalLab pipeline ->
// goal_lab_s8_gumbel_v1 over projected candidates -> forcedJointActions ->
// kernel transition, with the dual-run reference lane recorded side by side.

import { describe, expect, it } from 'vitest';

import { adaptResolvedSceneToGoalLabV1 } from '@/lib/scene/adapters/goalLab';
import { adaptResolvedSceneToConflictV1 } from '@/lib/scene/adapters/conflict';
import { resolveObservationsV1 } from '@/lib/scene/observation/resolver';
import { KANONAR_SYSTEM_VERSION } from '@/lib/goal-lab/versioning';
import type { ObservationProvenanceV1, ResolvedSceneInputV1, VisibilityRuleV1 } from '@/lib/scene/observation/types';
import {
  defaultConflictAgentState,
  defaultConflictRelationState,
  resolveProtocolStep,
  type ConflictState,
  type StrategyProfile,
} from '@/lib/dilemma';
import { TRUST_EXCHANGE_ACTION_ORDER } from '@/lib/dilemma/dynamics/trustExchange';
import { TRUST_EXCHANGE_DEFINITION, projectLegalActions } from '@/lib/dilemma/definition';
import {
  buildConflictPossibilities,
  conflictDeltaGoalsV1,
  runConflictJointDecisionV1,
} from '@/lib/dilemma/integration';
import type { ContextAtom } from '@/lib/context/v2/types';
import { buildActionCandidates } from '@/lib/decision/actionCandidateUtils';

import { mockAgent, mockWorld } from '../pipeline/fixtures';

// Deterministic seeded rng in [0, 1) — a named channel stand-in.
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const provenance = (id: string): ObservationProvenanceV1 => ({
  sourceIds: [id],
  adapterSteps: [{ adapterId: 'conflict-integration-test', adapterVersion: 1, inputIds: [id] }],
});

function rule(id: string, allow: string[]): VisibilityRuleV1 {
  return { ruleId: id, mode: 'participants', fieldAllowlist: allow, provenance: provenance(id) };
}

function integrationScene(): ResolvedSceneInputV1 {
  return {
    schemaVersion: 1, systemVersion: KANONAR_SYSTEM_VERSION, sceneId: 'conflict-integration-scene',
    sourceRefs: [{ kind: 'test', id: 'conflict-integration' }], seed: 7, tick: 0,
    cast: [
      { agentId: 'A', roleIds: ['participant'], roleVisibility: rule('role-A', ['roleIds']) },
      { agentId: 'B', roleIds: ['participant'], roleVisibility: rule('role-B', ['roleIds']) },
    ],
    povAgentIds: ['A', 'B'],
    placements: [
      { agentId: 'A', locationId: 'loc:demo', x: 0, y: 0, provenance: provenance('p-A') },
      { agentId: 'B', locationId: 'loc:demo', x: 1, y: 1, provenance: provenance('p-B') },
    ],
    events: [{
      eventId: 'speech-1', kind: 'speech', tick: 0, actorId: 'B', targetIds: ['A'],
      payload: { visible: 'offer' },
      visibilityRuleIds: ['speech'], baseReliability: 0.9, provenance: provenance('speech-1'),
    }],
    relationLayers: [],
    knowledge: [],
    visibilityRules: [rule('speech', ['visible'])],
    tags: ['conflict-integration'],
  };
}

function makeConflictState(): ConflictState {
  const players = ['A', 'B'] as const;
  const strategyProfiles: Record<string, StrategyProfile> = {
    A: { playerId: 'A', probabilities: { trust: 1 / 3, withhold: 1 / 3, betray: 1 / 3 } },
    B: { playerId: 'B', probabilities: { trust: 1 / 3, withhold: 1 / 3, betray: 1 / 3 } },
  };
  return {
    tick: 0,
    players,
    agents: {
      A: defaultConflictAgentState({ cooperationTendency: 0.72, loyalty: 0.62 }),
      B: defaultConflictAgentState({ cooperationTendency: 0.68, loyalty: 0.58 }),
    },
    relations: {
      A: { B: defaultConflictRelationState({ trust: 0.62, bond: 0.42, conflict: 0.15 }) },
      B: { A: defaultConflictRelationState({ trust: 0.60, bond: 0.40, conflict: 0.18 }) },
    },
    environment: { resourceScarcity: 0.25, externalPressure: 0.30, visibility: 0.20, institutionalPressure: 0.45 },
    history: [],
    strategyProfiles,
  };
}

function buildJointDecisionArgs(seedA = 101, seedB = 202) {
  const scene = integrationScene();
  const resolution = resolveObservationsV1(scene);
  if (!resolution.ok) throw new Error('scene failed validation');
  const goalLabProjection = adaptResolvedSceneToGoalLabV1(scene, resolution.value);
  const conflictProjection = adaptResolvedSceneToConflictV1(scene, resolution.value);
  expect(conflictProjection.players).toEqual(['A', 'B']);

  const players: Record<string, any> = {};
  const seeds: Record<string, number> = { A: seedA, B: seedB };
  for (const observerId of ['A', 'B']) {
    const world = mockWorld([mockAgent('A'), mockAgent('B')]);
    (world as any).observations = goalLabProjection.observations;
    (world as any).sceneSnapshot = goalLabProjection.sceneSnapshot;
    (world as any).resolvedObservations = goalLabProjection.observationEnvelopes;
    const pipelineInput = {
      world, agentId: observerId, participantIds: ['A', 'B'],
      observeLiteParams: { seed: 1234 },
      manualAtoms: goalLabProjection.observationAtoms,
    } as any;
    players[observerId] = {
      pipelineInput,
      rng: lcg(seeds[observerId]),
      rngChannelId: `test:decide:${observerId}`,
    };
  }

  return { state: makeConflictState(), players };
}

describe('CONFLICT-INTEGRATION-0 — S8 policy drives the kernel through the projection gate', () => {
  it('runs resolved scene -> pipelines -> joint decision -> kernel transition end-to-end', () => {
    const args = buildJointDecisionArgs();
    const result = runConflictJointDecisionV1(args);
    expect(result.ok).toBe(true);
    if (result.ok === false) return;

    const report = result.value;
    expect(report.policyId).toBe('goal_lab_s8_gumbel');
    expect(report.policyVersion).toBe(1);

    // Canonical actions are legal kernel actions and drive the transition.
    for (const playerId of ['A', 'B']) {
      const actionId = report.canonical.actions[playerId];
      expect(TRUST_EXCHANGE_ACTION_ORDER.includes(actionId)).toBe(true);
    }
    const nextState = report.canonical.step.state;
    expect(nextState.tick).toBe(args.state.tick + 1);
    expect(nextState.history.length).toBe(1);
    expect(nextState.history[0].actions).toEqual(report.canonical.actions);
    // Transition trace, memory/learning and relation dynamics survive the seam.
    expect((nextState.trace ?? []).length).toBe(2);
    expect(report.canonical.step.intervention?.forced).toBe(true);
    expect(report.canonical.forcedActionStrategyMode).toBe('learn_from_utility');

    // Choice traces carry the ADR §5 wire contract.
    for (const playerId of ['A', 'B']) {
      const trace = report.choices[playerId];
      expect(trace.schemaVersion).toBe('conflict-choice-trace-v1');
      expect(trace.rngChannelId).toBe(`test:decide:${playerId}`);
      expect(trace.ranked.length).toBe(3);
      expect(trace.projectedRows.length).toBe(3);
      expect(trace.usedAtomIds.length).toBeGreaterThan(0);
      expect(trace.ranked.some((r) => r.chosen)).toBe(true);
      expect(trace.samplingPoolCandidateIds.length).toBeGreaterThan(0);
      expect(trace.ranked.every((r) => Number.isFinite(r.effectiveTemperature))).toBe(true);
      expect(trace.ranked.filter((r) => r.inSamplingPool).map((r) => r.utilityCandidateId))
        .toEqual(trace.samplingPoolCandidateIds);
      const chosenRow = trace.projectedRows.find((r) => r.utilityCandidateId === trace.chosenUtilityCandidateId);
      expect(chosenRow?.kernelActionId).toBe(trace.kernelActionId);
      expect(Number.isFinite(trace.temperature)).toBe(true);
    }
  });

  it('is deterministic for identical scenes and seeds', () => {
    const first = runConflictJointDecisionV1(buildJointDecisionArgs());
    const second = runConflictJointDecisionV1(buildJointDecisionArgs());
    expect(first.ok).toBe(true);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('fail-closed: a missing rng channel is an error, not a silent fallback', () => {
    const args = buildJointDecisionArgs();
    args.players.B.rng = null;
    const result = runConflictJointDecisionV1(args);
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.error.code).toBe('missing_rng_channel');
      expect(result.error.playerId).toBe('B');
    }
  });

  it('fail-closed: pipeline identity must match the conflict player and tick', () => {
    const args = buildJointDecisionArgs();
    args.players.A.pipelineInput.agentId = 'B';
    const result = runConflictJointDecisionV1(args);
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.error.code).toBe('pipeline_mismatch');
      expect(result.error.playerId).toBe('A');
    }
  });

  it('ignores UI force_action overrides so the canonical winner stays the S8 Gumbel choice', () => {
    const forcedArgs = buildJointDecisionArgs();
    const protocol = TRUST_EXCHANGE_DEFINITION.createProtocol(['A', 'B']);
    const rows = projectLegalActions(TRUST_EXCHANGE_DEFINITION, forcedArgs.state, protocol, 'A');
    if (rows.ok === false) throw new Error('projection failed');
    const forcedId = rows.value.find((row) => row.kernelActionId === 'betray')!.utilityCandidateId;
    forcedArgs.players.A.pipelineInput.injectedEvents = [
      { type: 'force_action', agentId: 'A', actionId: forcedId },
    ];

    const forced = runConflictJointDecisionV1(forcedArgs);
    const control = runConflictJointDecisionV1(buildJointDecisionArgs());
    expect(forced.ok).toBe(true);
    expect(JSON.stringify(forced)).toBe(JSON.stringify(control));
    if (forced.ok === false) return;
    const trace = forced.value.choices.A;
    expect(trace.ranked.filter((entry) => entry.chosen)).toHaveLength(1);
    expect(trace.ranked.find((entry) => entry.chosen)?.utilityCandidateId)
      .toBe(trace.chosenUtilityCandidateId);
  });

  it('records the dual-run reference lane; reference equals a direct kernel step', () => {
    const args = buildJointDecisionArgs();
    const result = runConflictJointDecisionV1(args);
    expect(result.ok).toBe(true);
    if (result.ok === false) return;

    const report = result.value;
    const protocol = TRUST_EXCHANGE_DEFINITION.createProtocol(['A', 'B']);
    const direct = resolveProtocolStep(args.state, protocol);
    expect(JSON.stringify(report.reference.step)).toBe(JSON.stringify(direct.ok ? direct.value : null));

    for (const playerId of ['A', 'B']) {
      const entry = report.divergence.byPlayer[playerId];
      expect(entry.canonicalActionId).toBe(report.canonical.actions[playerId]);
      expect(entry.referenceActionId).toBe(report.reference.actions[playerId]);
      expect(entry.same).toBe(entry.canonicalActionId === entry.referenceActionId);
    }
  });
});

describe('conflict candidate bridge — impact matrix and belief modulation', () => {
  const beliefNeutral = { trust: 0.5, threat: 0.5, usedAtomIds: [] as string[] };

  it('sign oracle: mechanic impact projects to distinct goal deltas per action', () => {
    const trust = conflictDeltaGoalsV1({ support: 0.72, harm: 0, betrayal: 0, deception: 0, repair: 0.18, dominance: 0, submission: 0.10, withdrawal: 0, humiliation: 0, protection: 0 }, beliefNeutral);
    expect(trust.affiliation).toBeGreaterThan(0);

    const withhold = conflictDeltaGoalsV1({ support: 0, harm: 0, betrayal: 0, deception: 0, repair: 0, dominance: 0, submission: 0, withdrawal: 0.55, humiliation: 0, protection: 0.35 }, beliefNeutral);
    expect(withhold.safety).toBeGreaterThan(0);
    expect(withhold.affiliation).toBeLessThan(0);

    const betray = conflictDeltaGoalsV1({ support: 0, harm: 0.5, betrayal: 1.0, deception: 0.7, repair: 0, dominance: 0.35, submission: 0, withdrawal: 0, humiliation: 0.2, protection: 0, threat: 0.55 }, beliefNeutral);
    expect(betray.affiliation).toBeLessThan(0);
    expect(betray.control).toBeGreaterThan(0);
    expect(betray.safety).toBeLessThan(0);
  });

  it('believed trust raises the reciprocal (trust) affiliation delta monotonically', () => {
    const impact = { support: 0.72, harm: 0, betrayal: 0, deception: 0, repair: 0.18, dominance: 0, submission: 0.10, withdrawal: 0, humiliation: 0, protection: 0 };
    const low = conflictDeltaGoalsV1(impact, { trust: 0.1, threat: 0.5, usedAtomIds: [] });
    const mid = conflictDeltaGoalsV1(impact, beliefNeutral);
    const high = conflictDeltaGoalsV1(impact, { trust: 0.9, threat: 0.5, usedAtomIds: [] });
    expect(low.affiliation).toBeLessThan(mid.affiliation);
    expect(mid.affiliation).toBeLessThan(high.affiliation);
  });

  it('reads canonical belief atoms first and records their provenance on the possibility', () => {
    const state = makeConflictState();
    const protocol = TRUST_EXCHANGE_DEFINITION.createProtocol(['A', 'B']);
    const projected = projectLegalActions(TRUST_EXCHANGE_DEFINITION, state, protocol, 'A');
    if (projected.ok === false) throw new Error('projection failed');

    const beliefAtomId = 'tom:belief:final:A:B:trust';
    const atoms: ContextAtom[] = [
      { id: beliefAtomId, kind: 'belief', ns: 'tom', origin: 'tom', source: 'test', magnitude: 0.9, confidence: 0.9 } as any,
    ];
    const { possibilities, beliefSignalsByTarget } = buildConflictPossibilities({
      rows: projected.value, atoms, selfId: 'A',
    });
    expect(possibilities.length).toBe(3);
    expect(beliefSignalsByTarget.B.trust).toBeCloseTo(0.9, 6);
    for (const possibility of possibilities) {
      expect(possibility.trace?.usedAtomIds).toContain(beliefAtomId);
      expect(possibility.id.startsWith('conflict:')).toBe(true);
    }

    const built = buildActionCandidates({ selfId: 'A', atoms, possibilities, currentTick: state.tick });
    expect(built.actions.map((action) => action.kind)).toEqual(['trust', 'withhold', 'betray']);

    // Higher believed trust must raise the trust-action candidate's
    // affiliation delta relative to the low-trust read.
    const lowAtoms: ContextAtom[] = [
      { id: beliefAtomId, kind: 'belief', ns: 'tom', origin: 'tom', source: 'test', magnitude: 0.1, confidence: 0.9 } as any,
    ];
    const lowRun = buildConflictPossibilities({ rows: projected.value, atoms: lowAtoms, selfId: 'A' });
    const trustRowId = projected.value.find((r) => r.kernelActionId === 'trust')!.utilityCandidateId;
    const highDelta = (possibilities.find((p) => p.id === trustRowId)?.meta as any)?.sim?.deltaGoals?.affiliation;
    const lowDelta = (lowRun.possibilities.find((p) => p.id === trustRowId)?.meta as any)?.sim?.deltaGoals?.affiliation;
    expect(highDelta).toBeGreaterThan(lowDelta);
  });
});
