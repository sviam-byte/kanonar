
import React, { useState } from "react";
import { WorldDebugSnapshot, WorldEpisode } from "../../types";
import { entityMap } from "../../data";

interface Props {
  world: WorldDebugSnapshot;
  onSelectCharacter?: (id: string) => void;
  selectedCharacterId?: string | null;
}

const StatTile: React.FC<{ label: string, value: number, color: string, isPercent?: boolean }> = ({ label, value, color, isPercent = true }) => {
    const safeValue = value ?? 0;
    return (
        <div className="bg-canon-bg/50 border border-canon-border/30 rounded p-2 flex flex-col justify-between">
            <div className="text-[9px] text-canon-text-light uppercase tracking-wider truncate">{label}</div>
            <div className="flex items-end gap-2 mt-1">
                <span className={`font-mono text-sm font-bold`} style={{ color }}>
                    {isPercent ? Math.round(safeValue * 100) : safeValue.toFixed(1)}{isPercent ? '%' : ''}
                </span>
                <div className="flex-1 h-1 bg-canon-bg rounded-full overflow-hidden mb-1">
                    <div className="h-full transition-all duration-500" style={{ width: `${Math.min(1, safeValue) * 100}%`, backgroundColor: color }}></div>
                </div>
            </div>
        </div>
    );
};

const FactionCard: React.FC<{ faction: any }> = ({ faction }) => (
    <div className="bg-canon-bg border border-canon-border/30 rounded-lg p-3 flex flex-col gap-2">
        <div className="flex justify-between items-start">
            <div>
                <div className="text-sm font-bold text-canon-text">{faction.name}</div>
                <div className="text-[10px] text-canon-text-light uppercase tracking-wider mt-0.5">
                    Leader: <span className="text-canon-accent">{faction.leaderName || '—'}</span>
                </div>
            </div>
            <div className="text-right">
                <div className="text-xs font-mono font-bold text-canon-blue">{faction.membersCount}</div>
                <div className="text-[9px] text-canon-text-light">Members</div>
            </div>
        </div>
        
        <div>
             <div className="flex justify-between text-[10px] text-canon-text-light mb-1">
                <span>Legitimacy</span>
                <span>{((faction.legitimacy ?? 0) * 100).toFixed(0)}%</span>
            </div>
             <div className="h-1.5 bg-canon-bg-light rounded-full overflow-hidden">
                <div className="h-full bg-purple-500" style={{width: `${(faction.legitimacy ?? 0)*100}%`}}></div>
            </div>
        </div>

        {faction.hostility && Object.keys(faction.hostility).length > 0 && (
            <div className="mt-1 pt-2 border-t border-canon-border/20">
                <div className="text-[9px] text-canon-text-light mb-1 uppercase">Hostility</div>
                <div className="flex flex-wrap gap-1">
                    {Object.entries(faction.hostility).map(([targetId, val]: [string, any]) => (
                        <span key={targetId} className={`px-1.5 py-0.5 rounded text-[9px] border ${val > 0.5 ? 'border-red-500/30 text-red-400' : 'border-yellow-500/30 text-yellow-400'}`}>
                            {targetId}: {val}
                        </span>
                    ))}
                </div>
            </div>
        )}
    </div>
);

