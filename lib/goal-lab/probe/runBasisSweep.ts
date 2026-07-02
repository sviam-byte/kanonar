// lib/goal-lab/probe/runBasisSweep.ts
//
// Phase 3 driver: sweep every active (non-pending) sign-table prediction across
// its predicted scene, plus each axis across S_neutral as a leak control, and
// return the concatenated long-format records. The Python triage
// (kanonar_behavior_lab/src/basis/triage.py) consumes the CSV.

import { sweepAxis, linspace, type ProbeRecord } from './sweep';
import { activePredictions } from './signTable';
import { outcomeActivePredictions } from './outcomeSignTable';
import { sceneById, S_neutral } from './scenes';

export interface BasisSweepOptions {
  values?: number[];
  seeds?: number[];
}

export function basisSweepRecords(opts: BasisSweepOptions = {}): ProbeRecord[] {
  const values = opts.values ?? linspace(0, 1, 7);
  const seeds = opts.seeds ?? [1, 2, 3, 4, 5, 6, 7, 8];
  const out: ProbeRecord[] = [];

  const seenControl = new Set<string>();
  const sweptPairs = new Set<string>();
  // v1 (observable A) ∪ v2 (observable B) predictions, deduped on axis×scene:
  // a pair already swept for v1 (e.g. A_Power_Sovereignty × S_contest) emits
  // its OUTCOME records automatically via sweepAxis, so no double work.
  const targets = [...activePredictions(), ...outcomeActivePredictions()];
  for (const p of targets) {
    const pair = `${p.axis}|${p.scene}`;
    if (sweptPairs.has(pair)) continue;
    sweptPairs.add(pair);

    const scene = sceneById(p.scene);
    if (!scene) continue;
    out.push(...sweepAxis({ axis: p.axis, scene, values, seeds }));

    // One control sweep per distinct axis: same axis in the empty room must
    // show ~no differentiation (otherwise the scene/affordance leaked).
    // S_neutral carries no game, so it emits no OUTCOME rows — that absence
    // is itself the control for observable B.
    if (!seenControl.has(p.axis)) {
      seenControl.add(p.axis);
      out.push(...sweepAxis({ axis: p.axis, scene: S_neutral, values, seeds }));
    }
  }

  return out;
}
