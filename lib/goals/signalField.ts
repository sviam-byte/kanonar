import type { ContextAtom } from '../context/v2/types';
import type { EnergyChannel } from '../agents/energyProfiles';

export type SignalChannel = {
  sources: ContextAtom[];
  raw_value: number;
  weights: number[];
};

export type SignalField = {
  channels: Record<EnergyChannel, SignalChannel>;
};

const KNOWN_CHANNELS: EnergyChannel[] = [
  'threat',
  'uncertainty',
  'norm',
  'attachment',
  'resource',
  'status',
  'curiosity',
  'base',
];

// Map atom-id keys to energy channels.
// This makes SignalField a backbone even when upstream stages
// do not explicitly emit `app:<channel>` or `obs:<channel>` atoms.
//
// Convention used below:
// - drv:* are needs/drives -> channel pressures
// - ctx:* are contextual axes -> channel pressures
// - cap:* (selected) reflect internal resource constraints
type ChannelMap = Partial<Record<EnergyChannel, number>>;

const DRIVER_TO_CHANNEL: Record<string, ChannelMap> = {
  safetyNeed: { threat: 1.0 },
  safety: { threat: 1.0 },
  controlNeed: { uncertainty: 0.75, threat: 0.25 },
  control: { uncertainty: 0.75, threat: 0.25 },
  statusNeed: { status: 1.0, norm: 0.25 },
  status: { status: 1.0, norm: 0.25 },
  affiliationNeed: { attachment: 1.0 },
  affiliation: { attachment: 1.0 },
  restNeed: { resource: 1.0 },
  rest: { resource: 1.0 },
  curiosityNeed: { curiosity: 1.0, uncertainty: 0.15 },
  curiosity: { curiosity: 1.0, uncertainty: 0.15 },
  resolveNeed: { norm: 0.35, threat: 0.15, uncertainty: 0.25 },
  resolve: { norm: 0.35, threat: 0.15, uncertainty: 0.25 },
};

const CTX_TO_CHANNEL: Record<string, ChannelMap> = {
  danger: { threat: 1.0 },
  threat: { threat: 1.0 },
  hostility: { threat: 0.75, uncertainty: 0.25 },
  uncertainty: { uncertainty: 1.0 },
  scarcity: { resource: 0.85, threat: 0.15 },
  timePressure: { threat: 0.35, resource: 0.35, uncertainty: 0.25 },
  normPressure: { norm: 1.0 },
  proceduralStrict: { norm: 0.85, status: 0.15 },
  hierarchy: { status: 0.75, norm: 0.35 },
  publicness: { status: 0.6, norm: 0.4 },
  surveillance: { norm: 0.65, threat: 0.15, status: 0.15 },
  privacy: { attachment: 0.25, threat: 0.15 },
  intimacy: { attachment: 0.85 },
  crowd: { norm: 0.25, threat: 0.25, uncertainty: 0.25 },
  novelty: { curiosity: 0.75, uncertainty: 0.25 },
  chaos: { uncertainty: 0.65, threat: 0.25 },
  grief: { attachment: 0.25, threat: 0.25 },
  pain: { threat: 0.25, resource: 0.35 },
  control: { uncertainty: 0.45, threat: 0.25 },
  cover: { threat: 0.25, norm: 0.15 },
  escape: { threat: 0.35, uncertainty: 0.25 },
};

const CAP_TO_CHANNEL: Record<string, ChannelMap> = {
  fatigue: { resource: 1.0 },
  hunger: { resource: 0.75 },
  thirst: { resource: 0.75 },
  pain: { resource: 0.35, threat: 0.15 },
};

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function wAtom(a: any): number {
  const m = Number(a?.magnitude ?? 0);
  const c = Number(a?.confidence ?? 1);
  if (!Number.isFinite(m)) return 0;
  if (!Number.isFinite(c)) return 0;
  return clamp01(m) * clamp01(c);
}

function ensure(channels: Record<string, SignalChannel>, ch: string): SignalChannel {
  if (!channels[ch]) channels[ch] = { sources: [], raw_value: 0, weights: [] };
  return channels[ch];
}

