
// components/goal-lab/EventsPanel.tsx
import React, { useMemo, useState } from 'react';
import { arr } from '../../lib/utils/arr';

type EventKind =
  | 'helped' | 'saved' | 'hurt' | 'attacked' | 'betrayed' | 'lied'
  | 'kept_oath' | 'broke_oath' | 'obeyed_order' | 'disobeyed_order'
  | 'shared_secret' | 'public_shame';

type WorldEvent = {
  id: string;
  tick: number;
  kind: EventKind;
  actorId: string;
  targetId?: string;
  magnitude?: number;
  context?: { locationId?: string; sceneId?: string; protocolId?: string };
  meta?: Record<string, any>;
};

type Props = {
  nowTick: number;
  selfId: string;
  eventsWorld?: WorldEvent[];
  eventsInjected?: WorldEvent[];
  onInject?: (ev: Omit<WorldEvent, 'id'>) => void;
  onClearInjected?: () => void;
  className?: string;
};

const KINDS: EventKind[] = [
  'helped','saved','hurt','attacked','betrayed','lied',
  'kept_oath','broke_oath','obeyed_order','disobeyed_order',
  'shared_secret','public_shame'
];

function pct(x?: number) {
  const v = typeof x === 'number' && Number.isFinite(x) ? x : 0;
  return `${Math.round(v * 100)}%`;
}

export const EventsPanel: React.FC<Props> = ({
  nowTick, selfId, eventsWorld, eventsInjected, onInject, onClearInjected, className
}) => {
  const [kind, setKind] = useState<EventKind>('betrayed');
  const [actorId, setActorId] = useState<string>(selfId);
  const [targetId, setTargetId] = useState<string>('');
  const [magnitude, setMagnitude] = useState<number>(0.8);
  const [q, setQ] = useState('');

  const combined = useMemo(() => {
    const all = [...arr(eventsWorld), ...arr(eventsInjected)]
      // Sort newest first
      .sort((a, b) => (b.tick - a.tick));
    const s = q.trim().toLowerCase();
    const next = all.filter(ev => !s ? true : (
      `${ev.kind} ${ev.actorId} ${ev.targetId || ''} ${ev.id}`.toLowerCase().includes(s)
    ));
    if (!Array.isArray(next)) {
      console.error('Expected array, got', next);
      return [];
    }
    return next;
  }, [eventsWorld, eventsInjected, q]);

  return (
    <div className={className ?? 'h-full min-h-0 flex flex-col bg-canon-bg text-canon-text'}>
      <div className="p-3 border-b border-canon-border bg-canon-bg-light/30">
        <div className="text-sm font-semibold">EventLog</div>
        <div className="text-xs text-canon-text-light mt-1">
          Evidence layer. Inject events to test relations → ToM → threat.
        </div>

        <div className="mt-3 p-2 bg-canon-bg/50 rounded border border-canon-border/30">
            <div className="text-[10px] font-bold text-canon-accent uppercase mb-2">Inject Event</div>
            <div className="grid grid-cols-2 gap-2 mb-2">
                <select
                    value={kind}
                    onChange={e => setKind(e.target.value as any)}
                    className="px-2 py-1.5 rounded bg-canon-bg border border-canon-border text-xs focus:outline-none focus:border-canon-accent"
                >
                    {KINDS.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
                <input
                    value={magnitude}
                    onChange={e => setMagnitude(Math.max(0, Math.min(1, Number(e.target.value))))}
                    className="px-2 py-1.5 rounded bg-canon-bg border border-canon-border text-xs font-mono focus:outline-none focus:border-canon-accent"
                    placeholder="magnitude 0..1"
                    type="number" step="0.1"
                />
            </div>
            <div className="grid grid-cols-2 gap-2 mb-2">
                <input
                    value={actorId}
                    onChange={e => setActorId(e.target.value)}
                    className="px-2 py-1.5 rounded bg-canon-bg border border-canon-border text-xs font-mono focus:outline-none focus:border-canon-accent"
                    placeholder="actorId"
                />
                <input
                    value={targetId}
                    onChange={e => setTargetId(e.target.value)}
                    className="px-2 py-1.5 rounded bg-canon-bg border border-canon-border text-xs font-mono focus:outline-none focus:border-canon-accent"
                    placeholder="targetId (optional)"
                />
            </div>
            
            <div className="flex gap-2">
                <button
                    className="flex-1 px-3 py-1.5 rounded bg-canon-blue text-canon-bg font-bold text-xs hover:bg-opacity-90 transition-colors"
                    onClick={() => {
                    if (!onInject) return;
                    onInject({
                        tick: nowTick,
                        kind,
                        actorId: actorId.trim(),
                        targetId: targetId.trim() || undefined,
                        magnitude
                    });
                    }}
                >
                    Inject @ T{nowTick}
                </button>
                <button
                    className="px-3 py-1.5 rounded bg-canon-bg border border-canon-border text-xs text-red-400 hover:border-red-500 transition-colors"
                    onClick={() => onClearInjected?.()}
                >
                    Clear
                </button>
            </div>
        </div>

        <div className="mt-2">
            <input
                value={q}
                onChange={e => setQ(e.target.value)}
                className="w-full px-2 py-1.5 rounded bg-canon-bg border border-canon-border text-xs font-mono focus:outline-none focus:border-canon-accent"
                placeholder="search events..."
            />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
        {arr(combined).map(ev => {
          const injected = arr(eventsInjected).some(x => x.id === ev.id);
          return (
            <div key={ev.id} className={`p-3 border-b border-canon-border/50 ${injected ? 'bg-orange-900/10' : 'hover:bg-canon-bg-light/20'} transition-colors`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`px-1.5 py-0.5 text-[9px] uppercase font-bold rounded border ${injected ? 'bg-orange-500/20 border-orange-500/40 text-orange-300' : 'bg-canon-bg border-canon-border/50 text-canon-text-light'}`}>
                  {injected ? 'injected' : 'world'}
                </span>
                <span className="text-[10px] text-canon-text-light font-mono">T:{ev.tick}</span>
                <span className="text-[10px] font-mono text-canon-text-light/50 truncate ml-auto">{ev.id}</span>
              </div>
              <div className="text-xs">
                <span className="font-bold text-canon-text">{ev.kind}</span>
                <span className="text-canon-text-light mx-1">·</span>
                <span className="font-mono text-canon-accent">{ev.actorId}</span>
                {ev.targetId && (
                    <>
                        <span className="text-canon-text-light mx-1">➜</span>
                        <span className="font-mono text-canon-text">{ev.targetId}</span>
                    </>
                )}
                <span className="float-right font-mono text-canon-blue font-bold">{pct(ev.magnitude)}</span>
              </div>
            </div>
          );
        })}
        {combined.length === 0 && (
             <div className="p-8 text-center text-xs text-canon-text-light italic">No events recorded.</div>
        )}
      </div>
    </div>
  );
};
