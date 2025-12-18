
import { ContextAtom } from './types';

/**
 * Computes high-level Domains (psychological environments) from granular Atoms.
 * This is the "Sensemaking" layer that translates physical/social facts into 
 * actionable vectors for the Goal Engine.
 */
export function computeDomainsFromAtoms(
  atoms: ContextAtom[]
): Record<string, number> {
  
  // Helper to get sum of magnitudes for a specific kind
  const getSum = (kind: string) => 
    atoms.filter(a => a.kind === kind).reduce((sum, a) => sum + (a.magnitude || 0), 0);

  // Helper to check for presence/max
  const getMax = (kind: string) => 
    atoms.filter(a => a.kind === kind).reduce((max, a) => Math.max(max, a.magnitude || 0), 0);
  
  const getAtomVal = (kind: string, defaultValue: number = 0) => {
      const a = atoms.find(x => x.kind === kind);
      if (!a || typeof a.magnitude !== 'number') return defaultValue;
      return a.magnitude;
  };
  
  const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

  /**
   * Bounded weighted combination: keeps result in [0,1] and avoids instant saturation.
   * Interpretable as independent “risk channels”.
   */
  const combine = (terms: Array<{ w: number; x: number }>) => {
    let p = 1;
    for (const { w, x } of terms) {
      const wx = clamp01(w) * clamp01(x);
      p *= (1 - wx);
    }
    return clamp01(1 - p);
  };

  // --- 1. DANGER (Physical & Immediate) ---
  const envHazard = getMax('env_hazard');
  const mapHazard = getMax('map_hazard') || getMax('hazard_local');
  
  // If a signal is missing, default to neutral (not “worst”).
  const exits = clamp01(getAtomVal('nav_exits_count', 0.5)); // 0..1 (1 = many exits)
  const visibility = clamp01(getAtomVal('env_visibility', 0.7)); // 0..1 (1 = clear)
  
  const enemyPresence = getMax('proximity_enemy') || getMax('tom_threatening_other_near');
  const localThreat = getMax('threat_local') || getMax('threat_scene');
  const eventThreat = getMax('event_threat');
  
  const hazardTerm = clamp01(Math.max(envHazard, mapHazard, localThreat, eventThreat));
  const exitsTerm = clamp01(1 - exits);
  const visTerm = clamp01(1 - visibility);
  const enemyTerm = clamp01(enemyPresence);
  
  // Weights tuned so “moderate” inputs don't instantly hit 1
  const danger = combine([
    { w: 0.55, x: hazardTerm },
    { w: 0.20, x: exitsTerm },
    { w: 0.15, x: visTerm },
    { w: 0.45, x: enemyTerm },
  ]);

  // --- 2. INTIMACY (Privacy & Connection) ---
  // intimacy = private * (1 - surveillance)
  const isPrivate = getAtomVal('soc_publicness', 0.5) < 0.2 ? 1 : 0; // Publicness 0 = Private
  // Also check for explicit safe zone hints
  const safeZone = getMax('safe_zone_hint');
  
  const surveillance = getAtomVal('soc_surveillance');
  const bondStrength = getMax('tom_attachment') || getMax('intimacy');
  
  const intimacy = Math.max(0, Math.min(1,
      (Math.max(isPrivate, safeZone) ? 0.7 : 0.1) * (1 - surveillance) + 
      0.3 * bondStrength
  ));

  // --- 3. HIERARCHY (Authority Presence) ---
  const ownerPresent = getMax('loc_owner'); // 1 if faction owner context active
  const authorityPresence = getMax('authority_presence');
  const statusAsymmetry = getAtomVal('soc_status_asymmetry');
  const controlLevel = getAtomVal('soc_surveillance'); // Surveillance implies hierarchy
  
  const hierarchy = Math.max(0, Math.min(1,
      0.4 * authorityPresence +
      0.3 * ownerPresent +
      0.2 * controlLevel +
      0.1 * statusAsymmetry
  ));

  // --- 4. OBLIGATION (Norms & Orders) ---
  const activeOrders = getSum('active_order'); // Count/Mag of orders
  const normPressure = getAtomVal('soc_norm_pressure') || getAtomVal('norm_pressure');
  const oaths = (getSum('tom_belief') && atoms.some(a => a.label?.includes('Oath'))) ? 0.5 : 0;
  const eventNorm = getMax('event_norm_violation');
  
  // Normalize orders: 1 order ~ 0.3, 3 orders ~ 0.9
  const orderWeight = Math.min(1, activeOrders * 0.3);
  
  const obligation = Math.max(0, Math.min(1,
      0.4 * normPressure +
      0.3 * orderWeight +
      0.2 * oaths + 
      0.2 * eventNorm
  ));

  // --- 5. AVOIDANCE (Desire to leave) ---
  // avoidance = danger + surveillance + crowding
  const crowding = getAtomVal('soc_crowd_density') || getAtomVal('crowding_pressure');
  
  const avoidance = Math.max(0, Math.min(1,
      0.5 * danger +
      0.3 * surveillance +
      0.2 * crowding
  ));

  // --- 6. ATTACHMENT (Safety + Bond) ---
  // attachment = intimacy * (1 - danger) + support
  const support = getMax('social_support') || getMax('ally_support') || getMax('event_support');
  
  const attachment = Math.max(0, Math.min(1,
      0.6 * intimacy * (1 - danger) +
      0.4 * support
  ));
  
  // --- 7. CARE_HELP (Need for care) ---
  const wounded = getMax('wounded_local') || getMax('care_need');
  const care_help = Math.max(0, Math.min(1,
      wounded
  ));

  return {
    danger,
    intimacy,
    hierarchy,
    obligation,
    avoidance,
    attachment,
    'care/help': care_help,
    
    // Pass-throughs for other systems or fallbacks
    social: (support + crowding) / 2,
    status: hierarchy * 0.5
  };
}
