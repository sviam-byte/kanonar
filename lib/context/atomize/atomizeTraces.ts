
import { ContextAtom } from '../v2/types';
import { normalizeAtom } from '../v2/infer';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

export function atomizeTraces(selfId: string, agent: any): ContextAtom[] {
  const tr = agent?.state?.traces || {};
  const out: ContextAtom[] = [];

  const add = (key: string, v: number, label: string) =>
    out.push(
      normalizeAtom({
        id: `trace:${key}:${selfId}`,
        ns: 'trace' as any, // Will be mapped to misc or specific if we update types
        kind: 'trace_state' as any,
        origin: 'world',
        source: 'agent_state',
        magnitude: clamp01(v),
        confidence: 1,
        subject: selfId,
        tags: ['trace', key],
        label,
        trace: { usedAtomIds: [], notes: ['from agent.state.traces'], parts: {} },
      } as any)
    );

  if (typeof tr.stressLoad === 'number')
    add('stressLoad', tr.stressLoad, `stressLoad=${Math.round(tr.stressLoad * 100)}%`);

  if (typeof tr.traumaPriming === 'number')
    add('traumaPriming', tr.traumaPriming, `traumaPriming=${Math.round(tr.traumaPriming * 100)}%`);

  if (typeof tr.trustClimate === 'number')
    add('trustClimate', tr.trustClimate, `trustClimate=${Math.round(tr.trustClimate * 100)}%`);

  return out;
}
