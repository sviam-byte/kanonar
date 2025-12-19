
// components/goal-lab/GoalLabControls.tsx
import React from 'react';
import { CharacterEntity, LocationEntity, LocalActorRef } from '../../types';
import { Event } from '../../lib/events/types';
import { ContextAtom, ContextAtomKind } from '../../lib/context/v2/types';
import { Slider } from '../Slider';
import { AffectState } from '../../types';
import { TEST_SCENES, ScenePreset } from '../../data/presets/scenes';
import { CONTEXT_ATOM_KIND_CATALOG, DEFAULT_MANUAL_KINDS } from '../../lib/context/v2/catalog';
import { ModsPanel } from './ModsPanel'; 
import { ScenePanel } from './ScenePanel';

interface Props {
  allCharacters: CharacterEntity[];
  allLocations: LocationEntity[];
  allEvents: Event[];
  
  selectedAgentId: string;
  onSelectAgent: (id: string) => void;
  
  selectedLocationId: string | null;
  onSelectLocation: (id: string) => void;
  
  locationMode: 'preset' | 'custom';
  onLocationModeChange: (mode: 'preset' | 'custom') => void;

  selectedEventIds: Set<string>;
  onToggleEvent: (id: string) => void;
  
  manualAtoms: ContextAtom[];
  onChangeManualAtoms: (atoms: ContextAtom[]) => void;

  nearbyActors: LocalActorRef[];
  onNearbyActorsChange: (actors: LocalActorRef[]) => void;
  
  placingActorId: string | null;
  onStartPlacement: (id: string | null) => void;

  affectOverrides: Partial<AffectState>;
  onAffectOverridesChange: (overrides: Partial<AffectState>) => void;

  onLoadScene?: (preset: ScenePreset) => void;
  onRunTicks?: (steps: number) => void;

  // Optional: World Access for Mods
  world?: any;
  onWorldChange?: (w: any) => void;
  
  // New: List of all participant IDs in the current scene/world
  participantIds?: string[];
  // NEW: direct scene participant control (preferred over nearbyActors)
  onAddParticipant?: (id: string) => void;
  onRemoveParticipant?: (id: string) => void;
  
  // Scene Control Props
  sceneControl?: any;
  onSceneControlChange?: (ctrl: any) => void;
  scenePresets?: any[];

  // Perspective (who is the observer)
  perspectiveAgentId?: string | null;
  onSelectPerspective?: (id: string) => void;
}

