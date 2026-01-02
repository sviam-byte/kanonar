
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { UnifiedEventView, UnifiedEventKind } from '../../lib/events/unifiedEvents';
import { listify } from "../../lib/utils/listify";
import { useAccess } from '../../contexts/AccessContext';
import { RedactedBlock } from '../EntitySecurityGate';

interface EventsPanelProps {
  events: UnifiedEventView[];
}

const KindBadge: React.FC<{ kind: UnifiedEventKind }> = ({ kind }) => {
    const styles = {
        social: 'bg-blue-900/40 text-blue-300 border-blue-500/30',
        personal: 'bg-purple-900/40 text-purple-300 border-purple-500/30',
        domain: 'bg-yellow-900/40 text-yellow-300 border-yellow-500/30',
    };
    
    const labels = {
        social: 'SOC',
        personal: 'PERS',
        domain: 'WORLD'
    };

    return (
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${styles[kind]} uppercase tracking-wider`}>
            {labels[kind]}
        </span>
    );
};

const DetailSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="mb-6 last:mb-0">
    <h4 className="text-xs font-bold text-canon-accent uppercase tracking-wider mb-2 border-b border-canon-border/30 pb-1">{title}</h4>
    <div className="text-xs text-canon-text space-y-2">{children}</div>
  </div>
);

const EffectRow: React.FC<{ label: string; value: any; highlight?: boolean }> = ({ label, value, highlight }) => (
    <div className="flex justify-between items-center bg-black/20 px-2 py-1 rounded hover:bg-black/30 transition-colors">
        <span className="text-canon-text-light">{label}</span>
        <span className={`font-mono ${highlight ? 'text-green-400 font-bold' : 'text-canon-text'}`}>
            {String(value)}
        </span>
    </div>
);

const EntityLink: React.FC<{ id?: string; name?: string; className?: string }> = ({ id, name, className }) => {
    if (!id) return <span className={className}>—</span>;
    const isChar = id.startsWith('character') || id.startsWith('session');
    const isLoc = id.startsWith('ka_') || id.startsWith('loc');
    const path = isLoc ? `/location/${id}` : `/character/${id}`;
    
    return (
        <Link to={path} className={`${className} hover:underline hover:text-canon-accent transition-colors`}>
            {name || id}
        </Link>
    );
};

export const EventsPanel: React.FC<EventsPanelProps> = ({ events }) => {
  const [kindFilter, setKindFilter] = useState<'all' | UnifiedEventKind>('all');
  const [search, setSearch] = useState('');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const { activeModule, clearanceLevel } = useAccess();

  const filtered = useMemo(() => {
    // If no events, return empty
    if (!events) return [];
    
    // We assume events are passed already sorted or we sort them here
    return events.filter(ev => {
      // 1. Visibility Filter: Required Key (Strict Hiding)
      if (ev.security?.requiredKey) {
          if (!activeModule) return false;
          const key = ev.security.requiredKey;
          const hasKey = activeModule.id === key || activeModule.codes.includes(key);
          if (!hasKey) return false;
      }

      // 2. Visibility Filter: Module Only (Strict Hiding)
      if (ev.tags.includes('module_only') && !activeModule) {
          return false;
      }

      if (kindFilter !== 'all' && ev.kind !== kindFilter) return false;

      if (search.trim().length > 0) {
        const s = search.toLowerCase();
        const haystack = [
          ev.label,
          ev.domain,
          ev.actorName,
          ev.targetName,
          ev.tags.join(' '),
        ].filter(Boolean).join(' ').toLowerCase();
        
        if (!haystack.includes(s)) return false;
      }
      return true;
    });
  }, [events, kindFilter, search, activeModule]);

  const selected = filtered.find(ev => ev.id === selectedEventId) || filtered[0] || null;

  // Check redaction for selected item
  const isRedacted = selected && selected.security?.requiredLevel !== undefined && clearanceLevel < selected.security.requiredLevel;

  return (
    <div className="flex h-full bg-canon-bg-light border border-canon-border rounded-lg overflow-hidden shadow-xl">
      {/* LEFT: List & Filters */}
      <div className="w-1/3 flex flex-col border-r border-canon-border bg-canon-bg/50">
        {/* Toolbar */}
        <div className="p-3 border-b border-canon-border bg-canon-bg space-y-2">
             <div className="flex gap-1">
                {(['all', 'social', 'personal', 'domain'] as const).map(k => (
                    <button
                        key={k}
                        onClick={() => setKindFilter(k)}
                        className={`flex-1 py-1 text-[10px] uppercase font-bold rounded border transition-colors ${
                            kindFilter === k 
                            ? 'bg-canon-accent text-canon-bg border-canon-accent' 
                            : 'bg-transparent text-canon-text-light border-canon-border hover:border-canon-text-light'
                        }`}
                    >
                        {k}
                    </button>
                ))}
            </div>
            <input
                className="w-full bg-black/30 border border-canon-border rounded px-2 py-1 text-xs text-canon-text focus:border-canon-accent outline-none placeholder:text-canon-text-light/30"
                placeholder="Фильтр по названию, актору, тегу..."
                value={search}
                onChange={e => setSearch(e.target.value)}
            />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-1 space-y-1">
            {filtered.length === 0 && (
                <div className="text-center py-8 text-xs text-canon-text-light italic">Событий не найдено.</div>
            )}
            {filtered.map(ev => {
                const isSelected = selected?.id === ev.id;
                const itemRedacted = ev.security?.requiredLevel !== undefined && clearanceLevel < ev.security.requiredLevel;

                return (
                    <div
                        key={ev.id}
                        onClick={() => setSelectedEventId(ev.id)}
                        className={`
                            p-3 rounded cursor-pointer border transition-all duration-200 group relative
                            ${isSelected 
                                ? 'bg-canon-accent/10 border-canon-accent/50 shadow-[inset_2px_0_0_0_#00aaff]' 
                                : 'bg-transparent border-transparent hover:bg-white/5 hover:border-white/10'
                            }
                        `}
                    >
                        <div className="flex justify-between items-center mb-1">
                             <div className="flex items-center gap-2">
                                <span className="text-[10px] font-mono text-canon-text-light opacity-50">{ev.t}</span>
                                <KindBadge kind={ev.kind} />
                             </div>
                             {itemRedacted && (
                                 <span className="text-[8px] font-mono text-red-500 border border-red-500/50 px-1 rounded">L{ev.security?.requiredLevel}</span>
                             )}
                             {!itemRedacted && ev.intensity !== undefined && (
                                 <div className="flex gap-0.5">
                                     {[...Array(Math.ceil(ev.intensity * 3))].map((_, i) => (
                                         <div key={i} className="w-1 h-2 bg-canon-text-light/40 rounded-sm" />
                                     ))}
                                 </div>
                             )}
                        </div>
                        
                        <div className={`font-bold text-sm truncate mb-1 group-hover:text-white transition-colors ${itemRedacted ? 'text-canon-text-light/30 font-mono' : 'text-canon-text'}`}>
                            {itemRedacted ? '██████████' : ev.label}
                        </div>
                        
                        {!itemRedacted && (
                            <div className="flex justify-between items-end">
                                 <div className="text-xs text-canon-text-light">
                                     <span className="text-canon-accent">{ev.actorName}</span>
                                     {ev.targetName && <span className="opacity-70"> ➝ {ev.targetName}</span>}
                                 </div>
                                 <div className="text-[10px] uppercase tracking-wider opacity-50 font-bold">{ev.domain}</div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
      </div>

      {/* RIGHT: Details */}
      <div className="flex-1 flex flex-col bg-canon-bg-light relative h-full overflow-hidden">
          {selected ? (
              isRedacted ? (
                  <div className="flex-1 p-8 flex items-center justify-center">
                      <div className="max-w-sm w-full aspect-square">
                          <RedactedBlock level={selected.security?.requiredLevel || 0} label={selected.id} />
                      </div>
                  </div>
              ) : (
              <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                  <div className="flex justify-between items-start mb-6 border-b border-canon-border pb-4">
                      <div>
                          <div className="flex items-center gap-3 mb-2">
                              <h2 className="text-2xl font-bold text-canon-text">{selected.label}</h2>
                              <KindBadge kind={selected.kind} />
                              <span className="px-2 py-0.5 bg-canon-bg border border-canon-border rounded text-xs font-mono text-canon-text-light">Tick: {selected.t}</span>
                          </div>
                          <div className="text-sm text-canon-text-light flex gap-2 items-center">
                              <EntityLink id={selected.actorId} name={selected.actorName} className="font-bold text-canon-text" />
                              <span className="text-xs">➜</span>
                              <EntityLink id={selected.targetId} name={selected.targetName} className="font-bold text-canon-text" />
                              <span className="mx-2 text-canon-border">|</span>
                              <span className="italic opacity-70">{selected.domain}</span>
                          </div>
                      </div>
                      {selected.valence !== undefined && (
                          <div className={`text-2xl font-bold ${selected.valence > 0 ? 'text-green-500' : selected.valence < 0 ? 'text-red-500' : 'text-gray-500'}`}>
                              {selected.valence > 0 ? '+' : ''}{selected.valence}
                          </div>
                      )}
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                      <div className="space-y-6">
                          <DetailSection title="Контекст">
                              <div className="space-y-2">
                                  {selected.tags.length > 0 && (
                                      <div className="flex flex-wrap gap-1">
                                          {selected.tags.map(tag => (
                                              <span key={tag} className="px-1.5 py-0.5 bg-canon-bg border border-canon-border rounded text-[10px] text-canon-text-light">#{tag}</span>
                                          ))}
                                      </div>
                                  )}
                                  <EffectRow label="Intensity" value={selected.intensity?.toFixed(2)} />
                              </div>
                          </DetailSection>
                          
                          {selected.participants && (
                              <DetailSection title="Участники">
                                  {listify(selected.participants?.participants, "selected.participants.participants").map((p: any, i: number) => (
                                      <div key={i} className="flex justify-between text-xs py-1 border-b border-canon-border/20 last:border-0">
                                          <EntityLink id={p.actorId} className="text-canon-text font-medium" />
                                          <span className="text-canon-text-light italic">{p.role}</span>
                                      </div>
                                  ))}
                              </DetailSection>
                          )}

                          {selected.epistemics && (
                              <DetailSection title="Эпистемика (Кто знает?)">
                                  <div className="flex justify-between text-[10px] uppercase font-bold text-canon-text-light mb-1">
                                      <span>Observer</span>
                                      <span>Channel</span>
                                  </div>
                                  {listify(selected.epistemics?.observers, "event.epistemics.observers").map((obs: any, i: number) => (
                                      <div key={i} className="flex justify-between py-1 border-b border-canon-border/20 last:border-0">
                                          <EntityLink id={obs.actorId} className="text-canon-text" />
                                          <span className="opacity-70">{obs.channel}</span>
                                      </div>
                                  ))}
                              </DetailSection>
                          )}
                      </div>

                      <div className="space-y-6">
                          {selected.effects && (
                              <DetailSection title="Эффекты (Delta)">
                                  {/* Body */}
                                  {selected.effects.body?.delta_reserves && Object.entries(selected.effects.body.delta_reserves).map(([k, v]) => (
                                      <EffectRow key={k} label={`Body: ${k}`} value={Number(v) > 0 ? `+${v}` : v} highlight />
                                  ))}
                                  
                                  {/* Vectors */}
                                  {selected.effects.vector_base && Object.entries(selected.effects.vector_base).map(([k, v]) => (
                                      <EffectRow key={k} label={`Vector: ${k.split('.').pop()}`} value={Number(v) > 0 ? `+${v}` : v} highlight />
                                  ))}
                                  
                                  {/* Relations */}
                                  {selected.effects.relations?.delta_trust && Object.entries(selected.effects.relations.delta_trust).map(([k, v]) => (
                                      <EffectRow key={k} label={`Trust: ${k}`} value={Number(v) > 0 ? `+${v}` : v} highlight />
                                  ))}
                                  
                                  {/* Norms */}
                                  {selected.effects.norms?.entries.map((n, i) => (
                                      <div key={i} className="text-xs bg-red-900/20 border border-red-500/30 p-2 rounded text-red-300">
                                          <span className="font-bold uppercase">{n.effect}</span> {n.norm.norm_id} (Sev: {n.severity})
                                      </div>
                                  ))}

                                  {!selected.effects.body && !selected.effects.vector_base && !selected.effects.relations && !selected.effects.norms?.entries.length && (
                                      <div className="italic text-canon-text-light opacity-50">Нет прямых механических эффектов.</div>
                                  )}
                              </DetailSection>
                          )}
                          
                          {selected.goalEffects && selected.goalEffects.goal_weights_delta && (
                               <DetailSection title="Влияние на Цели">
                                   {Object.entries(selected.goalEffects.goal_weights_delta).map(([g, v]) => (
                                       <EffectRow key={g} label={g} value={Number(v) > 0 ? `+${Number(v).toFixed(2)}` : Number(v).toFixed(2)} highlight={Number(v) > 0} />
                                   ))}
                               </DetailSection>
                          )}
                      </div>
                  </div>
                  
                  <div className="mt-8 pt-4 border-t border-canon-border opacity-50 hover:opacity-100 transition-opacity">
                       <div className="text-[10px] font-bold text-canon-text-light uppercase mb-2">Raw Data Preview</div>
                       <pre className="text-[9px] font-mono text-canon-text-light bg-black/30 p-2 rounded overflow-x-auto">
                           {JSON.stringify(selected.raw, (k,v) => k === 'effects' || k === 'raw' ? undefined : v, 2)}
                       </pre>
                  </div>
              </div>
              )
          ) : (
              <div className="flex items-center justify-center h-full text-canon-text-light italic opacity-50">
                  Выберите событие из списка для просмотра деталей.
              </div>
          )}
      </div>
    </div>
  );
};
