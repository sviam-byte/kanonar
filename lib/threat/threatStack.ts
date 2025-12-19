// lib/threat/threatStack.ts
import { ContextAtom } from '../context/v2/types';
import { getAtom01 } from '../tom/atomsDyad';

export type Clamp01 = (x: number) => number;
export const clamp01: Clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

export type ThreatInputs = {
  // environment (0..1)
  envDanger: number;        
  visibilityBad: number;    
  coverLack: number;        
  crowding: number;         

  // social (0..1)
  nearbyCount: number;      
  nearbyTrustMean: number;  
  nearbyHostileMean: number;
  hierarchyPressure: number;
  surveillance: number;     

  // scenario (0..1)
  timePressure: number;     
  woundedPressure: number;  
  goalBlock: number;        

  // personal bias (0..1)
  paranoia: number;
  trauma: number;
  exhaustion: number;
  dissociation: number;
  experience: number;       
};

export type ThreatBreakdown = {
  env: number;
  social: number;
  scenario: number;
  personal: number;
  total: number; // 0..1
  inputs: ThreatInputs;
  usedAtomIds: string[];
  why: string[];
  traceAtoms?: ContextAtom[];
};

function getMag(atoms: any[], id: string, fallback = 0) {
  const a = atoms.find(x => x.id === id);
  const m = a?.magnitude;
  return (typeof m === 'number' && Number.isFinite(m)) ? m : fallback;
}

function getFeat(atoms: any[], key: string, fallback = 0) {
  const a = atoms.find(x => x.id === key);
  const m = a?.magnitude;
  return (typeof m === 'number' && Number.isFinite(m)) ? m : fallback;
}

function pickAny(atoms: any[], ids: string[], fallback = 0) {
  for (const id of ids) {
    const a = atoms.find(x => x.id === id);
    if (a && typeof a.magnitude === 'number' && Number.isFinite(a.magnitude)) return a.magnitude;
  }
  return fallback;
}

function getDyadThreat(atoms: ContextAtom[], selfId: string, otherId: string): number {
  const ctx = getAtom01(atoms, `tom:dyad:${selfId}:${otherId}:threat_ctx`, NaN as any);
  if (Number.isFinite(ctx)) return ctx;
  const prior = getAtom01(atoms, `tom:dyad:${selfId}:${otherId}:threat_prior`, NaN as any);
  if (Number.isFinite(prior)) return prior;
  const base = getAtom01(atoms, `tom:dyad:${selfId}:${otherId}:threat`, NaN as any);
  if (Number.isFinite(base)) return base;
  const relHostility = getAtom01(atoms, `rel:base:${selfId}:${otherId}:hostility`, NaN as any);
  if (Number.isFinite(relHostility)) return relHostility;
  return 0;
}

function getDyadTrust(atoms: ContextAtom[], selfId: string, otherId: string): number {
  const ctx = getAtom01(atoms, `tom:dyad:${selfId}:${otherId}:trust_ctx`, NaN as any);
  if (Number.isFinite(ctx)) return ctx;
  const prior = getAtom01(atoms, `tom:dyad:${selfId}:${otherId}:trust_prior`, NaN as any);
  if (Number.isFinite(prior)) return prior;
  const base = getAtom01(atoms, `tom:dyad:${selfId}:${otherId}:trust`, NaN as any);
  if (Number.isFinite(base)) return base;
  return 0.45;
}

function noisyOr01(values: number[]) {
  const prod = values.reduce((p, v) => p * (1 - v), 1);
  return Math.max(0, Math.min(1, 1 - prod));
}

// belief helper: belief:* если есть — используем, иначе world id
function getBeliefOrWorld(atoms: any[], worldId: string, beliefId: string, fallback = 0) {
  const b = atoms.find(x => x.id === beliefId);
  if (b && typeof b.magnitude === 'number') return b.magnitude;
  return getMag(atoms, worldId, fallback);
}

