import { normalizeAtom } from '../../context/v2/infer';
import type { ContextAtom } from '../../context/v2/types';

export type GoalLabScenario = {
  id: string;
  title: string;
  selfId: string;
  atoms: ContextAtom[];
  expect: {
    // Expect possibility enabled/disabled by id prefix.
    mustDisablePrefixes?: string[];
    mustEnablePrefixes?: string[];
  };
};

const A = (atom: any) => normalizeAtom(atom);

/**
 * Minimal GoalLab scenarios for interactive smoke-checks in the UI.
 * Keep these tiny: they are intended for quick manual validation.
 */
export function goalLabScenarios(): GoalLabScenario[] {
  const selfId = 'assi-the-runner';
  const otherId = 'someone';

  return [
    {
      id: 'no-threat-no-attack',
      title: 'No aggression drive => attack must be disabled',
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
      id: 'harm-allows-attack',
      title: 'Aggression drive + weapon => attack may be enabled',
      selfId,
      atoms: [
        A({ id: `obs:nearby:${otherId}:closeness`, ns: 'obs', origin: 'world', magnitude: 0.6, confidence: 1, target: otherId }),
        A({ id: `access:weapon:${selfId}`, ns: 'access', origin: 'world', magnitude: 1.0, confidence: 1 }),
        A({ id: `ctx:danger:${selfId}`, ns: 'ctx', origin: 'derived', magnitude: 0.6, confidence: 1 }),
        A({ id: `sum:threatLevel:${selfId}`, ns: 'sum', origin: 'derived', magnitude: 0.4, confidence: 1 }),
        A({ id: `affect:e:anger:${selfId}`, ns: 'affect', origin: 'derived', magnitude: 0.7, confidence: 1 }),
      ],
      expect: {
        mustEnablePrefixes: [`aff:attack:${otherId}`],
      },
    },
    {
      id: 'protocol-blocks-attack',
      title: 'Protocol strict => attack must be disabled',
      selfId,
      atoms: [
        A({ id: `obs:nearby:${otherId}:closeness`, ns: 'obs', origin: 'world', magnitude: 0.5, confidence: 1, target: otherId }),
        A({ id: `access:weapon:${selfId}`, ns: 'access', origin: 'world', magnitude: 1.0, confidence: 1 }),
        A({ id: `ctx:danger:${selfId}`, ns: 'ctx', origin: 'derived', magnitude: 0.7, confidence: 1 }),
        A({ id: `sum:threatLevel:${selfId}`, ns: 'sum', origin: 'derived', magnitude: 0.6, confidence: 1 }),
        A({ id: `affect:e:anger:${selfId}`, ns: 'affect', origin: 'derived', magnitude: 0.7, confidence: 1 }),
        A({ id: `ctx:proceduralStrict:${selfId}`, ns: 'ctx', origin: 'derived', magnitude: 0.9, confidence: 1 }),
      ],
      expect: {
        mustDisablePrefixes: [`aff:attack:${otherId}`],
      },
    },
  ];
}
