// lib/simkit/compare/amplifierAttribution.ts
// ProConflict Lab: post-hoc attribution of trajectory divergence to specific
// nonlinear amplifier gates inside the GoalLab/SimKit loop.
//
// The runner keeps compact per-tick pipelineHistory from existing trace facts:
// - trace.actionsApplied -> action-kind flips
// - pipelineHistory[*].mode -> mode flips
// - pipelineHistory[*].drivers -> driver threshold crossings
// - stressHistory / tensionHistory -> coarse divergence onset

import type { RunResult, PipelineTickState } from './batchRunner';
import type { SimTickRecord } from '../core/types';

export type AmplifierGate =
  | 'action.kindFlip'
  | 'mode.flip'
  | 'driver.crossing'
  | 'tension.spike'
  | 'stress.spike';

export type AmplifierEvent = {
  tick: number;
  agentId: string;
  gate: AmplifierGate;
  baseline: number | string;
  perturbed: number | string;
  threshold?: number;
  evidence: string;
};

const DRIVER_THRESHOLD = 0.3;
const TENSION_SPIKE = 0.1;
const STRESS_SPIKE = 0.05;

function actionByAgent(rec: SimTickRecord | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of rec?.trace?.actionsApplied ?? []) {
    const id = String((a as any).actorId ?? '');
    if (id) out[id] = String((a as any).kind ?? '');
  }
  return out;
}

function agentIds(runA: RunResult, runB: RunResult): string[] {
  return Array.from(new Set([
    ...Object.keys(runA.pipelineHistory || {}),
    ...Object.keys(runB.pipelineHistory || {}),
    ...Object.keys(runA.stressHistory || {}),
    ...Object.keys(runB.stressHistory || {}),
  ])).sort();
}

function stateAt(run: RunResult, id: string, tick: number): PipelineTickState | null {
  return run.pipelineHistory?.[id]?.[tick] ?? null;
}

function crossedThreshold(before: unknown, after: unknown, threshold: number): boolean {
  const b = Number(before);
  const a = Number(after);
  if (!Number.isFinite(b) || !Number.isFinite(a)) return false;
  return (b < threshold && a >= threshold) || (b >= threshold && a < threshold);
}

function detectActionFlips(
  recA: SimTickRecord | undefined,
  recB: SimTickRecord | undefined,
  tick: number,
): AmplifierEvent[] {
  const ma = actionByAgent(recA);
  const mb = actionByAgent(recB);
  const ids = new Set<string>([...Object.keys(ma), ...Object.keys(mb)]);
  const out: AmplifierEvent[] = [];
  for (const id of ids) {
    const a = ma[id] ?? '';
    const b = mb[id] ?? '';
    if (a !== b) {
      out.push({
        tick,
        agentId: id,
        gate: 'action.kindFlip',
        baseline: a || 'none',
        perturbed: b || 'none',
        evidence: `agent chose '${a || 'none'}' in baseline vs '${b || 'none'}' in perturbed`,
      });
    }
  }
  return out;
}

