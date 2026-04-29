// lib/simkit/compare/batchRunner.ts
// Headless comparison runner for two simulation configurations.
//
// Important properties:
// - deterministic under same seed/config,
// - returns complete records for downstream analysis/visualization,
// - keeps output JSON-serializable for UI and exports.

import { SimKitSimulator } from '../core/simulator';
import type { SimWorld, SimTickRecord } from '../core/types';
import { makeSimWorldFromSelection } from '../adapters/fromKanonarEntities';
import { makeGoalLabDeciderPlugin } from '../plugins/goalLabDeciderPlugin';
import { makeGoalLabPipelinePlugin } from '../plugins/goalLabPipelinePlugin';
import { makePerceptionMemoryPlugin } from '../plugins/perceptionMemoryPlugin';
import type { CharacterEntity, LocationEntity } from '../../../types';
import type { NarrativeBeat } from '../narrative/beatDetector';
import { applyPerturbations, type PerturbationVector } from './perturbationVector';

type ActionCounts = Record<string, Record<string, number>>;

export type PipelineTickState = {
  tick: number;
  mode: string;
  decisionMode: string;
  goalScores: Record<string, number>;
  drivers: Record<string, number>;
};

export type PipelineHistory = Record<string, Array<PipelineTickState | null>>;

export type RunConfig = {
  label: string;
  characters: CharacterEntity[];
  locations: LocationEntity[];
  placements: Record<string, string>;
  seed: number;
  maxTicks: number;
  /**
   * Optional pure transform applied to the freshly built SimWorld before the
   * simulator is constructed. Used by ProConflict Lab to inject epsilon perturbations.
   * Must not touch RNG state.
   */
  worldTransform?: (world: SimWorld) => SimWorld;
};

export type RunResult = {
  label: string;
  seed: number;
  ticks: number;
  records: SimTickRecord[];
  finalWorld: SimWorld;
  tensionHistory: number[];
  beats: NarrativeBeat[];
  agentTraces: Record<string, any>;
  stressHistory: Record<string, number[]>;
  actionCounts: ActionCounts;
  pipelineHistory: PipelineHistory;
};

function asNumberMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const n = Number(v);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}

function readDeltaAfter(rec: SimTickRecord, key: string): any {
  return (rec.trace?.deltas?.facts as any)?.[key]?.after;
}

function firstNonEmptyMap(...maps: Array<Record<string, number> | undefined>): Record<string, number> {
  for (const map of maps) {
    if (map && Object.keys(map).length) return map;
  }
  return {};
}

function buildPipelineHistory(records: SimTickRecord[], agentIds: string[]): PipelineHistory {
  const history: PipelineHistory = {};
  const current: Record<string, PipelineTickState | null> = {};

  for (const id of agentIds) {
    history[id] = [];
    current[id] = null;
  }

  records.forEach((rec, index) => {
    for (const id of agentIds) {
      const pipelineFact = readDeltaAfter(rec, `sim:pipeline:${id}`);
      const traceFact = readDeltaAfter(rec, `sim:trace:${id}`);
      const prev = current[id];
      const pipelineGoalScores = asNumberMap((pipelineFact as any)?.goalScores);
      const traceGoalScores = asNumberMap((traceFact as any)?.goalScores);
      const traceDrivers = asNumberMap((traceFact as any)?.drivers);
      const next: PipelineTickState | null = (pipelineFact || traceFact || prev)
        ? {
            tick: Number((pipelineFact as any)?.tick ?? (traceFact as any)?.tick ?? rec.trace?.tickIndex ?? index),
            mode: String((pipelineFact as any)?.mode ?? (traceFact as any)?.mode ?? prev?.mode ?? ''),
            decisionMode: String(
              (pipelineFact as any)?.decisionMode ?? (traceFact as any)?.decisionMode ?? prev?.decisionMode ?? '',
            ),
            goalScores: firstNonEmptyMap(pipelineGoalScores, traceGoalScores, prev?.goalScores),
            drivers: firstNonEmptyMap(traceDrivers, prev?.drivers),
          }
        : null;

      current[id] = next;
      history[id].push(next ? { ...next, goalScores: { ...next.goalScores }, drivers: { ...next.drivers } } : null);
    }
  });

  return history;
}

