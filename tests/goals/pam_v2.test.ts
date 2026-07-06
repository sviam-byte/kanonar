import { describe, it, expect, afterEach } from 'vitest';

import { runProbe } from '@/lib/goal-lab/probe/runProbe';
import { S_coercive_order, sceneById } from '@/lib/goal-lab/probe/scenes';
import { OUTCOME_SIGN_TABLE_V5 } from '@/lib/goal-lab/probe/outcomeSignTableV5';
import { deriveActionPriors } from '@/lib/decision/actionPriors';
import { normalizeAtom } from '@/lib/context/v2/infer';
import { FC, PERSONALITY_ACTION_MAP_V2 } from '@/lib/config/formulaConfig';

// I-0.2 (ledger PAM-V2) HARNESS CONTRACT tests. Frozen v5 directions are NOT
// asserted here — they go to outcome_triage_v5. These pin:
//   (1) pamV2 is default-off;
//   (2) OFF is bit-identical to legacy: MAP-ABLATION EQUIVALENCE — the whole
//       ProbeReadout is deep-equal whether PERSONALITY_ACTION_MAP_V2 is
//       populated or emptied, under both priorInfluence states (the OFF
//       branch iterates the untouched v1 object by reference, so this is
//       exact, not approximate);
//   (3) ON wiring: prior:B:challenge / prior:B:defy exist and move with
//       A_Liberty_Autonomy (trait.autonomy is 1:1 from the axis);
//   (4) ON×ON mechanism: q of the challenge candidate moves with Liberty;
//   (5) the aggressive social-risk dampen covers the new verbs;
//   (6) v5 pre-registration structure.
// End-to-end OFF witness (no code here): the v4 exporter runs with pamV2
// OFF, so kanonar_behavior_lab/tests/test_interaction_perseed.py's sha256
// pin of outcome_sweep_on_v4.csv staying green after the v5 run proves the
// OFF path byte-identical through the whole pipeline.
// The OBS-VOCAB guard (negotiation_scenes.test.ts) lists betray/deceive/
// loot/defend_ally only — challenge/defy are intentionally NOT in it.

const PI = (FC.actionScoring as any).priorInfluence;
const PV2 = (FC.actionScoring as any).pamV2;
afterEach(() => { PI.enabled = false; PV2.enabled = false; });

/** Run fn with PERSONALITY_ACTION_MAP_V2 temporarily emptied (restored in finally). */
function withV2Ablated<T>(fn: () => T): T {
  const backup: Record<string, unknown> = {};
  for (const k of Object.keys(PERSONALITY_ACTION_MAP_V2)) {
    backup[k] = (PERSONALITY_ACTION_MAP_V2 as any)[k];
    delete (PERSONALITY_ACTION_MAP_V2 as any)[k];
  }
  try {
    return fn();
  } finally {
    Object.assign(PERSONALITY_ACTION_MAP_V2 as any, backup);
  }
}

function priorKeys(actPriors: Record<string, number>): string[] {
  return Object.keys(actPriors).filter(k => k.endsWith(':challenge') || k.endsWith(':defy'));
}

function qOfVerb(meanQ: Record<string, number>, verb: string): number {
  let best = 0;
  for (const [k, v] of Object.entries(meanQ)) if (k.split(':')[1] === verb) best = Math.max(best, v);
  return best;
}

describe('pamV2 flag (PAM-V2, default OFF)', () => {
  it('is off by default', () => {
    expect(PV2.enabled).toBe(false);
    expect(Object.keys(PERSONALITY_ACTION_MAP_V2).sort()).toEqual(['challenge', 'defy']);
  });

  it('OFF ⇒ the act:prior vocabulary is unchanged (no challenge/defy priors)', () => {
    const r = runProbe({ scene: S_coercive_order, axisOverrides: { A_Liberty_Autonomy: 0.9 }, seeds: [1] });
    expect(r.ok).toBe(true);
    expect(priorKeys(r.actPriors)).toEqual([]);
  });

  it('OFF ⇒ map-ablation equivalence: the whole readout is deep-equal with V2 emptied (both priorInfluence states)', () => {
    for (const pi of [false, true]) {
      PI.enabled = pi;
      const opts = {
        scene: S_coercive_order,
        axisOverrides: { A_Liberty_Autonomy: 0.9 },
        seeds: [1, 2],
      };
      const withV2 = runProbe(opts);
      const withoutV2 = withV2Ablated(() => runProbe(opts));
      expect(withV2, `priorInfluence=${pi}`).toEqual(withoutV2);
    }
  });
});

