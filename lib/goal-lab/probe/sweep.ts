// lib/goal-lab/probe/sweep.ts
//
// Sweep one axis 0->1 across a scene and emit a long-format table
// (axis, value, scene, layer, readout, result) — ready for CSV/JSON export to
// the fc analytics stack for Phase 3 triage (PASS / DEAD / MISLABELED /
// NON-MONOTONE / BUG).

import { runProbe } from './runProbe';
import type { ProbeScene } from './scenes';

export interface ProbeRecord {
  axis: string;
  value: number;
  scene: string;
  layer: 'S6' | 'S7' | 'S8' | 'STATE' | 'OUTCOME';
  readout: string;
  result: number;
}

export interface SweepOptions {
  axis: string;
  scene: ProbeScene;
  /** Axis values to sweep; default 0..1 in 7 steps. */
  values?: number[];
  /** Other axes held fixed (default: basis baseline at 0.5). */
  baseAxisOverrides?: Record<string, number>;
  seeds?: number[];
}

export function linspace(lo: number, hi: number, n: number): number[] {
  if (n <= 1) return [lo];
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(lo + ((hi - lo) * i) / (n - 1));
  return out;
}

export function sweepAxis(opts: SweepOptions): ProbeRecord[] {
  const values = opts.values ?? linspace(0, 1, 7);
  const base = opts.baseAxisOverrides ?? {};
  const records: ProbeRecord[] = [];

  for (const value of values) {
    const readout = runProbe({
      scene: opts.scene,
      axisOverrides: { ...base, [opts.axis]: value },
      seeds: opts.seeds,
    });

    const push = (layer: ProbeRecord['layer'], r: string, result: number) =>
      records.push({ axis: opts.axis, value, scene: opts.scene.id, layer, readout: r, result });

    for (const [domain, score] of Object.entries(readout.s7Domains)) push('S7', `goal:${domain}`, score);
    for (const [plan, mag] of Object.entries(readout.utilPlans)) push('S7', `util:${plan}`, mag);
    for (const [prior, mag] of Object.entries(readout.actPriors)) push('S8', `prior:${prior}`, mag);
    for (const [drv, mag] of Object.entries(readout.drivers)) push('S6', `drv:${drv}`, mag);
    for (const [act, prob] of Object.entries(readout.s8Distribution)) push('S8', `act:${act}`, prob);
    for (const [act, q] of Object.entries(readout.s8MeanQ)) push('S8', `q:${act}`, q);
    push('S8', 'action_entropy', readout.s8ActionEntropy);
    push('STATE', 'stress', readout.stress);
    push('STATE', 'ctxDanger', readout.ctxDanger);

    // Observable B (T1): emitted only for scenes carrying a game, so CSVs of
    // non-payoff scenes stay byte-identical.
    if (opts.scene.game) {
      for (const [label, prob] of Object.entries(readout.outcomeDistribution)) {
        push('OUTCOME', `outcome:${label}`, prob);
      }
      push('OUTCOME', 'outcome_mean_self', readout.outcomeMeanSelf);
      push('OUTCOME', 'outcome_mean_other', readout.outcomeMeanOther);
      push('OUTCOME', 'coop_rate', readout.coopRate);
      push('OUTCOME', 'unclassified_rate', readout.unclassifiedRate);
    }
  }

  return records;
}

export function toCsv(records: ProbeRecord[]): string {
  const header = 'axis,value,scene,layer,readout,result';
  const lines = records.map(r =>
    [r.axis, r.value, r.scene, r.layer, r.readout, r.result]
      .map(x => (typeof x === 'string' && x.includes(',') ? JSON.stringify(x) : String(x)))
      .join(','),
  );
  return [header, ...lines].join('\n') + '\n';
}
