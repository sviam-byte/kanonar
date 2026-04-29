// lib/simkit/compare/divergenceMetrics.ts
// ProConflict Lab: per-tick trajectory divergence metrics + Lyapunov estimator.
//
// Given two RunResults from runPair(), compute D(t): a composite scalar that
// measures how far the perturbed trajectory has drifted from baseline. The
// composite blends four normalized components: tension delta, action Hamming
// distance, goal-domain KL divergence, and per-agent stress L1.
//
// Atom-level L2 over S6/S7 atoms is omitted in v0 because RunResult does not
// retain full pipeline stages on every tick (storePipeline:false in batchRunner).
// runBatch keeps a compact per-agent pipelineHistory for live metrics instead.

import type { RunResult } from './batchRunner';
import type { SimTickRecord } from '../core/types';

export type DivergenceWeights = {
  tension: number;
  actionHamming: number;
  goalKL: number;
  stressL1: number;
};

export const DEFAULT_DIVERGENCE_WEIGHTS: DivergenceWeights = {
  tension: 0.25,
  actionHamming: 0.25,
  goalKL: 0.25,
  stressL1: 0.25,
};

export type DivergenceTrace = {
  tick: number;
  tensionDelta: number;
  actionHamming: number;
  goalKL: number;
  stressL1: number;
  composite: number;
};

function safeNum(x: unknown, fallback = 0): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function actionByAgent(rec: SimTickRecord | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  const acts = rec?.trace?.actionsApplied || [];
  for (const a of acts as Array<Record<string, unknown>>) {
    const id = String(a?.actorId ?? '');
    if (id) out[id] = String(a?.kind ?? '');
  }
  return out;
}

function hammingActions(a: SimTickRecord | undefined, b: SimTickRecord | undefined): number {
  const ma = actionByAgent(a);
  const mb = actionByAgent(b);
  const ids = new Set<string>([...Object.keys(ma), ...Object.keys(mb)]);
  let diff = 0;
  for (const id of ids) {
    if ((ma[id] || '') !== (mb[id] || '')) diff += 1;
  }
  return ids.size > 0 ? diff / ids.size : 0;
}

function goalDomainDistribution(run: RunResult, tick: number): Record<string, number> {
  // Prefer S7 goal-domain scores captured from sim:pipeline:<id>. When a tick
  // has no score map, fall back to mode counts so mode bifurcations still count.
  const scoreDist: Record<string, number> = {};
  const modeDist: Record<string, number> = {};
  let hasScores = false;

  for (const history of Object.values(run.pipelineHistory || {})) {
    const state = history?.[tick];
    if (!state) continue;

    for (const [domain, raw] of Object.entries(state.goalScores || {})) {
      const score = safeNum(raw);
      if (score <= 0) continue;
      hasScores = true;
      scoreDist[domain] = (scoreDist[domain] || 0) + score;
    }

    if (state.mode) {
      modeDist[state.mode] = (modeDist[state.mode] || 0) + 1;
    }
  }

  return hasScores ? scoreDist : modeDist;
}

/**
 * Symmetric KL divergence over discrete distributions, normalized to [0,1] via
 * a soft cap. Distributions are renormalized first; missing keys get an eps floor.
 */
function symmetricKL(p: Record<string, number>, q: Record<string, number>): number {
  const keys = new Set<string>([...Object.keys(p), ...Object.keys(q)]);
  if (keys.size === 0) return 0;
  const eps = 1e-3;
  const totalP = Object.values(p).reduce((s, v) => s + v, 0) + eps * keys.size;
  const totalQ = Object.values(q).reduce((s, v) => s + v, 0) + eps * keys.size;
  let kl = 0;
  for (const k of keys) {
    const pi = ((p[k] || 0) + eps) / totalP;
    const qi = ((q[k] || 0) + eps) / totalQ;
    kl += pi * Math.log(pi / qi) + qi * Math.log(qi / pi);
  }
  // Soft cap: KL of two disjoint distributions can be large; squash to [0,1].
  return 1 - Math.exp(-kl);
}

function stressL1(
  runA: RunResult,
  runB: RunResult,
  tick: number,
): number {
  const ids = Object.keys(runA.stressHistory);
  if (!ids.length) return 0;
  let sum = 0;
  let count = 0;
  for (const id of ids) {
    const sa = safeNum(runA.stressHistory[id]?.[tick]);
    const sb = safeNum(runB.stressHistory[id]?.[tick]);
    sum += Math.abs(sa - sb);
    count += 1;
  }
  return count > 0 ? sum / count : 0;
}

/**
 * Compute per-tick divergence between two runs. Returns a trace of length
 * min(runA.ticks, runB.ticks). Caller can plot composite as D(t).
 */
export function computeDivergenceTrace(
  runA: RunResult,
  runB: RunResult,
  weights: DivergenceWeights = DEFAULT_DIVERGENCE_WEIGHTS,
): DivergenceTrace[] {
  const len = Math.min(runA.records.length, runB.records.length);
  const out: DivergenceTrace[] = [];

  for (let t = 0; t < len; t += 1) {
    const recA = runA.records[t];
    const recB = runB.records[t];

    const tensionDelta = Math.abs(
      safeNum(runA.tensionHistory[t]) - safeNum(runB.tensionHistory[t]),
    );
    const action = hammingActions(recA, recB);
    const goalKL = symmetricKL(goalDomainDistribution(runA, t), goalDomainDistribution(runB, t));
    const stress = stressL1(runA, runB, t);

    const composite =
      weights.tension * tensionDelta +
      weights.actionHamming * action +
      weights.goalKL * goalKL +
      weights.stressL1 * stress;

    out.push({
      tick: t,
      tensionDelta,
      actionHamming: action,
      goalKL,
      stressL1: stress,
      composite,
    });
  }

  return out;
}

/**
 * Lyapunov-style divergence rate: lambda ~= (1/T) * log(D(T) / D(0)).
 * D(0) uses the first non-zero composite to avoid log(0). If divergence never
 * appears, returns 0. Higher lambda means the system amplifies epsilon faster.
 */
export function computeLyapunov(trace: DivergenceTrace[]): number {
  if (trace.length < 2) return 0;
  const eps = 1e-6;
  let i0 = -1;
  for (let i = 0; i < trace.length; i += 1) {
    if (trace[i].composite > eps) {
      i0 = i;
      break;
    }
  }
  if (i0 < 0) return 0;

  const last = trace[trace.length - 1];
  const d0 = Math.max(eps, trace[i0].composite);
  const dT = Math.max(eps, last.composite);
  const T = Math.max(1, last.tick - trace[i0].tick);
  return Math.log(dT / d0) / T;
}

/**
 * Convenience: find the first tick where composite divergence crosses a
 * threshold. Useful for highlighting bifurcation onset in the UI.
 */
export function firstDivergenceTickFromTrace(
  trace: DivergenceTrace[],
  threshold: number,
): number | null {
  for (const dt of trace) {
    if (dt.composite > threshold) return dt.tick;
  }
  return null;
}
