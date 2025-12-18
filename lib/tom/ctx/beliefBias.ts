
// lib/tom/ctx/beliefBias.ts
import { ContextAtom } from '../../context/v2/types';
import { normalizeAtom } from '../../context/v2/infer';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function getMag(atoms: ContextAtom[], id: string, fallback = 0) {
  const a = atoms.find(x => x.id === id);
  const m = a?.magnitude;
  return (typeof m === 'number' && Number.isFinite(m)) ? m : fallback;
}

export function buildBeliefToMBias(atoms: ContextAtom[], selfId: string) {
  // if believed hostility high -> interpret others as more threatening
  const believedHostility = getMag(atoms, 'belief:scene:hostility', NaN);
  const uncertainty = getMag(atoms, 'ctx:uncertainty', 0);

  // bias strength:
  // - increases with believed hostility
  // - also increases with uncertainty (more paranoia)
  const bias = clamp01(
    (Number.isFinite(believedHostility) ? 0.7 * believedHostility : 0) + 0.3 * uncertainty
  );

  const out: ContextAtom[] = [];

  out.push(normalizeAtom({
    id: `tom:ctx:bias:${selfId}`,
    kind: 'tom_belief',
    ns: 'tom',
    origin: 'derived',
    source: 'tom_ctx',
    magnitude: bias,
    confidence: 1,
    tags: ['tom', 'ctx', 'bias'],
    label: `interpretation bias:${Math.round(bias * 100)}%`,
    trace: {
      usedAtomIds: [
        Number.isFinite(believedHostility) ? 'belief:scene:hostility' : null,
        'ctx:uncertainty'
      ].filter(Boolean) as string[],
      notes: ['bias from belief hostility + uncertainty'],
      parts: { believedHostility: Number.isFinite(believedHostility) ? believedHostility : null, uncertainty }
    }
  } as any));

  return { bias, atoms: out };
}