export function computeThreatStack(i: ThreatInputs, contextAtoms?: ContextAtom[]): ThreatBreakdown {
  const why: string[] = [];
  const traceAtoms: ContextAtom[] = [];
  let inputs: ThreatInputs = { ...i };
  const usedAtomIds: string[] = [];

  if (contextAtoms && contextAtoms.length > 0) {
      const atoms = contextAtoms;
      const selfId = (atoms.find(a => a.subject)?.subject as string) || 'unknown'; 

      // ---------- ENV ----------
      const envDanger = Math.max(
          getMag(atoms, `world:map:danger:${selfId}`, 0),
          getMag(atoms, `world:env:hazard:${selfId}`, 0),
          getMag(atoms, `ctx:danger:${selfId}`, 0)
      );
      usedAtomIds.push(`world:map:danger:${selfId}`, `world:env:hazard:${selfId}`, `ctx:danger:${selfId}`);
      
      const visibility = getMag(atoms, `world:loc:visibility:${selfId}`, 0.6);
      usedAtomIds.push(`world:loc:visibility:${selfId}`);
      
      const cover = getMag(atoms, `world:map:cover:${selfId}`, 0);
      usedAtomIds.push(`world:map:cover:${selfId}`);
      
      const crowd = Math.max(
          getMag(atoms, `world:loc:crowd:${selfId}`, 0),
          getMag(atoms, `scene:crowd:${selfId}`, 0),
          getMag(atoms, `ctx:crowd:${selfId}`, 0)
      );
      usedAtomIds.push(`world:loc:crowd:${selfId}`, `scene:crowd:${selfId}`, `ctx:crowd:${selfId}`);

      inputs.envDanger = clamp01(envDanger);
      inputs.visibilityBad = clamp01(1 - visibility);
      inputs.coverLack = clamp01(1 - cover);
      inputs.crowding = clamp01(crowd);

      // ---------- authority / surveillance ----------
      const surveillance = pickAny(atoms, [
          `ctx:surveillance:${selfId}`,
          `norm:surveillance:${selfId}`,
          `world:loc:control_level:${selfId}`
      ], inputs.surveillance);
      usedAtomIds.push(`ctx:surveillance:${selfId}`, `norm:surveillance:${selfId}`, `world:loc:control_level:${selfId}`);
      inputs.surveillance = clamp01(surveillance);

      const hierarchyPressure = pickAny(atoms, [
          `ctx:hierarchy:${selfId}`,
          `ctx:normPressure:${selfId}`,
          `world:loc:normative_pressure:${selfId}`,
          `world:loc:control_level:${selfId}`
      ], inputs.hierarchyPressure);
      usedAtomIds.push(`ctx:hierarchy:${selfId}`, `ctx:normPressure:${selfId}`, `world:loc:normative_pressure:${selfId}`, `world:loc:control_level:${selfId}`);
      inputs.hierarchyPressure = clamp01(hierarchyPressure);

      // ---------- scenario ----------
      const urgency = pickAny(atoms, [`scene:urgency:${selfId}`, `ctx:timePressure:${selfId}`], inputs.timePressure);
      usedAtomIds.push(`scene:urgency:${selfId}`, `ctx:timePressure:${selfId}`);
      inputs.timePressure = clamp01(urgency);

      const fatigue = getFeat(atoms, `feat:char:${selfId}:body.fatigue`, inputs.exhaustion);
      const pain = getFeat(atoms, `feat:char:${selfId}:body.pain`, 0);
      usedAtomIds.push(`feat:char:${selfId}:body.fatigue`, `feat:char:${selfId}:body.pain`);
      inputs.woundedPressure = clamp01(Math.max(inputs.woundedPressure, 0.6 * fatigue + 0.4 * pain));

      // ---------- SOCIAL ----------
      const obsNearby = atoms.filter(a => typeof a.id === 'string' && a.id.startsWith(`obs:nearby:${selfId}:`));
      const closeVals: number[] = [];
      const wTrust: number[] = [];
      const wHost: number[] = [];
      const wts: number[] = [];

      for (const o of obsNearby) {
          const otherId = (o.id.split(':')[3] || o.target || '').toString();
          const close = clamp01(o.magnitude ?? 0);
          const los = clamp01(getMag(atoms, `obs:los:${selfId}:${otherId}`, 0));
          const aud = clamp01(getMag(atoms, `obs:audio:${selfId}:${otherId}`, 0));
          const percept = clamp01(0.6 * los + 0.4 * aud);
          const w = clamp01(close * (0.35 + 0.65 * percept));

          closeVals.push(close);
          wts.push(w);

          const trust = getDyadTrust(atoms, selfId, otherId);

          const dyThreat = (() => {
              const v = getDyadThreat(atoms, selfId, otherId);
              if (Number.isFinite(v)) return v;
              return clamp01(1 - trust);
          })();

          wTrust.push(clamp01(trust) * w);
          wHost.push(clamp01(dyThreat) * w);
          
          usedAtomIds.push(
              o.id, `obs:los:${selfId}:${otherId}`, `obs:audio:${selfId}:${otherId}`,
              `tom:dyad:${selfId}:${otherId}:trust_ctx`, `tom:dyad:${selfId}:${otherId}:trust`,
              `tom:dyad:${selfId}:${otherId}:trust_prior`,
              `tom:dyad:${selfId}:${otherId}:threat_ctx`, `tom:dyad:${selfId}:${otherId}:threat`,
              `tom:dyad:${selfId}:${otherId}:threat_prior`,
              `rel:base:${selfId}:${otherId}:hostility`
          );
      }

      const nearbyCount = noisyOr01(closeVals);
      const wSum = wts.reduce((s, v) => s + v, 0) || 1;
      const trustMean = clamp01(wTrust.reduce((s, v) => s + v, 0) / wSum);
      const hostileMean = clamp01(wHost.reduce((s, v) => s + v, 0) / wSum);

      inputs.nearbyCount = clamp01(nearbyCount);
      inputs.nearbyTrustMean = trustMean;
      inputs.nearbyHostileMean = hostileMean;

      // ---------- epistemic noise ----------
      const uncertainty = pickAny(atoms, [`ctx:uncertainty:${selfId}`, `obs:infoAdequacy:${selfId}`], NaN);
      const unc = Number.isFinite(uncertainty) 
          ? clamp01(uncertainty)
          : clamp01(1 - getMag(atoms, `obs:infoAdequacy:${selfId}`, 0.6));
      
      const rumorFlag = getMag(atoms, `belief:banner:${selfId}`, 0);
      const traumaPriming = getMag(atoms, `trace:traumaPriming:${selfId}`, 0);
      usedAtomIds.push(`ctx:uncertainty:${selfId}`, `obs:infoAdequacy:${selfId}`, `belief:banner:${selfId}`, `trace:traumaPriming:${selfId}`);
      
      const epistemicNoise = Math.max(unc, 0.6 * rumorFlag);

      // ---------- traits ----------
      inputs.paranoia = getFeat(atoms, `feat:char:${selfId}:trait.paranoia`, inputs.paranoia);
      inputs.experience = getFeat(atoms, `feat:char:${selfId}:trait.experience`, inputs.experience);
      inputs.exhaustion = getFeat(atoms, `feat:char:${selfId}:body.fatigue`, inputs.exhaustion);
      usedAtomIds.push(`feat:char:${selfId}:trait.paranoia`, `feat:char:${selfId}:trait.experience`, `feat:char:${selfId}:body.fatigue`);

      inputs.paranoia = clamp01(inputs.paranoia + 0.3 * epistemicNoise + 0.5 * traumaPriming);
      
      if (traumaPriming > 0.1) why.push(`traumaPriming=${traumaPriming.toFixed(2)} (+${(0.5*traumaPriming).toFixed(2)} paranoia)`);
      why.push(`inputs :: envDanger=${inputs.envDanger.toFixed(2)} crowd=${inputs.crowding.toFixed(2)} nearby=${inputs.nearbyCount.toFixed(2)} trustMean=${inputs.nearbyTrustMean.toFixed(2)} hostileMean=${inputs.nearbyHostileMean.toFixed(2)} auth=${inputs.hierarchyPressure.toFixed(2)} unc=${unc.toFixed(2)}`);
  }

  // 1) ENV
  const env = clamp01(
    0.45 * inputs.envDanger +
    0.20 * inputs.visibilityBad +
    0.15 * inputs.coverLack +
    0.20 * inputs.crowding
  );

  // 2) SOCIAL
  const peopleFactor = clamp01(inputs.nearbyCount); 
  const distrust = clamp01(1 - inputs.nearbyTrustMean);
  const hostility = clamp01(inputs.nearbyHostileMean);

  const social = clamp01(
    peopleFactor * (0.55 * distrust + 0.45 * hostility) +
    0.20 * inputs.hierarchyPressure +
    0.10 * inputs.surveillance
  );

  // 3) SCENARIO
  const scenario = clamp01(
    0.40 * inputs.timePressure +
    0.35 * inputs.woundedPressure +
    0.25 * inputs.goalBlock
  );

  // 4) PERSONAL (bias)
  const expBuffer = clamp01(inputs.experience);
  const personalRaw = clamp01(
    0.35 * inputs.paranoia +
    0.25 * inputs.trauma +
    0.25 * inputs.exhaustion +
    0.10 * inputs.dissociation
  );
  const personal = clamp01(personalRaw * (1 - 0.45 * expBuffer));

  const wEnv = 0.40, wSoc = 0.30, wScn = 0.30;
  const combined = 1 - (1 - wEnv * env) * (1 - wSoc * social) * (1 - wScn * scenario);

  const total = clamp01(sigmoid(2.4 * (combined - 0.35 + 0.55 * personal)));

  return { 
      env, social, scenario, personal, total, 
      inputs, 
      usedAtomIds: Array.from(new Set(usedAtomIds)).filter(Boolean), 
      why, 
      traceAtoms 
  };
}

export function threatToSceneMetric(total01: number): number {
  return Math.round(150 * Math.pow(clamp01(total01), 0.85));
}
export function threatToAppraisal(total01: number): number {
  return clamp01(Math.pow(total01, 1.05));
}
