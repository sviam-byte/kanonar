import type { ContextAtom } from '../context/v2/types';

type RelEdge = {
  a: string;
  b: string;
  tags: string[];
  strength: number;
  trustPrior?: number;
  threatPrior?: number;
  updatedAtTick?: number;
  sources?: Array<{ kind: string; ref?: string; weight?: number }>;
};

type RelGraph = {
  schemaVersion: number;
  edges: RelEdge[];
};

export function buildRelGraphFromAtoms(atoms: ContextAtom[]): RelGraph {
  const edges: RelEdge[] = [];

  for (const atom of Array.isArray(atoms) ? atoms : []) {
    const id = String((atom as { id?: string })?.id ?? '');
    // atomizeFrame emits IDs like: rel:label:self:other
    if (!id.startsWith('rel:label:')) continue;

    const parts = id.split(':'); // rel label self other
    if (parts.length < 4) continue;
    const selfId = parts[2];
    const otherId = parts[3];

    const label = String(
      (atom as { meta?: { label?: string } })?.meta?.label ??
        (atom as { label?: string })?.label ??
        'acquaintance',
    );
    const strength = Number(
      (atom as { magnitude?: number })?.magnitude ?? (atom as { m?: number })?.m ?? 0,
    );

    edges.push({
      a: selfId,
      b: otherId,
      tags: ['rel', label],
      strength: Number.isFinite(strength) ? strength : 0,
      // NOTE: we can hydrate trust/threat priors from rel:score:* atoms later if needed.
    });
  }

  return { schemaVersion: 1, edges };
}
