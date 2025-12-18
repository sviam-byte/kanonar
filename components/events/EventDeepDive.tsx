
import React, { useState } from 'react';
import { UnifiedEventView } from '../../lib/events/unifiedEvents';
import { Link } from 'react-router-dom';

interface Props {
    event: UnifiedEventView;
}

const Section: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className }) => (
    <div className={`mb-6 border border-canon-border/50 rounded-lg overflow-hidden bg-canon-bg/20 ${className}`}>
        <div className="bg-canon-bg border-b border-canon-border/30 px-3 py-1.5">
            <h4 className="text-[10px] font-bold text-canon-text-light uppercase tracking-wider">{title}</h4>
        </div>
        <div className="p-3">
            {children}
        </div>
    </div>
);

const JsonBlock: React.FC<{ data: any }> = ({ data }) => {
    const [open, setOpen] = useState(false);
    if (!data || Object.keys(data).length === 0) return null;
    return (
        <div className="mt-2">
            <button onClick={() => setOpen(!open)} className="text-[10px] text-canon-accent hover:underline">
                {open ? '▼ Hide JSON' : '▶ Show JSON'}
            </button>
            {open && (
                <pre className="text-[9px] font-mono bg-black/40 p-2 rounded mt-1 overflow-x-auto text-green-400">
                    {JSON.stringify(data, null, 2)}
                </pre>
            )}
        </div>
    )
}

const DeltaPill: React.FC<{ label: string, value: any, isPositiveGood?: boolean }> = ({ label, value, isPositiveGood = true }) => {
    const num = Number(value);
    if (isNaN(num)) return <span className="text-xs bg-canon-border/30 px-2 py-1 rounded text-canon-text">{label}: {String(value)}</span>;
    
    let color = 'text-canon-text';
    if (num > 0) color = isPositiveGood ? 'text-green-400' : 'text-red-400';
    if (num < 0) color = isPositiveGood ? 'text-red-400' : 'text-green-400';
    
    return (
        <div className="flex justify-between items-center bg-canon-bg border border-canon-border/30 px-2 py-1 rounded text-xs">
            <span className="text-canon-text-light mr-2">{label}</span>
            <span className={`font-mono font-bold ${color}`}>{num > 0 ? '+' : ''}{num.toFixed(2)}</span>
        </div>
    )
}