describe('pamV2 ON: wiring (prior layer, deterministic)', () => {
  it('emits prior:B:challenge and prior:B:defy, both rising with A_Liberty_Autonomy by > 0.1', () => {
    PV2.enabled = true;
    const lo = runProbe({ scene: S_coercive_order, axisOverrides: { A_Liberty_Autonomy: 0.1 }, seeds: [1] });
    const hi = runProbe({ scene: S_coercive_order, axisOverrides: { A_Liberty_Autonomy: 0.9 }, seeds: [1] });
    for (const verb of ['challenge', 'defy']) {
      const key = Object.keys(hi.actPriors).find(k => k.endsWith(`:${verb}`));
      expect(key, `prior key for ${verb}`).toBeTruthy();
      const d = hi.actPriors[key!] - (lo.actPriors[key!] ?? 0);
      expect(d, `Δprior(${verb}) = ${d.toFixed(3)}`).toBeGreaterThan(0.1);
    }
  });

  it('ON×ON ⇒ q of the challenge candidate moves with Liberty (> 0.02)', () => {
    PV2.enabled = true;
    PI.enabled = true;
    const lo = runProbe({ scene: S_coercive_order, axisOverrides: { A_Liberty_Autonomy: 0.1 }, seeds: [1] });
    const hi = runProbe({ scene: S_coercive_order, axisOverrides: { A_Liberty_Autonomy: 0.9 }, seeds: [1] });
    const d = qOfVerb(hi.s8MeanQ, 'challenge') - qOfVerb(lo.s8MeanQ, 'challenge');
    expect(d, `Δq(challenge) = ${d.toFixed(3)}`).toBeGreaterThan(0.02);
  });

  it('social risk dampens the new insubordinate priors (unit level)', () => {
    PV2.enabled = true;
    const selfId = 'agent1';
    const otherId = 'agent2';
    const mkAtom = (id: string, magnitude: number) =>
      normalizeAtom({ id, magnitude, confidence: 1, origin: 'test' } as any);
    const base = [
      mkAtom(`feat:char:${selfId}:trait.autonomy`, 0.9),
      mkAtom(`rel:state:${selfId}:${otherId}:trust`, 0.5),
      mkAtom(`obs:nearby:${selfId}:${otherId}`, 0.8),
    ];
    const risky = [
      ...base,
      mkAtom(`ctx:publicness:${selfId}`, 1),
      mkAtom(`ctx:surveillance:${selfId}`, 1),
    ];
    const find = (atoms: any[], act: string) =>
      atoms.find(a => a.id === `act:prior:${selfId}:${otherId}:${act}`);
    const calm = deriveActionPriors({ selfId, otherIds: [otherId], atoms: base });
    const damp = deriveActionPriors({ selfId, otherIds: [otherId], atoms: risky });
    for (const verb of ['challenge', 'defy']) {
      const c = find(calm, verb);
      const d = find(damp, verb);
      expect(c, `${verb} present`).toBeDefined();
      expect(d, `${verb} present under risk`).toBeDefined();
      expect(d.magnitude, `${verb} dampened`).toBeLessThan(c.magnitude);
    }
  });
});

describe('v5 pre-registration structure (directions go to triage, not tests)', () => {
  it('4 frozen rows: R0 flat control, R1 S8 wiring, R2/R3 OUTCOME; 512 seeds declared', () => {
    expect(OUTCOME_SIGN_TABLE_V5).toHaveLength(4);
    for (const p of OUTCOME_SIGN_TABLE_V5) {
      expect(p.priorInfluence).toBe('on');
      expect(sceneById(p.scene), `scene ${p.scene} exists`).toBeTruthy();
      expect(p.seeds).toBe(512);
    }
    const byId = Object.fromEntries(OUTCOME_SIGN_TABLE_V5.map(p => [p.id, p]));
    expect(byId.R0.pamV2).toBe('off');
    expect(byId.R0.direction).toBe('flat');
    expect(byId.R1.layer).toBe('S8');
    expect(byId.R1.direction).toBe('up');
    expect(byId.R2.layer).toBe('OUTCOME');
    expect(byId.R3.direction).toBe('contrast_up');
  });
});
