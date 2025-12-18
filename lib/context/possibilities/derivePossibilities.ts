
import { ContextAtom } from '../v2/types';
import { normalizeAtom } from '../v2/infer';
import { Possibility } from './types';
import { computeActionCost } from '../../cost/model';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function getMag(atoms: ContextAtom[], id: string, fallback = 0) {
  const a = atoms.find(x => x.id === id);
  const m = a?.magnitude;
  return (typeof m === 'number' && Number.isFinite(m)) ? m : fallback;
}

function has(atoms: ContextAtom[], id: string) {
  return atoms.some(a => a.id === id);
}

// Check for relation tag atom
function hasRelTag(atoms: ContextAtom[], selfId: string, otherId: string, tag: string): boolean {
    return atoms.some(a => a.id === `rel:tag:${selfId}:${otherId}:${tag}`);
}

function getRelTags(atoms: ContextAtom[], selfId: string, otherId: string): string[] {
    // Collect all tags from rel:tag atoms
    const prefix = `rel:tag:${selfId}:${otherId}:`;
    return atoms
        .filter(a => a.id.startsWith(prefix))
        .map(a => a.id.replace(prefix, ''));
}

export function derivePossibilities(atoms: ContextAtom[], selfId: string): { possibilities: Possibility[]; atoms: ContextAtom[] } {
  const outAtoms: ContextAtom[] = [];
  const poss: Possibility[] = [];
  
  const cover = getMag(atoms, 'ctx:cover', getMag(atoms, 'map_cover', 0));
  const escape = getMag(atoms, 'ctx:escape', 0);
  const publicness = getMag(atoms, 'ctx:publicness', 0);
  const protocolStrict = getMag(atoms, 'ctx:proceduralStrict', 0);

  // constraints
  const noViolence = protocolStrict > 0.6 ? 1 : 0;
  if (noViolence) {
    outAtoms.push(normalizeAtom({
      id: 'con:protocol:noViolence',
      kind: 'constraint' as any,
      ns: 'con' as any,
      origin: 'derived',
      source: 'possibilities',
      magnitude: 1,
      confidence: 1,
      tags: ['con', 'protocol'],
      label: 'protocol forbids violence',
      trace: { usedAtomIds: ['ctx:proceduralStrict'], notes: ['derived constraint'], parts: { protocolStrict } }
    } as any));
  }

  // aff:hide
  const hideAvail = clamp01(cover);
  poss.push({
    id: 'aff:hide',
    kind: 'affordance',
    actionId: 'hide',
    label: 'Hide (use cover)',
    magnitude: hideAvail,
    enabled: hideAvail > 0.1,
    whyAtomIds: ['ctx:cover', 'map_cover'].filter(id => has(atoms, id))
  });

  // exit:escape (generic)
  const escapeAvail = clamp01(escape);
  poss.push({
    id: 'aff:escape',
    kind: 'affordance',
    actionId: 'escape',
    label: 'Escape (exit routes)',
    magnitude: escapeAvail,
    enabled: escapeAvail > 0.1,
    whyAtomIds: ['ctx:escape']
  });

  // talk/help/share_secret/attack depend on nearby agents (obs:nearby:* ids)
  const nearby = atoms
    .filter(a => a.id.startsWith('obs:nearby:') && typeof (a as any).target === 'string')
    .map(a => ({ otherId: (a as any).target as string, closeness: clamp01(a.magnitude ?? 0) }));

  for (const n of nearby) {
    const other = n.otherId;
    const closeness = n.closeness;
    
    // talk
    poss.push({
      id: `aff:talk:${other}`,
      kind: 'affordance',
      actionId: 'talk',
      targetId: other,
      label: `Talk to ${other}`,
      magnitude: closeness,
      enabled: closeness > 0.15,
      whyAtomIds: [`obs:nearby:${other}:closeness`].filter(id => has(atoms, id))
    });

    // help (more likely if friend/ally/lover)
    const tags = getRelTags(atoms, selfId, other);
    const relBoost =
      tags.includes('lover') ? 0.35 :
      tags.includes('friend') ? 0.25 :
      tags.includes('ally') ? 0.15 : 0;

    poss.push({
      id: `aff:help:${other}`,
      kind: 'affordance',
      actionId: 'help',
      targetId: other,
      label: `Help ${other}`,
      magnitude: clamp01(closeness + relBoost),
      enabled: closeness > 0.15,
      whyAtomIds: [`obs:nearby:${other}:closeness`].filter(id => has(atoms, id)),
      tags: ['social', ...tags]
    });

    // share_secret taboo: disabled if publicness high OR relation not trusted
    // We check rel:base:trust or fallback to legacy prior
    const trustBase = getMag(atoms, `rel:base:${selfId}:${other}:loyalty`, 0); // using loyalty as trust proxy
    const trustPrior = Math.max(trustBase, getMag(atoms, `rel:prior:${selfId}:${other}:trust`, 0.5));
    
    const secretOk = publicness < 0.35 && trustPrior > 0.7;

    poss.push({
      id: `aff:share_secret:${other}`,
      kind: 'affordance',
      actionId: 'share_secret',
      targetId: other,
      label: `Share secret with ${other}`,
      magnitude: secretOk ? clamp01(0.6 + 0.4 * closeness) : 0.05,
      enabled: secretOk && closeness > 0.2,
      whyAtomIds: ['ctx:publicness', `rel:base:${selfId}:${other}:loyalty`].filter(id => has(atoms, id)),
      blockedBy: !secretOk ? ['con:context:noPrivacyOrTrust'] : []
    });

    // attack taboo: disabled if protocol noViolence OR relation tag says friend/lover/family
    const hardTaboo = tags.includes('lover') || tags.includes('friend') || tags.includes('family') || tags.includes('protected');
    
    // Check Access Control for Weapon
    const weaponAccess = getMag(atoms, `access:weapon:${selfId}`, 0);
    const weaponAllowed = weaponAccess > 0.5;

    const attackEnabled = !noViolence && !hardTaboo && weaponAllowed && closeness > 0.15;

    poss.push({
      id: `aff:attack:${other}`,
      kind: 'affordance',
      actionId: 'attack',
      targetId: other,
      label: `Attack ${other}`,
      magnitude: attackEnabled ? clamp01(0.5 + 0.5 * closeness) : 0.02,
      enabled: attackEnabled,
      whyAtomIds: [`obs:nearby:${other}:closeness`, 'con:protocol:noViolence', `rel:label:${selfId}:${other}`, `access:weapon:${selfId}`].filter(id => has(atoms, id)),
      blockedBy: [
        ...(noViolence ? ['con:protocol:noViolence'] : []),
        ...(hardTaboo ? [`con:rel:taboo:attack:${selfId}:${other}`] : []),
        ...(!weaponAllowed ? [`access:weapon:${selfId}`] : [])
      ],
      tags: ['violent', ...tags]
    });

    if (hardTaboo) {
      outAtoms.push(normalizeAtom({
        id: `con:rel:taboo:attack:${selfId}:${other}`,
        kind: 'constraint' as any,
        ns: 'con' as any,
        origin: 'derived',
        source: 'possibilities',
        magnitude: 1,
        confidence: 1,
        tags: ['con', 'rel', 'taboo'],
        label: 'taboo: cannot attack close relation',
        subject: selfId,
        target: other,
        trace: { 
            usedAtomIds: tags.map(t => `rel:tag:${selfId}:${other}:${t}`), 
            notes: ['hard taboo from relation tags'], 
            parts: { tags } 
        }
      } as any));
    }
  }

  // Attach cost to each possibility
  for (const p of poss) {
    if (!p.enabled && p.magnitude < 0.08) continue; // skip negligible
    const c = computeActionCost({
      actionId: p.actionId as any,
      atoms,
      selfId,
      targetId: p.targetId
    });
    outAtoms.push(...c.atoms);
    const costAtom = c.atoms[0];
    p.costAtomId = costAtom.id;
    p.cost = clamp01(costAtom.magnitude ?? c.actionCost.total);
  }

  // Emit summary atoms for UI
  outAtoms.push(normalizeAtom({
    id: `aff:banner:${selfId}`,
    kind: 'summary_banner' as any,
    ns: 'aff' as any,
    origin: 'derived',
    source: 'possibilities',
    magnitude: clamp01(Math.min(1, poss.filter(x => x.enabled).length / 8)),
    confidence: 1,
    tags: ['aff', 'banner'],
    label: `possibilities:${poss.filter(x => x.enabled).length}`,
    trace: { usedAtomIds: [], notes: ['count enabled possibilities'], parts: {} }
  } as any));

  return { possibilities: poss, atoms: outAtoms };
}
