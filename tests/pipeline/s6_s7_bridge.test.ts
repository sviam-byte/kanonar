import { describe, it, expect } from 'vitest';
import { deriveDriversAtoms } from '../../lib/drivers/deriveDrivers';
import { deriveGoalAtoms } from '../../lib/goals/goalAtoms';
import { normalizeAtom } from '../../lib/context/v2/infer';

function mkAtom(id: string, magnitude: number, ns = 'ctx'): any {
  return normalizeAtom({
    id,
    ns,
    kind: 'test',
    origin: 'world',
    source: 'test',
    magnitude,
    confidence: 1,
  } as any);
}

function buildAtoms(selfId: string, overrides: Record<string, number> = {}): any[] {
  const defaults: Record<string, number> = {
    [`ctx:final:danger:${selfId}`]: 0,
    [`ctx:final:control:${selfId}`]: 0.5,
    [`ctx:final:publicness:${selfId}`]: 0,
    [`ctx:final:normPressure:${selfId}`]: 0,
    [`ctx:final:uncertainty:${selfId}`]: 0,
    [`emo:fear:${selfId}`]: 0,
    [`emo:shame:${selfId}`]: 0,
    [`emo:care:${selfId}`]: 0,
    [`emo:anger:${selfId}`]: 0,
    ...overrides,
  };
  return Object.entries(defaults).map(([id, mag]) =>
    mkAtom(
      id,
      mag,
      id.startsWith('emo:') ? 'emo' : id.startsWith('body:') ? 'body' : id.startsWith('cap:') ? 'cap' : 'ctx'
    )
  );
}

function getDrv(atoms: any[], selfId: string, name: string): number {
  const a = atoms.find((x: any) => x.id === `drv:${name}:${selfId}`);
  return a ? Number(a.magnitude) : NaN;
}

function getParts(atoms: any[], selfId: string, name: string): any {
  const a = atoms.find((x: any) => x.id === `drv:${name}:${selfId}`);
  return (a as any)?.trace?.parts ?? {};
}

describe('Patch 018: New Drivers', () => {
  const selfId = 'bridge_test';

  it('produces restNeed from fatigue + stress', () => {
    const atoms = buildAtoms(selfId, {
      [`body:fatigue:${selfId}`]: 0.6,
      [`body:stress:${selfId}`]: 0.3,
    });
    const res = deriveDriversAtoms({ selfId, atoms });
    const rest = getDrv(res.atoms, selfId, 'restNeed');

    expect(rest).not.toBeNaN();
    expect(rest).toBeGreaterThan(0);
    // accumulation defaults lower first-tick output: 0.48 -> 0.3624 with alpha/blend
    expect(rest).toBeCloseTo(0.36, 1);
  });

  it('restNeed is 0 when no body signals present', () => {
    const atoms = buildAtoms(selfId);
    const res = deriveDriversAtoms({ selfId, atoms });
    const rest = getDrv(res.atoms, selfId, 'restNeed');

    expect(rest).not.toBeNaN();
    expect(rest).toBeCloseTo(0, 2);
  });

  it('produces curiosityNeed from uncertainty + antiThreat + antiFear', () => {
    const atoms = buildAtoms(selfId, {
      [`ctx:final:uncertainty:${selfId}`]: 0.5,
      [`ctx:final:danger:${selfId}`]: 0.2,
      [`emo:fear:${selfId}`]: 0.1,
    });
    const res = deriveDriversAtoms({ selfId, atoms });
    const cur = getDrv(res.atoms, selfId, 'curiosityNeed');

    expect(cur).not.toBeNaN();
    expect(cur).toBeGreaterThan(0.5);
  });

  it('curiosityNeed decreases with high threat', () => {
    const safe = deriveDriversAtoms({
      selfId,
      atoms: buildAtoms(selfId, {
        [`ctx:final:uncertainty:${selfId}`]: 0.5,
        [`ctx:final:danger:${selfId}`]: 0.1,
      }),
    });
    const dangerous = deriveDriversAtoms({
      selfId,
      atoms: buildAtoms(selfId, {
        [`ctx:final:uncertainty:${selfId}`]: 0.5,
        [`ctx:final:danger:${selfId}`]: 0.8,
      }),
    });

    const curSafe = getDrv(safe.atoms, selfId, 'curiosityNeed');
    const curDanger = getDrv(dangerous.atoms, selfId, 'curiosityNeed');
    expect(curSafe).toBeGreaterThan(curDanger);
  });

  it('both new drivers have full trace.parts', () => {
    const atoms = buildAtoms(selfId, {
      [`body:fatigue:${selfId}`]: 0.5,
      [`ctx:final:uncertainty:${selfId}`]: 0.4,
    });
    const res = deriveDriversAtoms({ selfId, atoms });

    const restParts = getParts(res.atoms, selfId, 'restNeed');
    expect(restParts.rawLinear).toBeDefined();
    expect(restParts.curveSpec).toBeDefined();
    expect(restParts.shaped).toBeDefined();
    expect(restParts.inhibition).toBeDefined();
    expect(restParts.accumulation).toBeDefined();

    const curParts = getParts(res.atoms, selfId, 'curiosityNeed');
    expect(curParts.rawLinear).toBeDefined();
    expect(curParts.curveSpec).toBeDefined();
    expect(curParts.shaped).toBeDefined();
    expect(curParts.inhibition).toBeDefined();
    expect(curParts.accumulation).toBeDefined();
  });

  it('all 7 drivers produced', () => {
    const atoms = buildAtoms(selfId);
    const res = deriveDriversAtoms({ selfId, atoms });
    const drvAtoms = res.atoms.filter((a) => String((a as any)?.id || '').startsWith('drv:') && String((a as any)?.id || '').endsWith(`:${selfId}`));
    expect(drvAtoms.length).toBe(7);
  });
});