const SystemLogView: React.FC<{ episode: WorldEpisode | undefined, characters: {id: string, name: string}[] }> = ({ episode, characters }) => {
    if (!episode) return <div className="p-4 text-center text-xs text-canon-text-light">No system data for this tick.</div>;

    const charMap = new Map(characters.map(c => [c.id, c.name]));
    const getName = (id: string) => charMap.get(id) || id;

    return (
        <div className="space-y-4">
             {/* Header Stats */}
             {episode.stabilitySummary && (
                <div className="grid grid-cols-3 gap-2 p-2 bg-canon-bg border border-canon-border/30 rounded text-xs">
                    <div className="text-center">
                        <div className="text-[9px] text-canon-text-light uppercase">Global Stability</div>
                        <div className="font-mono font-bold text-canon-green">{(episode.stabilitySummary.meanS ?? 0).toFixed(1)}%</div>
                    </div>
                    <div className="text-center border-l border-canon-border/20">
                        <div className="text-[9px] text-canon-text-light uppercase">Stress Load</div>
                        <div className="font-mono font-bold text-yellow-400">{(episode.stabilitySummary.meanStress ?? 0).toFixed(1)}%</div>
                    </div>
                    <div className="text-center border-l border-canon-border/20">
                        <div className="text-[9px] text-canon-text-light uppercase">Dark Share</div>
                        <div className="font-mono font-bold text-purple-400">{((episode.stabilitySummary.darkShare ?? 0)*100).toFixed(0)}%</div>
                    </div>
                </div>
             )}

             {/* Action Log */}
             <div className="space-y-1">
                 <h4 className="text-[10px] text-canon-text-light uppercase tracking-wider font-bold mb-2">Tick Actions</h4>
                 {episode.actions.map((action, i) => (
                     <div key={i} className="bg-canon-bg/50 border border-canon-border/20 rounded p-2 text-xs flex justify-between items-center">
                         <div className="flex-1 min-w-0">
                             <span className="font-bold text-canon-text">{getName(action.actorId)}</span>
                             <span className="text-canon-text-light mx-1">→</span>
                             <span className="text-canon-blue">{action.actionId}</span>
                             {action.targetId && (
                                 <>
                                    <span className="text-canon-text-light mx-1">on</span>
                                    <span className="text-canon-text italic">{getName(action.targetId)}</span>
                                 </>
                             )}
                         </div>
                         <div className="flex items-center gap-2 ml-2">
                             {action.qTotal !== undefined && (
                                 <span className="text-[9px] text-canon-text-light font-mono">Q:{(action.qTotal ?? 0).toFixed(1)}</span>
                             )}
                             <div className={`w-1.5 h-1.5 rounded-full ${(action.successRealized ?? 1) > 0.5 ? 'bg-green-500' : 'bg-red-500'}`} title={`Success: ${action.successRealized}`} />
                         </div>
                     </div>
                 ))}
                 {episode.actions.length === 0 && <div className="text-xs text-canon-text-light italic">No actions recorded.</div>}
             </div>

             {/* Leadership State */}
             {episode.leadership && (
                 <div className="p-2 bg-canon-bg/30 border border-canon-border/20 rounded text-xs">
                     <h4 className="text-[10px] text-canon-text-light uppercase tracking-wider font-bold mb-1">Leadership</h4>
                     <div className="flex justify-between items-center">
                        <span>Leader: <span className="text-canon-accent font-bold">{episode.leadership.leaderId ? getName(episode.leadership.leaderId) : 'None'}</span></span>
                        <span>Legitimacy: <span className="font-mono">{(episode.leadership.legitimacy ?? 0).toFixed(2)}</span></span>
                     </div>
                     <div className="w-full bg-canon-bg h-1 mt-1 rounded-full overflow-hidden">
                         <div className="h-full bg-purple-500" style={{width: `${(episode.leadership.legitimacy ?? 0)*100}%`}} />
                     </div>
                 </div>
             )}
        </div>
    );
}

