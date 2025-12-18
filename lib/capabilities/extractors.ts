
import { Capability, CapabilityProfile } from './types';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

const EMPTY: CapabilityProfile = {
  schemaVersion: 1,
  caps: {
    key_basic: 0,
    key_security: 0,
    clearance_low: 0,
    clearance_mid: 0,
    clearance_high: 0,
    can_command: 0,
    can_arrest: 0,
    can_use_weapon: 0,
    medical_training: 0,
    engineering_training: 0
  }
};

export function extractCapabilitiesFromCharacter(agent: any): CapabilityProfile {
  const p: CapabilityProfile = JSON.parse(JSON.stringify(EMPTY));

  // inventory keys
  const inv = agent?.inventory || agent?.resources?.inventory || [];
  const has = (name: string) => (Array.isArray(inv) ? inv : []).some((x: any) => String(x?.id || x?.name || x).toLowerCase().includes(name));

  if (has('key') || has('pass')) p.caps.key_basic = 1;
  if (has('security') || has('vault')) p.caps.key_security = 1;

  // identity / authority
  const clearance = agent?.identity?.clearance_level ?? agent?.authority?.clearance ?? agent?.authority?.level ?? 0;
  const c = typeof clearance === 'number' ? clearance : 0;

  // map clearance numeric to low/mid/high
  p.caps.clearance_low = clamp01(c >= 1 ? 1 : 0);
  p.caps.clearance_mid = clamp01(c >= 3 ? 1 : 0);
  p.caps.clearance_high = clamp01(c >= 5 ? 1 : 0);

  // can_command from rank/role/sigils
  const role = String(agent?.identity?.role || agent?.authority?.role || agent?.roles?.global?.[0] || '').toLowerCase();
  const rank = Number(agent?.authority?.rank ?? 0);
  
  if (role.includes('commander') || role.includes('captain') || role.includes('leader') || rank >= 2) p.caps.can_command = 1;

  // weapon permission
  const weapons = agent?.resources?.weapons || agent?.inventory?.weapons || [];
  // For MVP, assume explicit weapon capability for guards/soldiers or if armed
  const isArmed = (agent as any)?.how?.physical?.isArmed ?? true; // Default true in MVP
  
  if ((Array.isArray(weapons) && weapons.length > 0) || role.includes('guard') || role.includes('soldier') || isArmed) p.caps.can_use_weapon = 1;

  // arrest permission
  if (role.includes('police') || role.includes('guard') || role.includes('security')) p.caps.can_arrest = 1;

  // trainings
  const skills = agent?.competencies || agent?.skills || {};
  const med = skills?.medical ?? skills?.medical_skill ?? skills?.medicine ?? 0;
  const eng = skills?.engineering ?? skills?.mechanics ?? 0;
  
  if (typeof med === 'number') p.caps.medical_training = clamp01(med / 100); // 0-100 to 0-1
  if (typeof eng === 'number') p.caps.engineering_training = clamp01(eng / 100);

  return p;
}
