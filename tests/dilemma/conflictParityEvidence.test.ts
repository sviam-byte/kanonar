// CONFLICT-PARITY-0 (plan §CONFLICT-6.3): accumulate dual-run parity evidence
// between the canonical S8 lane and the kernel replicator+argmax reference
// lane across a deterministic grid of relations × agent pairings ×
// environments × seeds, rolled out over multiple kernel ticks.
//
// The gate runs a small fixed subset. The full evidence grid behind
// CONFLICT_PARITY_FULL=1 (optionally CONFLICT_PARITY_OUT=<path> to dump the
// JSON artifact) produced docs/unification/evidence/conflict_parity_0.json —
// see docs/unification/CONFLICT_PARITY_0.md for the analysis.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { adaptResolvedSceneToGoalLabV1 } from '@/lib/scene/adapters/goalLab';
import { resolveObservationsV1 } from '@/lib/scene/observation/resolver';
import { KANONAR_SYSTEM_VERSION } from '@/lib/goal-lab/versioning';
import type { ObservationProvenanceV1, ResolvedSceneInputV1, VisibilityRuleV1 } from '@/lib/scene/observation/types';
import {
  defaultConflictAgentState,
  defaultConflictRelationState,
  type ConflictState,
  type StrategyProfile,
} from '@/lib/dilemma';
import { TRUST_EXCHANGE_ACTION_ORDER } from '@/lib/dilemma/dynamics/trustExchange';
import {
  aggregateConflictParityEvidenceV1,
  CONFLICT_CHOICE_POLICY_ID,
  CONFLICT_CHOICE_POLICY_VERSION,
  extractConflictParityRecordV1,
  runConflictJointDecisionV1,
  type ConflictParityDecisionRecordV1,
} from '@/lib/dilemma/integration';
import { rankPairConcordanceV1 } from '@/lib/dilemma/integration/paritySweep';

import { mockAgent, mockWorld } from '../pipeline/fixtures';

// ---------------------------------------------------------------------------
// Deterministic grid (frozen for the CONFLICT_PARITY_0 evidence artifact).

const PARITY_GRID_VERSION = 'conflict-parity-grid-v1';
const PARITY_ARTIFACT_SCHEMA_VERSION = 'conflict-parity-artifact-v2';
const PARITY_ARTIFACT_PATH = resolve(process.cwd(), 'docs/unification/evidence/conflict_parity_0.json');
const PARITY_REPRO_COMMAND = "$env:CONFLICT_PARITY_FULL='1'; $env:CONFLICT_PARITY_OUT='docs\\unification\\evidence\\conflict_parity_0.json'; npm test -- --run tests/dilemma/conflictParityEvidence.test.ts";
const PARITY_SOURCE_PATHS = [
  'lib/config/runtimeMechanics.ts',
  'lib/decision/actionCandidateUtils.ts',
  'lib/dilemma',
  'lib/goal-lab/pipeline',
  'lib/scene',
  'tests/dilemma/conflictParityEvidence.test.ts',
  'tests/pipeline/fixtures.ts',
  'package.json',
  'package-lock.json',
] as const;