export const EventDeepDive: React.FC<Props> = ({ event }) => {
    return (
        <div className="h-full flex flex-col bg-canon-bg-light border-l border-canon-border overflow-y-auto custom-scrollbar p-6 pb-24">
            {/* Header */}
            <div className="mb-6 pb-4 border-b border-canon-border">
                <div className="flex justify-between items-start mb-2">
                    <h2 className="text-2xl font-bold text-canon-text leading-tight">{event.label}</h2>
                    <span className="font-mono text-xl text-canon-accent font-bold">T:{event.t}</span>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-mono text-canon-text-light mb-4">
                     <span className="bg-canon-bg px-2 py-0.5 rounded border border-canon-border">{event.id}</span>
                     <span className="bg-canon-bg px-2 py-0.5 rounded border border-canon-border uppercase">{event.kind}</span>
                     <span className="bg-canon-bg px-2 py-0.5 rounded border border-canon-border uppercase">{event.domain}</span>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <div className="text-[10px] text-canon-text-light uppercase">Actor</div>
                        <Link to={`/character/${event.actorId}`} className="font-bold text-canon-text hover:text-canon-accent hover:underline">
                            {event.actorName || event.actorId || '—'}
                        </Link>
                    </div>
                    <div>
                         <div className="text-[10px] text-canon-text-light uppercase">Target</div>
                         <Link to={`/character/${event.targetId}`} className="font-bold text-canon-text hover:text-canon-accent hover:underline">
                            {event.targetName || event.targetId || '—'}
                        </Link>
                    </div>
                </div>
            </div>

            {/* Check / Resolution */}
            {event.check && (
                <div className={`mb-6 p-3 rounded border-l-4 ${event.check.success ? 'border-green-500 bg-green-900/10' : 'border-red-500 bg-red-900/10'}`}>
                    <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-sm uppercase">{event.check.type} Check</span>
                        <span className={`font-mono font-bold ${event.check.success ? 'text-green-400' : 'text-red-400'}`}>
                            {event.check.success ? 'SUCCESS' : 'FAILURE'}
                        </span>
                    </div>
                    <div className="flex gap-4 text-xs font-mono text-canon-text-light">
                        <span>Diff: {event.check.difficulty}</span>
                        <span>Roll: {event.check.roll?.toFixed(2) ?? '-'}</span>
                    </div>
                </div>
            )}

            {/* Causality */}
            {(event.causedBy || event.causes) && (
                <Section title="Причинность (Causality)">
                    {event.causedBy && event.causedBy.length > 0 && (
                        <div className="mb-2">
                             <span className="text-[10px] text-canon-text-light block mb-1">Вызвано:</span>
                             <div className="flex flex-wrap gap-1">
                                 {event.causedBy.map(id => (
                                     <span key={id} className="text-xs bg-canon-bg border border-canon-border px-1.5 py-0.5 rounded font-mono truncate max-w-full">{id}</span>
                                 ))}
                             </div>
                        </div>
                    )}
                     {event.causes && event.causes.length > 0 && (
                        <div>
                             <span className="text-[10px] text-canon-text-light block mb-1">Вызвало:</span>
                             <div className="flex flex-wrap gap-1">
                                 {event.causes.map(id => (
                                     <span key={id} className="text-xs bg-canon-bg border border-canon-border px-1.5 py-0.5 rounded font-mono truncate max-w-full">{id}</span>
                                 ))}
                             </div>
                        </div>
                    )}
                </Section>
            )}

            {/* Effects Matrix */}
            {event.effects && (
                <Section title="Матрица Эффектов (Effects Delta)">
                    <div className="space-y-4">
                        {event.effects.stateDelta && Object.keys(event.effects.stateDelta).length > 0 && (
                            <div>
                                <div className="text-[10px] text-canon-text-light mb-1">State</div>
                                <div className="grid grid-cols-2 gap-2">
                                    {Object.entries(event.effects.stateDelta).map(([k, v]) => <DeltaPill key={k} label={k} value={v} isPositiveGood={false} />)}
                                </div>
                            </div>
                        )}
                        {event.effects.worldDelta && Object.keys(event.effects.worldDelta).length > 0 && (
                             <div>
                                <div className="text-[10px] text-canon-text-light mb-1">World</div>
                                <div className="grid grid-cols-2 gap-2">
                                    {Object.entries(event.effects.worldDelta).map(([k, v]) => <DeltaPill key={k} label={k} value={v} />)}
                                </div>
                            </div>
                        )}
                        {event.effects.tensionDelta !== 0 && event.effects.tensionDelta !== undefined && (
                             <DeltaPill label="Tension" value={event.effects.tensionDelta} isPositiveGood={false} />
                        )}
                        
                        <JsonBlock data={event.effects} />
                    </div>
                </Section>
            )}

            {/* Epistemics */}
            {event.epistemics && (
                <Section title="Эпистемика (Witnesses)">
                     <div className="flex justify-between items-center mb-2">
                         <span className="text-xs text-canon-text-light">Visibility:</span>
                         <span className="font-mono text-xs">{event.epistemics.visibility?.toFixed(2)}</span>
                     </div>
                     <div className="flex flex-wrap gap-1">
                         {/* Check both legacy 'observers' and new 'witnesses' due to unified type */}
                         {(event.epistemics.witnesses || event.epistemics.observers?.map((o: any) => o.actorId) || []).map((id: string) => (
                             <span key={id} className="px-2 py-1 bg-blue-900/20 text-blue-300 border border-blue-500/30 rounded text-[10px]">
                                 {id}
                             </span>
                         ))}
                     </div>
                     {event.epistemics.beliefByAgent && (
                         <div className="mt-2 pt-2 border-t border-canon-border/20">
                             <div className="text-[10px] text-canon-text-light mb-1">Beliefs</div>
                             {Object.entries(event.epistemics.beliefByAgent).map(([aid, bel]: [string, any]) => (
                                 <div key={aid} className="flex justify-between text-xs font-mono text-canon-text-light">
                                     <span className="truncate w-1/2">{aid}</span>
                                     <span className={bel.confidence > 0.8 ? 'text-green-400' : 'text-yellow-500'}>
                                         Conf: {bel.confidence?.toFixed(2)}
                                     </span>
                                 </div>
                             ))}
                         </div>
                     )}
                </Section>
            )}
            
            {/* Meta / Raw */}
            <Section title="Meta / Context">
                <div className="text-xs space-y-1">
                    {event.locationId && <div className="flex justify-between"><span>Location:</span> <span className="font-mono text-canon-accent">{event.locationId}</span></div>}
                    <div className="flex justify-between"><span>Tags:</span> <span className="font-mono">{event.tags.join(', ')}</span></div>
                </div>
                 <JsonBlock data={event.raw} />
            </Section>

        </div>
    );
}