function detectModeFlips(
  runA: RunResult,
  runB: RunResult,
  tick: number,
  seen: Set<string>,
): AmplifierEvent[] {
  const out: AmplifierEvent[] = [];
  for (const id of agentIds(runA, runB)) {
    const aMode = stateAt(runA, id, tick)?.mode || '';
    const bMode = stateAt(runB, id, tick)?.mode || '';
    if (!aMode && !bMode) continue;
    if (aMode === bMode) continue;

    const key = `${id}:${aMode}:${bMode}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      tick,
      agentId: id,
      gate: 'mode.flip',
      baseline: aMode || 'none',
      perturbed: bMode || 'none',
      evidence: `pipeline mode diverged: ${aMode || 'none'} vs ${bMode || 'none'}`,
    });
  }
  return out;
}

function detectDriverCrossings(
  runA: RunResult,
  runB: RunResult,
  tick: number,
): AmplifierEvent[] {
  if (tick <= 0) return [];

  const out: AmplifierEvent[] = [];
  for (const id of agentIds(runA, runB)) {
    const prevA = stateAt(runA, id, tick - 1)?.drivers || {};
    const curA = stateAt(runA, id, tick)?.drivers || {};
    const prevB = stateAt(runB, id, tick - 1)?.drivers || {};
    const curB = stateAt(runB, id, tick)?.drivers || {};
    const keys = new Set<string>([
      ...Object.keys(prevA),
      ...Object.keys(curA),
      ...Object.keys(prevB),
      ...Object.keys(curB),
    ]);

    for (const driver of keys) {
      const aCrossed = crossedThreshold(prevA[driver], curA[driver], DRIVER_THRESHOLD);
      const bCrossed = crossedThreshold(prevB[driver], curB[driver], DRIVER_THRESHOLD);
      if (aCrossed === bCrossed) continue;

      const aAfter = Number(curA[driver]);
      const bAfter = Number(curB[driver]);
      out.push({
        tick,
        agentId: id,
        gate: 'driver.crossing',
        baseline: Number.isFinite(aAfter) ? aAfter.toFixed(3) : 'none',
        perturbed: Number.isFinite(bAfter) ? bAfter.toFixed(3) : 'none',
        threshold: DRIVER_THRESHOLD,
        evidence: `${driver} crossed threshold in ${aCrossed ? 'baseline' : 'perturbed'} only`,
      });
    }
  }

  return out;
}

function detectStressSpikes(
  runA: RunResult,
  runB: RunResult,
  tick: number,
  prevSpikeAgents: Set<string>,
): AmplifierEvent[] {
  const out: AmplifierEvent[] = [];
  for (const id of agentIds(runA, runB)) {
    if (prevSpikeAgents.has(id)) continue;
    const sA = Number(runA.stressHistory[id]?.[tick] ?? NaN);
    const sB = Number(runB.stressHistory[id]?.[tick] ?? NaN);
    if (!Number.isFinite(sA) || !Number.isFinite(sB)) continue;
    if (Math.abs(sA - sB) >= STRESS_SPIKE) {
      prevSpikeAgents.add(id);
      out.push({
        tick,
        agentId: id,
        gate: 'stress.spike',
        baseline: sA.toFixed(3),
        perturbed: sB.toFixed(3),
        threshold: STRESS_SPIKE,
        evidence: `stress diverged by ${Math.abs(sA - sB).toFixed(3)} (first crossing)`,
      });
    }
  }
  return out;
}

function detectTensionSpike(
  runA: RunResult,
  runB: RunResult,
  tick: number,
): AmplifierEvent | null {
  const tA = Number(runA.tensionHistory[tick] ?? NaN);
  const tB = Number(runB.tensionHistory[tick] ?? NaN);
  if (!Number.isFinite(tA) || !Number.isFinite(tB)) return null;
  if (Math.abs(tA - tB) < TENSION_SPIKE) return null;
  return {
    tick,
    agentId: '*',
    gate: 'tension.spike',
    baseline: tA.toFixed(3),
    perturbed: tB.toFixed(3),
    threshold: TENSION_SPIKE,
    evidence: `world-level tension diverged by ${Math.abs(tA - tB).toFixed(3)}`,
  };
}

/**
 * Walk both runs in lock-step and emit AmplifierEvents at each tick where the
 * runs diverge in observable ways. Events are returned in tick order; the
 * cascade across stages (driver crossing -> mode flip -> action flip) reads
 * left-to-right.
 */
export function attributeAmplifiers(
  runA: RunResult,
  runB: RunResult,
  fromTick: number = 0,
  toTick: number = Infinity,
): AmplifierEvent[] {
  const len = Math.min(runA.records.length, runB.records.length);
  const lo = Math.max(0, fromTick);
  const hi = Math.min(len - 1, Number.isFinite(toTick) ? toTick : len - 1);
  const out: AmplifierEvent[] = [];
  const stressFirstCrossed = new Set<string>();
  const modeFlipsSeen = new Set<string>();

  for (let t = lo; t <= hi; t += 1) {
    const recA = runA.records[t];
    const recB = runB.records[t];

    out.push(...detectDriverCrossings(runA, runB, t));
    out.push(...detectModeFlips(runA, runB, t, modeFlipsSeen));
    out.push(...detectActionFlips(recA, recB, t));

    const tensionEvt = detectTensionSpike(runA, runB, t);
    if (tensionEvt) out.push(tensionEvt);

    out.push(...detectStressSpikes(runA, runB, t, stressFirstCrossed));
  }

  const gateOrder: Record<AmplifierGate, number> = {
    'driver.crossing': 0,
    'mode.flip': 1,
    'action.kindFlip': 2,
    'tension.spike': 3,
    'stress.spike': 4,
  };
  out.sort((a, b) => {
    if (a.tick !== b.tick) return a.tick - b.tick;
    const ga = gateOrder[a.gate] ?? 99;
    const gb = gateOrder[b.gate] ?? 99;
    if (ga !== gb) return ga - gb;
    return a.agentId.localeCompare(b.agentId);
  });

  return out;
}
