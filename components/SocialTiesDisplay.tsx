
import React, { useState, useMemo } from 'react';
import { CharacterEntity, EntityType, Relationship } from '../types';
import { entityMap, getEntitiesByType } from '../data';
import { calculateStationaryRelation } from '../lib/relations/stationary';
import { StationaryRelationDisplay } from './StationaryRelationDisplay';
import { Tabs } from './Tabs';
import { MetricDisplay } from './MetricDisplay';

interface SocialTiesDisplayProps {
    character: CharacterEntity;
}

const TieCard: React.FC<{ targetName: string, targetId: string, trust: number, bond: number, conflict: number, onClick: () => void }> = ({ targetName, targetId, trust, bond, conflict, onClick }) => {
    return (
        <div onClick={onClick} className="bg-canon-bg border border-canon-border/50 rounded p-2 cursor-pointer hover:border-canon-accent hover:bg-canon-bg-light/50 transition-all">
            <div className="font-bold text-xs text-canon-text truncate mb-1">{targetName}</div>
            <div className="flex gap-2">
                 <div className="flex-1 flex flex-col gap-0.5">
                     <div className="text-[9px] text-canon-text-light">Trust</div>
                     <div className="w-full h-1 bg-canon-bg rounded-full overflow-hidden border border-canon-border/30">
                         <div className="h-full bg-green-400" style={{width: `${trust*100}%`}}></div>
                     </div>
                 </div>
                 <div className="flex-1 flex flex-col gap-0.5">
                     <div className="text-[9px] text-canon-text-light">Bond</div>
                     <div className="w-full h-1 bg-canon-bg rounded-full overflow-hidden border border-canon-border/30">
                         <div className="h-full bg-blue-400" style={{width: `${bond*100}%`}}></div>
                     </div>
                 </div>
                 <div className="flex-1 flex flex-col gap-0.5">
                     <div className="text-[9px] text-canon-text-light">Conflict</div>
                     <div className="w-full h-1 bg-canon-bg rounded-full overflow-hidden border border-canon-border/30">
                         <div className="h-full bg-red-400" style={{width: `${conflict*100}%`}}></div>
                     </div>
                 </div>
            </div>
        </div>
    )
}

const NetworkView: React.FC<{ character: CharacterEntity, allChars: CharacterEntity[], onSelect: (id: string) => void }> = ({ character, allChars, onSelect }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [ties, setTies] = useState<any[]>([]);

    React.useEffect(() => {
        setIsLoading(true);
        // Calculate all ties async
        setTimeout(() => {
            const computed = allChars
                .filter(c => c.entityId !== character.entityId)
                .map(target => {
                    const rel = calculateStationaryRelation(character, target, allChars);
                    return {
                        id: target.entityId,
                        name: target.title,
                        trust: rel.rapport.trust_base,
                        bond: rel.rapport.tie_survival, // Using tie survival as bond proxy for stationary view
                        conflict: rel.rapport.norm_conflict,
                        score: rel.scores100.relation_strength // Sort metric
                    };
                })
                .sort((a,b) => b.score - a.score);
            
            setTies(computed);
            setIsLoading(false);
        }, 50);
    }, [character, allChars]);

    if(isLoading) return <div className="p-4 text-xs text-canon-text-light italic">Расчет сети связей...</div>

    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[500px] overflow-y-auto p-1">
            {ties.map(t => (
                <TieCard 
                    key={t.id} 
                    targetId={t.id} 
                    targetName={t.name} 
                    trust={t.trust} 
                    bond={t.bond} 
                    conflict={t.conflict}
                    onClick={() => onSelect(t.id)}
                />
            ))}
        </div>
    )
}

const DetailView: React.FC<{ character: CharacterEntity, allChars: CharacterEntity[] }> = ({ character, allChars }) => {
    const otherChars = useMemo(() => allChars.filter(c => c.entityId !== character.entityId), [allChars, character]);
    const [selectedTargetId, setSelectedTargetId] = useState<string>(otherChars[0]?.entityId || '');

    const relation = useMemo(() => {
        if (!selectedTargetId) return null;
        const target = entityMap.get(selectedTargetId) as CharacterEntity;
        if (!target) return null;
        return calculateStationaryRelation(character, target, allChars);
    }, [character, selectedTargetId, allChars]);

    return (
        <div className="space-y-4">
            <div>
                <label htmlFor="target-select" className="text-sm font-semibold text-canon-text-light block mb-1">
                    Цель для детального анализа:
                </label>
                <select
                    id="target-select"
                    value={selectedTargetId}
                    onChange={(e) => setSelectedTargetId(e.target.value)}
                    className="w-full bg-canon-bg border border-canon-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-canon-accent"
                >
                    <option value="" disabled>Выберите персонажа...</option>
                    {otherChars.map(c => <option key={c.entityId} value={c.entityId}>{c.title}</option>)}
                </select>
            </div>
            
            {relation ? (
                <StationaryRelationDisplay relation={relation} />
            ) : (
                <div className="p-8 text-center text-canon-text-light">
                    {selectedTargetId ? "Расчет отношения..." : "Выберите цель для анализа."}
                </div>
            )}
        </div>
    );
}

export const SocialTiesDisplay: React.FC<SocialTiesDisplayProps> = ({ character }) => {
    const allChars = useMemo(() => (getEntitiesByType(EntityType.Character) as CharacterEntity[]).concat(getEntitiesByType(EntityType.Essence) as CharacterEntity[]), []);
    const [activeTab, setActiveTab] = useState(0);
    
    // Shared state for selection jump
    const [selectedIdForDetail, setSelectedIdForDetail] = useState<string | null>(null);

    const handleSelectFromNetwork = (id: string) => {
        setSelectedIdForDetail(id);
        setActiveTab(1); // Switch to detail view
    };

    // Hacky way to pass selection to DetailView without rewriting Tabs component or lifting state too high for this quick fix
    // We'll render manually instead of using generic Tabs component to pass props easily
    
    return (
        <div className="bg-canon-bg-light border border-canon-border rounded-lg p-6 max-w-4xl space-y-6">
             <div>
                <h3 className="font-bold text-lg text-canon-text mb-2">Социальные связи</h3>
                <p className="text-sm text-canon-text-light">Анализ отношений, доверия и влияния.</p>
            </div>
            
            <div className="flex border-b border-canon-border mb-4">
                <button 
                    className={`px-4 py-2 text-sm font-bold ${activeTab === 0 ? 'text-canon-accent border-b-2 border-canon-accent' : 'text-canon-text-light hover:text-canon-text'}`}
                    onClick={() => setActiveTab(0)}
                >
                    Сеть (Обзор)
                </button>
                <button 
                    className={`px-4 py-2 text-sm font-bold ${activeTab === 1 ? 'text-canon-accent border-b-2 border-canon-accent' : 'text-canon-text-light hover:text-canon-text'}`}
                    onClick={() => setActiveTab(1)}
                >
                    Детальный анализ (Dyad)
                </button>
            </div>
            
            {activeTab === 0 ? (
                <NetworkView character={character} allChars={allChars} onSelect={handleSelectFromNetwork} />
            ) : (
                <DetailView character={character} allChars={allChars} />
            )}
        </div>
    );
};
