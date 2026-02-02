import { CurveSpec, normalizeCurveSpec } from '../utils/curves';

export type EnergyChannel =
  | 'threat'
  | 'uncertainty'
  | 'norm'
  | 'attachment'
  | 'resource'
  | 'status'
  | 'curiosity'
  | 'base';

export type AgentEnergyProfile = {
  // Per-channel response curves: raw -> felt
  curves: Partial<Record<EnergyChannel, CurveSpec>>;
  // Optional per-channel inertia (0..1): higher = faster update, lower = more inertia
  inertia?: Partial<Record<EnergyChannel, number>>;
};

const DEFAULT_PROFILE: AgentEnergyProfile = {
  curves: {
    threat: { type: 'exp', k: 3.0 },
    uncertainty: { type: 'sigmoid', center: 0.4, slope: 8 },
    norm: { type: 'pow', k: 1.6 },
    attachment: { type: 'sigmoid', center: 0.35, slope: 6 },
    resource: { type: 'pow', k: 1.3 },
    status: { type: 'pow', k: 1.2 },
    curiosity: { type: 'sqrt' },
    base: { type: 'preset', preset: 'smoothstep' },
  },
  inertia: {
    threat: 0.35,
    uncertainty: 0.5,
    norm: 0.45,
    attachment: 0.4,
    resource: 0.55,
    status: 0.6,
    curiosity: 0.7,
    base: 0.6,
  },
};

/**
 * World/agent overrides support:
 * - world.energyProfiles?.[selfId]?.curves?.[channel]
 * - world.energyProfiles?.[selfId]?.inertia?.[channel]
 */
export function getAgentEnergyProfile(selfId: string, world?: any): AgentEnergyProfile {
  const perSelf = world?.energyProfiles?.[selfId];
  if (!perSelf) return DEFAULT_PROFILE;

  const curves: any = { ...(DEFAULT_PROFILE.curves || {}), ...(perSelf.curves || {}) };
  const inertia: any = { ...(DEFAULT_PROFILE.inertia || {}), ...(perSelf.inertia || {}) };

  // normalize curve specs
  for (const k of Object.keys(curves)) {
    curves[k] = normalizeCurveSpec(curves[k]);
  }

  return { curves, inertia };
}

export function getAgentChannelCurve(selfId: string, channel: EnergyChannel, world?: any): CurveSpec {
  const p = getAgentEnergyProfile(selfId, world);
  const spec = (p.curves as any)?.[channel] || (p.curves as any)?.base;
  return normalizeCurveSpec(spec);
}

export function getAgentChannelInertia(selfId: string, channel: EnergyChannel, world?: any): number {
  const p = getAgentEnergyProfile(selfId, world);
  const v = (p.inertia as any)?.[channel];
  if (!Number.isFinite(v)) return 0.6;
  return Math.max(0, Math.min(1, v));
}
