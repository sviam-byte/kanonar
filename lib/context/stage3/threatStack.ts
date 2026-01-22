import { Atom } from '../../atoms/types';
import { getM, used } from '../../atoms/read';
import { clamp01, linMix, noisyOr } from '../../math/normalize';
import { pickCtxId } from '../layers';

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
  socialBaselineHostility: 0.06,
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
  // Prefer subjective ctx:final:* axes when present.
  const ctxKey = (axis: string) => {
    const candidates = pickCtxId(axis, agentId);
    for (const id of candidates) {
      if (resolved.has(id)) return id;
    }
    return `ctx:${axis}:${agentId}`;
  };

  // Environment
  const T_env = clamp01(Math.max(
    getM(resolved, `world:map:danger:${agentId}`, 0),
    getM(resolved, `world:env:hazard:${agentId}`, 0),
    getM(resolved, ctxKey('danger'), 0)
  ));

  // Authority
  const authMix = linMix([
    { name: 'locControl', value: getM(resolved, `world:loc:control:${agentId}`, 0), weight: 0.60 },
    { name: 'normPressure', value: getM(resolved, ctxKey('normPressure'), 0), weight: 0.40 },
  ]);
  const T_auth = authMix.value;

  // Uncertainty
  const T_unc = getM(resolved, ctxKey('uncertainty'), 0.5);

  // Scenario
  const scMix = linMix([
    { name: 'crowd', value: getM(resolved, ctxKey('crowd'), 0), weight: 0.55 },
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
    // Prefer dyad-level threat/support from ToM if available.
    const dyadThreat = getM(resolved, `tom:dyad:${agentId}:${b}:threat`, NaN);
    const dyadSupport = getM(resolved, `tom:dyad:${agentId}:${b}:support`, NaN);
    // Fallback trust if dyad atoms are missing.
    const trust = getM(resolved, `tom:trustEff:${agentId}:${b}`, 0.45);

    const percept = clamp01(P.wLos * los + P.wAud * aud);
    // If we have dyad threat: use it; otherwise derive from trust with small baseline.
    const baseThreat = Number.isFinite(dyadThreat)
      ? clamp01(dyadThreat)
      : clamp01(P.socialBaselineHostility + (1 - trust) * 0.75);
    // Support acts as shield: high support suppresses perceived threat.
    const shield = Number.isFinite(dyadSupport) ? clamp01(dyadSupport) : clamp01(trust);
    const effectiveThreat = clamp01(baseThreat * (1 - P.socialShieldStrength * shield));
    const t = clamp01(close * effectiveThreat * percept);

    t_ab_list.push({
      b, t,
      usedAtomIds: Number.isFinite(dyadThreat) || Number.isFinite(dyadSupport)
        ? used(
          `obs:nearby:${agentId}:${b}`,
          `obs:los:${agentId}:${b}`,
          `obs:audio:${agentId}:${b}`,
          `tom:dyad:${agentId}:${b}:threat`,
          `tom:dyad:${agentId}:${b}:support`
        )
        : used(
          `obs:nearby:${agentId}:${b}`,
          `obs:los:${agentId}:${b}`,
          `obs:audio:${agentId}:${b}`,
          `tom:trustEff:${agentId}:${b}`
        )
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
  const surv = getM(resolved, ctxKey('surveillance'), 0);
  const pressureMix = linMix([
    { name: 'surveillance', value: surv, weight: 0.5 },
    { name: 'normPressure', value: getM(resolved, ctxKey('normPressure'), 0), weight: 0.2 },
  ]);

  return [
    {
      id: `threat:env:${agentId}`,
      m: T_env,
      c: 1,
      o: 'derived',
      meta: {
        trace: {
          usedAtomIds: [
            `world:map:danger:${agentId}`,
            `world:env:hazard:${agentId}`,
            ctxKey('danger')
          ],
          parts: [
            { name: 'mapDanger', value: getM(resolved, `world:map:danger:${agentId}`, 0), weight: 1 },
            { name: 'envHazard', value: getM(resolved, `world:env:hazard:${agentId}`, 0), weight: 1 },
            { name: 'ctxDanger', value: getM(resolved, ctxKey('danger'), 0), weight: 1 },
          ],
          notes: 'env threat = max(mapDanger, envHazard, ctxDanger)'
        }
      }
    },
    {
      id: `threat:soc:${agentId}`,
      m: T_soc,
      c: 1,
      o: 'derived',
      meta: {
        trace: {
          usedAtomIds: t_ab_list.flatMap(x => x.usedAtomIds),
          parts: t_ab_list.map(x => ({ name: `soc:${x.b}`, value: x.t, weight: 1 })),
          notes: 'noisyOr across nearby agents'
        }
      }
    },
    {
      id: `threat:auth:${agentId}`,
      m: T_auth,
      c: 1,
      o: 'derived',
      meta: {
        trace: {
          usedAtomIds: [
            `world:loc:control:${agentId}`,
            ctxKey('normPressure')
          ],
          parts: authMix.parts.map(p => ({ name: p.name || 'part', value: p.value, weight: p.weight })),
          notes: 'authority mix from control + normPressure'
        }
      }
    },
    {
      id: `threat:unc:${agentId}`,
      m: T_unc,
      c: 1,
      o: 'derived',
      meta: {
        trace: {
          usedAtomIds: [ctxKey('uncertainty')],
          parts: [{ name: 'uncertainty', value: T_unc, weight: 1 }],
          notes: 'threat uncertainty from ctx:uncertainty'
        }
      }
    },
    {
      id: `threat:body:${agentId}`,
      m: T_body,
      c: 1,
      o: 'derived',
      meta: {
        trace: {
          usedAtomIds: [`body:fatigue:${agentId}`, `body:pain:${agentId}`, `body:stress:${agentId}`],
          parts: [
            { name: 'fatigue', value: getM(resolved, `body:fatigue:${agentId}`, 0), weight: 1 },
            { name: 'pain', value: getM(resolved, `body:pain:${agentId}`, 0), weight: 1 },
            { name: 'stress', value: getM(resolved, `body:stress:${agentId}`, 0), weight: 1 },
          ],
          notes: 'body threat = max(fatigue, pain, stress)'
        }
      }
    },
    {
      id: `threat:sc:${agentId}`,
      m: T_sc,
      c: 1,
      o: 'derived',
      meta: {
        trace: {
          usedAtomIds: [ctxKey('crowd'), `scene:urgency:${agentId}`],
          parts: scMix.parts.map(p => ({ name: p.name || 'part', value: p.value, weight: p.weight })),
          notes: 'scenario mix from crowd and urgency'
        }
      }
    },
    {
      id: `threat:final:${agentId}`,
      m: T_final,
      c: 1,
      o: 'derived',
      meta: {
        trace: {
          usedAtomIds: [
            `threat:env:${agentId}`,
            `threat:soc:${agentId}`,
            `threat:auth:${agentId}`,
            `threat:unc:${agentId}`,
            `threat:body:${agentId}`,
            `threat:sc:${agentId}`,
          ],
          parts: finalMix.parts.map(p => ({ name: p.name || 'part', value: p.value, weight: p.weight })),
          formulaId: 'threat:final@v1',
          notes: 'weighted threat blend',
        }
      }
    },
    { id: `mind:threat:${agentId}`, m: T_final, c: 1, o: 'derived', meta: { trace: { usedAtomIds: [`threat:final:${agentId}`], notes: 'mind.threat mirrors threat:final' } } },
    {
      id: `mind:pressure:${agentId}`,
      m: pressureMix.value,
      c: 1,
      o: 'derived',
      meta: {
        trace: {
          usedAtomIds: [ctxKey('surveillance'), ctxKey('normPressure')],
          parts: pressureMix.parts.map(p => ({ name: p.name || 'part', value: p.value, weight: p.weight })),
          notes: 'pressure mix from surveillance and normPressure'
        }
      }
    },
    {
      id: `mind:support:${agentId}`,
      m: noisyOr(otherAgentIds.map(b => getM(resolved, `obs:nearby:${agentId}:${b}`, 0) * getM(resolved, `tom:trustEff:${agentId}:${b}`, 0.45))),
      c: 1,
      o: 'derived',
      meta: {
        trace: {
          usedAtomIds: otherAgentIds.flatMap(b => used(`obs:nearby:${agentId}:${b}`, `tom:trustEff:${agentId}:${b}`)),
          notes: 'support = noisyOr(nearby * trust)',
          parts: otherAgentIds.map(b => ({ name: `support:${b}`, value: getM(resolved, `obs:nearby:${agentId}:${b}`, 0) * getM(resolved, `tom:trustEff:${agentId}:${b}`, 0.45), weight: 1 }))
        }
      }
    },
    {
      id: `mind:crowd:${agentId}`,
      m: getM(resolved, ctxKey('crowd'), 0),
      c: 1,
      o: 'derived',
      meta: {
        trace: {
          usedAtomIds: [ctxKey('crowd')],
          parts: [{ name: 'ctxCrowd', value: getM(resolved, ctxKey('crowd'), 0), weight: 1 }],
          notes: 'mind.crowd mirrors ctx:crowd'
        }
      }
    },
  ];
}
