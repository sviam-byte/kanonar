import React, { useEffect, useMemo, useRef } from "react";
import type { WorldState, DomainEvent } from "../../types";

interface Props {
  worldHistory: WorldState[];
  currentTick: number;
  playing: boolean;
}

function formatEventLine(ev: DomainEvent) {
  const actor = ev.actorId || "unknown";
  const target = ev.targetId ? ` → ${ev.targetId}` : "";
  const label = ev.meta?.label ? ` (${String(ev.meta.label)})` : "";
  return `${actor}: ${ev.actionId}${target}${label}`;
}

export const NarrativeLog: React.FC<Props> = ({ worldHistory, currentTick, playing }) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const grouped = useMemo(() => {
    const events: DomainEvent[] = [];
    for (const world of worldHistory) {
      const evs = world?.eventLog?.events || [];
      for (const ev of evs) {
        if (ev?.domain === "action" && Number(ev.t) <= currentTick) {
          events.push(ev);
        }
      }
    }
    events.sort((a, b) => Number(a.t) - Number(b.t));

    const out = new Map<number, DomainEvent[]>();
    for (const ev of events) {
      const t = Number(ev.t);
      const list = out.get(t) || [];
      list.push(ev);
      out.set(t, list);
    }
    return out;
  }, [worldHistory, currentTick]);

  useEffect(() => {
    if (!playing) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [playing, currentTick, grouped.size]);

  const ticks = Array.from(grouped.keys()).sort((a, b) => a - b);

  return (
    <div className="h-full w-full rounded-xl border border-canon-border bg-canon-bg-light/30 p-3 text-canon-text shadow-inner overflow-hidden flex flex-col">
      <div className="text-xs text-canon-text-light mb-2">Narrative Log (actions)</div>
      <div ref={scrollRef} className="flex-1 overflow-auto font-mono text-xs whitespace-pre-wrap custom-scrollbar">
        {ticks.length ? (
          ticks.map((t) => {
            const evs = grouped.get(t) || [];
            return (
              <div key={t} className="mb-2">
                <div className="text-[10px] uppercase text-canon-text-light">tick {t}</div>
                {evs.map((ev) => (
                  <div key={ev.id}>• {formatEventLine(ev)}</div>
                ))}
              </div>
            );
          })
        ) : (
          <div className="text-[10px] text-canon-text-light italic">(no actions yet)</div>
        )}
      </div>
    </div>
  );
};
