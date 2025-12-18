
import React, { useState, useMemo } from 'react';
import { LocationEntity, LocationConnection, AffectProfile, ToMModifier, PhysicsProfile, OwnershipBlock } from '../../types';
import { Link } from 'react-router-dom';
import { LocationNetworkView } from './LocationNetworkView';
import { LocationVectorMap } from './LocationVectorMap';
import { LocationContextDebug } from './LocationContextDebug';
import { useSandbox } from '../../contexts/SandboxContext';

interface LocationProfileProps {
    location: LocationEntity;
}

// ... existing helper components (PropertyBar, StateBadge, ConnectionCard, PhysicsBlock, AffectBlock, OwnershipBlockView) ...
const PropertyBar: React.FC<{ label: string; value: number; color?: string; tooltip?: string }> = ({ label, value, color = 'bg-canon-blue', tooltip }) => (
    <div className="mb-2" title={tooltip}>
        <div className="flex justify-between text-xs text-canon-text-light mb-1">
            <span>{label}</span>
            <span className="font-mono text-canon-text">{(value * 100).toFixed(0)}%</span>
        </div>
        <div className="h-1.5 w-full bg-canon-bg rounded-full overflow-hidden border border-canon-border/30">
            <div className={`h-full ${color}`} style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}></div>
        </div>
    </div>
);

const StateBadge: React.FC<{ label: string; active: boolean; colorOn: string; colorOff: string }> = ({ label, active, colorOn, colorOff }) => (
    <div className={`px-3 py-1.5 rounded border text-xs font-bold text-center ${active ? colorOn : colorOff}`}>
        {label}: {active ? 'YES' : 'NO'}
    </div>
);

const ConnectionCard: React.FC<{ targetId: string; conn: LocationConnection }> = ({ targetId, conn }) => (
    <Link to={`/location/${targetId}`} className="block bg-canon-bg border border-canon-border/50 rounded p-2 hover:border-canon-accent hover:bg-canon-bg-light/50 transition-all group">
        <div className="flex justify-between items-center mb-1">
            <span className="text-xs font-bold text-canon-text truncate group-hover:text-canon-accent">{targetId}</span>
            <span className="text-[10px] text-canon-text-light font-mono">Dist: {conn.distance}</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-canon-text-light">
            <span>Diff: {conn.difficulty.toFixed(1)}</span>
            <div className="flex-1 h-1 bg-canon-bg-light rounded-full overflow-hidden">
                 <div className="h-full bg-canon-text-light/30" style={{width: `${(1/Math.max(0.1, conn.difficulty))*100}%`}}></div>
            </div>
        </div>
    </Link>
);

const PhysicsBlock: React.FC<{ physics?: PhysicsProfile }> = ({ physics }) => {
    if (!physics) return <div className="text-xs text-canon-text-light italic">Физика не определена</div>;
    return (
        <div className="space-y-2 text-xs">
            <PropertyBar label="Стресс среды" value={physics.environmentalStress} color="bg-orange-500" />
            <PropertyBar label="Риск столкновений" value={physics.collisionRisk} color="bg-red-400" />
            <div className="grid grid-cols-2 gap-2 mt-2">
                 <div className="bg-canon-bg p-1.5 rounded border border-canon-border/20 text-center">
                     <span className="text-canon-text-light text-[10px] block">Мобильность</span>
                     <span className="font-mono font-bold">{physics.mobilityCost.toFixed(1)}x</span>
                 </div>
                 <div className="bg-canon-bg p-1.5 rounded border border-canon-border/20 text-center">
                     <span className="text-canon-text-light text-[10px] block">Эхо</span>
                     <span className="font-mono font-bold">{(physics.acousticsProfile.echo * 100).toFixed(0)}%</span>
                 </div>
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
                {physics.climbable && <span className="px-1.5 py-0.5 bg-blue-900/30 text-blue-300 rounded border border-blue-500/30 text-[9px]">CLIMB</span>}
                {physics.jumpable && <span className="px-1.5 py-0.5 bg-green-900/30 text-green-300 rounded border border-green-500/30 text-[9px]">JUMP</span>}
                {physics.crawlable && <span className="px-1.5 py-0.5 bg-yellow-900/30 text-yellow-300 rounded border border-yellow-500/30 text-[9px]">CRAWL</span>}
            </div>
        </div>
    );
};

