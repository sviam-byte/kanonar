export interface DomainEventV1 {
  id: string;
  tick: number;
  kind: string;
  actorId: string;
  targetId?: string;
  locationId?: string;
  tags: string[];
  payload: Record<string, unknown>;
}

/** Normalizes heterogeneous SimKit event payloads into a stable event shape. */
export function normalizeSimEvents(rawEvents: any[], fallbackTick: number): DomainEventV1[] {
  return (Array.isArray(rawEvents) ? rawEvents : [])
    .map((ev, idx) => {
      const id = String(ev?.id ?? `sim:event:${fallbackTick}:${idx}`);
      const tick = Number(ev?.tick ?? ev?.t ?? fallbackTick);
      const kind = String(ev?.kind ?? ev?.type ?? 'unknown');
      const actorId = String(ev?.actorId ?? ev?.sourceId ?? 'unknown');
      const targetId = ev?.targetId != null ? String(ev.targetId) : undefined;
      const locationId = ev?.locationId != null
        ? String(ev.locationId)
        : ev?.context?.locationId != null
          ? String(ev.context.locationId)
          : undefined;
      const tags = Array.isArray(ev?.tags) ? ev.tags.map(String) : [];

      return {
        id,
        tick: Number.isFinite(tick) ? tick : fallbackTick,
        kind,
        actorId,
        ...(targetId ? { targetId } : {}),
        ...(locationId ? { locationId } : {}),
        tags,
        payload: typeof ev === 'object' && ev ? ev : { value: ev },
      };
    });
}
