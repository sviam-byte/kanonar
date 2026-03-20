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

type ActionCounts = Record<string, Record<string, number>>;

export type RunConfig = {
  label: string;
  characters: CharacterEntity[];
  locations: LocationEntity[];
  placements: Record<string, string>;
  seed: number;
  maxTicks: number;
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
};

export function runBatch(config: RunConfig): RunResult {
  const world = makeSimWorldFromSelection({
    seed: config.seed,
    locations: config.locations,
    characters: config.characters,
    placements: config.placements,
  } as any);

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
