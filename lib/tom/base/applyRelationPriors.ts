// lib/tom/base/applyRelationPriors.ts
import { ContextAtom } from '../../context/v2/types';
import { normalizeAtom } from '../../context/v2/infer';

function unpackAtomsAndSelfId(
  arg1: ContextAtom[] | { atoms?: unknown; selfId?: unknown } | null | undefined,
  arg2?: unknown
): { atoms: ContextAtom[]; selfId: string } {
  if (Array.isArray(arg1)) {
    return { atoms: arg1 as ContextAtom[], selfId: String(arg2 ?? '') };
  }

  if (arg1 && typeof arg1 === 'object') {
    const a: any = arg1;
    const rawAtoms = a.atoms;
    const atoms = Array.isArray(rawAtoms)
      ? rawAtoms
      : rawAtoms && typeof rawAtoms === 'object'
        ? Object.values(rawAtoms)
        : [];

    return { atoms: atoms as ContextAtom[], selfId: String(a.selfId ?? arg2 ?? '') };
  }

  return { atoms: [] as ContextAtom[], selfId: String(arg2 ?? '') };
}

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function makeBaseId(outId: string): string {
  if (outId.startsWith('tom:dyad:')) return outId.replace(/^tom:dyad:/, 'tom:base:dyad:');
  if (outId.startsWith('tom:')) return outId.replace(/^tom:/, 'tom:base:');
  return `tom:base:${outId}`;
}

function ensureBaseCopyAtom(lookupAtoms: ContextAtom[], outAtoms: ContextAtom[], outId: string, sourceNote: string): string {
  const baseId = makeBaseId(outId);
  if (lookupAtoms.some(a => a && a.id === baseId) || outAtoms.some(a => a && a.id === baseId)) return baseId;
  const current = lookupAtoms.find(a => a && a.id === outId);
  if (!current) return baseId;

  outAtoms.push({
    ...current,
    id: baseId,
    origin: 'derived',
    source: `base_copy:${sourceNote}`,
    label: `${(current as any).label ?? outId} (base)`,
    trace: {
      usedAtomIds: [outId],
      notes: ['base copy before override', sourceNote],
      parts: { from: outId }
    },
  } as any);

  return baseId;
}

