
import React from "react";
import { CharacterDebugSnapshot } from "../../types";

interface Props {
  character: CharacterDebugSnapshot;
}

export const CharacterCard: React.FC<Props> = ({ character }) => {
  const {
    name,
    stress,
    prMonstro,
    archetypeObserved,
    archetypeSelf,
    archetypePhase,
    identityTension,
    shadowId,
    shadowActivation,
    tomQuality,
    tomUncertainty,
    tomMode,
    topRelations,
    activeFailureModes,
    lastEpisodes,
    psych
  } = character;

  // Safe getters
  const safeStress = stress ?? 0;
  const safePrMonstro = prMonstro ?? 0;
  const safeTension = identityTension ?? 0;
  const safeShadowActivation = shadowActivation ?? 0;
  const safeTomQuality = tomQuality ?? 0.5;
  const safeTomUncertainty = tomUncertainty ?? 0.5;
  const safeSelfGap = psych?.selfGap ?? 0;

  return (
    <div className="w-full h-full rounded-xl border border-canon-border bg-canon-bg-light/30 p-4 text-canon-text shadow-inner overflow-y-auto custom-scrollbar">
      {/* Header */}
      <div className="mb-4 pb-3 border-b border-canon-border/50">
        <div className="flex justify-between items-start mb-1">
           <h3 className="text-lg font-bold text-canon-text tracking-tight">{name}</h3>
           <div className="flex flex-col items-end gap-1">
                {activeFailureModes.map(m => (
                    <span key={m} className="px-1.5 py-0.5 text-[9px] uppercase font-bold bg-red-500/20 text-red-400 rounded border border-red-500/30">{m}</span>
                ))}
           </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
             <span className={`px-2 py-0.5 rounded-full font-mono text-[10px] border ${
                archetypePhase === 'normal' ? 'border-green-500/30 bg-green-500/10 text-green-400' :
                archetypePhase === 'strain' ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400' :
                'border-red-500/30 bg-red-500/10 text-red-400'
             }`}>
                {archetypePhase ? archetypePhase.toUpperCase() : 'NORMAL'}
             </span>
             <span className="text-canon-text-light/50">|</span>
             <span className="text-canon-text-light uppercase text-[10px] tracking-wider">{tomMode} MODE</span>
        </div>
      </div>

      {/* Vitals */}
      <div className="mb-5 space-y-3">
        <div>
            <div className="flex justify-between text-[10px] text-canon-text-light uppercase mb-1">
                <span>Stress Level</span>
                <span className={safeStress > 0.7 ? 'text-red-400 font-bold' : 'text-canon-text'}>{(safeStress*100).toFixed(0)}%</span>
            </div>
            <div className="h-2 bg-canon-bg rounded-full overflow-hidden border border-canon-border/30">
                <div className={`h-full transition-all duration-300 ${safeStress > 0.7 ? 'bg-red-500' : safeStress > 0.4 ? 'bg-yellow-500' : 'bg-emerald-500'}`} style={{width: `${safeStress*100}%`}}></div>
            </div>
        </div>
        <div>
             <div className="flex justify-between text-[10px] text-canon-text-light uppercase mb-1">
                <span>Monstro Risk</span>
                <span className={safePrMonstro > 0.7 ? 'text-purple-400 font-bold' : 'text-canon-text'}>{(safePrMonstro*100).toFixed(0)}%</span>
            </div>
            <div className="h-2 bg-canon-bg rounded-full overflow-hidden border border-canon-border/30">
                 <div className="h-full bg-gradient-to-r from-purple-900 to-purple-500 transition-all duration-300" style={{width: `${safePrMonstro*100}%`}}></div>
            </div>
        </div>
      </div>

      {/* Archetype */}
      <div className="mb-5 p-3 bg-canon-bg/40 rounded-lg border border-canon-border/30">
        <h4 className="text-[10px] font-bold text-canon-text-light uppercase mb-3 tracking-wider">Identity Matrix</h4>
        <div className="space-y-2 text-xs">
            <div className="flex justify-between">
                <span className="text-canon-text-light">Self (Target):</span>
                <span className="text-canon-blue font-medium">{archetypeSelf || '—'}</span>
            </div>
            <div className="flex justify-between">
                <span className="text-canon-text-light">Actual (True):</span>
                <span className="text-emerald-400 font-medium">{archetypeObserved || '—'}</span>
            </div>
            {shadowId && (
                 <div className="flex justify-between">
                    <span className="text-canon-text-light">Shadow:</span>
                    <span className="text-red-400 font-medium">{shadowId}</span>
                </div>
            )}
        </div>
        <div className="mt-3 pt-2 border-t border-canon-border/20">
             <div className="flex justify-between text-[10px] text-canon-text-light mb-1">
                <span>Self Gap</span>
                <span className={safeSelfGap > 0.5 ? 'text-orange-400' : 'text-canon-text'}>{(safeSelfGap * 100).toFixed(0)}%</span>
            </div>
             <div className="h-1.5 bg-canon-bg rounded-full overflow-hidden mb-2">
                 <div className="h-full bg-orange-400" style={{width: `${safeSelfGap*100}%`}}></div>
            </div>

            {shadowActivation !== undefined && (
                <div className="mt-2">
                     <div className="flex justify-between text-[10px] text-canon-text-light mb-1">
                        <span>Shadow Activation</span>
                        <span>{(safeShadowActivation * 100).toFixed(0)}%</span>
                    </div>
                     <div className="h-1.5 bg-canon-bg rounded-full overflow-hidden">
                        <div className="h-full bg-purple-500" style={{width: `${safeShadowActivation*100}%`}}></div>
                    </div>
                </div>
            )}
        </div>
      </div>
      
      {/* Psych Brief */}
      {psych && (
        <div className="mb-5 p-3 bg-canon-bg/20 rounded-lg border border-canon-border/20 text-xs">
             <h4 className="text-[10px] font-bold text-canon-text-light uppercase mb-2 tracking-wider">Psycho-Layer</h4>
             <div className="space-y-1">
                <div className="flex justify-between">
                    <span className="text-canon-text-light">Role:</span>
                    <span className="text-canon-text capitalize">{psych.narrative.role}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-canon-text-light">Moral Gap:</span>
                    <span>{((psych.moral.valueBehaviorGap ?? 0) * 100).toFixed(0)}%</span>
                </div>
                 <div className="flex flex-wrap gap-1 mt-2">
                    {psych.coping.aggression > 0.5 && <span className="px-1.5 py-0.5 bg-red-500/20 text-red-300 rounded text-[9px]">Aggression</span>}
                    {psych.coping.avoid > 0.5 && <span className="px-1.5 py-0.5 bg-gray-500/20 text-gray-300 rounded text-[9px]">Avoidance</span>}
                    {psych.coping.hyperControl > 0.5 && <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-300 rounded text-[9px]">HyperControl</span>}
                    {psych.distortions.threatBias > 0.5 && <span className="px-1.5 py-0.5 bg-orange-500/20 text-orange-300 rounded text-[9px]">ThreatBias</span>}
                </div>
             </div>
        </div>
      )}

      {/* ToM */}
      <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
             <h4 className="text-[10px] font-bold text-canon-text-light uppercase tracking-wider">Theory of Mind</h4>
             <div className="flex gap-1">
                 <div className="w-1 h-1 rounded-full bg-canon-blue"></div>
                 <div className="w-1 h-1 rounded-full bg-fuchsia-500"></div>
             </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
             <div className="bg-canon-bg/30 p-2 rounded border border-canon-border/20 text-center">
                <div className="text-canon-blue font-mono font-bold text-sm">{(safeTomQuality*100).toFixed(0)}%</div>
                <div className="text-[9px] text-canon-text-light uppercase">Quality</div>
             </div>
             <div className="bg-canon-bg/30 p-2 rounded border border-canon-border/20 text-center">
                <div className="text-fuchsia-500 font-mono font-bold text-sm">{(safeTomUncertainty*100).toFixed(0)}%</div>
                <div className="text-[9px] text-canon-text-light uppercase">Uncertainty</div>
             </div>
          </div>
      </div>

       {/* Relations */}
       <div className="mb-5">
            <h4 className="text-[10px] font-bold text-canon-text-light uppercase mb-2 tracking-wider">Top Relations</h4>
            <div className="space-y-1.5">
                {topRelations.map(rel => (
                    <div key={rel.targetId} className="flex items-center text-xs bg-canon-bg/20 p-1.5 rounded border border-canon-border/10">
                        <div className="flex-1 truncate pr-2" title={rel.targetName}>{rel.targetName}</div>
                        <div className="w-16 h-1.5 bg-canon-bg rounded-full overflow-hidden">
                             <div className="h-full bg-emerald-500" style={{width: `${(rel.trust ?? 0)*100}%`}}></div>
                        </div>
                    </div>
                ))}
                {topRelations.length === 0 && <div className="text-[10px] text-canon-text-light italic">No active relations</div>}
            </div>
       </div>

       {/* History */}
       <div>
           <h4 className="text-[10px] font-bold text-canon-text-light uppercase mb-2 tracking-wider">Recent Events</h4>
           <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
               {lastEpisodes.map(ep => (
                   <div key={ep.id} className="flex-shrink-0 w-2 h-6 rounded-sm relative group" 
                        style={{backgroundColor: ep.color === 'red' ? '#ef4444' : ep.color === 'green' ? '#10b981' : ep.color === 'blue' ? '#3b82f6' : '#f59e0b'}}>
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block w-32 bg-black/90 text-white text-[10px] p-1.5 rounded z-10 pointer-events-none border border-white/10">
                            <div className="font-bold mb-0.5">{ep.kind}</div>
                            <div className="opacity-70">{ep.summary}</div>
                            <div className="text-[9px] mt-1 text-white/40">Tick: {ep.tick}</div>
                        </div>
                   </div>
               ))}
           </div>
       </div>

    </div>
  );
};
