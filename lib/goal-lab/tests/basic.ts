import { normalizeAtom } from '../../context/v2/infer';
import type { GoalLabScenario } from './scenarios';

const A = (atom: any) => normalizeAtom(atom);

/**
 * Minimal deterministic GoalLab checks used by the UI test runner.
 * Keep scenarios small and stable to avoid accidental regressions.
 */
export function goalLabBasicTests(selfId: string, otherId = 'someone'): GoalLabScenario[] {
  return [
    {
      id: 'no-drive-no-attack',
      title: 'No aggression drive => attack disabled',
      selfId,
      atoms: [
        A({ id: `obs:nearby:${otherId}:closeness`, ns: 'obs', origin: 'world', magnitude: 0.8, confidence: 1, target: otherId }),
        A({ id: `access:weapon:${selfId}`, ns: 'access', origin: 'world', magnitude: 1.0, confidence: 1 }),
        A({ id: `ctx:danger:${selfId}`, ns: 'ctx', origin: 'derived', magnitude: 0.1, confidence: 1 }),
        A({ id: `sum:threatLevel:${selfId}`, ns: 'sum', origin: 'derived', magnitude: 0.1, confidence: 1 }),
        A({ id: `affect:e:anger:${selfId}`, ns: 'affect', origin: 'derived', magnitude: 0.1, confidence: 1 }),
        A({ id: `affect:e:fear:${selfId}`, ns: 'affect', origin: 'derived', magnitude: 0.1, confidence: 1 }),
        A({ id: `affect:stress:${selfId}`, ns: 'affect', origin: 'derived', magnitude: 0.1, confidence: 1 }),
      ],
      expect: {
        mustDisablePrefixes: [`aff:attack:${otherId}`],
        mustEnablePrefixes: [`aff:talk:${otherId}`],
      },
    },
    {
      id: 'drive-allows-attack',
      title: 'Aggression drive + weapon => attack enabled',
      selfId,
      atoms: [
        A({ id: `obs:nearby:${otherId}:closeness`, ns: 'obs', origin: 'world', magnitude: 0.6, confidence: 1, target: otherId }),
        A({ id: `access:weapon:${selfId}`, ns: 'access', origin: 'world', magnitude: 1.0, confidence: 1 }),
        A({ id: `ctx:danger:${selfId}`, ns: 'ctx', origin: 'derived', magnitude: 0.6, confidence: 1 }),
        A({ id: `sum:threatLevel:${selfId}`, ns: 'sum', origin: 'derived', magnitude: 0.4, confidence: 1 }),
        A({ id: `affect:e:anger:${selfId}`, ns: 'affect', origin: 'derived', magnitude: 0.8, confidence: 1 }),
      ],
      expect: {
        mustEnablePrefixes: [`aff:attack:${otherId}`],
      },
    },
    {
      id: 'protocol-blocks-attack',
      title: 'Protocol strict => attack disabled',
      selfId,
      atoms: [
        A({ id: `obs:nearby:${otherId}:closeness`, ns: 'obs', origin: 'world', magnitude: 0.6, confidence: 1, target: otherId }),
        A({ id: `access:weapon:${selfId}`, ns: 'access', origin: 'world', magnitude: 1.0, confidence: 1 }),
        A({ id: `ctx:danger:${selfId}`, ns: 'ctx', origin: 'derived', magnitude: 0.7, confidence: 1 }),
        A({ id: `sum:threatLevel:${selfId}`, ns: 'sum', origin: 'derived', magnitude: 0.6, confidence: 1 }),
        A({ id: `affect:e:anger:${selfId}`, ns: 'affect', origin: 'derived', magnitude: 0.8, confidence: 1 }),
        A({ id: `ctx:proceduralStrict:${selfId}`, ns: 'ctx', origin: 'derived', magnitude: 0.9, confidence: 1 }),
      ],
      expect: {
        mustDisablePrefixes: [`aff:attack:${otherId}`],
      },
    },
  ];
}
