// lib/simkit/core/spatial.ts
// Spatial helpers for SimKit: positions on a location map, distances, audibility.

import type { SimWorld } from './types';
import { getChar, getLoc } from './world';

export type SpatialConfig = {
  // Map-space units (same coordinate system as location.map / nav nodes).
  talkRange: number; // normal speaking
  whisperRange: number;
  shoutRange: number;
  attackRange: number;

  // Per tick max step for move_xy (map-space units).
  moveMaxStep: number;

  // Privacy threshold for whisper to be considered plausible.
  whisperMinPrivacy: number;
};

export const DEFAULT_SPATIAL_CONFIG: SpatialConfig = {
  talkRange: 90,
  whisperRange: 28,
  shoutRange: 1e9,
  attackRange: 18,
  moveMaxStep: 70,
  whisperMinPrivacy: 0.35,
};

function clamp01(x: number): number {
  return Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0;
}

// Read spatial config from world facts, with fallbacks to defaults.
export function getSpatialConfig(world: SimWorld): SpatialConfig {
  const raw = (world.facts || ({} as any))['spatial'];
  const cfg = raw && typeof raw === 'object' ? raw : {};
  const pick = (k: keyof SpatialConfig, fb: number) => {
    const v = Number((cfg as any)[k]);
    return Number.isFinite(v) ? v : fb;
  };
  return {
    talkRange: pick('talkRange', DEFAULT_SPATIAL_CONFIG.talkRange),
    whisperRange: pick('whisperRange', DEFAULT_SPATIAL_CONFIG.whisperRange),
    shoutRange: pick('shoutRange', DEFAULT_SPATIAL_CONFIG.shoutRange),
    attackRange: pick('attackRange', DEFAULT_SPATIAL_CONFIG.attackRange),
    moveMaxStep: pick('moveMaxStep', DEFAULT_SPATIAL_CONFIG.moveMaxStep),
    whisperMinPrivacy: pick('whisperMinPrivacy', DEFAULT_SPATIAL_CONFIG.whisperMinPrivacy),
  };
}

export type XY = { x: number; y: number };

// Resolve the best possible XY for a character within its current location.
export function getCharXY(world: SimWorld, charId: string): XY {
  const c = getChar(world, charId);
  const loc = getLoc(world, c.locId);

  // 1) Explicit x/y.
  const x0 = Number(c.pos?.x);
  const y0 = Number(c.pos?.y);
  if (Number.isFinite(x0) && Number.isFinite(y0)) return { x: x0, y: y0 };

  // 2) Node position.
  const nid = String(c.pos?.nodeId ?? '');
  if (nid && loc?.nav?.nodes?.length) {
    const n = loc.nav.nodes.find((nn) => nn.id === nid);
    if (n && Number.isFinite(n.x) && Number.isFinite(n.y)) return { x: Number(n.x), y: Number(n.y) };
  }

  // 3) Fallback: center of map if available.
  const mapW = Number((loc as any)?.map?.width ?? (loc as any)?.width);
  const mapH = Number((loc as any)?.map?.height ?? (loc as any)?.height);
  if (Number.isFinite(mapW) && Number.isFinite(mapH)) return { x: mapW / 2, y: mapH / 2 };

  return { x: 0, y: 0 };
}

export function distSameLocation(world: SimWorld, aId: string, bId: string): number {
  const a = getChar(world, aId);
  const b = getChar(world, bId);
  if (!a || !b) return Number.POSITIVE_INFINITY;
  if (a.locId !== b.locId) return Number.POSITIVE_INFINITY;
  const pa = getCharXY(world, aId);
  const pb = getCharXY(world, bId);
  const dx = pa.x - pb.x;
  const dy = pa.y - pb.y;
  return Math.hypot(dx, dy);
}

// Very simple privacy heuristic (0..1): higher => more private.
// You can later replace this with nav/node tags and line-of-sight.
export function privacyOf(world: SimWorld, locId: string, nodeId?: string | null): number {
  const loc = getLoc(world, locId);
  const base = (() => {
    const tags = new Set((loc.tags || []).map(String));
    if (tags.has('private')) return 0.85;
    if (tags.has('public')) return 0.25;
    return 0.55;
  })();

  const surveillance = Number((loc.norms || {})['surveillance'] ?? 0);
  const crowd = Number((loc.hazards || {})['crowd'] ?? 0);
  const nodeBonus = (() => {
    if (!nodeId || !loc?.nav?.nodes?.length) return 0;
    const n = loc.nav.nodes.find((x) => x.id === nodeId);
    const t = new Set((n?.tags || []).map(String));
    if (t.has('private')) return 0.2;
    if (t.has('public')) return -0.2;
    return 0;
  })();

  return clamp01(base + nodeBonus - 0.45 * surveillance - 0.25 * crowd);
}

export type Volume = 'whisper' | 'normal' | 'shout';

// Determine if a listener can hear a speaker for a given volume.
export function canHear(world: SimWorld, speakerId: string, listenerId: string, volume: Volume): boolean {
  const speaker = getChar(world, speakerId);
  const listener = getChar(world, listenerId);
  if (!speaker || !listener) return false;
  if (speaker.locId !== listener.locId) return false;

  const cfg = getSpatialConfig(world);
  const d = distSameLocation(world, speakerId, listenerId);
  if (!Number.isFinite(d)) return false;

  if (volume === 'shout') return d <= cfg.shoutRange;
  if (volume === 'normal') return d <= cfg.talkRange;

  // whisper
  if (d > cfg.whisperRange) return false;
  const priv = privacyOf(world, speaker.locId, speaker.pos?.nodeId ?? null);
  return priv >= cfg.whisperMinPrivacy;
}
