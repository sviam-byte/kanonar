import type { ContextAtom } from '../../context/v2/types';
import { derivePossibilities } from '../../context/possibilities/derivePossibilities';

export type GoalLabTestResult = { id: string; title: string; ok: boolean; details?: string };
export type GoalLabTestScenario = { id: string; title: string; atoms: ContextAtom[]; expect: { mustEnable?: string[]; mustDisable?: string[] } };

function atom(id: string, magnitude: number, extra: Partial<ContextAtom> = {}): ContextAtom {
  return {
    id,
    ns: (extra as any).ns ?? 'test',
    kind: (extra as any).kind ?? 'test',
    origin: (extra as any).origin ?? 'world',
    source: (extra as any).source ?? 'goal-lab-tests',
    magnitude,
    confidence: (extra as any).confidence ?? 1,
    ...extra
  } as any;
}

function hasPoss(poss: { id: string; enabled: boolean }[], prefix: string) {
  return poss.some(p => String(p.id).startsWith(prefix));
}

function enabled(poss: { id: string; enabled: boolean }[], idPrefix: string): boolean {
  const p = poss.find(x => String(x.id).startsWith(idPrefix));
  return !!p?.enabled;
}

export function runBasicGoalLabTests(selfId: string): GoalLabTestResult[] {
  const scenarios = goalLabTestScenarios(selfId);
  const out: GoalLabTestResult[] = [];
  for (const s of scenarios) {
    const poss = derivePossibilities(s.atoms, selfId || 'tester').possibilities;
    const mustEnable = s.expect.mustEnable ?? [];
    const mustDisable = s.expect.mustDisable ?? [];
    const fails: string[] = [];
    for (const pfx of mustEnable) if (!hasPoss(poss, pfx) || !enabled(poss, pfx)) fails.push(`enable:${pfx}`);
    for (const pfx of mustDisable) if (!hasPoss(poss, pfx) || enabled(poss, pfx)) fails.push(`disable:${pfx}`);
    out.push({ id: `scenario.${s.id}`, title: s.title, ok: fails.length === 0, details: fails.length ? fails.join(', ') : 'ok' });
  }
  return out;
}

export function goalLabTestScenarios(selfId: string): GoalLabTestScenario[] {
  const me = selfId || 'tester';
  const other = 'other';
  const atomsCalm: ContextAtom[] = [
    atom(`obs:nearby:${other}:closeness`, 0.8, { subject: me, target: other }),
    atom(`access:weapon:${me}`, 1, { kind: 'access' as any, ns: 'access' as any, subject: me }),
    atom(`ctx:danger:${me}`, 0.05, { kind: 'ctx' as any, ns: 'ctx' as any, subject: me }),
    atom(`sum:threatLevel:${me}`, 0.05, { kind: 'sum' as any, ns: 'sum' as any, subject: me }),
  ];
  const atomsAggro: ContextAtom[] = [
    atom(`obs:nearby:${other}:closeness`, 0.8, { subject: me, target: other }),
    atom(`access:weapon:${me}`, 1, { kind: 'access' as any, ns: 'access' as any, subject: me }),
    atom(`ctx:danger:${me}`, 0.9, { kind: 'ctx' as any, ns: 'ctx' as any, subject: me }),
    atom(`sum:threatLevel:${me}`, 0.9, { kind: 'sum' as any, ns: 'sum' as any, subject: me }),
    atom(`affect:e:anger:${me}`, 0.8, { kind: 'emotion' as any, ns: 'emo' as any, subject: me, origin: 'derived' }),
    atom(`affect:stress:${me}`, 0.7, { kind: 'affect' as any, ns: 'emo' as any, subject: me, origin: 'derived' }),
  ];
  const atomsProtocol: ContextAtom[] = [
    ...atomsAggro,
    atom(`ctx:proceduralStrict:${me}`, 0.95, { kind: 'ctx' as any, ns: 'ctx' as any, subject: me })
  ];
  return [
    { id: 'calm_no_attack', title: 'Calm / low threat => attack disabled', atoms: atomsCalm, expect: { mustDisable: ['aff:attack:'] } },
    { id: 'high_threat_attack_ok', title: 'High threat/anger => attack may be enabled', atoms: atomsAggro, expect: { mustEnable: ['aff:attack:'] } },
    { id: 'protocol_blocks_attack', title: 'Procedural strictness blocks violence even if threat is high', atoms: atomsProtocol, expect: { mustDisable: ['aff:attack:'] } },
  ];
}
