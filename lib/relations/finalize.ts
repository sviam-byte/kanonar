import type { ContextAtom } from '../context/v2/types';
import type { RelationshipEdge, RelationshipGraph, RelationTag } from './types';
import { normalizeAtom } from '../context/v2/infer';
function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function mag(a?: any, fb = 0) {
  const m = a?.magnitude;
  return (typeof m === 'number' && Number.isFinite(m)) ? m : fb;
}

function pick(atoms: ContextAtom[], id: string) {
  return atoms.find(a => String((a as any)?.id || '') === id) as any;
}

const METRICS = ['trust', 'hostility', 'closeness', 'obligation', 'respect'] as const;
type Metric = typeof METRICS[number];

export function deriveRelFinalAtoms(args: {
  selfId: string;
  atoms: ContextAtom[];
  participantIds: string[];
  wState?: number; // rel:state weight
  wTom?: number; // tom:effective weight
}) {
  const { selfId, atoms, participantIds, wState = 0.55, wTom = 0.45 } = args;
  const out: ContextAtom[] = [];

  for (const otherId of participantIds) {
    if (!otherId || otherId === selfId) continue;

    for (const metric of METRICS) {
      const idState = `rel:state:${selfId}:${otherId}:${metric}`;
      const idTom = `tom:effective:dyad:${selfId}:${otherId}:${metric}`;
      const aState = pick(atoms, idState);
      const aTom = pick(atoms, idTom);

      // If neither exists, do nothing.
      if (!aState && !aTom) continue;

      const ms = clamp01(mag(aState, 0));
      const mt = clamp01(mag(aTom, 0));
      const mFinal = clamp01(wState * ms + wTom * mt);

      const idFinal = `rel:final:${selfId}:${otherId}:${metric}`;
      out.push(
        normalizeAtom({
          id: idFinal,
          ns: 'rel',
          kind: 'rel_final',
          origin: 'derived',
          source: 'rel_final',
          subject: selfId,
          object: otherId,
          magnitude: mFinal,
          confidence: Math.min(1, (aState?.confidence ?? 1) * 0.75 + (aTom?.confidence ?? 1) * 0.25),
          tags: ['rel', 'final', metric],
          label: `rel.final.${metric}:${selfId}→${otherId}`,
          trace: {
            usedAtomIds: [aState?.id, aTom?.id].filter(Boolean),
            notes: ['rel:final = mix(rel:state, tom:effective)'],
            parts: { metric, wState, wTom, ms, mt, mFinal },
          },
        } as any)
      );
    }
  }

  return { atoms: out };
}

function uniq(xs: string[]) {
  return Array.from(new Set((Array.isArray(xs) ? xs : []).map(String).filter(Boolean)));
}

function inferTrustPrior(tags: RelationTag[]) {
  if (tags.includes('lover')) return 0.9;
  if (tags.includes('family')) return 0.85;
  if (tags.includes('friend')) return 0.8;
  if (tags.includes('ally')) return 0.7;
  if (tags.includes('mentor') || tags.includes('protege')) return 0.75;
  if (tags.includes('enemy')) return 0.1;
  if (tags.includes('rival')) return 0.35;
  return 0.5;
}

function inferThreatPrior(tags: RelationTag[]) {
  if (tags.includes('enemy')) return 0.85;
  if (tags.includes('rival')) return 0.55;
  if (tags.includes('superior')) return 0.35;
  if (tags.includes('subordinate')) return 0.15;
  if (tags.includes('ally') || tags.includes('friend') || tags.includes('lover') || tags.includes('family')) return 0.1;
  return 0.3;
}

function mergeBio(prev?: any, next?: any) {
  if (!prev && !next) return undefined;
  const out: any = { ...(prev || {}), ...(next || {}) };

  const prevAspects = prev?.aspects ?? {};
  const nextAspects = next?.aspects ?? {};
  const aspectKeys = new Set([...Object.keys(prevAspects), ...Object.keys(nextAspects)]);
  if (aspectKeys.size > 0) {
    out.aspects = out.aspects || {};
    for (const k of aspectKeys) {
      const a = Number(prevAspects[k] ?? 0);
      const b = Number(nextAspects[k] ?? 0);
      out.aspects[k] = clamp01(Math.max(a, b));
    }
  }

  const prevVec = prev?.vector ?? {};
  const nextVec = next?.vector ?? {};
  const vecKeys = new Set([...Object.keys(prevVec), ...Object.keys(nextVec)]);
  if (vecKeys.size > 0) {
    out.vector = out.vector || {};
    for (const k of vecKeys) {
      const a = Number(prevVec[k] ?? 0);
      const b = Number(nextVec[k] ?? 0);
      out.vector[k] = Math.abs(b) >= Math.abs(a) ? b : a;
    }
  }

  return out;
}

/**
 * Normalize + dedupe relationship edges into a canonical graph.
 * - Ensures tags/priors are present.
 * - Merges duplicate edges by (a, b).
 */
export function finalizeRelations(raw: RelationshipGraph): RelationshipGraph {
  const map = new Map<string, RelationshipEdge>();

  for (const edge of raw?.edges || []) {
    const a = String((edge as any)?.a ?? '').trim();
    const b = String((edge as any)?.b ?? '').trim();
    if (!a || !b) continue;
    const key = `${a}→${b}`;
    const prev = map.get(key);

    const tags = uniq([...(prev?.tags || []), ...(edge.tags || [])]);
    const strength = clamp01(Math.max(prev?.strength ?? 0, edge.strength ?? 0));
    const trustPrior =
      typeof edge.trustPrior === 'number' ? edge.trustPrior : (typeof prev?.trustPrior === 'number' ? prev.trustPrior : undefined);
    const threatPrior =
      typeof edge.threatPrior === 'number' ? edge.threatPrior : (typeof prev?.threatPrior === 'number' ? prev.threatPrior : undefined);
    const exclusivity = Math.max(prev?.exclusivity ?? 0, edge.exclusivity ?? 0);
    const updatedAtTick = Math.max(prev?.updatedAtTick ?? 0, edge.updatedAtTick ?? 0);
    const sources = [...(prev?.sources || []), ...(edge.sources || [])];
    const mergedBio = mergeBio((prev as any)?.bio, (edge as any)?.bio);

    map.set(key, {
      a,
      b,
      tags: tags.length > 0 ? (tags as RelationTag[]) : ['neutral'],
      strength,
      trustPrior,
      threatPrior,
      exclusivity,
      updatedAtTick,
      sources,
      ...(mergedBio ? { bio: mergedBio } : {}),
    } as any);
  }

  const edges = Array.from(map.values()).map(e => ({
    ...e,
    strength: clamp01(e.strength ?? 0.5),
    trustPrior: clamp01(typeof e.trustPrior === 'number' ? e.trustPrior : inferTrustPrior(e.tags)),
    threatPrior: clamp01(typeof e.threatPrior === 'number' ? e.threatPrior : inferThreatPrior(e.tags)),
  }));

  return { schemaVersion: 1, edges };
}
