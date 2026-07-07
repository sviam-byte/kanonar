// tests/simkit/comm_threat_v1.test.ts
//
// I-2.1 Communication v1a contract + units.
//
// OFF (default): the comm-threat atom is never produced; deriveAxes' danger
// trace carries NO comm keys and the value path is max(x, 0) = x — the pinned
// MVP-0 golden hash (mvp0_golden.test.ts) is the byte-identity witness for
// whole-engine OFF behavior.
// ON: hand-computed unit for the producer and the axis join, plus a 1-seed
// end-to-end sign smoke (the 32-seed observation lives in mvp0_c1_sign_v1,
// env-gated, run after the freeze commit).

import { describe, it, expect } from 'vitest';
import { FC } from '../../lib/config/formulaConfig';
import { deriveCommThreatAtoms } from '../../lib/context/sources/commThreatAtoms';
import { deriveAxes } from '../../lib/context/axes/deriveAxes';
import { normalizeAtom } from '../../lib/context/v2/infer';
import { makeMvp0Simulator } from '../../lib/simkit/mvp0/runMvpRollout';
import { injectSpeechAtomTransform } from '../../lib/simkit/mvp0/runTwins';
import { MVP0_AGENT_A, MVP0_AGENT_B } from '../../lib/simkit/scenarios/mvp0Scene';

const speechThreat = (from: string, to: string, mag: number, conf: number) =>
  normalizeAtom({
    id: `speech:${from}:${to}:1:danger`,
    ns: 'ctx',
    kind: 'ctx',
    origin: 'obs',
    source: 'speech',
    magnitude: mag,
    confidence: conf,
    meta: { from, act: 'threaten' },
  });

describe('commThreat producer (I-2.1 units)', () => {
  it('derives max(mag·conf) over incoming threaten atoms, tracing contributors', () => {
    const atoms = [
      speechThreat('A', 'B', 0.7, 0.9), // 0.63
      speechThreat('C', 'B', 0.5, 0.8), // 0.40
      speechThreat('B', 'B', 1.0, 1.0), // own threat — excluded
      normalizeAtom({ id: 'ctx:danger:B', kind: 'ctx', magnitude: 0.9, meta: { from: 'A' } }), // no act — excluded
    ];
    const out = deriveCommThreatAtoms({ selfId: 'B', atoms });
    expect(out.atoms).toHaveLength(1);
    const atom = out.atoms[0];
    expect(atom.id).toBe('ctx:src:comm:threat:B');
    expect(atom.magnitude).toBeCloseTo(0.7 * 0.9, 12);
    expect(atom.trace?.usedAtomIds).toEqual(['speech:A:B:1:danger', 'speech:C:B:1:danger']);
  });

  it('no incoming threats ⇒ no atom', () => {
    expect(deriveCommThreatAtoms({ selfId: 'B', atoms: [speechThreat('B', 'B', 1, 1)] }).atoms).toHaveLength(0);
  });

  it('deriveAxes joins commThreat into danger: 0.25·0.45·commThreat on a clean floor', () => {
    const comm = deriveCommThreatAtoms({ selfId: 'B', atoms: [speechThreat('A', 'B', 0.7, 0.9)] }).atoms;
    const { atoms } = deriveAxes({ selfId: 'B', atoms: comm });
    const danger = atoms.find((a) => a.id === 'ctx:danger:B')!;
    // dangerBase = 0, hostility = 0 ⇒ danger = 0.25 · 0.45 · 0.63 = 0.070875
    expect(danger.magnitude).toBeCloseTo(0.25 * 0.45 * 0.63, 12);
    expect((danger.trace as any)?.parts?.commThreat?.val).toBeCloseTo(0.63, 12);
    expect(danger.trace?.usedAtomIds).toContain('ctx:src:comm:threat:B');
  });

  it('OFF-shape: without the comm atom the danger trace has NO comm keys (legacy bytes)', () => {
    const { atoms } = deriveAxes({ selfId: 'B', atoms: [] });
    const danger = atoms.find((a) => a.id === 'ctx:danger:B')!;
    expect((danger.trace as any)?.parts?.commThreat).toBeUndefined();
    expect((danger.trace as any)?.parts?.threatEff).toBeUndefined();
    expect(danger.trace?.usedAtomIds).not.toContain('ctx:src:comm:threat:B');
    expect((danger.trace as any)?.parts?.formula).toBe(
      'danger = 0.75*(danger * vulnFactor) + 0.25*(0.55*hostility + 0.45*sceneThreat)',
    );
  });
});

describe('commThreat end-to-end sign smoke (flag ON, 1 seed)', () => {
  it("injected threaten raises B's tick-1 safetyNeed vs base", () => {
    const flag = (FC.communication as any).speechThreatV1;
    flag.enabled = true;
    try {
      const read = (inject: boolean) => {
        const sim = makeMvp0Simulator(
          3,
          inject ? injectSpeechAtomTransform({ from: MVP0_AGENT_A, to: MVP0_AGENT_B }) : undefined,
        );
        sim.step();
        sim.step();
        const tr: any = (sim.world.facts as any)[`sim:trace:${MVP0_AGENT_B}`] ?? {};
        return Number(tr?.drivers?.safetyNeed ?? 0);
      };
      const base = read(false);
      const twin = read(true);
      expect(twin).toBeGreaterThan(base);
    } finally {
      flag.enabled = false;
    }
  }, 240000);
});
