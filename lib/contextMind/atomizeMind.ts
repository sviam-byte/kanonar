// lib/contextMind/atomizeMind.ts
import type { ContextAtom } from '../context/v2/types';
import { normalizeAtom } from '../context/v2/infer';

const clamp01 = (x: any) => {
  const v = Number(x);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
};

/**
 * Materialize scoreboard metrics into canonical atoms so they can be:
 * - exported
 * - consumed by decision/goals weighting
 * - explained
 */
export function atomizeContextMindMetrics(selfId: string, contextMind: any): ContextAtom[] {
  const metrics = Array.isArray(contextMind?.metrics) ? contextMind.metrics : [];
  const out: ContextAtom[] = [];

  for (const m of metrics) {
    const key = String(m?.key ?? '');
    if (!key) continue;
    const value = clamp01(m?.value ?? 0);
    const used = Array.isArray(m?.usedAtomIds) ? m.usedAtomIds.slice(0, 80) : [];

    out.push(
      normalizeAtom({
        id: `mind:metric:${key}:${selfId}`,
        ns: 'mind',
        kind: 'mind_metric',
        origin: 'derived',
        source: 'contextMindScoreboard',
        magnitude: value,
        confidence: 1,
        subject: selfId,
        tags: ['mind', 'metric', key],
        label: `mind.${key}=${Math.round(value * 100)}%`,
        trace: { usedAtomIds: used, notes: ['materialized from contextMind.metrics'], parts: { key } },
      } as any)
    );
  }

  return out;
}