const AffectBlock: React.FC<{ affect?: AffectProfile, tom?: ToMModifier }> = ({ affect, tom }) => {
    if (!affect) return null;
    return (
        <div className="space-y-3">
             <div className="space-y-1">
                 <div className="flex justify-between text-[10px] uppercase font-bold text-canon-text-light">Атмосфера</div>
                 <div className="h-2 w-full flex rounded-full overflow-hidden">
                     <div className="bg-purple-500" style={{width: `${affect.anxiety*20}%`}} title={`Anxiety: ${affect.anxiety}`} />
                     <div className="bg-red-500" style={{width: `${affect.shame*20}%`}} title={`Shame: ${affect.shame}`} />
                     <div className="bg-green-500" style={{width: `${affect.hope*20}%`}} title={`Hope: ${affect.hope}`} />
                     <div className="bg-yellow-400" style={{width: `${affect.awe*20}%`}} title={`Awe: ${affect.awe}`} />
                     <div className="bg-pink-500" style={{width: `${affect.intimacy*20}%`}} title={`Intimacy: ${affect.intimacy}`} />
                 </div>
             </div>
             {tom && (
                 <div className="grid grid-cols-2 gap-2 text-[10px]">
                     <div className="bg-canon-bg p-1 rounded">Noise: <span className="font-mono text-canon-accent">{tom.noise.toFixed(2)}</span></div>
                     <div className="bg-canon-bg p-1 rounded">Bias: <span className="font-mono text-canon-accent">{tom.authorityBias > 0 ? '+' : ''}{tom.authorityBias}</span></div>
                 </div>
             )}
        </div>
    )
}

const OwnershipBlockView: React.FC<{ ownership?: OwnershipBlock }> = ({ ownership }) => {
    if (!ownership) return null;
    return (
        <div className="bg-canon-bg/30 p-2 rounded border border-canon-border/20 text-xs mb-3">
            <div className="flex justify-between items-center mb-1">
                <span className="text-canon-text-light">Владелец:</span>
                <span className="font-bold text-canon-text">{ownership.ownerFaction || 'Никто'}</span>
            </div>
             <div className="flex justify-between items-center">
                <span className="text-canon-text-light">Уровень защиты:</span>
                <span className={`font-mono font-bold ${ownership.securityLevel > 0.7 ? 'text-red-400' : 'text-green-400'}`}>
                    {(ownership.securityLevel * 100).toFixed(0)}%
                </span>
            </div>
             {ownership.authority.length > 0 && (
                 <div className="mt-1 text-[10px] text-canon-text-light truncate">
                     Auth: {ownership.authority.join(', ')}
                 </div>
             )}
        </div>
    )
}

