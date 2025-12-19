
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

/**
 * Takes existing tom:dyad:self:other:trust/threat and nudges toward rel priors.
 * Reads from rel:base:* atoms (closeness, loyalty, hostility, etc).
 * 
 * Logic:
 * - trust_eff = max(trust_base, loyalty * 0.7 + closeness * 0.3)
 * - threat_eff = max(threat_base, hostility * 0.7)
 */
export function applyRelationPriorsToDyads(atoms: ContextAtom[], selfId: string): { atoms: ContextAtom[] } {
  const out: ContextAtom[] = [];

  const trustDyads = atoms.filter(a => a.id.startsWith(`tom:dyad:${selfId}:`) && a.id.endsWith(':trust'));
  const threatDyads = atoms.filter(a => a.id.startsWith(`tom:dyad:${selfId}:`) && a.id.endsWith(':threat'));

  if (trustDyads.length === 0 && threatDyads.length === 0) {
    out.push(normalizeAtom({
      id: `tom:priorApplied:${selfId}:no_dyads`,
      kind: 'tom_prior_applied',
      ns: 'tom',
      origin: 'derived',
      source: 'tom_base',
      magnitude: 0,
      confidence: 1,
      subject: selfId,
      tags: ['tom', 'prior', 'missing_dyads'],
      label: 'tom prior skipped: no tom:dyad atoms found',
      trace: {
        usedAtomIds: [],
        notes: ['no tom:dyad atoms present for relation priors'],
        parts: { selfId },
      },
    } as any));

    return { atoms: out };
  }

  // trust
  for (const d of trustDyads) {
    const otherId = d.target || d.id.split(':')[3]; // tom:dyad:self:other:trust
    
    // Read from rel_base atoms
    const loyalty = getMag(atoms, `rel:base:${selfId}:${otherId}:loyalty`, 0);
    const closeness = getMag(atoms, `rel:base:${selfId}:${otherId}:closeness`, 0);
    
    // Legacy support: check old prior path if new one missing
    const oldPrior = getMag(atoms, `rel:prior:${selfId}:${otherId}:trust`, 0);
    
    const priorValue = Math.max(oldPrior, loyalty * 0.7 + closeness * 0.3);

    const base = clamp01(d.magnitude ?? 0);
    const floor = clamp01(priorValue * 0.7); // Floor is 70% of prior strength
    const eff = clamp01(Math.max(base, floor));

    if (eff !== base) {
      out.push(normalizeAtom({
        id: `tom:priorApplied:${selfId}:${otherId}:trust`,
        kind: 'tom_prior_applied',
        ns: 'tom',
        origin: 'derived',
        source: 'tom_base',
        magnitude: eff,
        confidence: 1,
        subject: selfId,
        target: otherId,
        tags: ['tom', 'prior', 'rel'],
        label: `trust≥${Math.round(floor * 100)}% => ${Math.round(eff * 100)}%`,
        trace: { 
            usedAtomIds: [d.id, `rel:base:${selfId}:${otherId}:loyalty`], 
            notes: ['trust floor from rel base'], 
            parts: { base, loyalty, closeness, floor } 
        }
      } as any));
    }
  }

  // threat
  for (const d of threatDyads) {
    const otherId = d.target || d.id.split(':')[3];
    
    // Read from rel_base atoms
    const hostility = getMag(atoms, `rel:base:${selfId}:${otherId}:hostility`, 0);
    const oldPrior = getMag(atoms, `rel:prior:${selfId}:${otherId}:threat`, 0);

    const priorValue = Math.max(oldPrior, hostility);

    const base = clamp01(d.magnitude ?? 0);
    const floor = clamp01(priorValue * 0.7);
    const eff = clamp01(Math.max(base, floor));

    if (eff !== base) {
      out.push(normalizeAtom({
        id: `tom:priorApplied:${selfId}:${otherId}:threat`,
        kind: 'tom_prior_applied',
        ns: 'tom',
        origin: 'derived',
        source: 'tom_base',
        magnitude: eff,
        confidence: 1,
        subject: selfId,
        target: otherId,
        tags: ['tom', 'prior', 'rel'],
        label: `threat≥${Math.round(floor * 100)}% => ${Math.round(eff * 100)}%`,
        trace: { 
            usedAtomIds: [d.id, `rel:base:${selfId}:${otherId}:hostility`], 
            notes: ['threat floor from rel base'], 
            parts: { base, hostility, floor } 
        }
      } as any));
    }
  }

  return { atoms: out };
}