function paritySourceFingerprint(): { algorithm: 'sha256'; digest: string; trackedFileCount: number } {
  const tracked = execFileSync('git', ['ls-files', '-z', '--', ...PARITY_SOURCE_PATHS], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .sort();
  const hash = createHash('sha256');
  for (const file of tracked) {
    hash.update(file);
    hash.update('\0');
    hash.update(readFileSync(resolve(process.cwd(), file)));
    hash.update('\0');
  }
  return { algorithm: 'sha256', digest: hash.digest('hex'), trackedFileCount: tracked.length };
}

function parityToolchainMetadata(): { node: string; typescript: string; vitest: string } {
  const lock = JSON.parse(readFileSync(resolve(process.cwd(), 'package-lock.json'), 'utf8')) as {
    packages?: Record<string, { version?: string }>;
  };
  return {
    node: process.version,
    typescript: String(lock.packages?.['node_modules/typescript']?.version ?? 'unknown'),
    vitest: String(lock.packages?.['node_modules/vitest']?.version ?? 'unknown'),
  };
}

function compactParityArtifact(aggregate: ReturnType<typeof aggregateConflictParityEvidenceV1>) {
  return {
    artifactSchemaVersion: PARITY_ARTIFACT_SCHEMA_VERSION,
    gridVersion: PARITY_GRID_VERSION,
    mode: 'full',
    system: { version: KANONAR_SYSTEM_VERSION },
    policy: {
      canonical: { id: CONFLICT_CHOICE_POLICY_ID, version: CONFLICT_CHOICE_POLICY_VERSION },
      reference: { id: 'trust_exchange_replicator_argmax', version: 1 },
    },
    toolchain: parityToolchainMetadata(),
    source: paritySourceFingerprint(),
    reproductionCommand: PARITY_REPRO_COMMAND,
    grid: {
      relations: Object.keys(RELATION_PRESETS),
      agentPairings: Object.keys(AGENT_PAIRINGS),
      environments: Object.keys(ENVIRONMENT_PRESETS),
      temperatures: Object.keys(TEMPERATURE_PRESETS),
      seeds: FULL_SEEDS,
      ticksPerRollout: FULL_TICKS,
      runtimeProfile: 'phase1',
    },
    aggregate,
  };
}

interface RelationPreset {
  // Kernel side (both directions symmetric).
  readonly kernel: { trust: number; bond: number; conflict: number; perceivedThreat: number };
  // Legacy ToM mirror so the belief lane sees the same relationship
  // (world.tom traits -> S0 dyad atoms -> S5 decoder prior -> belief atoms).
  readonly tomTraits: Record<string, number>;
}

const RELATION_PRESETS: Record<string, RelationPreset> = {
  allied: {
    kernel: { trust: 0.78, bond: 0.62, conflict: 0.06, perceivedThreat: 0.08 },
    tomTraits: { trust: 0.78, bond: 0.62, conflict: 0.06, fear: 0.05, align: 0.6, respect: 0.6, dominance: 0.4, uncertainty: 0.25 },
  },
  neutral: {
    kernel: { trust: 0.5, bond: 0.3, conflict: 0.2, perceivedThreat: 0.2 },
    tomTraits: { trust: 0.5, bond: 0.3, conflict: 0.2, fear: 0.15, align: 0.4, respect: 0.5, dominance: 0.5, uncertainty: 0.45 },
  },
  strained: {
    kernel: { trust: 0.22, bond: 0.12, conflict: 0.6, perceivedThreat: 0.55 },
    tomTraits: { trust: 0.22, bond: 0.12, conflict: 0.6, fear: 0.4, align: 0.2, respect: 0.35, dominance: 0.55, uncertainty: 0.5 },
  },
};

const AGENT_PRESETS: Record<string, Partial<ReturnType<typeof defaultConflictAgentState>>> = {
  cooperative: { cooperationTendency: 0.8, loyalty: 0.72, fear: 0.12, resentment: 0.05, dominanceNeed: 0.3 },
  defensive: { cooperationTendency: 0.28, loyalty: 0.3, fear: 0.45, resentment: 0.35, dominanceNeed: 0.55 },
};

const AGENT_PAIRINGS: Record<string, { A: string; B: string }> = {
  'coop-coop': { A: 'cooperative', B: 'cooperative' },
  'coop-def': { A: 'cooperative', B: 'defensive' },
  'def-def': { A: 'defensive', B: 'defensive' },
};

const ENVIRONMENT_PRESETS: Record<string, ConflictState['environment']> = {
  calm: { resourceScarcity: 0.15, externalPressure: 0.2, visibility: 0.3, institutionalPressure: 0.5 },
  pressured: { resourceScarcity: 0.7, externalPressure: 0.75, visibility: 0.6, institutionalPressure: 0.25 },
};

// vector_base.B_decision_temperature -> trait.decisionTemperature atom ->
// S8 temperature = max(0.05, t * 2.5). The choice-policy dimension: at the
// mock default (0.5 -> T=1.25+) the Gumbel policy is exploratory; `cool`
// (0.12 -> T=0.3) approximates a near-greedy character.
const TEMPERATURE_PRESETS: Record<string, number> = {
  default: 0.5,
  cool: 0.12,
};

const FULL_SEEDS = [11, 23, 37, 59] as const;
const FULL_TICKS = 3;
const GATE_CELLS: Array<{ rel: string; agents: string; env: string; temp: string }> = [
  { rel: 'allied', agents: 'coop-coop', env: 'calm', temp: 'default' },
  { rel: 'strained', agents: 'def-def', env: 'pressured', temp: 'cool' },
];
const GATE_SEEDS = [11, 23] as const;
const GATE_TICKS = 2;

// ---------------------------------------------------------------------------
// Harness plumbing (same construction as conflictIntegration.test.ts).

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const provenance = (id: string): ObservationProvenanceV1 => ({
  sourceIds: [id],
  adapterSteps: [{ adapterId: 'conflict-parity-harness', adapterVersion: 1, inputIds: [id] }],
});

function rule(id: string, allow: string[]): VisibilityRuleV1 {
  return { ruleId: id, mode: 'participants', fieldAllowlist: allow, provenance: provenance(id) };
}

function parityScene(): ResolvedSceneInputV1 {
  return {
    schemaVersion: 1, systemVersion: KANONAR_SYSTEM_VERSION, sceneId: 'conflict-parity-scene',
    sourceRefs: [{ kind: 'test', id: 'conflict-parity' }], seed: 7, tick: 0,
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
    tags: ['conflict-parity'],
  };
}

function makeInitialState(relKey: string, agentsKey: string, envKey: string): ConflictState {
  const players = ['A', 'B'] as const;
  const rel = RELATION_PRESETS[relKey].kernel;
  const pairing = AGENT_PAIRINGS[agentsKey];
  const strategyProfiles: Record<string, StrategyProfile> = {
    A: { playerId: 'A', probabilities: { trust: 1 / 3, withhold: 1 / 3, betray: 1 / 3 } },
    B: { playerId: 'B', probabilities: { trust: 1 / 3, withhold: 1 / 3, betray: 1 / 3 } },
  };
  return {
    tick: 0,
    players,
    agents: {
      A: defaultConflictAgentState(AGENT_PRESETS[pairing.A]),
      B: defaultConflictAgentState(AGENT_PRESETS[pairing.B]),
    },
    relations: {
      A: { B: defaultConflictRelationState(rel) },
      B: { A: defaultConflictRelationState(rel) },
    },
    environment: ENVIRONMENT_PRESETS[envKey],
    history: [],
    strategyProfiles,
  };
}

interface RolloutCell { rel: string; agents: string; env: string; temp: string; seed: number; ticks: number }

function runRollout(cell: RolloutCell): ConflictParityDecisionRecordV1[] {
  const scene = parityScene();
  const resolution = resolveObservationsV1(scene);
  if (resolution.ok === false) throw new Error('parity scene failed validation');
  const goalLabProjection = adaptResolvedSceneToGoalLabV1(scene, resolution.value);

  const tomTraits = RELATION_PRESETS[cell.rel].tomTraits;
  const decisionTemperatureTrait = TEMPERATURE_PRESETS[cell.temp];
  // Named seeded channels persist across the rollout, one per player.
  const rngs: Record<string, () => number> = {
    A: lcg(cell.seed * 1000 + 1),
    B: lcg(cell.seed * 1000 + 2),
  };

  let state = makeInitialState(cell.rel, cell.agents, cell.env);
  const records: ConflictParityDecisionRecordV1[] = [];

  for (let tickIndex = 0; tickIndex < cell.ticks; tickIndex += 1) {
    const players: Record<string, any> = {};
    for (const observerId of ['A', 'B']) {
      const agents = [mockAgent('A'), mockAgent('B')];
      for (const agent of agents) {
        (agent as any).vector_base.B_decision_temperature = decisionTemperatureTrait;
      }
      const world = mockWorld(agents);
      (world as any).tick = state.tick;
      (world as any).observations = goalLabProjection.observations;
      (world as any).sceneSnapshot = goalLabProjection.sceneSnapshot;
      (world as any).resolvedObservations = goalLabProjection.observationEnvelopes;
      // Legacy ToM mirror of the relation preset; the scene evidence stays
      // static across ticks (belief update from conflict actions is a later
      // migration — documented limitation of this evidence pass).
      (world as any).tom = {
        A: { B: { traits: { ...tomTraits } } },
        B: { A: { traits: { ...tomTraits } } },
      };
      players[observerId] = {
        pipelineInput: {
          world, agentId: observerId, participantIds: ['A', 'B'],
          observeLiteParams: { seed: 1234 },
          manualAtoms: goalLabProjection.observationAtoms,
          // Live UI default profile: S5 OpponentBelief dual-emit ON, so the
          // bridge reads canonical tom:belief:final:* atoms first.
          sceneControl: { runtimeProfile: { profileId: 'phase1' } },
        },
        rng: rngs[observerId],
        rngChannelId: `parity:decide:${observerId}`,
      };
    }

    const result = runConflictJointDecisionV1({ state, players });
    expect(result.ok).toBe(true);
    if (result.ok === false) throw new Error(`joint decision failed: ${result.error.code}`);

    records.push(extractConflictParityRecordV1(result.value, {
      cellId: `rel=${cell.rel}|agents=${cell.agents}|env=${cell.env}|temp=${cell.temp}|seed=${cell.seed}`,
      dims: { rel: cell.rel, agents: cell.agents, env: cell.env, temp: cell.temp },
      seed: cell.seed,
      tickIndex,
    }));

    state = result.value.canonical.step.state;
  }

  return records;
}

function fullGridCells(): RolloutCell[] {
  const cells: RolloutCell[] = [];
  for (const rel of Object.keys(RELATION_PRESETS)) {
    for (const agents of Object.keys(AGENT_PAIRINGS)) {
      for (const env of Object.keys(ENVIRONMENT_PRESETS)) {
        for (const temp of Object.keys(TEMPERATURE_PRESETS)) {
          for (const seed of FULL_SEEDS) {
            cells.push({ rel, agents, env, temp, seed, ticks: FULL_TICKS });
          }
        }
      }
    }
  }
  return cells;
}

function gateGridCells(): RolloutCell[] {
  const cells: RolloutCell[] = [];
  for (const cell of GATE_CELLS) {
    for (const seed of GATE_SEEDS) {
      cells.push({ ...cell, seed, ticks: GATE_TICKS });
    }
  }
  return cells;
}

const runFull = process.env.CONFLICT_PARITY_FULL === '1';

describe('conflict parity rank concordance', () => {
  it('excludes one-sided ties from the denominator', () => {
    const canonical = { trust: 2, withhold: 2, betray: 0 };
    const reference = { trust: 3, withhold: 2, betray: 0 };
    expect(rankPairConcordanceV1(canonical, reference, TRUST_EXCHANGE_ACTION_ORDER)).toBe(1);
  });
});

describe('CONFLICT-PARITY-0 — dual-run parity evidence sweep', () => {
  it('collects structurally complete parity records across the grid', { timeout: 600000 }, () => {
    const cells = runFull ? fullGridCells() : gateGridCells();
    const records = cells.flatMap((cell) => runRollout(cell));
    const aggregate = aggregateConflictParityEvidenceV1(records);

    // Legal action sets and choice traces must be complete in every record:
    // parity numbers are only meaningful over full evidence.
    expect(aggregate.nDecisions).toBe(cells.reduce((sum, cell) => sum + cell.ticks, 0));
    expect(aggregate.legalSetMatchRate).toBe(1);
    expect(aggregate.traceCompleteRate).toBe(1);
    for (const record of records) {
      for (const playerId of record.players) {
        const player = record.byPlayer[playerId];
        expect(TRUST_EXCHANGE_ACTION_ORDER.includes(player.canonicalActionId)).toBe(true);
        expect(TRUST_EXCHANGE_ACTION_ORDER.includes(player.referenceActionId)).toBe(true);
        expect(player.canonicalRankOrder.length).toBe(TRUST_EXCHANGE_ACTION_ORDER.length);
        expect(player.rankPairConcordance).toBeGreaterThanOrEqual(0);
        expect(player.rankPairConcordance).toBeLessThanOrEqual(1);
      }
    }

    // When both lanes agree on the joint action, the learn_from_utility
    // transition must be equivalent to the kernel's own step.
    expect(aggregate.transitionParity.payoffsEqual).toBe(aggregate.transitionParity.nJointAgree);
    expect(aggregate.transitionParity.relationsEqual).toBe(aggregate.transitionParity.nJointAgree);
    expect(aggregate.transitionParity.profilesEqual).toBe(aggregate.transitionParity.nJointAgree);

    // Divergence is data, not failure: rates just have to be well-formed.
    expect(aggregate.actionAgreementRate).toBeGreaterThanOrEqual(0);
    expect(aggregate.actionAgreementRate).toBeLessThanOrEqual(1);
    expect(aggregate.meanRankPairConcordance).toBeGreaterThanOrEqual(0);
    expect(aggregate.meanRankPairConcordance).toBeLessThanOrEqual(1);

    const out = process.env.CONFLICT_PARITY_OUT;
    if (out) {
      mkdirSync(dirname(out), { recursive: true });
      if (!runFull) throw new Error('CONFLICT_PARITY_OUT requires CONFLICT_PARITY_FULL=1');
      writeFileSync(out, JSON.stringify(compactParityArtifact(aggregate), null, 2), 'utf8');
    }
    const recordsOut = process.env.CONFLICT_PARITY_RECORDS_OUT;
    if (recordsOut) {
      if (!runFull) throw new Error('CONFLICT_PARITY_RECORDS_OUT requires CONFLICT_PARITY_FULL=1');
      mkdirSync(dirname(recordsOut), { recursive: true });
      writeFileSync(recordsOut, JSON.stringify({ gridVersion: PARITY_GRID_VERSION, records }, null, 2), 'utf8');
    }
  });

  it('is deterministic: the same cell reproduces byte-identical records', () => {
    const cell: RolloutCell = { rel: 'neutral', agents: 'coop-def', env: 'calm', temp: 'default', seed: 11, ticks: 2 };
    const first = runRollout(cell);
    const second = runRollout(cell);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('pins the compact full-grid aggregate to the current tracked source', () => {
    const artifact = JSON.parse(readFileSync(PARITY_ARTIFACT_PATH, 'utf8')) as ReturnType<typeof compactParityArtifact>;
    expect(artifact.artifactSchemaVersion).toBe(PARITY_ARTIFACT_SCHEMA_VERSION);
    expect(artifact.mode).toBe('full');
    expect(artifact.source).toEqual(paritySourceFingerprint());
    expect(artifact.aggregate).toMatchObject({
      nDecisions: 432,
      nPlayerDecisions: 864,
      legalSetMatchRate: 1,
      traceCompleteRate: 1,
      transitionParity: {
        nJointAgree: 108,
        payoffsEqual: 108,
        relationsEqual: 108,
        profilesEqual: 108,
      },
    });
    expect((artifact as unknown as { records?: unknown }).records).toBeUndefined();
  });
});
