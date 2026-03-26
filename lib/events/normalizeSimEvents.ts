/**
 * Layer B: Event Normalization — enriched.
 *
 * Converts raw SimKit events into a uniform domain event format
 * with magnitude, urgency, valence, causal chains.
 */

export interface DomainEventV1 {
  id: string;
  tick: number;
  kind: string;
  actorId: string;
  targetId?: string;
  locationId?: string;
  fromLocationId?: string;
  toLocationId?: string;

  /** Estimated magnitude/intensity [0, 1]. */
  magnitude: number;
  /** Estimated urgency [0, 1]. */
  urgency: number;
  /** Valence: negative = threat/harm, positive = benefit. [-1, 1]. */
  valence: number;

  topic?: string;
  tags: string[];

  causedBy: string[];
  consequences: string[];

  /** Raw source for debugging (only in dev). */
  rawKind: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function inferValence(kind: string): number {
  if (/attack|harm|hurt|betray|accuse|threaten|hazard|blocked/.test(kind)) return -0.6;
  if (/help|comfort|heal|protect|save|escort|assist|praise|share/.test(kind)) return 0.5;
  if (/warn|alert/.test(kind)) return -0.2;
  return 0;
}

function inferUrgency(kind: string, magnitude: number): number {
  if (/attack|hazard|threat|blocked|hurt/.test(kind)) return clamp(0.5 + magnitude * 0.5, 0, 1);
  if (/warn|alert|escape|flee/.test(kind)) return clamp(0.4 + magnitude * 0.3, 0, 1);
  return clamp(magnitude * 0.3, 0, 1);
}

function inferTags(kind: string): string[] {
  const tags: string[] = [kind];
  if (/attack|harm|hurt|betray|threaten/.test(kind)) tags.push('danger', 'conflict');
  if (/help|comfort|heal|protect|escort|assist/.test(kind)) tags.push('care', 'support');
  if (/talk|inform|ask|negotiate|propose/.test(kind)) tags.push('communication');
  if (/move|escape|flee|approach/.test(kind)) tags.push('movement');
  if (/hazard|radiation/.test(kind)) tags.push('environmental');
  if (/observe|inspect|investigate/.test(kind)) tags.push('epistemic');
  return [...new Set(tags)];
}

/**
 * Normalize a batch of raw SimKit events into enriched DomainEvents.
 */
export function normalizeSimEvents(rawEvents: any[], fallbackTick: number): DomainEventV1[] {
  return (Array.isArray(rawEvents) ? rawEvents : [])
    .map((ev, idx): DomainEventV1 | null => {
      if (!ev) return null;

      const kind = String(
        ev.kind ?? ev.actionId ?? ev.type ?? ev.payload?.type ?? 'unknown',
      ).toLowerCase();

      const tick = Number(
        ev.tick ?? ev.t ?? ev.meta?.payload?.tick ?? ev.payload?.tick ?? fallbackTick,
      );

      const magnitude = clamp(
        Number(ev.magnitude ?? ev.intensity ?? ev.urgency ?? ev.payload?.level ?? 0.5),
        0, 1,
      );

      const actorId = ev.actorId != null
        ? String(ev.actorId)
        : (ev.payload?.actorId != null ? String(ev.payload.actorId) : 'unknown');
      const targetId = ev?.targetId != null ? String(ev.targetId) : undefined;
      const locationId = ev?.locationId ?? ev?.context?.locationId ?? ev?.payload?.locationId;

      const id = String(
        ev.id ?? `${kind}:${actorId}:${targetId ?? 'none'}:${tick}:${idx}`,
      );

      return ({
        id,
        tick: Number.isFinite(tick) ? tick : fallbackTick,
        kind,
        actorId,
        ...(targetId ? { targetId } : {}),
        ...(locationId != null ? { locationId: String(locationId) } : {}),
        ...(ev?.fromLocationId != null ? { fromLocationId: String(ev.fromLocationId) } : {}),
        ...(ev?.toLocationId != null ? { toLocationId: String(ev.toLocationId) } : {}),
        magnitude,
        urgency: inferUrgency(kind, magnitude),
        valence: inferValence(kind),
        topic: ev?.topic ? String(ev.topic) : undefined,
        tags: inferTags(kind),
        causedBy: Array.isArray(ev?.causedBy) ? ev.causedBy.map(String) : [],
        consequences: Array.isArray(ev?.consequences) ? ev.consequences.map(String) : [],
        rawKind: kind,
      });
    })
    .filter((e): e is DomainEventV1 => e !== null);
}