/**
 * Build a lightweight SignalField from existing atoms.
 *
 * Goal: provide a stable structure `signal[channel] = {sources[], raw_value}`.
 *
 * This intentionally starts conservative:
 * - obs:<channel>:<selfId>(:otherId?)
 * - app:<key>:<selfId>
 * - emo:<key>:<selfId>
 *
 * We only pick channels that match KNOWN_CHANNELS.
 */
export function buildSignalField(selfId: string, atoms: ContextAtom[]): SignalField {
  const byCh: Record<string, SignalChannel> = {};

  const sid = String(selfId);

  const addMapped = (m: ChannelMap | undefined, a: ContextAtom) => {
    if (!m) return;
    const w0 = wAtom(a);
    if (w0 <= 0) return;
    for (const ch of Object.keys(m) as EnergyChannel[]) {
      if (!KNOWN_CHANNELS.includes(ch)) continue;
      const k = Number((m as Record<string, number>)[ch] ?? 0);
      if (!Number.isFinite(k) || k === 0) continue;
      const w = w0 * k;
      const slot = ensure(byCh, ch);
      slot.sources.push(a);
      slot.raw_value += w;
      slot.weights.push(w);
    }
  };

  for (const a of atoms || []) {
    const id = String((a as any)?.id ?? '');
    if (!id) continue;

    // obs:<channel>:<selfId>[:<otherId>]
    if (id.startsWith('obs:')) {
      const parts = id.split(':');
      const ch = String(parts[1] || '');
      const who = String(parts[2] || '');
      if (who !== sid) continue;
      if (!KNOWN_CHANNELS.includes(ch as any)) continue;

      const w = wAtom(a);
      const slot = ensure(byCh, ch);
      slot.sources.push(a);
      slot.raw_value += w;
      slot.weights.push(w);
      continue;
    }

    // app:<key>:<selfId>
    if (id.startsWith('app:')) {
      const parts = id.split(':');
      const key = String(parts[1] || '');
      const who = String(parts[2] || '');
      if (who !== sid) continue;
      if (!KNOWN_CHANNELS.includes(key as any)) continue;

      const w = wAtom(a);
      const slot = ensure(byCh, key);
      slot.sources.push(a);
      slot.raw_value += w;
      slot.weights.push(w);
      continue;
    }

    // emo:<key>:<selfId>
    if (id.startsWith('emo:')) {
      const parts = id.split(':');
      const key = String(parts[1] || '');
      const who = String(parts[2] || '');
      if (who !== sid) continue;
      if (!KNOWN_CHANNELS.includes(key as any)) continue;

      const w = wAtom(a);
      const slot = ensure(byCh, key);
      slot.sources.push(a);
      slot.raw_value += w;
      slot.weights.push(w);
      continue;
    }

    // drv:<key>:<selfId>
    if (id.startsWith('drv:')) {
      const parts = id.split(':');
      const key = String(parts[1] || '');
      const who = String(parts[2] || '');
      if (who !== sid) continue;
      addMapped(DRIVER_TO_CHANNEL[key], a);
      continue;
    }

    // ctx:<key>:<selfId>
    // Ignore ctx:src:* atoms (they are raw inputs, not stable axes).
    if (id.startsWith('ctx:')) {
      if (id.startsWith('ctx:src:')) continue;
      const parts = id.split(':');
      const key = String(parts[1] || '');
      const who = String(parts[2] || '');
      if (who !== sid) continue;
      addMapped(CTX_TO_CHANNEL[key], a);
      continue;
    }

    // cap:<key>:<selfId>
    if (id.startsWith('cap:')) {
      const parts = id.split(':');
      const key = String(parts[1] || '');
      const who = String(parts[2] || '');
      if (who !== sid) continue;
      addMapped(CAP_TO_CHANNEL[key], a);
      continue;
    }
  }

  // Ensure all known channels exist for predictable downstream code.
  for (const ch of KNOWN_CHANNELS) ensure(byCh, ch);

  // Clamp raw_value to 0..1 (we treat it as a normalized pressure).
  for (const ch of Object.keys(byCh)) {
    byCh[ch].raw_value = clamp01(byCh[ch].raw_value);
  }

  return { channels: byCh as any };
}
