// lib/goal-lab/probe/rosterSweep.ts
//
// Workstream A: sweep each canonical vector_base axis as a δ around every real
// character's true baseline, across the scene battery, and emit per-character
// slope rows. The Python roster triage aggregates these into population
// sign-consistency (a sign that holds across the roster, not just at 0.5).
//
// Readouts (act:prior/util/goal/drv) are deterministic, so the map runs at 1
// seed by default; action_entropy (needs multi-seed) is intentionally excluded
// from the map and audited separately for the variance axes.

import { runProbe, type ProbeReadout } from './runProbe';
import { PROBE_SCENES, type ProbeScene } from './scenes';
import { loadRosterAgents, rosterAxes, type RosterMember } from './realAgents';

const MOVE_EPS = 0.02;          // |Δ| below this = no movement (not emitted)
// Only the endpoints are used for the slope, so the map sweeps δ = ±0.4 (the
// full range around baseline). Monotonicity within the range is not captured by
// the discovery map — that is fine; the triage tests sign-consistency across the
// population, not per-character monotonicity.
const DEFAULT_DELTAS = [-0.4, 0.4];

export interface RosterRecord {
  characterId: string;
  axis: string;
  base: number;        // the character's true baseline for this axis
  scene: string;
  readout: string;
  slope: number;       // result(δ_hi) − result(δ_lo)
  sign: number;        // sign(slope)
}

export interface RosterSweepOptions {
  members?: RosterMember[];
  axes?: string[];
  scenes?: ProbeScene[];
  deltas?: number[];
  seeds?: number[];
}

/** Flatten a ProbeReadout into a single readout→value map. */
function flatReadout(r: ProbeReadout): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(r.s7Domains)) out[`goal:${k}`] = v;
  for (const [k, v] of Object.entries(r.utilPlans)) out[`util:${k}`] = v;
  for (const [k, v] of Object.entries(r.actPriors)) out[`prior:${k}`] = v;
  for (const [k, v] of Object.entries(r.drivers)) out[`drv:${k}`] = v;
  out['ctxDanger'] = r.ctxDanger;
  return out;
}

export function rosterSweepRecords(opts: RosterSweepOptions = {}): RosterRecord[] {
  const members = opts.members ?? loadRosterAgents();
  const axes = opts.axes ?? rosterAxes(members);
  const scenes = opts.scenes ?? PROBE_SCENES;
  const deltas = (opts.deltas ?? DEFAULT_DELTAS).slice().sort((a, b) => a - b);
  const seeds = opts.seeds ?? [1];
  const records: RosterRecord[] = [];

  for (const member of members) {
    for (const axis of axes) {
      const base = Number((member.baseline as any)[axis]);
      if (!Number.isFinite(base)) continue; // axis not defined for this character

      for (const scene of scenes) {
        const series = deltas.map((d) => ({
          d,
          map: flatReadout(runProbe({ scene, agentTemplate: member.agent, axisDeltas: { [axis]: d }, seeds })),
        }));
        const lo = series[0].map;
        const hi = series[series.length - 1].map;
        const keys = new Set<string>([...Object.keys(lo), ...Object.keys(hi)]);
        for (const readout of keys) {
          const slope = (hi[readout] ?? 0) - (lo[readout] ?? 0);
          if (Math.abs(slope) < MOVE_EPS) continue;
          records.push({
            characterId: member.id,
            axis,
            base: Number(base.toFixed(4)),
            scene: scene.id,
            readout,
            slope: Number(slope.toFixed(4)),
            sign: Math.sign(slope),
          });
        }
      }
    }
  }

  return records;
}

export function rosterToCsv(records: RosterRecord[]): string {
  const header = 'characterId,axis,base,scene,readout,slope,sign';
  const lines = records.map((r) =>
    [r.characterId, r.axis, r.base, r.scene, r.readout, r.slope, r.sign].join(','),
  );
  return [header, ...lines].join('\n') + '\n';
}
