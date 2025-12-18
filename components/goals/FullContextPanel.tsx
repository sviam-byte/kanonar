
import React from "react";
import type { AgentContextFrame } from "../../lib/context/frame/types";

interface Props {
  ctx: AgentContextFrame;
}

const SectionHeader: React.FC<{ title: string; icon?: string }> = ({ title, icon }) => (
    <div className="flex items-center gap-2 border-b border-canon-border/40 pb-1 mb-3 mt-6 first:mt-0">
        {icon && <span className="text-canon-accent text-sm">{icon}</span>}
        <h4 className="text-[10px] font-bold text-canon-text-light uppercase tracking-widest">{title}</h4>
    </div>
);

const StatPill: React.FC<{ label: string; value: string | number; color?: string; icon?: string }> = ({ label, value, color = "text-canon-text", icon }) => (
    <div className="flex flex-col bg-black/20 border border-canon-border/30 rounded p-2 text-center min-w-[70px]">
        <div className="text-[9px] text-canon-text-light uppercase tracking-wider mb-0.5 flex justify-center items-center gap-1">
             {icon} {label}
        </div>
        <div className={`font-mono font-bold text-sm ${color}`}>
            {value}
        </div>
    </div>
);

const Tag: React.FC<{ label: string; color?: string }> = ({ label, color = "bg-canon-bg border-canon-border text-canon-text-light" }) => (
    <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${color} truncate max-w-full`}>
        {label}
    </span>
);

export const FullContextPanel: React.FC<Props> = ({ ctx }) => {
  const { who, where, when, what, how, why, derived, social, tom } = ctx;

  const threatIndex = derived?.threatIndex ?? 0;
  const threatColor = threatIndex > 0.6 ? 'text-red-400' : threatIndex > 0.3 ? 'text-yellow-400' : 'text-emerald-400';
  
  return (
    <div className="h-full flex flex-col bg-canon-bg-light border border-canon-border rounded-lg shadow-xl overflow-hidden">
      
      {/* 1. HEADER IDENTITY */}
      <div className="p-4 bg-canon-bg/80 border-b border-canon-border flex justify-between items-start">
          <div className="flex gap-3">
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-canon-blue/20 to-purple-500/20 border border-canon-border flex items-center justify-center text-2xl shadow-inner">
                  👤
              </div>
              <div>
                  <h2 className="text-lg font-bold text-canon-text">{who.name}</h2>
                  <div className="flex flex-wrap gap-1 mt-1">
                      <span className="text-[10px] font-mono text-canon-accent bg-canon-accent/10 px-1.5 py-0.5 rounded">{who.entityId}</span>
                      {who.roles.map(r => <span key={r} className="text-[10px] text-canon-text-light border border-canon-border px-1.5 py-0.5 rounded">{r}</span>)}
                      {who.factions.map(f => <span key={f} className="text-[10px] text-blue-300 border border-blue-500/30 bg-blue-900/10 px-1.5 py-0.5 rounded">{f}</span>)}
                  </div>
              </div>
          </div>
          <div className="text-right flex flex-col items-end">
               <div className="text-[10px] text-canon-text-light uppercase tracking-wider mb-1">Time & Phase</div>
               <div className="font-mono text-canon-text font-bold text-sm flex items-center gap-2">
                   <span>T:{ctx.tick}</span>
                   <span className="text-canon-border">|</span>
                   <span className="uppercase text-canon-accent">{when.timeOfDay}</span>
               </div>
               <div className="text-xs text-canon-text-light italic mt-0.5">{when.phase}</div>
          </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-1 pb-20">
          
          {/* 2. SITUATION HUD */}
          <div className="grid grid-cols-4 gap-2 mb-6">
               <StatPill label="Threat" value={(threatIndex * 100).toFixed(0) + '%'} color={threatColor} icon="⚠️" />
               <StatPill label="Safety" value={((derived?.safetyIndex ?? 0) * 100).toFixed(0) + '%'} color="text-blue-400" icon="🛡️" />
               <StatPill label="Support" value={((derived?.supportIndex ?? 0) * 100).toFixed(0) + '%'} color="text-green-400" icon="🤝" />
               <StatPill label="Allies" value={social.allyCountNearby} color="text-canon-text" icon="👥" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* WHERE */}
              <div>
                  <SectionHeader title="Environment (Where)" icon="📍" />
                  <div className="bg-black/20 border border-canon-border/30 rounded p-3 text-xs space-y-2">
                      <div className="flex justify-between items-center">
                          <span className="font-bold text-canon-text text-sm">{where.locationName || 'Unknown'}</span>
                          <span className="text-[10px] font-mono text-canon-text-light">{where.locationId}</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                          {where.locationTags.map(t => <Tag key={t} label={t} color="bg-blue-900/20 border-blue-500/30 text-blue-200" />)}
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-canon-border/20">
                          <div className="flex justify-between">
                              <span className="text-canon-text-light">Hazard:</span>
                              <span className={`font-mono font-bold ${where.map.hazard > 0 ? 'text-red-400' : 'text-green-400'}`}>{(where.map.hazard ?? 0).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                              <span className="text-canon-text-light">Cover:</span>
                              <span className="font-mono text-canon-text">{(where.map.cover ?? 0).toFixed(2)}</span>
                          </div>
                      </div>
                  </div>
              </div>

              {/* HOW (STATE) */}
              <div>
                  <SectionHeader title="Internal State (How)" icon="❤️" />
                  <div className="bg-black/20 border border-canon-border/30 rounded p-3 space-y-3">
                      {/* Physical */}
                      <div>
                           <div className="flex justify-between text-[10px] mb-1">
                               <span className="text-canon-text-light">Physical Integrity</span>
                               <span className={how.physical.hp < 40 ? 'text-red-500 font-bold' : 'text-canon-text'}>{how.physical.hp.toFixed(0)}/100</span>
                           </div>
                           <div className="h-1.5 w-full bg-canon-bg rounded-full overflow-hidden">
                               <div className={`h-full ${how.physical.hp < 40 ? 'bg-red-500' : 'bg-green-500'}`} style={{width: `${how.physical.hp}%`}}></div>
                           </div>
                      </div>
                      
                      {/* Affect Grid */}
                      <div className="grid grid-cols-3 gap-2">
                           <div className="text-center bg-canon-bg/50 rounded py-1">
                               <div className="text-[9px] text-canon-text-light uppercase">Arousal</div>
                               <div className="font-mono text-xs font-bold text-yellow-400">{(how.affect.arousal ?? 0).toFixed(2)}</div>
                           </div>
                           <div className="text-center bg-canon-bg/50 rounded py-1">
                               <div className="text-[9px] text-canon-text-light uppercase">Valence</div>
                               <div className={`font-mono text-xs font-bold ${how.affect.valence > 0 ? 'text-green-400' : 'text-red-400'}`}>{(how.affect.valence ?? 0).toFixed(2)}</div>
                           </div>
                           <div className="text-center bg-canon-bg/50 rounded py-1">
                               <div className="text-[9px] text-canon-text-light uppercase">Fear</div>
                               <div className="font-mono text-xs font-bold text-purple-400">{(how.affect.fear ?? 0).toFixed(2)}</div>
                           </div>
                      </div>
                  </div>
              </div>
          </div>
          
          {/* ToM Physical Section (NEW) */}
          {tom && (tom.physicalSelf || tom.physicalOthers) && (
              <div className="mt-4">
                  <SectionHeader title="Body & Physics (ToM)" icon="🩺" />
                  <div className="bg-black/20 border border-canon-border/30 rounded p-3 text-xs space-y-3">
                      {/* Self Perception */}
                      {tom.physicalSelf && (
                          <div>
                              <div className="text-[10px] font-bold text-canon-text-light uppercase mb-1">Self Perception</div>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px]">
                                  <div className="bg-canon-bg/50 p-1.5 rounded flex justify-between">
                                      <span className="text-canon-text-light">HP Est:</span>
                                      <span className="font-mono">{(tom.physicalSelf.hpEstimate * 100).toFixed(0)}%</span>
                                  </div>
                                  <div className="bg-canon-bg/50 p-1.5 rounded flex justify-between">
                                      <span className="text-canon-text-light">Pain Est:</span>
                                      <span className="font-mono">{(tom.physicalSelf.painEstimate * 100).toFixed(0)}%</span>
                                  </div>
                                  <div className="bg-canon-bg/50 p-1.5 rounded flex justify-between">
                                      <span className="text-canon-text-light">Severe:</span>
                                      <span className={`font-bold ${tom.physicalSelf.isSeverelyWounded ? 'text-red-400' : 'text-green-400'}`}>
                                          {tom.physicalSelf.isSeverelyWounded ? 'YES' : 'NO'}
                                      </span>
                                  </div>
                                  <div className="bg-canon-bg/50 p-1.5 rounded flex justify-between">
                                      <span className="text-canon-text-light">Combat:</span>
                                      <span className={`font-bold ${tom.physicalSelf.isCombatCapable ? 'text-blue-400' : 'text-red-400'}`}>
                                          {tom.physicalSelf.isCombatCapable ? 'READY' : 'NO'}
                                      </span>
                                  </div>
                              </div>
                          </div>
                      )}
                      
                      {/* Others Perception */}
                      {tom.physicalOthers && tom.physicalOthers.length > 0 && (
                          <div className="pt-2 border-t border-canon-border/20">
                              <div className="text-[10px] font-bold text-canon-text-light uppercase mb-1">Others Perception</div>
                              <div className="space-y-1">
                                  {tom.physicalOthers.map(o => (
                                      <div key={o.targetId} className="flex justify-between items-center bg-canon-bg/30 p-1.5 rounded text-[10px]">
                                          <div className="flex items-center gap-2">
                                              <span className="font-bold text-canon-text">{o.name}</span>
                                          </div>
                                          <div className="flex gap-3 font-mono text-canon-text-light">
                                              <span>HP~{(o.hpEstimate*100).toFixed(0)}</span>
                                              <span>Pain~{(o.painEstimate*100).toFixed(0)}</span>
                                              <span className={o.isSeverelyWounded ? 'text-red-400' : 'text-green-400'}>
                                                  {o.isSeverelyWounded ? 'CRIT' : 'OK'}
                                              </span>
                                          </div>
                                      </div>
                                  ))}
                              </div>
                          </div>
                      )}
                  </div>
              </div>
          )}

          {/* WHAT (NEARBY) */}
          <div className="mt-4">
               <SectionHeader title="Nearby Actors (What/Who)" icon="👁️" />
               <div className="bg-black/20 border border-canon-border/30 rounded overflow-hidden">
                   {what.nearbyAgents.length > 0 ? (
                       <div className="divide-y divide-canon-border/20">
                           {what.nearbyAgents.slice(0, 5).map(a => {
                               const distNorm = a.distanceNorm ?? 0;
                               const isClose = distNorm < 0.3; // Close
                               
                               return (
                               <div key={a.id} className="flex items-center justify-between p-2 text-xs hover:bg-white/5 transition-colors">
                                   <div className="flex items-center gap-2">
                                       <span className="text-base">{a.isWounded ? '🚑' : '👤'}</span>
                                       <div className="flex flex-col">
                                           <div className="flex items-center gap-1">
                                               <span className={`font-bold ${a.isWounded ? 'text-red-400' : 'text-canon-text'}`}>{a.name}</span>
                                               {a.faction && <span className="text-[8px] bg-white/10 px-1 rounded text-canon-text-light">{a.faction}</span>}
                                           </div>
                                           <span className="text-[9px] text-canon-text-light">{a.role}</span>
                                       </div>
                                   </div>
                                   <div className="text-right">
                                       <div className={`font-mono ${isClose ? 'text-white' : 'text-canon-text-light'}`}>{(a.distance ?? 0).toFixed(1)}m</div>
                                   </div>
                               </div>
                           )})}
                           {what.nearbyAgents.length > 5 && (
                               <div className="p-2 text-center text-[10px] text-canon-text-light bg-canon-bg/50">
                                   +{what.nearbyAgents.length - 5} others...
                               </div>
                           )}
                       </div>
                   ) : (
                       <div className="p-4 text-center text-xs text-canon-text-light italic">No one nearby.</div>
                   )}
               </div>
          </div>
          
          {/* WHY (ORDERS) */}
          <div className="mt-4">
              <SectionHeader title="Directives (Why)" icon="📜" />
              {why.activeOrders.length > 0 ? (
                  <div className="space-y-2">
                      {why.activeOrders.map(o => (
                          <div key={o.id} className="bg-purple-900/10 border border-purple-500/30 rounded p-2 flex gap-3 items-start">
                              <div className="text-lg">👑</div>
                              <div>
                                  <div className="text-xs font-bold text-purple-300 uppercase">{o.kind}</div>
                                  <div className="text-xs text-canon-text">{o.summary || o.kind}</div>
                                  <div className="text-[10px] text-purple-300/50 mt-1">Issuer: {o.issuerId?.split('-')[1]} • Priority: {o.priority}</div>
                              </div>
                          </div>
                      ))}
                  </div>
              ) : (
                  <div className="text-xs text-canon-text-light italic bg-black/20 p-2 rounded border border-canon-border/30">No active orders.</div>
              )}
          </div>
          
          {/* RECENT EVENTS */}
          {what.recentEvents.length > 0 && (
               <div className="mt-4">
                  <SectionHeader title="Recent Activity" icon="🕒" />
                  <div className="space-y-1">
                      {what.recentEvents.map((ev, i) => (
                          <div key={i} className="flex justify-between items-center text-[10px] bg-black/20 px-2 py-1 rounded border border-canon-border/10">
                              <span className="font-mono text-canon-text-light">T:{ev.tick}</span>
                              <span className="font-bold text-canon-text truncate mx-2">{ev.kind}</span>
                              <span className="text-canon-accent">{ev.intensity?.toFixed(1)}</span>
                          </div>
                      ))}
                  </div>
               </div>
          )}

      </div>
    </div>
  );
};