function sanitizeUsedAtomIds(outId: string, usedAtomIds: unknown): string[] {
  if (!Array.isArray(usedAtomIds)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of usedAtomIds) {
    if (typeof x !== 'string' || x.length === 0) continue;
    if (x === outId) continue; // critical: no self-cycles
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
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

function parseRelBaseId(id: string): { selfId: string; otherId: string; metric: string } | null {
  // rel:base:self:other:metric
  const p = id.split(':');
  if (p.length < 5) return null;
  if (p[0] !== 'rel' || p[1] !== 'base') return null;
  return { selfId: p[2], otherId: p[3], metric: p[4] };
}

function has(atoms: ContextAtom[], id: string) {
  return atoms.some(a => a.id === id);
}

type RelBase = {
  closeness: number;
  loyalty: number;
  hostility: number;
  dependency: number;
  authority: number;
};

function readRelBaseOnly(atoms: ContextAtom[], selfId: string, otherId: string): RelBase {
  return {
    closeness: clamp01(getMag(atoms, `rel:base:${selfId}:${otherId}:closeness`, 0)),
    loyalty: clamp01(getMag(atoms, `rel:base:${selfId}:${otherId}:loyalty`, 0)),
    hostility: clamp01(getMag(atoms, `rel:base:${selfId}:${otherId}:hostility`, 0)),
    dependency: clamp01(getMag(atoms, `rel:base:${selfId}:${otherId}:dependency`, 0)),
    authority: clamp01(getMag(atoms, `rel:base:${selfId}:${otherId}:authority`, 0)),
  };
}

function readRelPrior(atoms: ContextAtom[], selfId: string, otherId: string): RelBase {
  return {
    closeness: clamp01(getMag(atoms, `rel:state:${selfId}:${otherId}:closeness`, getMag(atoms, `rel:base:${selfId}:${otherId}:closeness`, 0))),
    loyalty: clamp01(getMag(atoms, `rel:state:${selfId}:${otherId}:trust`, getMag(atoms, `rel:base:${selfId}:${otherId}:loyalty`, 0))),
    hostility: clamp01(getMag(atoms, `rel:state:${selfId}:${otherId}:hostility`, getMag(atoms, `rel:base:${selfId}:${otherId}:hostility`, 0))),
    dependency: clamp01(getMag(atoms, `rel:state:${selfId}:${otherId}:obligation`, getMag(atoms, `rel:base:${selfId}:${otherId}:dependency`, 0))),
    authority: clamp01(getMag(atoms, `rel:state:${selfId}:${otherId}:respect`, getMag(atoms, `rel:base:${selfId}:${otherId}:authority`, 0))),
  };
}

function relStrength(r: RelBase) {
  return Math.max(r.closeness, r.loyalty, r.hostility, r.dependency, r.authority);
}

function mkBeliefDyad(selfId: string, otherId: string, metric: string, magnitude: number, parts: any): ContextAtom {
  return normalizeAtom({
    id: `tom:dyad:${selfId}:${otherId}:${metric}`,
    kind: 'tom_dyad_metric',
    ns: 'tom',
    origin: 'belief',
    source: 'rel_base_seed',
    magnitude: clamp01(magnitude),
    confidence: 0.65,
    subject: selfId,
    target: otherId,
    tags: ['tom', 'dyad', metric, 'seed'],
    label: `seed.${metric}:${Math.round(clamp01(magnitude) * 100)}%`,
    trace: {
      usedAtomIds: [
        `rel:base:${selfId}:${otherId}:closeness`,
        `rel:base:${selfId}:${otherId}:loyalty`,
        `rel:base:${selfId}:${otherId}:hostility`,
        `rel:base:${selfId}:${otherId}:dependency`,
        `rel:base:${selfId}:${otherId}:authority`,
      ],
      notes: ['seeded from rel:base'],
      parts
    },
  } as any);
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
  arg1: ContextAtom[] | { atoms?: unknown; selfId?: unknown },
  arg2?: string
): { atoms: ContextAtom[] } {
  const { atoms, selfId } = unpackAtomsAndSelfId(arg1 as any, arg2);
  const out: ContextAtom[] = [];

  // 0) seed missing dyads from rel:base (so ToM matrix is never sparse)
  const relBaseIds = atoms
    .map(a => (typeof a.id === 'string' ? a.id : ''))
    .filter(id => id.startsWith(`rel:base:${selfId}:`));

  const otherIds = Array.from(new Set(
    relBaseIds.map(id => parseRelBaseId(id)?.otherId).filter(Boolean) as string[]
  ));

  for (const otherId of otherIds) {
    const r = readRelBaseOnly(atoms, selfId, otherId);
    if (relStrength(r) < 0.05) continue;

    // простые, но НЕ одинаковые и трактуемые сиды
    const trust0 = clamp01(0.15 + 0.65 * r.loyalty + 0.25 * r.closeness - 0.85 * r.hostility);
    const threat0 = clamp01(0.90 * r.hostility + 0.15 * (1 - r.closeness) * (1 - r.loyalty));
    const intim0 = clamp01(0.10 + 0.85 * r.closeness + 0.25 * r.loyalty - 0.80 * r.hostility);
    const unc0 = clamp01(0.15 + 0.35 * (1 - r.closeness) + 0.25 * (1 - r.loyalty));
    const align0 = clamp01(0.20 + 0.70 * r.loyalty + 0.20 * r.closeness - 0.70 * r.hostility);
    const resp0 = clamp01(0.10 + 0.85 * r.authority + 0.15 * r.loyalty);
    const dom0 = clamp01(0.10 + 0.90 * r.authority + 0.10 * r.hostility);
    const sup0 = clamp01((0.55 * trust0 + 0.45 * intim0) * (1 - threat0));

    const seed = (metric: string, v: number) => {
      const id = `tom:dyad:${selfId}:${otherId}:${metric}`;
      if (!has(atoms, id)) out.push(mkBeliefDyad(selfId, otherId, metric, v, { r, v }));
    };

    seed('trust', trust0);
    seed('threat', threat0);
    seed('intimacy', intim0);
    seed('uncertainty', unc0);
    seed('alignment', align0);
    seed('respect', resp0);
    seed('dominance', dom0);
    seed('support', sup0);
  }

  const dyads = [...atoms, ...out].filter(a => typeof a.id === 'string' && a.id.startsWith(`tom:dyad:${selfId}:`));
  for (const d of dyads) {
    const outId = d.id;
    const parsed = parseDyadId(d.id);
    if (!parsed) continue;

    const otherId = (d.target || parsed.otherId || '').toString();
    const metric = parsed.metric;

    const r = readRelPrior(atoms, selfId, otherId);
    if (relStrength(r) < 0.05) continue;

    const base = clamp01(d.magnitude ?? 0);

    // Extra dyad priors from non-context sources.
    // phys:threat reflects embodied danger (build/weapon/proximity),
    // social:rank:diff reflects hierarchical asymmetry.
    const physThreatAtom = [...atoms, ...out].find(a =>
      typeof a.id === 'string' && a.id === `phys:threat:${selfId}:${otherId}`
    );
    const physThreat = physThreatAtom ? clamp01(Number(physThreatAtom.magnitude ?? 0)) : 0;

    const rankDiffAtom = [...atoms, ...out].find(a =>
      typeof a.id === 'string' && a.id === `social:rank:diff:${selfId}:${otherId}`
    );
    const rankDiff = rankDiffAtom ? Number(rankDiffAtom.magnitude ?? 0) : 0;

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
        // Hostility drives threat baseline; embodied danger and rank asymmetry add pressure.
        floor = clamp01(
          0.65 * r.hostility * (1 - 0.5 * r.closeness) * (1 - 0.3 * r.loyalty)
          + 0.20 * physThreat
          + 0.10 * Math.max(0, rankDiff)
        );
        cap = clamp01(
          0.10 + 0.85 * r.hostility + 0.15 * (1 - r.closeness) * (1 - r.loyalty)
          + 0.15 * physThreat
        );
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
        floor = clamp01(0.05 + 0.35 * (1 - r.closeness) + 0.20 * (1 - r.loyalty));
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
        usedAtomIds: sanitizeUsedAtomIds(outId, [
          ensureBaseCopyAtom([...atoms, ...out], out, outId, 'tom_rel_priors'),
          `rel:state:${selfId}:${otherId}:closeness`,
          `rel:state:${selfId}:${otherId}:trust`,
          `rel:state:${selfId}:${otherId}:hostility`,
          `rel:state:${selfId}:${otherId}:obligation`,
          `rel:state:${selfId}:${otherId}:respect`,
          `rel:base:${selfId}:${otherId}:closeness`,
          `rel:base:${selfId}:${otherId}:loyalty`,
          `rel:base:${selfId}:${otherId}:hostility`,
          `rel:base:${selfId}:${otherId}:dependency`,
          `rel:base:${selfId}:${otherId}:authority`,
        ]),
        notes: [`rel priors applied: floor=${floor.toFixed(2)} cap=${cap.toFixed(2)} base=${base.toFixed(2)} -> ${eff.toFixed(2)}`],
        parts: { metric, base, floor, cap, rel: r }
      }
    } as any));
  }

  return { atoms: out };
}
