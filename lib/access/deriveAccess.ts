
import { ContextAtom } from '../context/v2/types';
import { normalizeAtom } from '../context/v2/infer';
import { AccessDecision } from './types';

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

export function deriveAccess(atoms: ContextAtom[], selfId: string, locationId?: string): { decisions: AccessDecision[]; atoms: ContextAtom[] } {
  const outAtoms: ContextAtom[] = [];
  const decisions: AccessDecision[] = [];

  const keyBasic = getMag(atoms, `cap:key_basic:${selfId}`, 0);
  const keySec = getMag(atoms, `cap:key_security:${selfId}`, 0);
  const clLow = getMag(atoms, `cap:clearance_low:${selfId}`, 0);
  const clMid = getMag(atoms, `cap:clearance_mid:${selfId}`, 0);
  const clHigh = getMag(atoms, `cap:clearance_high:${selfId}`, 0);

  const publicLoc = getMag(atoms, `loc:${locationId}:access:public`, 0); // 0..1
  const requiresKey = getMag(atoms, `loc:${locationId}:access:requires_key`, 0); // 0..1
  const requiresSecKey = getMag(atoms, `loc:${locationId}:access:requires_sec_key`, 0);
  const reqMid = getMag(atoms, `loc:${locationId}:access:requires_clearance_mid`, 0);
  const reqHigh = getMag(atoms, `loc:${locationId}:access:requires_clearance_high`, 0);

  // ENTER decision
  let allowed = true;
  let score = 1;
  const used: string[] = [];
  
  if (locationId) {
    if (has(atoms, `loc:${locationId}:access:public`)) used.push(`loc:${locationId}:access:public`);
    if (has(atoms, `loc:${locationId}:access:requires_key`)) used.push(`loc:${locationId}:access:requires_key`);
    if (has(atoms, `loc:${locationId}:access:requires_sec_key`)) used.push(`loc:${locationId}:access:requires_sec_key`);
    if (has(atoms, `loc:${locationId}:access:requires_clearance_mid`)) used.push(`loc:${locationId}:access:requires_clearance_mid`);
    if (has(atoms, `loc:${locationId}:access:requires_clearance_high`)) used.push(`loc:${locationId}:access:requires_clearance_high`);
  }

  // If publicLoc high -> easy access
  score = clamp01(Math.max(score * 0.8 + 0.2 * publicLoc, publicLoc));

  if (requiresKey > 0.5 && keyBasic < 0.5) { allowed = false; score = clamp01(score * 0.15); used.push(`cap:key_basic:${selfId}`); }
  if (requiresSecKey > 0.5 && keySec < 0.5) { allowed = false; score = clamp01(score * 0.10); used.push(`cap:key_security:${selfId}`); }
  if (reqHigh > 0.5 && clHigh < 0.5) { allowed = false; score = clamp01(score * 0.10); used.push(`cap:clearance_high:${selfId}`); }
  if (reqMid > 0.5 && clMid < 0.5) { allowed = false; score = clamp01(score * 0.20); used.push(`cap:clearance_mid:${selfId}`); }

  if (publicLoc < 0.2 && clLow < 0.5 && requiresKey < 0.5 && reqMid < 0.5 && reqHigh < 0.5) {
    // non-public and no explicit key/clearance: still penalize
    score = clamp01(score * 0.6);
    used.push(`cap:clearance_low:${selfId}`);
  }

  const enter: AccessDecision = {
    kind: 'enter_location',
    allowed,
    score,
    reason: allowed ? 'access granted' : 'access denied (missing key/clearance)',
    usedAtomIds: used
  };
  decisions.push(enter);

  outAtoms.push(normalizeAtom({
    id: `access:enter:${selfId}:${locationId || 'unknown'}`,
    kind: 'access_decision' as any,
    ns: 'access' as any,
    origin: 'derived',
    source: 'access',
    magnitude: clamp01(score),
    confidence: 1,
    subject: selfId,
    target: locationId,
    tags: ['access', 'enter', allowed ? 'allowed' : 'denied'],
    label: `enter ${allowed ? 'allowed' : 'denied'} (${Math.round(score * 100)}%)`,
    trace: { usedAtomIds: used, notes: [enter.reason], parts: { allowed, score } }
  } as any));

  // USE WEAPON (depends on cap + protocol noViolence)
  const canUseWeapon = getMag(atoms, `cap:can_use_weapon:${selfId}`, 0);
  const noViolence = getMag(atoms, 'con:protocol:noViolence', 0);
  
  const weaponAllowed = canUseWeapon > 0.5 && noViolence < 0.5;
  const weaponScore = clamp01(canUseWeapon * (1 - 0.8 * noViolence));

  decisions.push({
    kind: 'use_weapon',
    allowed: weaponAllowed,
    score: weaponScore,
    reason: weaponAllowed ? 'weapon use allowed' : 'weapon use blocked by capability or protocol',
    usedAtomIds: [`cap:can_use_weapon:${selfId}`, 'con:protocol:noViolence'].filter(id => has(atoms, id))
  });

  outAtoms.push(normalizeAtom({
    id: `access:weapon:${selfId}`,
    kind: 'access_decision' as any,
    ns: 'access' as any,
    origin: 'derived',
    source: 'access',
    magnitude: weaponScore,
    confidence: 1,
    subject: selfId,
    tags: ['access', 'weapon', weaponAllowed ? 'allowed' : 'denied'],
    label: `weapon ${weaponAllowed ? 'allowed' : 'denied'} (${Math.round(weaponScore * 100)}%)`,
    trace: {
      usedAtomIds: [`cap:can_use_weapon:${selfId}`, 'con:protocol:noViolence'].filter(id => has(atoms, id)),
      notes: [weaponAllowed ? 'allowed' : 'denied'],
      parts: { canUseWeapon, noViolence, weaponScore }
    }
  } as any));

  return { decisions, atoms: outAtoms };
}