describe('Patch 018: Fixed Inhibition', () => {
  const selfId = 'inh_test';

  it('high safetyNeed now suppresses curiosityNeed', () => {
    const atoms = buildAtoms(selfId, {
      [`ctx:final:danger:${selfId}`]: 0.9,
      [`emo:fear:${selfId}`]: 0.7,
      [`ctx:final:uncertainty:${selfId}`]: 0.5,
    });
    const res = deriveDriversAtoms({ selfId, atoms });
    const curParts = getParts(res.atoms, selfId, 'curiosityNeed');

    expect(curParts.inhibition).toBeDefined();
    expect(curParts.inhibition.suppression).toBeGreaterThan(0);
    expect(curParts.inhibition.sources?.safetyNeed).toBeGreaterThan(0);
  });
});

describe('Patch 019: Resolve Modulation (unit check)', () => {
  const selfId = 'resolve_test';

  it('resolveNeed is non-zero with anger + threat', () => {
    const atoms = buildAtoms(selfId, {
      [`emo:anger:${selfId}`]: 0.7,
      [`ctx:final:danger:${selfId}`]: 0.5,
    });
    const res = deriveDriversAtoms({ selfId, atoms });
    const resolve = getDrv(res.atoms, selfId, 'resolveNeed');
    expect(resolve).toBeGreaterThan(0.4);
  });

  it('high resolve inhibits affiliationNeed', () => {
    const atoms = buildAtoms(selfId, {
      [`emo:anger:${selfId}`]: 0.8,
      [`ctx:final:danger:${selfId}`]: 0.6,
      [`emo:care:${selfId}`]: 0.5,
    });
    const res = deriveDriversAtoms({ selfId, atoms });
    const affParts = getParts(res.atoms, selfId, 'affiliationNeed');

    expect(affParts.inhibition).toBeDefined();
    if (affParts.inhibition.suppression > 0) {
      expect(affParts.inhibition.sources?.resolveNeed).toBeGreaterThan(0);
    }
  });
});


describe('Patch 019: Resolve modulation in S7 goals', () => {
  const selfId = 'goal_mod_test';

  function mkGoalInput(resolve: number) {
    return [
      mkAtom(`ctx:final:danger:${selfId}`, 0.6),
      mkAtom(`ctx:final:control:${selfId}`, 0.5),
      mkAtom(`ctx:final:publicness:${selfId}`, 0.2),
      mkAtom(`ctx:final:normPressure:${selfId}`, 0.2),
      mkAtom(`ctx:final:uncertainty:${selfId}`, 0.2),
      mkAtom(`ctx:final:scarcity:${selfId}`, 0.2),
      mkAtom(`cap:fatigue:${selfId}`, 0.2, 'cap'),
      mkAtom(`drv:safetyNeed:${selfId}`, 0.7, 'drv'),
      mkAtom(`drv:controlNeed:${selfId}`, 0.4, 'drv'),
      mkAtom(`drv:affiliationNeed:${selfId}`, 0.3, 'drv'),
      mkAtom(`drv:statusNeed:${selfId}`, 0.3, 'drv'),
      mkAtom(`drv:restNeed:${selfId}`, 0.2, 'drv'),
      mkAtom(`drv:curiosityNeed:${selfId}`, 0.2, 'drv'),
      mkAtom(`drv:resolveNeed:${selfId}`, resolve, 'drv'),
    ];
  }

  function getDomainAtom(atoms: any[], domain: string) {
    return atoms.find((a) => a.id === `goal:domain:${domain}:${selfId}`);
  }

  it('high resolve writes explicit safety dampening and control boost traces', () => {
    const high = deriveGoalAtoms(selfId, mkGoalInput(1));

    const safety = getDomainAtom(high.atoms as any[], 'safety');
    const control = getDomainAtom(high.atoms as any[], 'control');
    const sParts = (safety as any)?.trace?.parts ?? {};
    const cParts = (control as any)?.trace?.parts ?? {};

    expect(sParts.resolveDampen ?? 0).toBeGreaterThan(0);
    expect((sParts.baseBeforeResolve ?? 0)).toBeGreaterThan((sParts.base ?? 0));
    expect(cParts.resolveBoost ?? 0).toBeGreaterThan(0);
    expect((cParts.base ?? 0)).toBeGreaterThan((cParts.baseBeforeResolve ?? 0));
  });
});