export function runBatch(config: RunConfig): RunResult {
  const baseWorld = makeSimWorldFromSelection({
    seed: config.seed,
    locations: config.locations,
    characters: config.characters,
    placements: config.placements,
  });
  const world = config.worldTransform ? config.worldTransform(baseWorld) : baseWorld;

  const sim = new SimKitSimulator({
    scenarioId: 'compare:batch',
    seed: config.seed,
    initialWorld: world,
    plugins: [
      makeGoalLabDeciderPlugin({ storePipeline: false }),
      makeGoalLabPipelinePlugin(),
      makePerceptionMemoryPlugin(),
    ],
    maxRecords: config.maxTicks + 10,
  });

  const records = sim.run(config.maxTicks);
  const agentIds = Object.keys(sim.world.characters || {}).sort();
  const pipelineHistory = buildPipelineHistory(records, agentIds);

  const stressHistory: Record<string, number[]> = {};
  const actionCounts: ActionCounts = {};

  for (const id of agentIds) {
    stressHistory[id] = [];
    actionCounts[id] = {};
  }

  for (const rec of records) {
    const chars = Array.isArray(rec.snapshot.characters) ? rec.snapshot.characters : [];
    for (const c of chars as any[]) {
      if (stressHistory[c.id]) stressHistory[c.id].push(Number(c.stress ?? 0));
    }

    const actions = Array.isArray(rec.trace.actionsApplied) ? rec.trace.actionsApplied : [];
    for (const a of actions as any[]) {
      if (!actionCounts[a.actorId]) actionCounts[a.actorId] = {};
      actionCounts[a.actorId][a.kind] = (actionCounts[a.actorId][a.kind] || 0) + 1;
    }
  }

  const agentTraces: Record<string, any> = {};
  for (const id of agentIds) {
    agentTraces[id] = (sim.world.facts as any)?.[`sim:trace:${id}`] ?? null;
  }

  return {
    label: config.label,
    seed: config.seed,
    ticks: records.length,
    records,
    finalWorld: sim.world,
    tensionHistory: sim.tensionHistory,
    beats: sim.beats,
    agentTraces,
    stressHistory,
    actionCounts,
    pipelineHistory,
  };
}

export type CompareResult = {
  runA: RunResult;
  runB: RunResult;
  firstDivergenceTick: number | null;
  uniqueActionsA: string[];
  uniqueActionsB: string[];
};

export function compareRuns(a: RunResult, b: RunResult): CompareResult {
  let firstDiv: number | null = null;
  const minLen = Math.min(a.tensionHistory.length, b.tensionHistory.length);

  for (let i = 0; i < minLen; i += 1) {
    if (Math.abs(Number(a.tensionHistory[i] ?? 0) - Number(b.tensionHistory[i] ?? 0)) > 0.15) {
      firstDiv = i;
      break;
    }
  }

  const allA = new Set<string>();
  const allB = new Set<string>();
  for (const rec of a.records) for (const act of rec.trace.actionsApplied || []) allA.add(String(act.kind));
  for (const rec of b.records) for (const act of rec.trace.actionsApplied || []) allB.add(String(act.kind));

  return {
    runA: a,
    runB: b,
    firstDivergenceTick: firstDiv,
    uniqueActionsA: [...allA].filter((k) => !allB.has(k)).sort(),
    uniqueActionsB: [...allB].filter((k) => !allA.has(k)).sort(),
  };
}

export type PerturbationRunPair = {
  runA: RunResult;
  runB: RunResult;
  perturbations: PerturbationVector[];
  applied: PerturbationVector[];
  skipped: Array<{ vec: PerturbationVector; reason: string }>;
  firstDivergenceTick: number | null;
};

/**
 * Run a base trajectory and an epsilon-perturbed trajectory with identical seed.
 * The perturbation is applied to the freshly built SimWorld via worldTransform,
 * so RNG channels remain seeded identically. Divergence is attributable
 * to state perturbation propagating through trait/archetype gates.
 */
export function runPair(
  config: RunConfig,
  perturbations: PerturbationVector[],
): PerturbationRunPair {
  const baseLabel = config.label || 'pair';
  const baseTransform = config.worldTransform;
  const runA = runBatch({ ...config, label: `${baseLabel}:A` });

  let appliedReport: { applied: PerturbationVector[]; skipped: Array<{ vec: PerturbationVector; reason: string }> } = {
    applied: [],
    skipped: [],
  };
  const runB = runBatch({
    ...config,
    label: `${baseLabel}:B`,
    worldTransform: (w) => {
      const transformed = baseTransform ? baseTransform(w) : w;
      const r = applyPerturbations(transformed, perturbations);
      appliedReport = { applied: r.applied, skipped: r.skipped };
      return r.world;
    },
  });

  const cmp = compareRuns(runA, runB);

  return {
    runA,
    runB,
    perturbations,
    applied: appliedReport.applied,
    skipped: appliedReport.skipped,
    firstDivergenceTick: cmp.firstDivergenceTick,
  };
}