export const GoalLabControls: React.FC<Props> = ({
  allCharacters, allLocations, allEvents,
  selectedAgentId, onSelectAgent,
  selectedLocationId, onSelectLocation,
  locationMode, onLocationModeChange,
  selectedEventIds, onToggleEvent,
  manualAtoms, onChangeManualAtoms,
  nearbyActors, onNearbyActorsChange,
  placingActorId, onStartPlacement,
  affectOverrides, onAffectOverridesChange,
  onLoadScene,
  onRunTicks,
  world, onWorldChange,
  participantIds,
  onAddParticipant,
  onRemoveParticipant,
  sceneControl, onSceneControlChange, scenePresets,
  perspectiveAgentId, onSelectPerspective
}) => {
  
  const [selectedActorToAdd, setSelectedActorToAdd] = React.useState<string>('');
  const [activeTab, setActiveTab] = React.useState<'events' | 'affect' | 'manual' | 'scenes' | 'sim' | 'mods' | 'scene'>('scenes');
  
  // Custom atom form state
  const [customAtomKind, setCustomAtomKind] = React.useState<ContextAtomKind>('threat');
  const [customAtomLabel, setCustomAtomLabel] = React.useState('');
  const [customAtomSearch, setCustomAtomSearch] = React.useState('');

  const handleSliderChange = (kind: ContextAtomKind, val: number, id?: string) => {
      const atomId = id || `manual:${kind}`;
      const existingIdx = manualAtoms.findIndex(a => a.id === atomId);
      let newAtoms = [...manualAtoms];
      
      if (val === 0 && !id) { // Only remove if it's a quick slider and 0
          if (existingIdx >= 0) newAtoms.splice(existingIdx, 1);
      } else {
          const atom: ContextAtom = {
              id: atomId,
              kind,
              source: 'manual',
              magnitude: val,
              label: manualAtoms[existingIdx]?.label || customAtomLabel || `Manual ${kind}`
          };
          if (existingIdx >= 0) newAtoms[existingIdx] = atom;
          else newAtoms.push(atom);
      }
      onChangeManualAtoms(newAtoms);
  };
  
  const handleRemoveAtom = (id: string) => {
      onChangeManualAtoms(manualAtoms.filter(a => a.id !== id));
  };
  
  const getManualValue = (kind: ContextAtomKind) => {
      return manualAtoms.find(a => a.kind === kind && a.source === 'manual')?.magnitude ?? 0;
  };
  
  const handleAddCustomAtom = () => {
      const id = `manual:${customAtomKind}:${Date.now()}`;
      const atom: ContextAtom = {
          id,
          kind: customAtomKind,
          source: 'manual',
          magnitude: 0.5,
          label: customAtomLabel || customAtomKind
      };
      onChangeManualAtoms([...manualAtoms, atom]);
      setCustomAtomLabel('');
  };

  const handleAddCharacter = () => {
      if (!selectedActorToAdd) return;

      // Preferred path: parent controls scene membership directly
      if (onAddParticipant) {
          onAddParticipant(selectedActorToAdd);
          setSelectedActorToAdd('');
          return;
      }

      // Fallback: old behavior via nearbyActors
      const char = allCharacters.find(c => c.entityId === selectedActorToAdd);
      if (!char) return;

      const newActor: LocalActorRef = {
          id: char.entityId,
          label: char.title,
          kind: 'neutral',
          role: char.roles?.global?.[0] || 'observer',
          distance: 10,
          threatLevel: 0
      };
      
      // We append to nearbyActors because that triggers the injection logic in parent
      if (!nearbyActors.some(a => a.id === newActor.id)) {
          onNearbyActorsChange([...nearbyActors, newActor]);
      }
      setSelectedActorToAdd('');
  };
  
  const handleRemoveCharacter = (id: string) => {
      if (onRemoveParticipant) {
          onRemoveParticipant(id);
          return;
      }
      onNearbyActorsChange(nearbyActors.filter(a => a.id !== id));
  };
  
  const handleLocationSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const val = e.target.value;
      onSelectLocation(val);
      if (val) {
          onLocationModeChange('preset');
      }
  };
  
  const toggleEditMode = () => {
      if (locationMode === 'custom') {
           onLocationModeChange('preset');
           if (!selectedLocationId && allLocations.length > 0) {
               onSelectLocation(allLocations[0].entityId);
           }
      } else {
           onLocationModeChange('custom');
      }
  };

  const handleAffectChange = (key: keyof AffectState, value: number) => {
      onAffectOverridesChange({ ...affectOverrides, [key]: value });
  };
  
  const filteredAtomKinds = CONTEXT_ATOM_KIND_CATALOG.filter(k => k.includes(customAtomSearch));
  
  const sceneIds = React.useMemo(() => {
      const ids =
        participantIds && participantIds.length > 0
          ? new Set(participantIds)
          : world?.agents?.length
            ? new Set(world.agents.map((a: any) => a.entityId))
            : new Set<string>();

      if (ids.size === 0 && selectedAgentId) ids.add(selectedAgentId);
      return ids;
  }, [participantIds, world, selectedAgentId]);

  // Calculate who is in scene but not the active agent
  const activeSceneActors = React.useMemo(() => {
      return Array.from(sceneIds).map(id => {
          const char = allCharacters.find(c => c.entityId === id);
          return { id, label: char?.title || id };
      });
  }, [sceneIds, allCharacters]);

  // Main agent dropdown: Show only current scene/world participants
  const activeAgentOptions = React.useMemo(() => {
      return allCharacters
          .filter(c => sceneIds.has(c.entityId))
          .map(c => ({ ...c, inScene: true }));
  }, [allCharacters, sceneIds]);
  
  // Add Character Dropdown: exclude those already in scene
  const availableToAdd = React.useMemo(() => {
      return allCharacters.filter(c => !sceneIds.has(c.entityId));
  }, [allCharacters, sceneIds]);

  return (
    <div className="flex flex-col h-full bg-canon-bg border-t border-canon-border">
      
      {/* 0. ACTIVE AGENT */}
      <div className="flex-shrink-0 p-2 border-b border-canon-border/50 bg-canon-bg-light/30">
        <div className="flex justify-between items-center mb-1">
          <span className="text-[10px] font-bold text-canon-text-light uppercase">Active Agent (Focus)</span>
          <button 
            type="button"
            onClick={() => onStartPlacement(placingActorId === selectedAgentId ? null : selectedAgentId)}
            disabled={!selectedAgentId}
            className={`text-[9px] px-2 py-0.5 rounded border ${
              placingActorId === selectedAgentId 
                ? 'bg-canon-accent text-black border-canon-accent' 
                : 'bg-canon-bg border-canon-border text-canon-text-light hover:border-white'
            } disabled:opacity-50`}
            title="Place active agent on map"
          >
            {placingActorId === selectedAgentId ? 'CANCEL PLACE' : 'PLACE'}
          </button>
        </div>
        <select 
          className="w-full bg-canon-bg border border-canon-border rounded px-1 py-1 text-xs text-canon-text truncate"
          value={selectedAgentId}
          onChange={e => onSelectAgent(e.target.value)}
        >
          {activeAgentOptions.map(c => (
            <option key={c.entityId} value={c.entityId} className={c.inScene ? 'font-bold' : ''}>
              {c.title} {c.inScene ? '(In Scene)' : ''}
            </option>
          ))}
        </select>
        {placingActorId === selectedAgentId && (
          <div className="text-[9px] text-canon-text-light italic mt-1 text-center">
            Click a cell on the map to place the active agent
          </div>
        )}
      </div>

      {/* 1. LOCATION & EDIT TOGGLE */}
      <div className="flex-shrink-0 p-2 border-b border-canon-border/50 bg-canon-bg-light/30">
          <div className="flex justify-between items-center mb-1">
               <span className="text-[10px] font-bold text-canon-text-light uppercase">Location</span>
               <button 
                  type="button"
                  onClick={toggleEditMode}
                  className={`text-[9px] px-2 py-0.5 rounded border ${locationMode==='custom' ? 'bg-canon-accent text-black border-canon-accent' : 'bg-canon-bg border-canon-border text-canon-text-light'}`}
               >
                   {locationMode === 'custom' ? 'DONE EDITING' : 'EDIT MAP'}
               </button>
          </div>
          
          <select 
                className="w-full bg-canon-bg border border-canon-border rounded px-1 py-1 text-xs text-canon-text truncate disabled:opacity-50"
                value={selectedLocationId || ''}
                onChange={handleLocationSelect}
                disabled={locationMode === 'custom'}
            >
                <option value="">[ Custom / Default ]</option>
                {allLocations.map(l => <option key={l.entityId} value={l.entityId}>{l.title}</option>)}
            </select>
            {locationMode === 'custom' && <div className="text-[9px] text-canon-text-light italic mt-1 text-center">Map Editor Active</div>}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-canon-border/50 overflow-x-auto no-scrollbar">
          {['scenes', 'scene', 'events', 'sim', 'affect', 'manual', 'mods'].map(tab => (
            <button 
               key={tab}
               className={`flex-1 py-1 px-2 text-[10px] font-bold uppercase whitespace-nowrap ${activeTab === tab ? 'text-canon-accent border-b-2 border-canon-accent' : 'text-canon-text-light'}`}
               onClick={() => setActiveTab(tab as any)}
            >
                {tab}
            </button>
          ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0 flex flex-col p-2 bg-canon-bg overflow-y-auto custom-scrollbar">
        
        {activeTab === 'scenes' && onLoadScene && (
            <div className="space-y-2">
                <div className="text-xs font-bold text-canon-text uppercase tracking-wider mb-2 flex items-center gap-2">
                    <span>🎬</span> Quick Presets
                </div>
                {TEST_SCENES.map(scene => (
                    <button
                        type="button"
                        key={scene.id}
                        onClick={() => onLoadScene(scene)}
                        className="w-full text-left bg-canon-bg-light/30 border border-canon-border/50 rounded p-2 hover:border-canon-accent hover:bg-canon-bg-light/60 transition-all group"
                    >
                        <div className="flex justify-between items-baseline">
                            <span className="text-xs font-bold text-canon-text group-hover:text-white">{scene.title}</span>
                            <span className="text-[9px] font-mono text-canon-text-light">{scene.characters.length} chars</span>
                        </div>
                        <p className="text-[9px] text-canon-text-light mt-1 line-clamp-2">{scene.description}</p>
                    </button>
                ))}
            </div>
        )}
        
        {activeTab === 'scene' && sceneControl && onSceneControlChange && (
            <ScenePanel 
                control={sceneControl} 
                presets={scenePresets || []} 
                onChange={onSceneControlChange} 
            />
        )}
        
        {activeTab === 'scene' && (!sceneControl || !onSceneControlChange) && (
            <div className="text-xs italic text-canon-text-light p-4 text-center">Scene Control not available.</div>
        )}

        {activeTab === 'sim' && onRunTicks && (
             <div className="space-y-4">
                 <div className="text-xs font-bold text-canon-text uppercase tracking-wider mb-2 flex items-center gap-2">
                    <span>⏱️</span> Time Control
                 </div>
                 <div className="grid grid-cols-2 gap-2">
                     <button 
                        type="button"
                        onClick={() => onRunTicks(1)} 
                        className="px-4 py-2 bg-canon-accent text-black text-xs font-bold rounded hover:bg-opacity-80 transition-colors"
                     >
                         Run 1 Tick
                     </button>
                     <button 
                        type="button"
                        onClick={() => onRunTicks(10)} 
                        className="px-4 py-2 bg-canon-bg border border-canon-accent text-canon-accent text-xs font-bold rounded hover:bg-canon-accent/10 transition-colors"
                     >
                         Run 10 Ticks
                     </button>
                 </div>
                 <div className="text-[10px] text-canon-text-light italic">
                     Running ticks updates internal state (affect, stress traces) and advances world time.
                 </div>
             </div>
        )}
        
        {activeTab === 'mods' && world && onWorldChange && (
            <ModsPanel 
                world={world} 
                kind="characters" 
                id={selectedAgentId} 
                onChange={onWorldChange} 
            />
        )}
        
        {activeTab === 'mods' && (!world || !onWorldChange) && (
            <div className="text-xs italic text-canon-text-light p-4 text-center">Mods require active world context.</div>
        )}

        {activeTab === 'events' && (
            <div className="space-y-1">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-xs font-bold text-canon-text uppercase tracking-wider flex items-center gap-2">
                        <span>🔥</span> Active Events
                    </h3>
                    <span className="text-[10px] bg-canon-accent/10 text-canon-accent px-1.5 rounded">{selectedEventIds.size}</span>
                </div>
                {allEvents.map(ev => {
                    const isActive = selectedEventIds.has(ev.id);
                    return (
                        <label 
                            key={ev.id} 
                            className={`
                                flex items-start gap-2 cursor-pointer p-2 rounded border transition-all select-none
                                ${isActive 
                                    ? 'bg-canon-accent/10 border-canon-accent/50' 
                                    : 'bg-canon-bg-light/30 border-transparent hover:bg-white/5 hover:border-canon-border/50'
                                }
                            `}
                        >
                            <input 
                                type="checkbox"
                                checked={isActive}
                                onChange={() => onToggleEvent(ev.id)}
                                className="mt-1 accent-canon-accent"
                            />
                            <div className="min-w-0 flex-1">
                                <div className={`font-bold text-xs truncate ${isActive ? 'text-canon-text' : 'text-canon-text/70'}`}>
                                    {ev.kind.toUpperCase()}
                                </div>
                                <div className="text-[10px] text-canon-text-light truncate opacity-70">
                                    {ev.tags.join(', ')}
                                </div>
                            </div>
                        </label>
                    )
                })}
                {allEvents.length === 0 && <div className="text-xs italic text-canon-text-light text-center py-10">No events found.</div>}
            </div>
        )}

        {activeTab === 'affect' && (
             <div className="space-y-3">
                 <h3 className="text-xs font-bold text-canon-text uppercase tracking-wider mb-2">Emotional State (Self)</h3>
                 <Slider label="Valence (-1..1)" value={affectOverrides.valence ?? 0} setValue={v => handleAffectChange('valence', v)} min={-1} max={1} step={0.1} />
                 <Slider label="Arousal (0..1)" value={affectOverrides.arousal ?? 0.2} setValue={v => handleAffectChange('arousal', v)} />
                 <Slider label="Fear (0..1)" value={affectOverrides.fear ?? 0} setValue={v => handleAffectChange('fear', v)} />
                 <Slider label="Anger (0..1)" value={affectOverrides.anger ?? 0} setValue={v => handleAffectChange('anger', v)} />
                 <Slider label="Shame (0..1)" value={affectOverrides.shame ?? 0} setValue={v => handleAffectChange('shame', v)} />
                 <div className="pt-2 border-t border-canon-border/30">
                     <button type="button" onClick={() => onAffectOverridesChange({})} className="w-full text-xs bg-canon-bg-light border border-canon-border rounded py-1 hover:text-canon-red">Reset Affect</button>
                 </div>
             </div>
        )}

        {activeTab === 'manual' && (
             <div className="space-y-4">
                 
                 {/* Quick Sliders */}
                 <div>
                    <h3 className="text-xs font-bold text-canon-text uppercase tracking-wider mb-2">Quick Access</h3>
                    <div className="space-y-1">
                        {DEFAULT_MANUAL_KINDS.map(kind => {
                            const val = getManualValue(kind);
                            return (
                                <Slider 
                                    key={kind}
                                    label={kind.replace(/_/g, ' ')}
                                    value={val}
                                    setValue={v => handleSliderChange(kind, v)}
                                    min={0} max={1} step={0.1}
                                />
                            )
                        })}
                    </div>
                 </div>

                 {/* Custom Atom Builder */}
                 <div className="border-t border-canon-border/30 pt-3">
                    <h3 className="text-xs font-bold text-canon-text uppercase tracking-wider mb-2">Add Custom Atom</h3>
                    <div className="space-y-2">
                        <input 
                            type="text" 
                            className="w-full bg-canon-bg border border-canon-border rounded p-1 text-xs" 
                            placeholder="Search kind..." 
                            value={customAtomSearch} 
                            onChange={e => setCustomAtomSearch(e.target.value)}
                        />
                        <select 
                            className="w-full bg-canon-bg border border-canon-border rounded p-1 text-xs"
                            value={customAtomKind}
                            onChange={e => setCustomAtomKind(e.target.value as ContextAtomKind)}
                        >
                            {filteredAtomKinds.map(k => <option key={k} value={k}>{k}</option>)}
                        </select>
                        <input 
                            type="text" 
                            className="w-full bg-canon-bg border border-canon-border rounded p-1 text-xs" 
                            placeholder="Optional Label" 
                            value={customAtomLabel} 
                            onChange={e => setCustomAtomLabel(e.target.value)}
                        />
                        <button type="button" onClick={handleAddCustomAtom} className="w-full bg-canon-accent text-black text-xs font-bold rounded py-1 hover:bg-opacity-80">Add</button>
                    </div>
                 </div>
                 
                 {/* Active Manual List */}
                 {manualAtoms.length > 0 && (
                     <div className="border-t border-canon-border/30 pt-3">
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="text-xs font-bold text-canon-text uppercase tracking-wider">Active Manual</h3>
                            <button type="button" onClick={() => onChangeManualAtoms([])} className="text-[9px] text-red-400 hover:underline">Clear All</button>
                        </div>
                        <div className="space-y-2">
                            {manualAtoms.map(atom => (
                                <div key={atom.id} className="bg-canon-bg/30 p-2 rounded border border-canon-border/20">
                                    <div className="flex justify-between text-[10px] mb-1">
                                        <span className="font-bold truncate">{atom.label}</span>
                                        <button type="button" onClick={() => handleRemoveAtom(atom.id)} className="text-red-400">×</button>
                                    </div>
                                    <div className="text-[9px] text-canon-text-light mb-1">{atom.kind}</div>
                                    <Slider 
                                        label="" 
                                        value={atom.magnitude} 
                                        setValue={v => handleSliderChange(atom.kind, v, atom.id)} 
                                        min={0} max={1} step={0.1}
                                    />
                                </div>
                            ))}
                        </div>
                     </div>
                 )}

             </div>
        )}

        <div className="h-12 shrink-0" />
      </div>
      
      {/* 3. SCENE CAST (Actors) */}
      <div className="flex-shrink-0 max-h-[35%] overflow-y-auto custom-scrollbar border-t border-canon-border/50 bg-canon-bg-light/20 p-3 space-y-3">
          
          <div>
            <div className="flex justify-between items-center mb-2">
                <h3 className="text-[10px] font-bold text-canon-text-light uppercase tracking-wider">Scene Participants</h3>
            </div>
            
            <div className="mb-3 p-2 rounded border border-canon-border/30 bg-canon-bg">
              <div className="text-[11px] font-bold mb-2">Perspective (для кого считаем)</div>

              <div className="flex flex-wrap gap-1">
                {(participantIds || []).map(id => {
                  const label = allCharacters.find(c => c.entityId === id)?.title || id;
                  return (
                    <button
                      key={id}
                      className={`px-2 py-1 rounded text-[10px] border ${
                        perspectiveAgentId === id
                          ? 'bg-canon-accent/20 border-canon-accent/50 text-canon-text-light'
                          : 'bg-canon-bg border-canon-border/40 text-canon-text-muted hover:text-canon-text-light'
                      }`}
                      onClick={() => onSelectPerspective?.(id)}
                      title={`Perspective: ${id}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-2 mb-3">
                <select 
                    className="flex-1 bg-canon-bg border border-canon-border rounded px-2 py-1 text-[10px]"
                    value={selectedActorToAdd}
                    onChange={e => setSelectedActorToAdd(e.target.value)}
                >
                    <option value="">+ Add Character...</option>
                    {availableToAdd.map(c => (
                        <option key={c.entityId} value={c.entityId}>{c.title}</option>
                    ))}
                </select>
                <button 
                    type="button"
                    onClick={handleAddCharacter}
                    disabled={!selectedActorToAdd}
                    className="text-[10px] bg-canon-accent text-black px-3 py-1 rounded font-bold hover:bg-opacity-80 disabled:opacity-50"
                >
                    ADD
                </button>
            </div>
            <div className="text-[9px] text-canon-text-light mt-1">
              participantIds: {(participantIds?.length ?? 0)} | nearbyActors: {nearbyActors.length}
            </div>
            
            <div className="space-y-1">
                 {activeSceneActors.map((actor) => (
                     <div
                       key={actor.id}
                       className={`flex items-center gap-2 p-1 rounded text-[10px] border ${
                         actor.id === selectedAgentId
                           ? 'bg-canon-accent/15 border-canon-accent'
                           : 'bg-canon-bg border-canon-border/30'
                       }`}
                     >
                         <button
                           className="flex-1 truncate text-left hover:underline"
                           onClick={() => onSelectAgent(actor.id)}
                           title="Switch active agent"
                         >
                           {actor.label}
                           {actor.id === selectedAgentId ? '  •  FOCUS' : ''}
                         </button>
                         <button 
                            type="button"
                            onClick={() => onStartPlacement(actor.id)}
                            className={`w-5 h-5 flex items-center justify-center rounded border ${placingActorId === actor.id ? 'bg-canon-accent text-black' : 'text-canon-text-light border-canon-border hover:border-white'}`}
                            title="Place"
                          >📍</button>
                          <button 
                             type="button"
                             onClick={() => handleRemoveCharacter(actor.id)}
                             className="text-canon-text-light hover:text-red-400"
                          >✕</button>
                     </div>
                 ))}
                 {activeSceneActors.length === 0 && (
                     <div className="text-[10px] text-canon-text-light italic text-center py-2">Solo scene.</div>
                 )}
            </div>
          </div>
          
          <div className="h-4 shrink-0" />
      </div>

    </div>
  );
};
