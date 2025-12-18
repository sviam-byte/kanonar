import { Atom } from '../../atoms/types';
import { getM, used } from '../../atoms/read';
import { clamp01, linMix, noisyOr } from '../../math/normalize';

type ThreatWeights = {
  env: number; soc: number; auth: number; unc: number; body: number; sc: number;
};

type ThreatParams = {
  socialBaselineHostility: number;
  socialShieldStrength: number;
  wLos: number;
  wAud: number;
};

const DEFAULT_W: ThreatWeights = {
  env: 0.28, soc: 0.28, auth: 0.16, unc: 0.12, body: 0.10, sc: 0.06,
};

const DEFAULT_P: ThreatParams = {
  socialBaselineHostility: 0.40,
  socialShieldStrength: 0.85,
  wLos: 0.6,
  wAud: 0.4,
};

export function deriveThreatStack(
  agentId: string,
  resolved: Map<string, Atom>,
  otherAgentIds: string[],
  weights: Partial<ThreatWeights> = {},
  params: Partial<ThreatParams> = {},
): Atom[] {
  const W: ThreatWeights = { ...DEFAULT_W, ...weights };
  const P: ThreatParams = { ...DEFAULT_P, ...params };

  // Environment
  const T_env = clamp01(Math.max(
    getM(resolved, `world:map:danger:${agentId}`, 0),
    getM(resolved, `world:env:hazard:${agentId}`, 0),
    getM(resolved, `ctx:danger:${agentId}`, 0)
  ));

  // Authority
  const authMix = linMix([
    { name: 'locControl', value: getM(resolved, `world:loc:control:${agentId}`, 0), weight: 0.60 },
    { name: 'normPressure', value: getM(resolved, `ctx:normPressure:${agentId}`, 0), weight: 0.40 },
  ]);
  const T_auth = authMix.value;

  // Uncertainty
  const T_unc = getM(resolved, `ctx:uncertainty:${agentId}`, 0.5);

  // Scenario
  const scMix = linMix([
    { name: 'crowd', value: getM(resolved, `ctx:crowd:${agentId}`, 0), weight: 0.55 },
    { name: 'urgency', value: getM(resolved, `scene:urgency:${agentId}`, 0), weight: 0.45 },
  ]);
  const T_sc = scMix.value;

  // Body
  const T_body = clamp01(Math.max(
    getM(resolved, `body:fatigue:${agentId}`, 0),
    getM(resolved, `body:pain:${agentId}`, 0),
    getM(resolved, `body:stress:${agentId}`, 0)
  ));

  // Social
  const t_ab_list: { b: string; t: number; usedAtomIds: string[] }[] = [];
  for (const b of otherAgentIds) {
    const close = getM(resolved, `obs:nearby:${agentId}:${b}`, 0);
    const los = getM(resolved, `obs:los:${agentId}:${b}`, 0);
    const aud = getM(resolved, `obs:audio:${agentId}:${b}`, 0);
    const trust = getM(resolved, `tom:trustEff:${agentId}:${b}`, 0.45);

    const hostility = clamp01(P.socialBaselineHostility + (1 - trust) * P.socialShieldStrength);
    const percept = clamp01(P.wLos * los + P.wAud * aud);
    const t = clamp01(close * hostility * percept);

    t_ab_list.push({
      b, t,
      usedAtomIds: used(`obs:nearby:${agentId}:${b}`, `obs:los:${agentId}:${b}`, `tom:trustEff:${agentId}:${b}`)
    });
  }
  const T_soc = noisyOr(t_ab_list.map(x => x.t));

  // Final
  const finalMix = linMix([
    { name: 'T_env', value: T_env, weight: W.env },
    { name: 'T_soc', value: T_soc, weight: W.soc },
    { name: 'T_auth', value: T_auth, weight: W.auth },
    { name: 'T_unc', value: T_unc, weight: W.unc },
    { name: 'T_body', value: T_body, weight: W.body },
    { name: 'T_sc', value: T_sc, weight: W.sc },
  ]);
  const T_final = finalMix.value;

  // mind:* atoms for panel
  const surv = getM(resolved, `ctx:surveillance:${agentId}`, 0);
  const pressureMix = linMix([
    { name: 'surveillance', value: surv, weight: 0.5 },
    { name: 'normPressure', value: getM(resolved, `ctx:normPressure:${agentId}`, 0), weight: 0.2 },
  ]);

  return [
    { id: `threat:env:${agentId}`, m: T_env, c: 1, o: 'derived' },
    { id: `threat:soc:${agentId}`, m: T_soc, c: 1, o: 'derived', meta: { trace: { notes: 'noisyOr across nearby agents' } } },
    { id: `threat:auth:${agentId}`, m: T_auth, c: 1, o: 'derived' },
    { id: `threat:unc:${agentId}`, m: T_unc, c: 1, o: 'derived' },
    { id: `threat:body:${agentId}`, m: T_body, c: 1, o: 'derived' },
    { id: `threat:sc:${agentId}`, m: T_sc, c: 1, o: 'derived' },
    /* Fix: Ensuring 'name' is non-optional for Atom.meta.trace.parts */
    { id: `threat:final:${agentId}`, m: T_final, c: 1, o: 'derived', meta: { trace: { parts: finalMix.parts.map(p => ({ name: p.name || 'part', value: p.value, weight: p.weight })), formulaId: 'threat:final@v1' } } },
    { id: `mind:threat:${agentId}`, m: T_final, c: 1, o: 'derived' },
    { id: `mind:pressure:${agentId}`, m: pressureMix.value, c: 1, o: 'derived' },
    { id: `mind:support:${agentId}`, m: noisyOr(otherAgentIds.map(b => getM(resolved, `obs:nearby:${agentId}:${b}`, 0) * getM(resolved, `tom:trustEff:${agentId}:${b}`, 0.45))), c: 1, o: 'derived' },
    { id: `mind:crowd:${agentId}`, m: getM(resolved, `ctx:crowd:${agentId}`, 0), c: 1, o: 'derived' },
  ];
}
