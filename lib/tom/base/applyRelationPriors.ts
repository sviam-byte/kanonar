// lib/tom/base/applyRelationPriors.ts
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

function parseDyadId(id: string): { selfId: string; otherId: string; metric: string } | null {
  // tom:dyad:self:other:metric
  const parts = id.split(':');
  if (parts.length < 5) return null;
  if (parts[0] !== 'tom' || parts[1] !== 'dyad') return null;
  return { selfId: parts[2], otherId: parts[3], metric: parts[4] };
}

type RelBase = {
  closeness: number;
  loyalty: number;
  hostility: number;
  dependency: number;
  authority: number;
};

function readRelBase(atoms: ContextAtom[], selfId: string, otherId: string): RelBase {
  return {
    closeness: clamp01(getMag(atoms, `rel:base:${selfId}:${otherId}:closeness`, 0)),
    loyalty: clamp01(getMag(atoms, `rel:base:${selfId}:${otherId}:loyalty`, 0)),
    hostility: clamp01(getMag(atoms, `rel:base:${selfId}:${otherId}:hostility`, 0)),
    dependency: clamp01(getMag(atoms, `rel:base:${selfId}:${otherId}:dependency`, 0)),
    authority: clamp01(getMag(atoms, `rel:base:${selfId}:${otherId}:authority`, 0)),
  };
}

function relStrength(r: RelBase) {
  return Math.max(r.closeness, r.loyalty, r.hostility, r.dependency, r.authority);
}

/**
 * Apply relation priors (rel:base) to ToM dyads (tom:dyad:self:other:*).
 *
 * Policy:
 * - Soft floors AND soft caps (e.g., high hostility caps trust).
 * - Overrides MUST reuse the original tom:dyad:* id for downstream consumers.
 * - Only applies when relStrength is meaningful (> ~0.05).
 */
export function applyRelationPriorsToDyads(
  atoms: ContextAtom[],
  selfId: string
): { atoms: ContextAtom[] } {
  const out: ContextAtom[] = [];

  const dyads = atoms.filter(a => typeof a.id === 'string' && a.id.startsWith(`tom:dyad:${selfId}:`));
  for (const d of dyads) {
    const parsed = parseDyadId(d.id);
    if (!parsed) continue;

    const otherId = (d.target || parsed.otherId || '').toString();
    const metric = parsed.metric;

    const r = readRelBase(atoms, selfId, otherId);
    if (relStrength(r) < 0.05) continue;

    const base = clamp01(d.magnitude ?? 0);

    let floor = 0;
    let cap = 1;

    switch (metric) {
      case 'trust': {
        floor = clamp01(0.15 * r.closeness + 0.60 * r.loyalty);
        cap = clamp01(1 - 0.85 * r.hostility);
        break;
      }
      case 'threat':
      case 'conflict':
      case 'fear': {
        floor = clamp01(0.65 * r.hostility + 0.15 * (1 - r.closeness) + 0.10 * (1 - r.loyalty));
        cap = clamp01(0.25 + 0.75 * r.hostility + 0.25 * (1 - r.closeness));
        break;
      }
      case 'intimacy':
      case 'bond': {
        floor = clamp01(0.80 * r.closeness + 0.10 * r.loyalty);
        cap = clamp01(1 - 0.80 * r.hostility);
        break;
      }
      case 'support':
      case 'reliability': {
        floor = clamp01(0.50 * r.loyalty + 0.30 * r.dependency + 0.20 * r.closeness);
        cap = clamp01(1 - 0.60 * r.hostility);
        break;
      }
      case 'respect': {
        floor = clamp01(0.60 * r.authority + 0.20 * r.loyalty);
        cap = 1;
        break;
      }
      case 'dominance': {
        floor = clamp01(0.80 * r.authority + 0.10 * r.hostility);
        cap = 1;
        break;
      }
      case 'alignment':
      case 'align': {
        floor = clamp01(0.65 * r.loyalty + 0.20 * r.closeness - 0.50 * r.hostility);
        cap = clamp01(1 - 0.70 * r.hostility);
        break;
      }
      case 'uncertainty': {
        floor = clamp01(0.10 + 0.35 * (1 - r.closeness) + 0.20 * (1 - r.loyalty));
        cap = 1;
        break;
      }
      default: {
        continue;
      }
    }

    const eff = clamp01(Math.min(cap, Math.max(base, floor)));
    if (Math.abs(eff - base) < 1e-6) continue;

    out.push(normalizeAtom({
      id: d.id, // override original dyad id
      kind: d.kind || 'tom_dyad',
      ns: d.ns || 'tom',
      origin: 'derived',
      source: 'tom_rel_priors',
      magnitude: eff,
      confidence: Math.max(0.85, clamp01(d.confidence ?? 1)),
      subject: selfId,
      target: otherId,
      tags: Array.from(new Set([...(d.tags || []), 'prior', 'rel'])),
      label: `${metric} (rel-prior)`,
      trace: {
        usedAtomIds: [
          d.id,
          `rel:base:${selfId}:${otherId}:closeness`,
          `rel:base:${selfId}:${otherId}:loyalty`,
          `rel:base:${selfId}:${otherId}:hostility`,
          `rel:base:${selfId}:${otherId}:dependency`,
          `rel:base:${selfId}:${otherId}:authority`,
        ],
        notes: [`rel priors applied: floor=${floor.toFixed(2)} cap=${cap.toFixed(2)} base=${base.toFixed(2)} -> ${eff.toFixed(2)}`],
        parts: { metric, base, floor, cap, rel: r }
      }
    } as any));
  }

  return { atoms: out };
}
