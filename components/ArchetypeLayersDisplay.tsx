
import React from 'react';
import { Link } from 'react-router-dom';
import { ArchetypeLayers } from '../types';

const LayerCard: React.FC<{ title: string, subtitle: string, archetype: any, colorClass: string }> = ({ title, subtitle, archetype, colorClass }) => {
    if (!archetype) {
        return (
             <div className="bg-canon-bg border border-canon-border/50 rounded-lg p-4 opacity-50">
                <h4 className="font-bold text-sm text-canon-text-light">{title}</h4>
                <p className="text-sm text-canon-text-light italic mt-2">Не определен</p>
            </div>
        );
    }
    return (
        <div className="bg-canon-bg border border-canon-border/50 rounded-lg p-4 hover:border-canon-accent/50 transition-colors group">
            <div className="flex justify-between items-baseline mb-1">
                <h4 className={`font-bold text-sm ${colorClass}`}>{title}</h4>
                <p className="text-xs font-mono text-canon-text-light/50 group-hover:text-canon-text-light transition-colors">
                    d: {archetype.distance.toFixed(2)}
                </p>
            </div>
            <p className="text-[10px] text-canon-text-light mb-2">{subtitle}</p>
            
            <h5 className="font-bold text-lg text-canon-text mt-1">{archetype.data.name}</h5>
            
            <Link to={`/character/ARCHETYPE::${archetype.id}`} className="text-xs text-canon-text-light hover:text-canon-accent hover:underline mt-3 inline-block transition-colors">
                Подробнее &rarr;
            </Link>
        </div>
    );
};

export const ArchetypeLayersDisplay: React.FC<{ layers: ArchetypeLayers }> = ({ layers }) => {
    return (
        <div className="mb-8">
            <h3 className="text-xl font-bold text-canon-accent mb-1">Структурные Слои</h3>
            <p className="text-sm text-canon-text-light mb-4">Фундаментальная композиция архетипа по трем осям (Human, Divine, Other).</p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <LayerCard 
                    title="Human (Личность)" 
                    subtitle="Базовые человеческие качества"
                    archetype={layers.kH} 
                    colorClass="text-blue-400"
                />
                <LayerCard 
                    title="Divine (Система)" 
                    subtitle="Роль в большой структуре"
                    archetype={layers.kD} 
                    colorClass="text-yellow-400"
                />
                <LayerCard 
                    title="Other (Предел)" 
                    subtitle="Метафизическая грань"
                    archetype={layers.kO} 
                    colorClass="text-purple-400"
                />
            </div>
        </div>
    );
};
