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
  }

  // Ensure all known channels exist for predictable downstream code.
  for (const ch of KNOWN_CHANNELS) ensure(byCh, ch);

  // Clamp raw_value to 0..1 (we treat it as a normalized pressure).
  for (const ch of Object.keys(byCh)) {
    byCh[ch].raw_value = clamp01(byCh[ch].raw_value);
  }

  return { channels: byCh as any };
}