export const WorldDashboard: React.FC<Props> = ({ world, onSelectCharacter, selectedCharacterId }) => {
  const { aggregates, factions, systems, characters, lastWorldEpisode } = world;
  const [activeTab, setActiveTab] = useState<'overview' | 'factions' | 'kanonar'>('overview');

  // Safely access aggregates in case they are missing or malformed
  const meanStress = aggregates?.meanStress ?? 0;
  const meanPrMonstro = aggregates?.meanPrMonstro ?? 0;
  const shareStrain = aggregates?.shareStrain ?? 0;
  const shareBreak = aggregates?.shareBreak ?? 0;
  const meanInstitutionLegitimacy = aggregates?.meanInstitutionLegitimacy ?? 0;
  const meanSystemStability = aggregates?.meanSystemStability ?? 0;

  return (
    <div className="flex h-full flex-col gap-4">
      {/* HUD Header */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
          <StatTile label="Avg Stress" value={meanStress} color="#facc15" />
          <StatTile label="Avg P(Mon)" value={meanPrMonstro} color="#ef4444" />
          <StatTile label="Strain %" value={shareStrain} color="#fb923c" />
          <StatTile label="Break %" value={shareBreak} color="#dc2626" />
          <StatTile label="Legitimacy" value={meanInstitutionLegitimacy} color="#60a5fa" />
          <StatTile label="Stability" value={meanSystemStability} color="#34d399" />
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 border-b border-canon-border/50 pb-1">
          <button 
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-1 text-xs font-bold uppercase tracking-wider transition-colors ${activeTab === 'overview' ? 'text-canon-accent border-b-2 border-canon-accent' : 'text-canon-text-light hover:text-canon-text'}`}
          >
            Overview
          </button>
          <button 
            onClick={() => setActiveTab('factions')}
            className={`px-3 py-1 text-xs font-bold uppercase tracking-wider transition-colors ${activeTab === 'factions' ? 'text-canon-accent border-b-2 border-canon-accent' : 'text-canon-text-light hover:text-canon-text'}`}
          >
            Factions
          </button>
          <button 
            onClick={() => setActiveTab('kanonar')}
            className={`px-3 py-1 text-xs font-bold uppercase tracking-wider transition-colors ${activeTab === 'kanonar' ? 'text-canon-accent border-b-2 border-canon-accent' : 'text-canon-text-light hover:text-canon-text'}`}
          >
            Kanonar
          </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1">
        
        {/* TAB: OVERVIEW */}
        {activeTab === 'overview' && (
             <div className="grid grid-cols-1 gap-4">
                 {/* Systems Row */}
                 {systems.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                         {systems.map(s => (
                            <div key={s.id} className="bg-canon-bg/50 p-2 rounded border border-canon-border/20 text-xs">
                                <div className="flex justify-between mb-1">
                                    <span className="font-semibold text-canon-text truncate">{s.name}</span>
                                </div>
                                <div className="flex gap-1 h-1">
                                    <div className="bg-emerald-500 flex-1 rounded-full opacity-70" style={{width: `${s.health*100}%`}} title="Health"/>
                                    <div className="bg-blue-500 flex-1 rounded-full opacity-70" style={{width: `${s.stability*100}%`}} title="Stability"/>
                                </div>
                            </div>
                        ))}
                    </div>
                 )}

                 {/* Agents Grid */}
                 <div>
                     <h4 className="text-xs font-bold text-canon-text-light uppercase mb-2">Population ({characters.length})</h4>
                     <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                        {characters.map(c => (
                            <button 
                                key={c.id}
                                onClick={() => onSelectCharacter?.(c.id)}
                                className={`
                                    group relative p-2 rounded-lg border text-left transition-all hover:scale-[1.02]
                                    ${selectedCharacterId === c.id 
                                        ? 'bg-canon-accent/10 border-canon-accent shadow-[0_0_10px_rgba(0,170,255,0.2)]' 
                                        : 'bg-canon-bg border-canon-border/40 hover:border-canon-text-light/50'
                                    }
                                `}
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <div className="truncate text-[11px] font-bold text-canon-text w-full pr-3">{c.name}</div>
                                    <div className={`absolute top-2 right-2 w-1.5 h-1.5 rounded-full ${
                                        c.archetypePhase === 'break' ? 'bg-red-500 animate-pulse' : 
                                        c.archetypePhase === 'strain' ? 'bg-yellow-400' : 'bg-emerald-500'
                                    }`} />
                                </div>
                                <div className="space-y-0.5 mt-2 opacity-80 group-hover:opacity-100 transition-opacity">
                                     <div className="h-1 w-full bg-canon-border/20 rounded-full overflow-hidden">
                                        <div className="h-full bg-yellow-400" style={{width: `${(c.stress ?? 0) * 100}%`}} title={`Stress: ${((c.stress ?? 0)*100).toFixed(0)}%`}/>
                                     </div>
                                     <div className="h-1 w-full bg-canon-border/20 rounded-full overflow-hidden">
                                        <div className="h-full bg-purple-500" style={{width: `${(c.prMonstro ?? 0) * 100}%`}} title={`Pr(Monstro): ${((c.prMonstro ?? 0)*100).toFixed(0)}%`}/>
                                     </div>
                                </div>
                            </button>
                        ))}
                     </div>
                 </div>
             </div>
        )}

        {/* TAB: FACTIONS */}
        {activeTab === 'factions' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(world.factions as any[]).map(f => <FactionCard key={f.id} faction={f} />)}
                {(world.factions || []).length === 0 && <div className="col-span-full text-center text-canon-text-light p-4">No factions defined.</div>}
            </div>
        )}
        
        {/* TAB: KANONAR */}
        {activeTab === 'kanonar' && (
            <SystemLogView episode={lastWorldEpisode} characters={characters} />
        )}

      </div>
    </div>
  );
};