export const LocationProfile: React.FC<LocationProfileProps> = ({ location }) => {
    const p = location.properties || { privacy: 'public', control_level: 0.5, visibility: 0.5, noise: 0.5 };
    const s = location.state || { locked: false, damaged: false, crowd_level: 0, alert_level: 0 };
    const g = location.geometry || { shape: 'rect', area: 0, capacity: 0 };
    const aff = location.affordances || { allowedActions: [] };
    
    const [viewMode, setViewMode] = useState<'map' | 'network' | 'context'>('map');
    const { characters } = useSandbox();
    const [selectedAgentId, setSelectedAgentId] = useState<string>(characters[0]?.entityId || '');

    return (
        <div className="space-y-6">
            {/* Header Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                <div className="lg:col-span-3 bg-canon-bg-light border border-canon-border rounded-lg p-4">
                     {/* ... Existing header content ... */}
                     <div className="flex justify-between items-start mb-4">
                        <div>
                            <h2 className="text-2xl font-bold text-canon-text">{location.title}</h2>
                            <p className="text-sm text-canon-text-light font-mono">{location.entityId}</p>
                        </div>
                        <div className="flex gap-2">
                             <span className="px-2 py-1 bg-canon-bg border border-canon-border rounded text-xs font-mono uppercase text-canon-accent">
                                 {location.kind}
                             </span>
                             <span className={`px-2 py-1 bg-canon-bg border border-canon-border rounded text-xs font-mono uppercase ${p.privacy === 'private' ? 'text-red-400' : p.privacy === 'semi' ? 'text-yellow-400' : 'text-green-400'}`}>
                                 {p.privacy}
                             </span>
                             {location.tags?.includes('module_only') && (
                                 <span className="px-2 py-1 bg-purple-900/30 border border-purple-500/50 text-purple-300 rounded text-xs font-mono uppercase">
                                     MODULE ONLY
                                 </span>
                             )}
                        </div>
                     </div>
                     
                     <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                         {/* ... Existing Columns ... */}
                         
                         {/* Col 1: Epistemics */}
                         <div className="space-y-3 bg-canon-bg/30 p-3 rounded border border-canon-border/20">
                             <h4 className="text-xs font-bold text-canon-text-light uppercase tracking-wider mb-2">Эпистемика</h4>
                             <PropertyBar label="Видимость" value={p.visibility} color="bg-blue-400" tooltip="Как легко заметить действие здесь." />
                             <PropertyBar label="Шум" value={p.noise} color="bg-purple-400" tooltip="Вероятность искажения информации/слухов." />
                             <PropertyBar label="Контроль" value={p.control_level} color="bg-red-400" tooltip="Уровень контроля властями." />
                         </div>
                         
                         {/* Col 2: State */}
                         <div className="space-y-3 bg-canon-bg/30 p-3 rounded border border-canon-border/20">
                             <h4 className="text-xs font-bold text-canon-text-light uppercase tracking-wider mb-2">Состояние</h4>
                             <div className="grid grid-cols-2 gap-2 mb-2">
                                <StateBadge label="LOCK" active={s.locked!} colorOn="bg-red-900/40 border-red-500 text-red-300" colorOff="bg-canon-bg border-canon-border text-canon-text-light opacity-50" />
                                <StateBadge label="DMG" active={s.damaged!} colorOn="bg-orange-900/40 border-orange-500 text-orange-300" colorOff="bg-canon-bg border-canon-border text-canon-text-light opacity-50" />
                             </div>
                             <PropertyBar label="Толпа" value={s.crowd_level!} color="bg-yellow-500" />
                             <PropertyBar label="Тревога" value={s.alert_level!} color="bg-red-500" />
                         </div>

                         {/* Col 3: Physics (Advanced) */}
                         <div className="space-y-3 bg-canon-bg/30 p-3 rounded border border-canon-border/20">
                             <h4 className="text-xs font-bold text-canon-text-light uppercase tracking-wider mb-2">Физика</h4>
                             <PhysicsBlock physics={location.physics} />
                         </div>
                         
                         {/* Col 4: Narrative/Social (Advanced) */}
                         <div className="space-y-3 bg-canon-bg/30 p-3 rounded border border-canon-border/20 flex flex-col justify-between">
                             <div>
                                 <h4 className="text-xs font-bold text-canon-text-light uppercase tracking-wider mb-2">Нарратив</h4>
                                 <OwnershipBlockView ownership={location.ownership} />
                                 <AffectBlock affect={location.affect} tom={location.tomModifier} />
                             </div>
                             {location.hazards && location.hazards.length > 0 && (
                                 <div className="pt-2 border-t border-canon-border/20">
                                     <div className="text-[10px] text-red-400 font-bold uppercase mb-1">Опасности</div>
                                     <div className="flex flex-wrap gap-1">
                                         {location.hazards.map((h: any) => (
                                             <span key={h.id} className="px-1.5 py-0.5 bg-red-900/20 text-red-300 border border-red-500/30 rounded text-[9px]">{h.type}</span>
                                         ))}
                                     </div>
                                 </div>
                             )}
                         </div>

                     </div>
                </div>

                <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4 flex flex-col">
                    <h3 className="font-bold text-sm text-canon-text mb-3">Связи (Connections)</h3>
                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-2 max-h-60">
                        {location.connections && Object.entries(location.connections).map(([tid, conn]) => (
                            <ConnectionCard key={tid} targetId={tid} conn={conn} />
                        ))}
                        {(!location.connections || Object.keys(location.connections).length === 0) && (
                            <div className="text-xs text-canon-text-light italic text-center py-4">Нет связей</div>
                        )}
                    </div>
                </div>
            </div>
            
            {/* Affordances & Visualizer */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                 {/* Left Panel: Affordances */}
                 <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4">
                     <h3 className="font-bold text-sm text-canon-text mb-3">Правила (Affordances)</h3>
                     <div className="space-y-4">
                         <div>
                             <h4 className="text-[10px] font-bold text-green-400 uppercase mb-2">Разрешено</h4>
                             <div className="flex flex-wrap gap-1">
                                 {aff.allowedActions?.map(a => (
                                     <span key={a} className="px-2 py-1 bg-green-900/20 border border-green-500/30 text-green-300 rounded text-[10px]">{a}</span>
                                 ))}
                             </div>
                         </div>
                         {aff.forbiddenActions && aff.forbiddenActions.length > 0 && (
                             <div>
                                 <h4 className="text-[10px] font-bold text-red-400 uppercase mb-2">Запрещено</h4>
                                 <div className="flex flex-wrap gap-1">
                                     {aff.forbiddenActions.map(a => (
                                         <span key={a} className="px-2 py-1 bg-red-900/20 border border-red-500/30 text-red-300 rounded text-[10px]">{a}</span>
                                     ))}
                                 </div>
                             </div>
                         )}
                         {location.contextModes && location.contextModes.length > 0 && (
                             <div className="pt-2 border-t border-canon-border/20">
                                 <h4 className="text-[10px] font-bold text-purple-400 uppercase mb-2">Активные Режимы</h4>
                                 <div className="flex flex-wrap gap-1">
                                     {location.contextModes.map((m: any) => (
                                         <span key={m.id} className="px-2 py-1 bg-purple-900/20 border border-purple-500/30 text-purple-300 rounded text-[10px]">{m.label || m.id}</span>
                                     ))}
                                 </div>
                             </div>
                         )}
                     </div>
                 </div>

                 {/* Main Panel: Visualizer / Context Debug */}
                 <div className="lg:col-span-2 bg-canon-bg-light border border-canon-border rounded-lg p-4 h-[500px] flex flex-col">
                      <div className="flex justify-between items-center mb-3">
                          <h3 className="font-bold text-sm text-canon-text flex items-center gap-2">
                              {viewMode === 'context' ? 'Анализ Контекста' : 'Карта'}
                              {location.map && viewMode !== 'context' ? <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 rounded border border-blue-500/40 font-mono">VECTOR DATA</span> : null}
                          </h3>
                          <div className="flex gap-2">
                               {viewMode === 'context' && (
                                   <select 
                                      value={selectedAgentId} 
                                      onChange={e => setSelectedAgentId(e.target.value)}
                                      className="text-[10px] bg-canon-bg border border-canon-border rounded px-2 py-1 text-canon-text focus:outline-none"
                                   >
                                       {characters.map(c => <option key={c.entityId} value={c.entityId}>{c.title}</option>)}
                                   </select>
                               )}
                               <button 
                                  onClick={() => setViewMode('map')}
                                  disabled={!location.map}
                                  className={`text-[10px] px-2 py-1 rounded border ${viewMode === 'map' ? 'bg-canon-accent text-black border-canon-accent' : 'bg-canon-bg text-canon-text border-canon-border'} disabled:opacity-50`}
                               >
                                   Map
                               </button>
                               <button 
                                  onClick={() => setViewMode('network')}
                                  className={`text-[10px] px-2 py-1 rounded border ${viewMode === 'network' ? 'bg-canon-accent text-black border-canon-accent' : 'bg-canon-bg text-canon-text border-canon-border'}`}
                               >
                                   Graph
                               </button>
                               <button 
                                  onClick={() => setViewMode('context')}
                                  className={`text-[10px] px-2 py-1 rounded border ${viewMode === 'context' ? 'bg-canon-accent text-black border-canon-accent' : 'bg-canon-bg text-canon-text border-canon-border'}`}
                               >
                                   Context
                               </button>
                          </div>
                      </div>
                      
                      <div className="flex-1 bg-black border border-canon-border/30 rounded relative overflow-hidden flex items-center justify-center p-4 overflow-y-auto custom-scrollbar">
                          {viewMode === 'map' && location.map ? (
                              <LocationVectorMap map={location.map} scale={20} showGrid={true} />
                          ) : viewMode === 'context' ? (
                              <div className="w-full h-full text-left">
                                  <LocationContextDebug location={location} agentId={selectedAgentId} allAgents={characters} />
                              </div>
                          ) : (
                              <LocationNetworkView centerId={location.entityId} />
                          )}
                      </div>
                 </div>
            </div>
        </div>
    );
};
