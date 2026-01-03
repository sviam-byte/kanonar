
// lib/context/sources/observationAtoms.ts
import type { ContextAtom } from '../v2/types';
import { normalizeAtom } from '../v2/infer';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function atom(args: {
  id: string;
  magnitude: number;
  subject?: string;
  target?: string;
  meta?: any;
  label?: string;
  confidence?: number;
}): ContextAtom {
  return {
    id: args.id,
    ns: 'obs',
    kind: 'observation',
    origin: 'obs',
    source: 'observationExtractor',
    magnitude: clamp01(args.magnitude),
    confidence: clamp01(args.confidence ?? 1),
    subject: args.subject,
    target: args.target,
    label: args.label,
    meta: args.meta
  } as any;
}

// distance -> closeness (0..1)
function closenessFromDist(d: number, r0: number) {
  // r0 ~ typical "perception radius" in cells/units
  return clamp01(1 - d / Math.max(1e-6, r0));
}

// Very cheap LOS proxy (MVP):
// - if map has walkable grid and obstacles, we can later do raycast;
// - now: if both agents in same location -> assume LOS degraded by crowd/visibility.
function losProxy(args: { visibility: number; crowd: number; dist: number; maxSight: number }) {
  const { visibility, crowd, dist, maxSight } = args;
  const distFactor = clamp01(1 - dist / Math.max(1e-6, maxSight));
  // crowd reduces LOS; visibility increases
  return clamp01(0.65 * visibility + 0.35 * distFactor - 0.30 * crowd);
}

function audibilityProxy(args: { noise: number; dist: number; maxHearing: number }) {
  const { noise, dist, maxHearing } = args;
  const distFactor = clamp01(1 - dist / Math.max(1e-6, maxHearing));
  // noise reduces audibility
  return clamp01(0.75 * distFactor + 0.25 * (1 - noise));
}

function getLocProp01(location: any, key: string, fb: number) {
  const v = Number(location?.properties?.[key]);
  if (!Number.isFinite(v)) return fb;
  if (v >= 0 && v <= 1) return v;
  if (v >= 0 && v <= 100) return v / 100;
  if (v >= 0 && v <= 10) return v / 10;
  return clamp01(v);
}
function getLocState01(location: any, key: string, fb: number) {
  const v = Number(location?.state?.[key]);
  if (!Number.isFinite(v)) return fb;
  if (v >= 0 && v <= 1) return v;
  if (v >= 0 && v <= 100) return v / 100;
  if (v >= 0 && v <= 10) return v / 10;
  return clamp01(v);
}

function getAgentPos(world: any, agentId: string) {
  // Prefer explicit agentPosition map
  const pos = world?.agentPositions?.[agentId] || world?.positions?.[agentId] || null;
  if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) return { x: pos.x, y: pos.y };
  // fallback: if agent stores x/y
  const a = (world?.agents || []).find((z: any) => z.entityId === agentId);
  if (a && Number.isFinite(a.position?.x) && Number.isFinite(a.position?.y)) return { x: a.position.x, y: a.position.y };
  if (a && Number.isFinite(a.x) && Number.isFinite(a.y)) return { x: a.x, y: a.y };
  
  // Last resort fallback: Random-ish stable position based on ID if world exists
  if (a) {
      const seed = agentId.charCodeAt(0) + agentId.charCodeAt(agentId.length-1);
      return { x: 5 + (seed % 5), y: 5 + (seed % 3) };
  }
  return null;
}

export function extractObservationAtoms(args: {
  world: any;
  selfId: string;
  location: any;          // resolved location entity
  otherAgentIds: string[]; // candidates in same location (or nearby)
}): ContextAtom[] {
  const { world, selfId, location } = args;

  const selfPos = getAgentPos(world, selfId);
  // If no position -> still can do coarse “same location => weak obs”
  const visibility = getLocProp01(location, 'visibility', 0.6);
  const noise = getLocProp01(location, 'noise', 0.3);
  const crowd = getLocState01(location, 'crowd_level', 0);

  // Perception parameters (MVP constants; later from CharacterFeatures)
  const maxSight = 8;    // cells/units
  const maxHearing = 10; // cells/units
  const r0 = 10;

  const out: ContextAtom[] = [];

  let infoAdequacyAccum = 0;
  let infoAdequacyCount = 0;

  for (const otherId of args.otherAgentIds || []) {
    if (otherId === selfId) continue;

    const otherPos = getAgentPos(world, otherId);

    let dist = 999;
    if (selfPos && otherPos) {
      const dx = selfPos.x - otherPos.x;
      const dy = selfPos.y - otherPos.y;
      dist = Math.sqrt(dx * dx + dy * dy);
    } else {
      // no positions => treat as medium distance
      dist = 6;
    }

    const close = closenessFromDist(dist, r0); // 0..1
    const los = losProxy({ visibility, crowd, dist, maxSight }); // 0..1
    const aud = audibilityProxy({ noise, dist, maxHearing }); // 0..1

    // confidence: combine sensory channels
    const conf = clamp01(Math.max(los, aud) * (0.75 + 0.25 * close));

    // observation atoms with subject/target for compatibility
    out.push(atom({
      id: `obs:nearby:${selfId}:${otherId}`,
      magnitude: close,
      confidence: conf,
      subject: selfId,
      target: otherId,
      meta: { dist },
      label: `near:${Math.round(close * 100)}%`
    }));
    out.push(atom({
      id: `obs:los:${selfId}:${otherId}`,
      magnitude: los,
      confidence: clamp01(los),
      subject: selfId,
      target: otherId,
      meta: { dist },
      label: `los:${Math.round(los * 100)}%`
    }));
    out.push(atom({
      id: `obs:audio:${selfId}:${otherId}`,
      magnitude: aud,
      confidence: clamp01(aud),
      subject: selfId,
      target: otherId,
      meta: { dist },
      label: `aud:${Math.round(aud * 100)}%`
    }));

    // summary for infoAdequacy
    infoAdequacyAccum += clamp01(0.6 * los + 0.4 * aud);
    infoAdequacyCount += 1;
  }

  // Global info adequacy in this tick (0..1)
  // If no others, it's still determined by environment visibility/crowd/noise.
  const envQuality = clamp01(0.55 * visibility + 0.25 * (1 - noise) + 0.20 * (1 - crowd));
  const socialQuality = infoAdequacyCount ? clamp01(infoAdequacyAccum / infoAdequacyCount) : envQuality;
  const infoAdequacy = clamp01(0.7 * envQuality + 0.3 * socialQuality);

  out.push(atom({
    id: `obs:infoAdequacy:${selfId}`,
    magnitude: infoAdequacy,
    confidence: 1,
    subject: selfId,
    meta: { envQuality, socialQuality, visibility, noise, crowd },
    label: `infoAdequacy:${Math.round(infoAdequacy * 100)}%`
  }));

  // IMPORTANT: normalize at source so downstream derived layers
  // can rely on atom.code/atom.params even before epistemic merge.
  return out.map(a => normalizeAtom(a as any));
}
